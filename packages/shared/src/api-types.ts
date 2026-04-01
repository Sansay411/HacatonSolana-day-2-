// ============================================================
// API types — contract between backend and frontend
// ============================================================

/** POST /api/vaults — off-chain metadata for vault creation */
export interface CreateVaultRequest {
  vaultAddress: string;
  name?: string;
  description?: string;
}

/** POST /api/spend-requests — submit description to backend */
export interface SubmitSpendRequestPayload {
  vaultAddress: string;
  requestIndex: number;
  requestAddress: string;
  description: string;
  amount: number; // lamports
  walletAddress?: string;
}

export interface AIDecisionFlags {
  high_velocity: boolean;
  suspicious_pattern: boolean;
  policy_violation: boolean;
}

export interface SpendRequestAIEvaluation {
  provider: string | null;
  status: "available" | "unavailable" | "in_progress";
  recommendation: "approve" | "reject" | null;
  riskScore: number | null;
  riskLevel: "low" | "medium" | "high" | null;
  findings: string[];
  flags: AIDecisionFlags | null;
  riskSource: "gemini" | "fallback_engine" | null;
  attempted: boolean;
  inProgress: boolean;
}

export interface SpendRequestPolicyEnforcement {
  perTxLimit: "passed" | "failed" | "not_applicable";
  cooldown: "passed" | "failed" | "not_applicable";
  totalLimit: "passed" | "failed" | "not_applicable";
  vaultMode: "active" | "restricted" | "paused" | "not_applicable";
  overrideType: "none" | "policy_override" | "decision_rule";
  overrideReason: string | null;
}

export interface SpendRequestFinalDecisionSummary {
  decision: "approved" | "rejected" | "pending";
  decisionSource:
    | "pending"
    | "ai_policy_validation"
    | "policy_enforcement"
    | "fallback_safety_engine";
  operatingMode: "standard" | "safe_mode";
  requestRecordedOnChain: boolean;
  payoutExecutedOnChain: boolean;
  reasons: string[];
  txSignature: string | null;
}

/** GET /api/spend-requests/:address — response includes off-chain data */
export interface SpendRequestDetail {
  requestAddress: string;
  vaultAddress: string;
  requestIndex: number;
  description: string;
  descriptionHash: string; // hex
  riskScore: number | null;
  riskSignals: RiskSignals | null;
  decision: "approved" | "rejected" | "pending";
  reason: string | null;
  reasons: string[];
  provider: string | null;
  decisionSource: "gemini" | "fallback" | null;
  flags: AIDecisionFlags | null;
  aiEvaluation: SpendRequestAIEvaluation;
  policyEnforcement: SpendRequestPolicyEnforcement;
  finalDecisionSummary: SpendRequestFinalDecisionSummary;
  evaluatedAt: string | null;
  processingStatus: "pending" | "processing" | "completed" | "failed";
  processingError: string | null;
  lastProcessedAt: string | null;
}

export interface BackendRuntimeStatus {
  aiProvider: string;
  aiModel?: string;
  aiConfigured?: boolean;
  aiTimeoutMs?: number;
  riskAuthority: {
    publicKey: string;
    balanceLamports: number;
    balanceSol: number;
    ready: boolean;
    isConfigured: boolean;
    isEphemeral: boolean;
    warnings: string[];
  };
}

/** Risk signals returned by risk engine */
export interface RiskSignals {
  amountRatio: number;
  velocity: number;
  timeAnomaly: number;
  amountAnomaly: number;
  compositeScore: number;
}

/** GET /api/vaults/:address/activity — audit events */
export interface AuditEvent {
  id: string;
  vaultAddress: string;
  eventType: string;
  actorAddress: string | null;
  details: Record<string, unknown>;
  txSignature: string | null;
  timestamp: string;
}

/** Standard API error response */
export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
