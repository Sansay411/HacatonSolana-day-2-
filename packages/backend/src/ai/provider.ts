export type AIDecision = "approve" | "reject";
export type AIDecisionSource = "gemini" | "fallback";

export interface AIRequestHistoryItem {
  amount: number;
  timestamp: number;
  status: "approved" | "rejected" | "pending";
}

export interface AIVaultPolicy {
  maxPerTx: number;
  cooldown: number;
  totalLimit: number;
  riskThreshold: number;
}

export interface AIFlags {
  high_velocity: boolean;
  suspicious_pattern: boolean;
  policy_violation: boolean;
}

export interface AIRequestInput {
  amount: number;
  purpose: string;
  timestamp: number;
  walletAddress: string;
  requestHistory: AIRequestHistoryItem[];
  vaultPolicy: AIVaultPolicy;
}

export interface AIParsedOutput {
  risk_score: number;
  decision: AIDecision;
  reasons: string[];
  flags: AIFlags;
}

export interface AIProviderResult {
  provider: string;
  decision: AIDecision;
  riskScore: number;
  reasons: string[];
  flags: AIFlags;
  inputPayload: string;
  sanitizedPurpose: string;
  rawResponse: string;
}

export interface AIProvider {
  readonly name: string;
  evaluate(input: AIRequestInput): Promise<AIProviderResult>;
}

export function clampRiskScore(score: number) {
  if (!Number.isFinite(score)) return 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function sanitizeReasons(reasons: unknown): string[] {
  if (!Array.isArray(reasons)) {
    return ["No structured reasoning provided"];
  }

  const normalized = reasons
    .map((reason) => (typeof reason === "string" ? reason.trim() : ""))
    .filter(Boolean)
    .map((reason) => reason.slice(0, 120))
    .slice(0, 4);

  return normalized.length > 0 ? normalized : ["No structured reasoning provided"];
}

export function summarizeReasons(reasons: string[]) {
  return sanitizeReasons(reasons).join("; ").slice(0, 240);
}

export function sanitizeFlags(flags: unknown): AIFlags {
  if (!flags || typeof flags !== "object") {
    return {
      high_velocity: false,
      suspicious_pattern: false,
      policy_violation: false,
    };
  }

  const value = flags as Partial<AIFlags>;
  return {
    high_velocity: Boolean(value.high_velocity),
    suspicious_pattern: Boolean(value.suspicious_pattern),
    policy_violation: Boolean(value.policy_violation),
  };
}

export function normalizeDecision(value: string | undefined | null): AIDecision | null {
  if (!value) return null;
  if (value === "approve") return "approve";
  if (value === "reject") return "reject";
  return null;
}

const EMOTIONAL_PATTERNS = [
  /\burgent\b/gi,
  /\bplease\b/gi,
  /\bfamily\b/gi,
  /\bemergency\b/gi,
  /\bdesperate\b/gi,
  /\bhelp me\b/gi,
  /\bguilt\b/gi,
  /\bthreat\b/gi,
  /\bchildren\b/gi,
  /\bmedical\b/gi,
  /\bmother\b/gi,
  /\bfather\b/gi,
];

export function sanitizePurposeText(purpose: string) {
  const normalized = (purpose || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

  const neutralized = EMOTIONAL_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, " "),
    normalized
  )
    .replace(/\s+/g, " ")
    .trim();

  return neutralized || "Operational expense request";
}
