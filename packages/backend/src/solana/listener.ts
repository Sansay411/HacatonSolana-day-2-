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
  getVaultProfile,
  getWalletTrustProfile,
  listWalletRequestActivity,
  getSpendRequestDetail,
  saveAiDecision,
  saveAuditEvent,
  saveRiskEvaluation,
  saveWalletChronologyEvent,
  saveWalletTrustProfile,
  updateSpendRequestProcessing,
  updateSpendRequestRequesterWallet,
} from "../db/queries";
import { registerApprovedPayoutMonitoring } from "../monitoring/service";
import {
  buildBehavioralContext,
  computeBehavioralPenalty,
  explainBehavioralFlags,
} from "../risk-engine/behavior";
import {
  assessBehavioralRisk,
  applyStabilityReward,
  buildUpdatedTrustProfile,
  computeHybridRisk,
  fromTrustProfile,
  getTrustLevel,
  MIN_TRUST_SCORE,
} from "../risk-engine/stability";

const processedRequests = new Set<string>();
const walletEvaluationLocks = new Set<string>();
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
  errorCode?: "RATE_LIMIT_EXCEEDED" | "COOLDOWN_ACTIVE" | "TRUST_TOO_LOW" | "HIGH_RISK_BLOCKED";
}

interface InternalDecision {
  provider: string;
  source: AIDecisionSource;
  decision: AIDecision;
  decisionHint?: "approve" | "review" | "reject";
  riskScore: number;
  reasons: string[];
  explanation?: string;
  behavioralPatterns: string[];
  behavioralFlags?: string[];
  flags: AIFlags;
  sanitizedPurpose?: string;
  inputPayload: string;
  rawResponse: string;
  attempted: boolean;
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
    /cooldown period/i,
    /within the cooldown/i,
    /per-transaction limit/i,
    /daily limit/i,
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

function buildDecisionRuleReasons(errorCode: HardPolicyValidation["errorCode"]) {
  if (errorCode === "RATE_LIMIT_EXCEEDED") {
    return dedupeReasons([
      "Multiple request attempts were detected inside the protected time window.",
      "High frequency behavior triggered the wallet safety limits.",
      "The request was rejected before AI evaluation.",
    ]);
  }

  if (errorCode === "COOLDOWN_ACTIVE") {
    return dedupeReasons([
      "A recent rejection activated a temporary wallet lock.",
      "Repeated request attempts were detected after rejection.",
      "The request was rejected before AI evaluation.",
    ]);
  }

  if (errorCode === "TRUST_TOO_LOW") {
    return dedupeReasons([
      "Wallet trust score dropped below the safe operating level.",
      "Recent request behavior requires a recovery period before new payouts.",
      "The request was rejected to stabilize beneficiary behavior.",
    ]);
  }

  if (errorCode === "HIGH_RISK_BLOCKED") {
    return dedupeReasons([
      "Effective risk exceeded the dynamic threshold for this wallet.",
      "Behavioral penalties outweighed the current trust stabilizer.",
      "The request was blocked by the decision engine.",
    ]);
  }

  return [];
}

function getDecisionRulePrimaryReason(errorCode: NonNullable<HardPolicyValidation["errorCode"]>) {
  if (errorCode === "RATE_LIMIT_EXCEEDED") {
    return "Request rate limit exceeded for this wallet.";
  }
  if (errorCode === "COOLDOWN_ACTIVE") {
    return "A recent rejection activated a temporary request lock.";
  }
  if (errorCode === "TRUST_TOO_LOW") {
    return "Wallet trust score is below the safe operating level.";
  }
  return "Effective risk exceeded the configured threshold.";
}

function buildControlDecision(params: {
  walletAddress: string;
  code: NonNullable<HardPolicyValidation["errorCode"]>;
  context: SpendRequestContext;
  behavioralReasons?: string[];
}) {
  const reasons = dedupeReasons([
    ...buildDecisionRuleReasons(params.code),
    ...(params.behavioralReasons || []),
  ]).slice(0, 4);

  return {
    provider: "gemini",
    source: "fallback" as const,
    decision: "reject" as const,
    decisionHint: "reject" as const,
    riskScore: 100,
    reasons,
    explanation: reasons[0] || "Control decision applied before AI evaluation.",
    behavioralPatterns: params.behavioralReasons || [],
    behavioralFlags: [],
    flags: {
      high_velocity: true,
      suspicious_pattern: true,
      policy_violation: false,
    },
    inputPayload: JSON.stringify({
      walletAddress: params.walletAddress,
      reason: params.code,
    }),
    rawResponse: JSON.stringify({
      skipped: true,
      reason: params.code,
    }),
    attempted: false,
  };
}

function summarizeDecisionReasons(reasons: string[]) {
  return summarizeReasons(dedupeReasons(reasons));
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
      processedRequests.add(pubkey);
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
      processedRequests.delete(pubkey);
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
  const walletAddress = context.spendRequest.beneficiary.toBase58();
  const inputPayload = JSON.stringify({
    request: {
      amount: lamportsToSol(context.spendRequest.amount.toNumber()),
      description: "AI unavailable",
      timestamp: context.spendRequest.createdAt.toNumber(),
    },
    walletAddress,
  });

  return {
    provider: "gemini",
    source: "fallback",
    decision: "reject",
    decisionHint: "reject",
    riskScore: 100,
    reasons: buildFallbackReasons(context),
    explanation: "AI unavailable. The fallback safety engine was used instead.",
    behavioralPatterns: [],
    behavioralFlags: [],
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
    attempted: true,
  };
}

function validateHardPolicy(
  context: SpendRequestContext,
  effectiveRisk: number,
  effectiveThreshold: number,
  aiDecision: InternalDecision,
  trustScore: number
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
      errorCode: "COOLDOWN_ACTIVE",
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

  if (trustScore < MIN_TRUST_SCORE) {
    return {
      allowed: false,
      reason: "Wallet trust score is below the minimum safe level.",
      enforcedRiskScore: Math.max(effectiveRisk, 85),
      enforcementType: "decision_rule",
      errorCode: "TRUST_TOO_LOW",
    };
  }

  if (aiDecision.source === "fallback" && !aiDecision.attempted) {
    return {
      allowed: false,
      reason: "Fallback safety rules triggered rejection.",
      enforcedRiskScore: Math.max(effectiveRisk, aiDecision.riskScore),
      enforcementType: "decision_rule",
      errorCode: "RATE_LIMIT_EXCEEDED",
    };
  }

  if (effectiveRisk > effectiveThreshold) {
    return {
      allowed: false,
      reason: "Effective risk exceeded the configured threshold.",
      enforcedRiskScore: effectiveRisk,
      enforcementType: "decision_rule",
      errorCode: "HIGH_RISK_BLOCKED",
    };
  }

  return { allowed: true };
}

async function evaluateWithAI(
  purpose: string,
  context: SpendRequestContext,
  vaultProfile: ReturnType<typeof getVaultProfile>,
  behaviorContext: ReturnType<typeof buildBehavioralContext>,
  trustScore: number
): Promise<InternalDecision> {
  const walletAddress = context.spendRequest.beneficiary.toBase58();

  const aiInput: AIRequestInput = {
    request: {
      amount: lamportsToSol(context.spendRequest.amount.toNumber()),
      description: purpose,
      timestamp: context.spendRequest.createdAt.toNumber(),
    },
    vault: {
      purposeType: vaultProfile?.purposeType || "unknown",
      allowedCategories: vaultProfile?.allowedCategories || [],
      limits: {
        maxPerTx: lamportsToSol(context.policy.perTxLimit.toNumber()),
        cooldown: context.policy.cooldownSeconds.toNumber(),
        totalLimit: lamportsToSol(context.policy.totalLimit.toNumber()),
        riskThreshold: context.policy.riskThreshold,
        vaultModePreset: context.vaultMode === "active" ? (vaultProfile?.mode || "startup") : "startup",
      },
    },
    behavior: {
      lastRequests: context.recentRequests.map((request) => ({
        amount: lamportsToSol(request.amountLamports),
        status: request.status,
        timestamp: request.timestamp,
      })),
      rejectCount: behaviorContext.rejectCount,
      requestFrequency: behaviorContext.requestFrequency,
      timeSinceLastRequest: behaviorContext.timeSinceLastRequest,
      flags: behaviorContext.flags,
    },
    trustScore,
    walletAddress,
  };

  try {
    const result = await getAIProvider().evaluate(aiInput);
    return {
      provider: result.provider,
      source: "gemini",
      decision: result.decision,
      decisionHint: result.decisionHint,
      riskScore: result.riskScore,
      reasons: result.reasons,
      explanation: result.explanation,
      behavioralPatterns: result.behavioralPatterns,
      behavioralFlags: result.behavioralFlags,
      flags: result.flags,
      sanitizedPurpose: result.sanitizedPurpose,
      inputPayload: result.inputPayload,
      rawResponse: result.rawResponse,
      attempted: true,
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
  errorCode?: HardPolicyValidation["errorCode"] | null;
}> {
  const vaultPubkey = new PublicKey(params.vaultPubkey);
  const requestPubkey = new PublicKey(params.requestPubkey);

  const context = await loadSpendRequestContext(vaultPubkey, requestPubkey);
  const walletAddress = context.spendRequest.beneficiary.toBase58();
  const backendRiskAuthority = getRiskAuthorityPublicKey().toBase58();
  const vaultRiskAuthority = context.vault.riskAuthority.toBase58();
  const now = Math.floor(Date.now() / 1000);

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

  updateSpendRequestRequesterWallet({
    requestPubkey: params.requestPubkey,
    walletPubkey: walletAddress,
  });

  saveWalletChronologyEvent({
    vaultPubkey: params.vaultPubkey,
    walletPubkey: walletAddress,
    requestPubkey: params.requestPubkey,
    eventKey: `${params.requestPubkey}:request_created`,
    eventType: "request_created",
    explanation: "Spend request recorded for beneficiary review.",
    metadata: {
      amountSol: lamportsToSol(context.spendRequest.amount.toNumber()),
    },
    eventTimestamp: context.spendRequest.createdAt.toNumber() || now,
  });

  const storedTrustProfile = getWalletTrustProfile(params.vaultPubkey, walletAddress);
  const vaultProfile = getVaultProfile(params.vaultPubkey);
  const trustBeforeReward = fromTrustProfile(storedTrustProfile);
  const stabilityReward = applyStabilityReward(trustBeforeReward, now);
  const trustState = stabilityReward.profile;
  const walletHistory = listWalletRequestActivity(params.vaultPubkey, walletAddress, 25).filter(
    (item) => item.requestPubkey !== params.requestPubkey
  );
  const behavioral = assessBehavioralRisk({
    history: walletHistory,
    now,
  });
  const behaviorContext = buildBehavioralContext({
    description: params.purpose,
    history: walletHistory,
    allowedCategories: vaultProfile?.allowedCategories || [],
    now,
  });
  const behaviorFlagReasons = explainBehavioralFlags(behaviorContext.flags);
  const behavioralPenalty = behavioral.penalty + computeBehavioralPenalty(behaviorContext.flags);
  const policyChecks = buildPolicyChecks(context);
  let aiDecision: InternalDecision;
  const lockKey = `${params.vaultPubkey}:${walletAddress}`;
  const queueBlocked = walletEvaluationLocks.has(lockKey) || behavioral.activePendingCount >= 1;

  if (queueBlocked || behavioral.requestCountInWindow >= 2) {
    aiDecision = buildControlDecision({
      walletAddress,
      code: "RATE_LIMIT_EXCEEDED",
      context,
      behavioralReasons: [...behavioral.reasons, ...behaviorFlagReasons],
    });
  } else if (behavioral.rejectLockActive) {
    aiDecision = buildControlDecision({
      walletAddress,
      code: "COOLDOWN_ACTIVE",
      context,
      behavioralReasons: [...behavioral.reasons, ...behaviorFlagReasons],
    });
  } else if (trustState.trustScore < MIN_TRUST_SCORE) {
    aiDecision = buildControlDecision({
      walletAddress,
      code: "TRUST_TOO_LOW",
      context,
      behavioralReasons: [...behavioral.reasons, ...behaviorFlagReasons],
    });
  } else {
    walletEvaluationLocks.add(lockKey);
    try {
      aiDecision = await evaluateWithAI(
        params.purpose,
        context,
        vaultProfile,
        behaviorContext,
        trustState.trustScore
      );
    } finally {
      walletEvaluationLocks.delete(lockKey);
    }
  }

  const hybridRisk = computeHybridRisk({
    currentAiRisk: aiDecision.riskScore,
    previousRisks: trustState.riskHistory,
    behavioralPenalty,
    trustScore: trustState.trustScore,
    baseThreshold: context.policy.riskThreshold,
  });

  const hardPolicy = validateHardPolicy(
    context,
    hybridRisk.effectiveRisk,
    hybridRisk.effectiveThreshold,
    aiDecision,
    trustState.trustScore
  );
  const aiAvailable = aiDecision.source !== "fallback" && aiDecision.attempted;
  const aiFindingSource =
    aiDecision.behavioralPatterns.length > 0
      ? aiDecision.behavioralPatterns
      : aiDecision.reasons;
  const aiFindings = aiAvailable ? sanitizeAiFindings(aiFindingSource) : [];

  const finalDecision: "approved" | "rejected" =
    !hardPolicy.allowed || aiDecision.decision === "reject" ? "rejected" : "approved";
  const finalRiskScore = hardPolicy.enforcedRiskScore ?? hybridRisk.effectiveRisk;
  const finalReasons = dedupeReasons([
    hardPolicy.reason,
    ...(aiDecision.source === "fallback" ? buildDecisionRuleReasons(hardPolicy.errorCode) : []),
    ...(hardPolicy.allowed ? aiFindings : []),
    ...(aiDecision.explanation ? [aiDecision.explanation] : []),
    ...behaviorFlagReasons,
    ...(!hardPolicy.allowed && hardPolicy.errorCode
      ? buildDecisionRuleReasons(hardPolicy.errorCode)
      : []),
    ...((!aiAvailable && aiDecision.attempted) ? ["AI unavailable."] : []),
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
    aiDecision.source === "fallback" && !aiDecision.attempted
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

  const updatedTrust = buildUpdatedTrustProfile({
    profile: trustState,
    now,
    finalDecision,
    effectiveRisk: finalRiskScore,
    behavioral,
    cooldownViolation: hardPolicy.errorCode === "COOLDOWN_ACTIVE",
  });
  const trustLevel = getTrustLevel(updatedTrust.trustScore);

  saveWalletTrustProfile({
    vaultPubkey: params.vaultPubkey,
    walletPubkey: walletAddress,
    trustScore: updatedTrust.trustScore,
    successfulRequests: updatedTrust.successfulRequests,
    rejectedRequests: updatedTrust.rejectedRequests,
    cooldownViolations: updatedTrust.cooldownViolations,
    lowRiskRequests: updatedTrust.lowRiskRequests,
    stabilityRewards: updatedTrust.stabilityRewards,
    riskHistory: updatedTrust.riskHistory,
    lastRequestAt: updatedTrust.lastRequestAt,
    lastRejectedAt: updatedTrust.lastRejectedAt,
    lastDecidedAt: updatedTrust.lastDecidedAt,
    metadata: {
      trustLevel,
      stabilityRewardApplied: stabilityReward.rewarded,
      lastDecisionSource: decisionSourceLabel,
      behavioralPenalty,
      requestCountInWindow: behavioral.requestCountInWindow,
      repeatedRejectCount: behavioral.repeatedRejectCount,
      activePendingCount: behavioral.activePendingCount,
      effectiveThreshold: hybridRisk.effectiveThreshold,
      aiAttempted: aiDecision.attempted,
      behaviorFlags: behaviorContext.flags,
    },
  });

  saveWalletChronologyEvent({
    vaultPubkey: params.vaultPubkey,
    walletPubkey: walletAddress,
    requestPubkey: params.requestPubkey,
    eventKey: `${params.requestPubkey}:${finalDecision}`,
    eventType: finalDecision,
    explanation:
      finalDecision === "approved"
        ? "Spend request approved and prepared for release."
        : hardPolicy.errorCode
          ? getDecisionRulePrimaryReason(hardPolicy.errorCode)
          : "Spend request rejected by the control engine.",
    txSignature: txSignature || null,
    metadata: {
      amountSol: lamportsToSol(context.spendRequest.amount.toNumber()),
      decisionSource: decisionSourceLabel,
      riskSnapshot: {
        aiRisk: aiDecision.riskScore,
        smoothedRisk: hybridRisk.smoothedRisk,
        effectiveRisk: finalRiskScore,
        effectiveThreshold: hybridRisk.effectiveThreshold,
        trustScore: updatedTrust.trustScore,
      },
      behaviorFlags: behaviorContext.flags,
      reasons: finalReasons,
    },
    eventTimestamp: now,
  });

  saveWalletChronologyEvent({
    vaultPubkey: params.vaultPubkey,
    walletPubkey: walletAddress,
    requestPubkey: params.requestPubkey,
    eventKey: `${params.requestPubkey}:trust:${updatedTrust.trustScore}:${now}`,
    eventType:
      updatedTrust.trustScore > trustBeforeReward.trustScore
        ? "trust_score_increased"
        : updatedTrust.trustScore < trustBeforeReward.trustScore
          ? "trust_score_decreased"
          : "trust_score_updated",
    explanation:
      updatedTrust.trustScore > trustBeforeReward.trustScore
        ? "Trust score improved after stable request behavior."
        : updatedTrust.trustScore < trustBeforeReward.trustScore
          ? "Trust score decreased after risky request behavior."
          : "Trust score was recalculated after the latest request.",
    metadata: {
      trustScore: updatedTrust.trustScore,
      trustLevel,
      previousTrustScore: trustBeforeReward.trustScore,
    },
    eventTimestamp: now,
  });

  if (finalDecision === "approved" && txSignature) {
    await registerApprovedPayoutMonitoring({
      vaultPubkey: params.vaultPubkey,
      walletPubkey: walletAddress,
      requestPubkey: params.requestPubkey,
      payoutAmountLamports: context.spendRequest.amount.toNumber(),
      payoutTxSignature: txSignature,
      payoutTimestamp: now,
    });
  }

  const auditPayload = {
    inputPayload: aiDecision.inputPayload,
    sanitizedPurpose: aiDecision.sanitizedPurpose || params.purpose,
    aiStatus: aiAvailable ? "available" : "unavailable",
    aiProvider: aiDecision.provider,
    aiRecommendation: aiAvailable ? aiDecision.decision : null,
    aiDecisionHint: aiDecision.decisionHint || (aiDecision.decision === "approve" ? "approve" : "reject"),
    aiRiskScore: aiAvailable ? aiDecision.riskScore : null,
    aiRiskSource: aiAvailable ? "gemini" : "fallback_engine",
    operatingMode: aiAvailable ? "standard" : "safe_mode",
    aiFindings,
    aiExplanation: aiDecision.explanation || null,
    behavioralPatterns: aiDecision.behavioralPatterns,
    behavioralFlags: behaviorContext.flags,
    providerDecision: aiDecision.decision,
    providerRiskScore: aiDecision.riskScore,
    providerReasons: aiDecision.reasons,
    providerFlags: aiDecision.flags,
    aiAttempted: aiDecision.attempted,
    aiBehavioralPatterns: aiDecision.behavioralPatterns,
    policyChecks,
    finalFlags,
    hardPolicyOverride: hardPolicy.enforcementType === "policy_override",
    decisionRuleApplied: hardPolicy.enforcementType === "decision_rule",
    enforcementType: hardPolicy.enforcementType || "none",
    errorCode: hardPolicy.errorCode || null,
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
    trustScore: updatedTrust.trustScore,
    trustLevel,
    successfulRequests: updatedTrust.successfulRequests,
    rejectedRequests: updatedTrust.rejectedRequests,
    cooldownViolations: updatedTrust.cooldownViolations,
    lowRiskRequests: updatedTrust.lowRiskRequests,
    stabilityRewards: updatedTrust.stabilityRewards,
    smoothedRisk: hybridRisk.smoothedRisk,
    behavioralPenalty,
    effectiveRisk: hybridRisk.effectiveRisk,
    effectiveThreshold: hybridRisk.effectiveThreshold,
    behavioralReasons: [...behavioral.reasons, ...behaviorFlagReasons],
    requestCountInWindow: behavioral.requestCountInWindow,
    repeatedRejectCount: behavioral.repeatedRejectCount,
    activePendingCount: behavioral.activePendingCount,
    riskHistory: updatedTrust.riskHistory,
  };

  saveAiDecision({
    requestId: params.requestPubkey,
    provider: aiDecision.provider,
    decision: finalDecision === "approved" ? "approve" : "reject",
    riskScore: finalRiskScore,
    reason: finalReason,
    reasons: finalReasons,
    flags: finalFlags,
    patterns: [...(aiDecision.behavioralPatterns || []), ...behaviorFlagReasons],
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
      threshold: hybridRisk.effectiveThreshold,
      baseThreshold: context.policy.riskThreshold,
      smoothedRisk: hybridRisk.smoothedRisk,
      behavioralPenalty,
      behaviorFlags: behaviorContext.flags,
      trustScore: updatedTrust.trustScore,
      trustLevel,
      hardPolicyOverride: hardPolicy.enforcementType === "policy_override",
      decisionRuleApplied: hardPolicy.enforcementType === "decision_rule",
      policyChecks,
      finalDecisionSource: decisionSourceLabel,
      requestRecordedOnChain,
      payoutExecutedOnChain,
      errorCode: hardPolicy.errorCode || null,
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
      aiExplanation: aiDecision.explanation || null,
      behaviorFlags: behaviorContext.flags,
      behavioralReasons: [...behavioral.reasons, ...behaviorFlagReasons],
      hardPolicyReason: hardPolicy.reason || null,
      enforcementType: hardPolicy.enforcementType || "none",
      finalDecisionSource: decisionSourceLabel,
      requestRecordedOnChain,
      payoutExecutedOnChain,
      executedOnChain,
      trustScore: updatedTrust.trustScore,
      trustLevel,
      effectiveRisk: hybridRisk.effectiveRisk,
      effectiveThreshold: hybridRisk.effectiveThreshold,
      smoothedRisk: hybridRisk.smoothedRisk,
      behavioralPenalty,
      errorCode: hardPolicy.errorCode || null,
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
      trustScore: updatedTrust.trustScore,
      trustLevel,
      smoothedRisk: hybridRisk.smoothedRisk,
      effectiveRisk: hybridRisk.effectiveRisk,
      effectiveThreshold: hybridRisk.effectiveThreshold,
      behavioralPenalty,
      behaviorFlags: behaviorContext.flags,
      behavioralReasons: [...behavioral.reasons, ...behaviorFlagReasons],
      errorCode: hardPolicy.errorCode || null,
    },
    txSignature,
    errorCode: hardPolicy.errorCode || null,
  };
}
