import { Router, Request, Response } from "express";
import { createHash } from "crypto";
import {
  findRecentDuplicateSpendRequest,
  saveSpendRequestDetail,
  updateSpendRequestProcessing,
  getSpendRequestDetail,
  getVaultRequests,
  getAiDecision,
  getRiskEvaluation,
  saveAuditEvent,
  getAuditEventForRequest,
} from "../db/queries";
import { processSpendRequest } from "../solana/listener";
import { requireVerifiedFirebaseAuth } from "../auth/firebaseToken";
import { getProgram } from "../solana/client";
import { PublicKey } from "@solana/web3.js";

export const spendRequestRoutes = Router();

const DUPLICATE_WINDOW_SECONDS = 90;

type DecisionSourceLabel =
  | "pending"
  | "ai_policy_validation"
  | "policy_enforcement"
  | "fallback_safety_engine";

type PolicyCheckStatus = "passed" | "failed" | "not_applicable";
type PolicyModeStatus = "active" | "restricted" | "paused" | "not_applicable";

function normalizePolicyCheck(
  value: unknown,
  resolved: boolean
): PolicyCheckStatus {
  if (value === "passed" || value === "failed") return value;
  return resolved ? "not_applicable" : "not_applicable";
}

function normalizePolicyMode(
  value: unknown,
  resolved: boolean
): PolicyModeStatus {
  if (value === "active" || value === "restricted" || value === "paused") {
    return value;
  }
  return resolved ? "not_applicable" : "not_applicable";
}

function normalizeDisplayReason(reason: string) {
  if (/Fallback safety rules triggered rejection/i.test(reason)) {
    return "Fallback safety rules triggered rejection.";
  }
  if (/Safety fallback activated/i.test(reason)) {
    return "Safety fallback activated.";
  }
  if (/Repeated request attempts detected/i.test(reason)) {
    return "Repeated request attempts detected.";
  }
  if (/High frequency behavior detected/i.test(reason)) {
    return "High frequency behavior detected.";
  }
  if (/Rejected by hard policy: AI risk score exceeds threshold/i.test(reason)) {
    return "AI risk score exceeded the configured threshold.";
  }
  if (/Rejected by hard policy: cooldown between payouts is still active/i.test(reason)) {
    return "Cooldown between payouts is still active.";
  }
  if (/Cooldown policy violation/i.test(reason)) {
    return "Cooldown between payouts is still active.";
  }
  if (/Rejected by hard policy: request exceeds per-transaction limit/i.test(reason)) {
    return "Request exceeds the per-request payout limit.";
  }
  if (/Rejected by hard policy: request exceeds total vault limit/i.test(reason)) {
    return "Request exceeds the total vault limit.";
  }
  if (/Rejected by hard policy: request exceeds current vault balance/i.test(reason)) {
    return "Request exceeds the available vault balance.";
  }
  if (/Rejected by hard policy: vault mode is/i.test(reason)) {
    return reason.replace(/^Rejected by hard policy:\s*/i, "").replace(/^vault mode is/i, "Vault mode is");
  }
  return reason;
}

function dedupeItems(items: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const value = (item || "").trim();
    if (!value) continue;
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }

  return result;
}

function sanitizeAiFindings(findings: unknown) {
  const values = Array.isArray(findings) ? findings : [];
  const blockedPatterns = [
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
    /fallback safety rules triggered rejection/i,
    /safety fallback activated/i,
  ];

  return dedupeItems(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => !blockedPatterns.some((pattern) => pattern.test(value)))
      .map(normalizeDisplayReason)
  );
}

function buildBehavioralFindingsFromFlags(flags: unknown) {
  const value = flags && typeof flags === "object" ? (flags as Record<string, unknown>) : {};
  return dedupeItems([
    value.high_velocity ? "Elevated request velocity detected." : null,
    value.suspicious_pattern ? "Request pattern deviates from normal behavior." : null,
  ]);
}

function sanitizeDecisionReasons(reasons: unknown) {
  const values = Array.isArray(reasons) ? reasons : [];
  return dedupeItems(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(normalizeDisplayReason)
  );
}

function buildFallbackDecisionReasons(reasons: string[]) {
  return dedupeItems([
    "Repeated request attempts detected.",
    "High frequency behavior detected.",
    "Safety fallback activated.",
    "Fallback safety rules triggered rejection.",
  ]).slice(0, 4);
}

function buildFallbackApprovalReasons(auditPayload: Record<string, any>, reasons: string[]) {
  return dedupeItems([
    typeof auditPayload?.providerReason === "string" ? normalizeDisplayReason(auditPayload.providerReason) : null,
    typeof auditPayload?.reason === "string" ? normalizeDisplayReason(auditPayload.reason) : null,
    ...reasons,
    "Fallback policy engine approved the request within configured limits.",
  ]).slice(0, 3);
}

function inferOverrideType(auditPayload: Record<string, any> | null) {
  if (auditPayload?.enforcementType === "policy_override") return "policy_override";
  if (auditPayload?.enforcementType === "decision_rule") return "decision_rule";
  const hardPolicyReason = typeof auditPayload?.hardPolicyReason === "string" ? auditPayload.hardPolicyReason : "";
  if (/risk score exceeds threshold/i.test(hardPolicyReason)) {
    return "decision_rule";
  }
  if (auditPayload?.hardPolicyOverride || hardPolicyReason) {
    return "policy_override";
  }
  return "none";
}

function mentionsCooldownFailure(...sources: unknown[]) {
  return sources.some((source) =>
    Array.isArray(source)
      ? source.some((item) => typeof item === "string" && /cooldown policy violation|cooldown between payouts is still active/i.test(item))
      : typeof source === "string" && /cooldown policy violation|cooldown between payouts is still active/i.test(source)
  );
}

function normalizeDecisionSource(
  value: unknown,
  fallback: DecisionSourceLabel
): DecisionSourceLabel {
  if (
    value === "pending" ||
    value === "ai_policy_validation" ||
    value === "policy_enforcement" ||
    value === "fallback_safety_engine" ||
    value === "fallback_policy_engine"
  ) {
    return value === "fallback_policy_engine" ? "fallback_safety_engine" : value;
  }
  return fallback;
}

function safeParseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, any>;
  } catch {
    return null;
  }
}

function mergeAuditPayload(
  rawPayload: Record<string, any> | null,
  auditDetails: Record<string, any> | null,
  auditEvent: any
): Record<string, any> {
  return {
    ...(auditDetails || {}),
    ...(rawPayload || {}),
    txSignature: rawPayload?.txSignature || auditDetails?.txSignature || auditEvent?.tx_signature || null,
  };
}

function toRiskLevel(score: number | null) {
  if (score === null || score === undefined) return null;
  if (score <= 30) return "low";
  if (score <= 55) return "medium";
  return "high";
}

function sanitizeDescriptionInput(value: unknown) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

async function validateSpendRequestInput(params: {
  vaultAddress: string;
  amountLamports: number;
  description: string;
}) {
  if (!params.vaultAddress) {
    return { valid: false, errorCode: "INVALID_INPUT", message: "vaultAddress is required" };
  }

  if (!Number.isFinite(params.amountLamports) || params.amountLamports <= 0) {
    return { valid: false, errorCode: "INVALID_INPUT", message: "Amount must be greater than zero" };
  }

  if (params.description.length < 10 || params.description.length > 300) {
    return {
      valid: false,
      errorCode: "INVALID_INPUT",
      message: "Description must be between 10 and 300 characters",
    };
  }

  try {
    const program = getProgram();
    const vault = (await (program.account as any).vault.fetch(new PublicKey(params.vaultAddress))) as any;
    const [policyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), new PublicKey(params.vaultAddress).toBuffer()],
      program.programId
    );
    const policy = (await (program.account as any).policy.fetch(policyPda)) as any;

    if (params.amountLamports > policy.perTxLimit.toNumber()) {
      return {
        valid: false,
        errorCode: "INVALID_INPUT",
        message: "Amount exceeds the configured per-request payout limit",
      };
    }

    const availableLamports = vault.totalDeposited.toNumber() - vault.totalDisbursed.toNumber();
    if (params.amountLamports > availableLamports) {
      return {
        valid: false,
        errorCode: "INVALID_INPUT",
        message: "Amount exceeds available vault balance",
      };
    }
  } catch (error) {
    return {
      valid: false,
      errorCode: "INVALID_INPUT",
      message: "Vault or policy could not be validated",
    };
  }

  return { valid: true as const };
}

/**
 * POST /api/spend-requests
 * Submit off-chain description for a spend request and trigger risk evaluation.
 *
 * Flow:
 * 1. Frontend submits spend request on-chain (submit_spend_request ix)
 * 2. Frontend calls this endpoint with the description
 * 3. Backend stores description, computes risk score
 * 4. Backend sends approve/reject transaction on-chain
 */
spendRequestRoutes.post("/", requireVerifiedFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const {
      vaultAddress,
      requestIndex,
      requestAddress,
      description,
      amount,
      walletAddress,
    } = req.body;

    // Validate required fields
    if (!vaultAddress || requestIndex === undefined || !requestAddress || !description) {
      return res.status(400).json({
        error: "validation",
        message: "Missing required fields: vaultAddress, requestIndex, requestAddress, description",
      });
    }

    const normalizedDescription = sanitizeDescriptionInput(description);

    if (!normalizedDescription) {
      return res.status(400).json({
        error: "validation",
        message: "Description cannot be empty",
      });
    }

    const amountLamports = Number(amount || 0);
    const validation = await validateSpendRequestInput({
      vaultAddress,
      amountLamports,
      description: normalizedDescription,
    });

    if (!validation.valid) {
      return res.status(400).json({
        error: "validation",
        message: validation.message,
        errorCode: validation.errorCode,
      });
    }

    const normalizedWalletAddress =
      typeof walletAddress === "string" ? walletAddress.trim() : "";

    if (!normalizedWalletAddress) {
      return res.status(400).json({
        error: "validation",
        message: "walletAddress is required",
        errorCode: "INVALID_INPUT",
      });
    }

    // Compute description hash for integrity verification
    const descriptionHash = createHash("sha256")
      .update(normalizedDescription)
      .digest("hex");

    const duplicate = findRecentDuplicateSpendRequest({
      vaultPubkey: vaultAddress,
      walletPubkey: normalizedWalletAddress,
      descriptionHash,
      amountLamports,
      windowSeconds: DUPLICATE_WINDOW_SECONDS,
    });

    if (duplicate && duplicate.request_pubkey !== requestAddress) {
      return res.status(409).json({
        error: "duplicate",
        message: "Duplicate request detected inside the protected time window",
        errorCode: "RATE_LIMIT_EXCEEDED",
      });
    }

    const existing = getSpendRequestDetail(requestAddress);
    if (
      existing &&
      ["processing", "completed"].includes(String(existing.processing_status || ""))
    ) {
      return res.status(202).json({
        requestAddress,
        descriptionHash,
        riskScore: null,
        decision: "pending",
        reason: null,
        reasons: [],
        flags: null,
        provider: "gemini",
        decisionSource: "pending",
        signals: null,
        txSignature: null,
        errorCode: null,
      });
    }

    // Store off-chain description
    saveSpendRequestDetail({
      vaultPubkey: vaultAddress,
      requestIndex,
      requestPubkey: requestAddress,
      description: normalizedDescription,
      descriptionHash,
      amountLamports,
      requesterWalletPubkey: normalizedWalletAddress,
    });
    updateSpendRequestProcessing({
      requestPubkey: requestAddress,
      status: "pending",
      error: null,
    });

    try {
      updateSpendRequestProcessing({
        requestPubkey: requestAddress,
        status: "processing",
        error: null,
      });

      const result = await processSpendRequest({
        requestPubkey: requestAddress,
        vaultPubkey: vaultAddress,
        purpose: normalizedDescription,
      });

      updateSpendRequestProcessing({
        requestPubkey: requestAddress,
        status: "completed",
        error: null,
      });

      res.json({
        requestAddress,
        descriptionHash,
        riskScore: result.score,
        decision: result.decision,
        reason: result.reason,
        reasons: result.reasons,
        flags: result.flags,
        provider: result.provider,
        decisionSource: result.decisionSource,
        signals: result.signals,
        txSignature: result.txSignature || null,
        errorCode: result.errorCode || null,
      });
    } catch (error: any) {
      const message = error?.message || "Failed to execute AI decision on-chain";
      updateSpendRequestProcessing({
        requestPubkey: requestAddress,
        status: "failed",
        error: message,
      });
      saveAuditEvent({
        vaultPubkey: vaultAddress,
        eventType: "ai_processing_failed",
        details: {
          requestPubkey: requestAddress,
          description,
          error: message,
        },
      });
      throw error;
    }
  } catch (err) {
    console.error("Error processing spend request:", err);
    const message = err instanceof Error ? err.message : "Failed to process spend request";
    const errorCodeMatch = /RATE_LIMIT_EXCEEDED|COOLDOWN_ACTIVE|TRUST_TOO_LOW|HIGH_RISK_BLOCKED/.exec(
      message
    );
    const statusCode = errorCodeMatch ? 429 : 500;
    res.status(statusCode).json({
      error: errorCodeMatch ? "risk_control" : "internal",
      message,
      errorCode: errorCodeMatch?.[0] || null,
    });
  }
});

/**
 * GET /api/spend-requests/:address
 * Get spend request details including off-chain description and risk evaluation.
 */
spendRequestRoutes.get("/:address", (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const detail = getSpendRequestDetail(address);
    const risk = getRiskEvaluation(address);
    const aiDecision = getAiDecision(address);
    const auditEvent = getAuditEventForRequest(address);
    const auditDetails = safeParseJson(auditEvent?.details);
    const auditPayload = mergeAuditPayload(
      safeParseJson(aiDecision?.raw_response),
      auditDetails,
      auditEvent
    );

    if (!detail) {
      return res.status(404).json({
        error: "not_found",
        message: "Spend request not found",
      });
    }

    const finalDecision =
      aiDecision?.decision === "approve"
        ? "approved"
        : aiDecision?.decision === "reject"
          ? "rejected"
          : risk?.decision || "pending";
    const resolved = finalDecision !== "pending" || detail.processing_status === "completed";
    const fallbackDecisionSource =
      finalDecision === "pending"
        ? "pending"
        : aiDecision?.decision_source === "fallback"
          ? "fallback_safety_engine"
          : "ai_policy_validation";
    const aiStatus =
      auditPayload?.aiStatus === "available" || auditPayload?.aiStatus === "unavailable"
        ? auditPayload.aiStatus
        : detail.processing_status === "pending" || detail.processing_status === "processing"
          ? "in_progress"
          : aiDecision?.decision_source === "fallback"
            ? "unavailable"
            : aiDecision
              ? "available"
              : "unavailable";
    const decisionSource =
      aiStatus === "unavailable"
        ? "fallback_safety_engine"
        : normalizeDecisionSource(
            auditPayload?.finalDecisionSource || auditPayload?.decisionSource,
            fallbackDecisionSource
          );
    const aiFindingsSource =
      auditPayload?.behavioralPatterns ||
      auditPayload?.aiFindings ||
      aiDecision?.reasons_json ||
      [];
    const aiFindings = sanitizeAiFindings(aiFindingsSource);
    const aiFlags =
      aiStatus === "available" && aiDecision?.flags_json
        ? { ...aiDecision.flags_json, policy_violation: false }
        : null;
    const visibleAiFindings =
      aiStatus === "available"
        ? aiFindings.length > 0
          ? aiFindings
          : buildBehavioralFindingsFromFlags(aiFlags)
        : [];
    const aiRiskScore =
      auditPayload && Object.prototype.hasOwnProperty.call(auditPayload, "aiRiskScore")
        ? (auditPayload.aiRiskScore as number | null)
        : aiStatus === "available"
          ? (aiDecision?.risk_score ?? risk?.risk_score ?? null)
          : null;
    const requestRecordedOnChain =
      typeof auditPayload?.requestRecordedOnChain === "boolean"
        ? auditPayload.requestRecordedOnChain
        : finalDecision !== "pending"
          ? Boolean(auditEvent || auditPayload?.txSignature || aiDecision)
          : false;
    const payoutExecutedOnChain =
      typeof auditPayload?.payoutExecutedOnChain === "boolean"
        ? auditPayload.payoutExecutedOnChain
        : finalDecision === "approved" && Boolean(auditPayload?.txSignature || auditEvent?.tx_signature);
    const rawFinalReasons = sanitizeDecisionReasons(
      Array.isArray(auditPayload?.finalReasons) ? auditPayload.finalReasons : aiDecision?.reasons_json || []
    );
    const finalReasons =
      aiStatus === "unavailable"
        ? finalDecision === "approved"
          ? buildFallbackApprovalReasons(auditPayload, rawFinalReasons)
          : buildFallbackDecisionReasons(rawFinalReasons)
        : rawFinalReasons;
    const finalReason =
      aiStatus === "unavailable"
        ? finalReasons[0] || null
        : typeof aiDecision?.reason === "string" && aiDecision.reason.trim()
          ? normalizeDisplayReason(aiDecision.reason)
          : finalReasons[0] || null;
    const overrideType = inferOverrideType(auditPayload);
    const operatingMode =
      auditPayload?.operatingMode === "safe_mode" || aiStatus === "unavailable"
        ? "safe_mode"
        : "standard";
    const cooldownFailed = mentionsCooldownFailure(
      auditPayload?.hardPolicyReason,
      auditPayload?.finalReasons,
      auditPayload?.aiFindings,
      aiDecision?.reasons_json
    );

    res.json({
      requestAddress: detail.request_pubkey,
      vaultAddress: detail.vault_pubkey,
      requestIndex: detail.request_index,
      description: detail.description,
      descriptionHash: detail.description_hash,
      riskScore: aiDecision?.risk_score ?? risk?.risk_score ?? null,
      riskSignals: risk?.signals || null,
      decision: finalDecision,
      reason: finalReason,
      reasons: finalReasons,
      provider: aiDecision?.provider || null,
      decisionSource: aiDecision?.decision_source || null,
      flags: aiDecision?.flags_json || null,
      aiEvaluation: {
        provider: auditPayload?.aiProvider || aiDecision?.provider || "Gemini",
        status: aiStatus,
        recommendation:
          aiStatus === "available"
            ? auditPayload && Object.prototype.hasOwnProperty.call(auditPayload, "aiRecommendation")
              ? auditPayload.aiRecommendation || null
              : aiDecision?.decision || null
            : null,
        decisionHint:
          aiStatus === "available"
            ? auditPayload?.aiDecisionHint || null
            : null,
        riskScore: aiRiskScore,
        effectiveRisk:
          typeof auditPayload?.effectiveRisk === "number" ? auditPayload.effectiveRisk : null,
        trustScore:
          typeof auditPayload?.trustScore === "number" ? auditPayload.trustScore : null,
        riskLevel: toRiskLevel(aiRiskScore),
        findings: visibleAiFindings,
        explanation:
          typeof auditPayload?.aiExplanation === "string" ? auditPayload.aiExplanation : null,
        behaviorFlags: Array.isArray(auditPayload?.behavioralFlags)
          ? auditPayload.behavioralFlags.filter((item: unknown) => typeof item === "string")
          : [],
        flags: aiFlags,
        riskSource: auditPayload?.aiRiskSource || (aiStatus === "available" ? "gemini" : "fallback_engine"),
        attempted: Boolean(aiDecision),
        inProgress: detail.processing_status === "pending" || detail.processing_status === "processing",
      },
      policyEnforcement: {
        perTxLimit:
          auditPayload?.policyChecks?.per_tx_limit
            ? normalizePolicyCheck(auditPayload?.policyChecks?.per_tx_limit, resolved)
            : finalDecision === "approved"
              ? "passed"
              : normalizePolicyCheck(auditPayload?.policyChecks?.per_tx_limit, resolved),
        cooldown: cooldownFailed
          ? "failed"
          : auditPayload?.policyChecks?.cooldown
            ? normalizePolicyCheck(auditPayload?.policyChecks?.cooldown, resolved)
            : finalDecision === "approved"
              ? "passed"
              : normalizePolicyCheck(auditPayload?.policyChecks?.cooldown, resolved),
        totalLimit:
          auditPayload?.policyChecks?.total_limit
            ? normalizePolicyCheck(auditPayload?.policyChecks?.total_limit, resolved)
            : finalDecision === "approved"
              ? "passed"
              : normalizePolicyCheck(auditPayload?.policyChecks?.total_limit, resolved),
        vaultMode:
          auditPayload?.policyChecks?.vault_mode
            ? normalizePolicyMode(auditPayload?.policyChecks?.vault_mode, resolved)
            : finalDecision === "approved"
              ? "active"
              : normalizePolicyMode(auditPayload?.policyChecks?.vault_mode, resolved),
        overrideType,
        overrideReason:
          aiStatus === "unavailable"
            ? finalDecision === "rejected"
              ? "Fallback safety rules triggered rejection."
              : null
            : typeof auditPayload?.hardPolicyReason === "string"
              ? normalizeDisplayReason(auditPayload.hardPolicyReason)
              : null,
      },
      finalDecisionSummary: {
        decision: finalDecision,
        decisionSource,
        operatingMode,
        requestRecordedOnChain,
        payoutExecutedOnChain,
        reasons: finalReasons,
        txSignature: auditPayload?.txSignature || auditEvent?.tx_signature || null,
      },
      evaluatedAt: aiDecision?.created_at || auditEvent?.timestamp || risk?.evaluated_at || null,
      processingStatus: detail.processing_status || "pending",
      processingError: detail.processing_error || null,
      lastProcessedAt: detail.last_processed_at || null,
    });
  } catch (err) {
    console.error("Error fetching spend request:", err);
    res.status(500).json({
      error: "internal",
      message: "Failed to fetch spend request",
    });
  }
});

/**
 * GET /api/spend-requests/vault/:vaultAddress
 * List all spend requests for a vault.
 */
spendRequestRoutes.get("/vault/:vaultAddress", (req: Request, res: Response) => {
  try {
    const { vaultAddress } = req.params;
    const requests = getVaultRequests(vaultAddress);

    res.json({
      vaultAddress,
      requests: requests.map((r: any) => ({
        requestAddress: r.request_pubkey,
        requestIndex: r.request_index,
        description: r.description,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("Error listing requests:", err);
    res.status(500).json({
      error: "internal",
      message: "Failed to list spend requests",
    });
  }
});
