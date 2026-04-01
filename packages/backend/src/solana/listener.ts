import { PublicKey } from "@solana/web3.js";
import { config } from "../config";
import {
  approveSpendRequestOnChain,
  ensureRiskAuthorityReady,
  getProgram,
  getRiskAuthorityPublicKey,
  rejectSpendRequestOnChain,
} from "./client";
import { getAIProvider, type AIDecision, type AIDecisionSource, type AIRequestInput } from "../ai";
import { summarizeReasons, type AIFlags } from "../ai";
import {
  getSpendRequestDetail,
  saveAiDecision,
  saveAuditEvent,
  saveRiskEvaluation,
  updateSpendRequestProcessing,
} from "../db/queries";

const processedRequests = new Set<string>();
const evaluationRateLimit = new Map<string, { count: number; resetAt: number }>();
let pollInFlight = false;

type ParsedVaultMode = "active" | "frozen" | "closed";
type ParsedRequestStatus = "pending" | "approved" | "rejected";

interface SpendRequestContext {
  vault: any;
  spendRequest: any;
  policy: any;
  policyPubkey: PublicKey;
  recentRequests: Array<{
    pubkey: string;
    amountLamports: number;
    status: ParsedRequestStatus;
    timestamp: number;
  }>;
  cooldownOk: boolean;
  vaultMode: ParsedVaultMode;
}

interface HardPolicyValidation {
  allowed: boolean;
  reason?: string;
  enforcedRiskScore?: number;
  enforcementType?: "policy_override" | "decision_rule";
}

interface InternalDecision {
  provider: string;
  source: AIDecisionSource;
  decision: AIDecision;
  riskScore: number;
  reasons: string[];
  flags: AIFlags;
  sanitizedPurpose?: string;
  inputPayload: string;
  rawResponse: string;
}

type PolicyCheckStatus = "passed" | "failed";
type PolicyModeStatus = "active" | "restricted" | "paused";

function dedupeReasons(reasons: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const reason of reasons) {
    const value = (reason || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

function sanitizeAiFindings(reasons: string[]) {
  const policyReasonPatterns = [
    /policy violation/i,
    /rejected by hard policy/i,
    /hard policy/i,
    /cooldown policy/i,
    /per-transaction limit/i,
    /total vault limit/i,
    /current vault balance/i,
    /risk score exceeds threshold/i,
    /vault mode/i,
  ];

  return dedupeReasons(
    reasons.filter(
      (reason) => !policyReasonPatterns.some((pattern) => pattern.test(reason))
    )
  ).slice(0, 4);
}

function buildFallbackReasons(context: SpendRequestContext) {
  return dedupeReasons([
    "Repeated request attempts detected.",
    "High frequency behavior detected.",
    "Safety fallback activated.",
  ]).slice(0, 3);
}

function summarizeDecisionReasons(reasons: string[]) {
  return summarizeReasons(dedupeReasons(reasons));
}

function isEvaluationRateLimited(walletAddress: string) {
  const now = Date.now();
  const current = evaluationRateLimit.get(walletAddress);

  if (!current || now > current.resetAt) {
    evaluationRateLimit.set(walletAddress, {
      count: 1,
      resetAt: now + 60_000,
    });
    return false;
  }

  if (current.count >= 10) {
    return true;
  }

  current.count += 1;
  evaluationRateLimit.set(walletAddress, current);
  return false;
}

export async function startListener() {
  console.log("  Listener polling every", config.risk.pollInterval, "ms");

  setInterval(async () => {
    if (pollInFlight) {
      return;
    }

    pollInFlight = true;
    try {
      await pollPendingRequests();
    } catch (err) {
      console.error("Poll error:", err);
    } finally {
      pollInFlight = false;
    }
  }, config.risk.pollInterval);
}

async function pollPendingRequests() {
  const program = getProgram();
  const accountNamespace = program.account as any;

  const requests = await accountNamespace.spendRequest.all();

  for (const request of requests as any[]) {
    const pubkey = request.publicKey.toBase58();
    const status = parseRequestStatus(request.account.status);

    if (status !== "pending" || processedRequests.has(pubkey)) {
      continue;
    }

    const detail = getSpendRequestDetail(pubkey);
    if (!detail) {
      continue;
    }

    if (detail.processing_status === "processing" || detail.processing_status === "completed") {
      processedRequests.add(pubkey);
      continue;
    }

    processedRequests.add(pubkey);
    console.log(`  [Listener] Processing pending SpendRequest: ${pubkey}`);

    updateSpendRequestProcessing({
      requestPubkey: pubkey,
      status: "processing",
      error: null,
    });

    try {
      await processSpendRequest({
        requestPubkey: pubkey,
        vaultPubkey: request.account.vault.toBase58(),
        purpose: detail.description,
      });
      updateSpendRequestProcessing({
        requestPubkey: pubkey,
        status: "completed",
        error: null,
      });
    } catch (error: any) {
      const message = error?.message || "Failed to execute AI decision on-chain";
      updateSpendRequestProcessing({
        requestPubkey: pubkey,
        status: "failed",
        error: message,
      });
      saveAuditEvent({
        vaultPubkey: request.account.vault.toBase58(),
        eventType: "ai_processing_failed",
        details: {
          requestPubkey: pubkey,
          error: message,
          source: "listener",
        },
      });
      console.error(`  [Listener] Failed to process ${pubkey}:`, message);
    }
  }
}

function parseVaultMode(mode: any): ParsedVaultMode {
  if (mode?.active !== undefined) return "active";
  if (mode?.frozen !== undefined) return "frozen";
  if (mode?.closed !== undefined) return "closed";
  return "active";
}

function parseRequestStatus(status: any): ParsedRequestStatus {
  if (status?.pending !== undefined) return "pending";
  if (status?.approved !== undefined) return "approved";
  if (status?.rejected !== undefined) return "rejected";
  return "pending";
}

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 5, delayMs = 400): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

async function loadSpendRequestContext(
  vaultPubkey: PublicKey,
  requestPubkey: PublicKey
): Promise<SpendRequestContext> {
  const program = getProgram();
  const accountNamespace = program.account as any;

  const vault = (await fetchWithRetry(() => accountNamespace.vault.fetch(vaultPubkey))) as any;
  const spendRequest = (await fetchWithRetry(() =>
    accountNamespace.spendRequest.fetch(requestPubkey)
  )) as any;

  const [policyPubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), vaultPubkey.toBuffer()],
    program.programId
  );
  const policy = (await fetchWithRetry(() => accountNamespace.policy.fetch(policyPubkey))) as any;

  const allVaultRequests = (await accountNamespace.spendRequest.all([
    {
      memcmp: {
        offset: 8,
        bytes: vaultPubkey.toBase58(),
      },
    },
  ])) as any[];

  const recentRequests = allVaultRequests
    .map((request) => ({
      pubkey: request.publicKey.toBase58(),
      amountLamports: request.account.amount.toNumber(),
      status: parseRequestStatus(request.account.status),
      timestamp:
        request.account.resolvedAt.toNumber() > 0
          ? request.account.resolvedAt.toNumber()
          : request.account.createdAt.toNumber(),
    }))
    .filter((request) => request.pubkey !== requestPubkey.toBase58())
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 10);

  const vaultMode = parseVaultMode(vault.vaultMode);
  const lastPayoutAt = vault.lastPayoutAt.toNumber();
  const cooldownOk =
    lastPayoutAt === 0 ||
    Date.now() / 1000 >= lastPayoutAt + policy.cooldownSeconds.toNumber();

  return {
    vault,
    spendRequest,
    policy,
    policyPubkey,
    recentRequests,
    cooldownOk,
    vaultMode,
  };
}

function lamportsToSol(amountLamports: number) {
  return amountLamports / 1_000_000_000;
}

function getPolicyModeStatus(mode: ParsedVaultMode): PolicyModeStatus {
  if (mode === "frozen") return "paused";
  if (mode === "closed") return "restricted";
  return "active";
}

function buildPolicyChecks(context: SpendRequestContext) {
  const amountLamports = context.spendRequest.amount.toNumber();
  const totalDisbursedLamports = context.vault.totalDisbursed.toNumber();
  const perTxLimitLamports = context.policy.perTxLimit.toNumber();
  const totalLimitLamports = context.policy.totalLimit.toNumber();

  return {
    per_tx_limit: amountLamports <= perTxLimitLamports ? "passed" : "failed",
    cooldown: context.cooldownOk ? "passed" : "failed",
    total_limit:
      totalDisbursedLamports + amountLamports <= totalLimitLamports ? "passed" : "failed",
    vault_mode: getPolicyModeStatus(context.vaultMode),
  };
}

function buildUnavailableDecision(
  context: SpendRequestContext,
  errorMessage: string
): InternalDecision {
  const inputPayload = JSON.stringify({
    amount: lamportsToSol(context.spendRequest.amount.toNumber()),
    purpose: "AI unavailable",
    timestamp: context.spendRequest.createdAt.toNumber(),
    walletAddress: context.spendRequest.beneficiary.toBase58(),
    requestHistory: context.recentRequests.map((request) => ({
      amount: lamportsToSol(request.amountLamports),
      timestamp: request.timestamp,
      status: request.status,
    })),
    vaultPolicy: {
      maxPerTx: lamportsToSol(context.policy.perTxLimit.toNumber()),
      cooldown: context.policy.cooldownSeconds.toNumber(),
      totalLimit: lamportsToSol(context.policy.totalLimit.toNumber()),
      riskThreshold: context.policy.riskThreshold,
    },
  });

  return {
    provider: "gemini",
    source: "fallback",
    decision: "reject",
    riskScore: 100,
    reasons: buildFallbackReasons(context),
    flags: {
      high_velocity: true,
      suspicious_pattern: true,
      policy_violation: false,
    },
    inputPayload,
    rawResponse: JSON.stringify({
      fallback: true,
      error: errorMessage,
    }),
  };
}

function validateHardPolicy(
  context: SpendRequestContext,
  aiDecision: InternalDecision
): HardPolicyValidation {
  const amountLamports = context.spendRequest.amount.toNumber();
  const vaultBalanceLamports =
    context.vault.totalDeposited.toNumber() - context.vault.totalDisbursed.toNumber();
  const totalDisbursedLamports = context.vault.totalDisbursed.toNumber();
  const perTxLimitLamports = context.policy.perTxLimit.toNumber();
  const totalLimitLamports = context.policy.totalLimit.toNumber();
  const riskThreshold = context.policy.riskThreshold;

  if (context.vaultMode !== "active") {
    return {
      allowed: false,
      reason: `Vault mode is ${context.vaultMode}.`,
      enforcedRiskScore: 100,
      enforcementType: "policy_override",
    };
  }

  if (!context.cooldownOk) {
    return {
      allowed: false,
      reason: "Cooldown between payouts is still active.",
      enforcedRiskScore: Math.max(aiDecision.riskScore, 90),
      enforcementType: "policy_override",
    };
  }

  if (amountLamports > perTxLimitLamports) {
    return {
      allowed: false,
      reason: "Request exceeds the per-request payout limit.",
      enforcedRiskScore: Math.max(aiDecision.riskScore, riskThreshold + 10),
      enforcementType: "policy_override",
    };
  }

  if (totalDisbursedLamports + amountLamports > totalLimitLamports) {
    return {
      allowed: false,
      reason: "Request exceeds the total vault limit.",
      enforcedRiskScore: Math.max(aiDecision.riskScore, riskThreshold + 10),
      enforcementType: "policy_override",
    };
  }

  if (amountLamports > vaultBalanceLamports) {
    return {
      allowed: false,
      reason: "Request exceeds the available vault balance.",
      enforcedRiskScore: Math.max(aiDecision.riskScore, 95),
      enforcementType: "policy_override",
    };
  }

  if (aiDecision.source === "fallback") {
    return {
      allowed: false,
      reason: "Fallback safety rules triggered rejection.",
      enforcedRiskScore: aiDecision.riskScore,
      enforcementType: "decision_rule",
    };
  }

  if (aiDecision.riskScore > riskThreshold) {
    return {
      allowed: false,
      reason: "AI risk score exceeded the configured threshold.",
      enforcedRiskScore: aiDecision.riskScore,
      enforcementType: "decision_rule",
    };
  }

  return { allowed: true };
}

async function evaluateWithAI(
  purpose: string,
  context: SpendRequestContext
): Promise<InternalDecision> {
  const walletAddress = context.spendRequest.beneficiary.toBase58();
  if (isEvaluationRateLimited(walletAddress)) {
    return {
      provider: "gemini",
      source: "fallback",
      decision: "reject",
      riskScore: 100,
      reasons: dedupeReasons([
        "Repeated request attempts detected.",
        "High frequency behavior detected.",
        "Safety fallback activated.",
      ]),
      flags: {
        high_velocity: true,
        suspicious_pattern: true,
        policy_violation: false,
      },
      inputPayload: JSON.stringify({
        walletAddress,
        reason: "rate_limited",
      }),
      rawResponse: JSON.stringify({
        fallback: true,
        error: "AI rate limit reached",
      }),
    };
  }

  const aiInput: AIRequestInput = {
    amount: lamportsToSol(context.spendRequest.amount.toNumber()),
    purpose,
    timestamp: context.spendRequest.createdAt.toNumber(),
    walletAddress,
    requestHistory: context.recentRequests.map((request) => ({
      amount: lamportsToSol(request.amountLamports),
      status: request.status,
      timestamp: request.timestamp,
    })),
    vaultPolicy: {
      maxPerTx: lamportsToSol(context.policy.perTxLimit.toNumber()),
      cooldown: context.policy.cooldownSeconds.toNumber(),
      totalLimit: lamportsToSol(context.policy.totalLimit.toNumber()),
      riskThreshold: context.policy.riskThreshold,
    },
  };

  try {
    const result = await getAIProvider().evaluate(aiInput);
    return {
      provider: result.provider,
      source: "gemini",
      decision: result.decision,
      riskScore: result.riskScore,
      reasons: result.reasons,
      flags: result.flags,
      sanitizedPurpose: result.sanitizedPurpose,
      inputPayload: result.inputPayload,
      rawResponse: result.rawResponse,
    };
  } catch (error: any) {
    console.warn("Gemini evaluation failed, rejecting request:", error?.message || error);
    return buildUnavailableDecision(context, error?.message || "AI unavailable");
  }
}

export async function processSpendRequest(params: {
  requestPubkey: string;
  vaultPubkey: string;
  purpose: string;
}): Promise<{
  score: number;
  decision: "approved" | "rejected";
  reason: string;
  reasons: string[];
  flags: AIFlags;
  decisionSource: AIDecisionSource;
  provider: string;
  signals: Record<string, unknown>;
  txSignature?: string;
}> {
  const vaultPubkey = new PublicKey(params.vaultPubkey);
  const requestPubkey = new PublicKey(params.requestPubkey);

  const context = await loadSpendRequestContext(vaultPubkey, requestPubkey);
  const backendRiskAuthority = getRiskAuthorityPublicKey().toBase58();
  const vaultRiskAuthority = context.vault.riskAuthority.toBase58();

  if (backendRiskAuthority !== vaultRiskAuthority) {
    throw new Error(
      `Backend risk authority ${backendRiskAuthority} does not match vault risk authority ${vaultRiskAuthority}. Recreate the vault with the backend authority or configure RISK_AUTHORITY_SECRET_KEY to match the existing vault.`
    );
  }

  const runtimeStatus = await ensureRiskAuthorityReady();
  if (!runtimeStatus.ready) {
    throw new Error(
      `Backend risk authority ${runtimeStatus.publicKey} is not ready for on-chain execution. ${runtimeStatus.warnings.join(" ")}`
    );
  }

  const aiDecision = await evaluateWithAI(params.purpose, context);
  const hardPolicy = validateHardPolicy(context, aiDecision);
  const policyChecks = buildPolicyChecks(context);
  const aiAvailable = aiDecision.source !== "fallback";
  const aiFindings = aiAvailable ? sanitizeAiFindings(aiDecision.reasons) : [];

  const finalDecision: "approved" | "rejected" =
    !hardPolicy.allowed || aiDecision.decision === "reject" ? "rejected" : "approved";
  const finalRiskScore = hardPolicy.enforcedRiskScore ?? aiDecision.riskScore;
  const finalReasons = dedupeReasons([
    hardPolicy.reason,
    ...(aiDecision.source === "fallback" ? aiDecision.reasons : []),
    ...(hardPolicy.allowed ? aiFindings : []),
    ...(aiAvailable || aiDecision.reasons.length > 0 ? [] : ["AI unavailable."]),
  ]);
  const finalReason = summarizeDecisionReasons(finalReasons);
  const finalFlags =
    !hardPolicy.allowed && hardPolicy.enforcementType === "policy_override"
      ? {
          ...aiDecision.flags,
          policy_violation: true,
        }
      : {
          ...aiDecision.flags,
          policy_violation: false,
        };
  const decisionSourceLabel =
    aiDecision.source === "fallback"
      ? "fallback_safety_engine"
      : !hardPolicy.allowed && hardPolicy.enforcementType === "policy_override"
        ? "policy_enforcement"
        : "ai_policy_validation";

  let txSignature: string | undefined;
  if (finalDecision === "approved") {
    txSignature = await approveSpendRequestOnChain({
      vaultPubkey,
      spendRequestPubkey: requestPubkey,
      policyPubkey: context.policyPubkey,
      beneficiaryPubkey: context.spendRequest.beneficiary,
      riskScore: finalRiskScore,
    });
  } else {
    txSignature = await rejectSpendRequestOnChain({
      vaultPubkey,
      spendRequestPubkey: requestPubkey,
      riskScore: finalRiskScore,
    });
  }
  const requestRecordedOnChain = true;
  const payoutExecutedOnChain = finalDecision === "approved" && Boolean(txSignature);
  const executedOnChain = Boolean(txSignature);

  const auditPayload = {
    inputPayload: aiDecision.inputPayload,
    sanitizedPurpose: aiDecision.sanitizedPurpose || params.purpose,
    aiStatus: aiAvailable ? "available" : "unavailable",
    aiProvider: aiDecision.provider,
    aiRecommendation: aiAvailable ? aiDecision.decision : null,
    aiRiskScore: aiAvailable ? aiDecision.riskScore : null,
    aiRiskSource: aiAvailable ? "gemini" : "fallback_engine",
    operatingMode: aiAvailable ? "standard" : "safe_mode",
    aiFindings,
    providerDecision: aiDecision.decision,
    providerRiskScore: aiDecision.riskScore,
    providerReasons: aiDecision.reasons,
    providerFlags: aiDecision.flags,
    policyChecks,
    finalFlags,
    hardPolicyOverride: hardPolicy.enforcementType === "policy_override",
    decisionRuleApplied: hardPolicy.enforcementType === "decision_rule",
    enforcementType: hardPolicy.enforcementType || "none",
    hardPolicyReason: hardPolicy.reason || null,
    providerRawResponse: aiDecision.rawResponse,
    finalDecision,
    finalDecisionSource: decisionSourceLabel,
    requestRecordedOnChain,
    payoutExecutedOnChain,
    executedOnChain,
    txSignature: txSignature || null,
    finalRiskScore,
    finalReasons,
  };

  saveAiDecision({
    requestId: params.requestPubkey,
    provider: aiDecision.provider,
    decision: finalDecision === "approved" ? "approve" : "reject",
    riskScore: finalRiskScore,
    reason: finalReason,
    reasons: finalReasons,
    flags: finalFlags,
    inputPayload: aiDecision.inputPayload,
    rawResponse: JSON.stringify(auditPayload),
    decisionSource: aiDecision.source,
  });

  saveRiskEvaluation({
    requestPubkey: params.requestPubkey,
    riskScore: finalRiskScore,
    signals: {
      aiDecision: aiDecision.decision,
      aiFlags: finalFlags as unknown as Record<string, unknown>,
      finalDecision,
      threshold: context.policy.riskThreshold,
      hardPolicyOverride: hardPolicy.enforcementType === "policy_override",
      decisionRuleApplied: hardPolicy.enforcementType === "decision_rule",
      policyChecks,
      finalDecisionSource: decisionSourceLabel,
      requestRecordedOnChain,
      payoutExecutedOnChain,
    },
    decision: finalDecision,
  });

  saveAuditEvent({
    vaultPubkey: params.vaultPubkey,
    eventType: `ai_decision_${finalDecision}`,
    details: {
      requestPubkey: params.requestPubkey,
      provider: aiDecision.provider,
      decisionSource: aiDecision.source,
      reason: finalReason,
      reasons: finalReasons,
      flags: finalFlags,
      policyChecks,
      riskScore: finalRiskScore,
      providerDecision: aiDecision.decision,
      aiFindings,
      hardPolicyReason: hardPolicy.reason || null,
      enforcementType: hardPolicy.enforcementType || "none",
      finalDecisionSource: decisionSourceLabel,
      requestRecordedOnChain,
      payoutExecutedOnChain,
      executedOnChain,
    },
    txSignature,
  });

  console.log(
    `  [AI] ${params.requestPubkey}: provider=${aiDecision.provider} source=${aiDecision.source} final=${finalDecision} tx=${txSignature}`
  );

  return {
    score: finalRiskScore,
    decision: finalDecision,
    reason: finalReason,
    reasons: finalReasons,
    flags: finalFlags,
    decisionSource: aiDecision.source,
    provider: aiDecision.provider,
    signals: {
      aiFlags: finalFlags as unknown as Record<string, unknown>,
      hardPolicyOverride: hardPolicy.enforcementType === "policy_override",
      policyChecks,
      finalDecisionSource: decisionSourceLabel,
      requestRecordedOnChain,
      payoutExecutedOnChain,
      executedOnChain,
    },
    txSignature,
  };
}
