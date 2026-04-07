export type AIDecision = "approve" | "reject";
export type AIDecisionSource = "gemini" | "fallback";
export type AIDecisionHint = "approve" | "review" | "reject";
export type AIBehaviorFlag =
  | "high_frequency"
  | "repeat_after_reject"
  | "category_mismatch"
  | "suspicious_pattern";

export interface AIRequestHistoryItem {
  amount: number;
  timestamp: number;
  status: "approved" | "rejected" | "pending";
}

export interface AIVaultPolicy {
  maxPerTx: number;
  dailyLimit?: number;
  cooldown: number;
  totalLimit: number;
  riskThreshold: number;
  allowedTimeWindows?: Array<{
    label: string;
    startHour: number;
    endHour: number;
  }>;
  categoryRules?: Array<{
    category: string;
    label: string;
    maxAmountSol: number;
    requiresReview: boolean;
    enabled: boolean;
  }>;
  vaultModePreset?: "startup" | "grant" | "freelancer";
}

export interface AIFlags {
  high_velocity: boolean;
  suspicious_pattern: boolean;
  policy_violation: boolean;
}

export interface AIRequestInput {
  request: {
    amount: number;
    description: string;
    timestamp: number;
  };
  vault: {
    purposeType: "startup" | "grant" | "infra" | "public_project" | "unknown";
    allowedCategories: string[];
    limits: AIVaultPolicy;
  };
  behavior: {
    lastRequests: AIRequestHistoryItem[];
    rejectCount: number;
    requestFrequency: number;
    timeSinceLastRequest: number | null;
    flags: AIBehaviorFlag[];
  };
  trustScore: number;
  walletAddress: string;
}

export interface AIParsedOutput {
  risk_score: number;
  decision_hint: AIDecisionHint;
  reasons?: string[];
  flags: AIBehaviorFlag[];
  explanation: string;
  category?: string;
  behavioral_patterns?: string[];
}

export interface AIProviderResult {
  provider: string;
  decision: AIDecision;
  decisionHint: AIDecisionHint;
  riskScore: number;
  reasons: string[];
  explanation: string;
  flags: AIFlags;
  behavioralFlags: AIBehaviorFlag[];
  category: string | null;
  behavioralPatterns: string[];
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

export function sanitizeExplanation(value: unknown) {
  if (typeof value !== "string") return "No explanation provided";
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 240);
  return normalized || "No explanation provided";
}

export function sanitizeCategory(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().slice(0, 40);
  return normalized || null;
}

export function sanitizePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .map((item) => item.slice(0, 120))
    .slice(0, 5);
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

export function sanitizeBehaviorFlags(flags: unknown): AIBehaviorFlag[] {
  if (!Array.isArray(flags)) return [];

  const seen = new Set<AIBehaviorFlag>();
  const result: AIBehaviorFlag[] = [];

  for (const item of flags) {
    if (
      item === "high_frequency" ||
      item === "repeat_after_reject" ||
      item === "category_mismatch" ||
      item === "suspicious_pattern"
    ) {
      if (!seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
  }

  return result;
}

export function normalizeDecisionHint(value: string | undefined | null): AIDecisionHint | null {
  if (!value) return null;
  if (value === "approve") return "approve";
  if (value === "review") return "review";
  if (value === "reject") return "reject";
  return null;
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
