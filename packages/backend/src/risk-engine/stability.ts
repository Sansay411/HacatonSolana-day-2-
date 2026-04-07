import type { WalletRequestActivityRecord, WalletTrustProfileRecord } from "../db/queries";

export const REQUEST_WINDOW_SECONDS = 10 * 60;
export const POST_REJECT_LOCK_SECONDS = 5 * 60;
export const RAPID_REPEAT_SECONDS = 2 * 60;
export const MIN_TRUST_SCORE = 15;

export interface WalletTrustState {
  trustScore: number;
  successfulRequests: number;
  rejectedRequests: number;
  cooldownViolations: number;
  lowRiskRequests: number;
  stabilityRewards: number;
  riskHistory: number[];
  lastRequestAt: number | null;
  lastRejectedAt: number | null;
  lastDecidedAt: number | null;
  metadata: Record<string, unknown> | null;
}

export interface BehavioralAssessment {
  penalty: number;
  requestCountInWindow: number;
  activePendingCount: number;
  repeatedRejectCount: number;
  rapidRepeat: boolean;
  repeatAfterReject: boolean;
  highFrequency: boolean;
  spamPattern: boolean;
  rejectLockActive: boolean;
  reasons: string[];
}

export interface HybridRiskEvaluation {
  smoothedRisk: number;
  effectiveRisk: number;
  effectiveThreshold: number;
  trustScore: number;
  trustLevel: "stable" | "warning" | "high_risk";
}

export function clampScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getTrustLevel(score: number): "stable" | "warning" | "high_risk" {
  if (score >= 70) return "stable";
  if (score >= 40) return "warning";
  return "high_risk";
}

export function buildDefaultTrustState(): WalletTrustState {
  return {
    trustScore: 50,
    successfulRequests: 0,
    rejectedRequests: 0,
    cooldownViolations: 0,
    lowRiskRequests: 0,
    stabilityRewards: 0,
    riskHistory: [],
    lastRequestAt: null,
    lastRejectedAt: null,
    lastDecidedAt: null,
    metadata: null,
  };
}

export function fromTrustProfile(profile: WalletTrustProfileRecord | null): WalletTrustState {
  if (!profile) {
    return buildDefaultTrustState();
  }

  return {
    trustScore: profile.trustScore,
    successfulRequests: profile.successfulRequests,
    rejectedRequests: profile.rejectedRequests,
    cooldownViolations: profile.cooldownViolations,
    lowRiskRequests: profile.lowRiskRequests,
    stabilityRewards: profile.stabilityRewards,
    riskHistory: profile.riskHistory || [],
    lastRequestAt: profile.lastRequestAt,
    lastRejectedAt: profile.lastRejectedAt,
    lastDecidedAt: profile.lastDecidedAt,
    metadata: profile.metadata,
  };
}

export function applyStabilityReward(profile: WalletTrustState, now: number) {
  if (!profile.lastRequestAt || now - profile.lastRequestAt <= REQUEST_WINDOW_SECONDS) {
    return { profile, rewarded: false };
  }

  return {
    rewarded: true,
    profile: {
      ...profile,
      trustScore: clampScore(profile.trustScore + 1),
      stabilityRewards: profile.stabilityRewards + 1,
    },
  };
}

export function assessBehavioralRisk(params: {
  history: WalletRequestActivityRecord[];
  now: number;
}): BehavioralAssessment {
  const recentWindow = params.history.filter((item) => params.now - item.createdAt <= REQUEST_WINDOW_SECONDS);
  const activePendingCount = params.history.filter(
    (item) => item.processingStatus === "pending" || item.processingStatus === "processing"
  ).length;
  const repeatedRejectCount = params.history.filter(
    (item) => item.decision === "rejected" && params.now - item.createdAt <= 60 * 60
  ).length;
  const lastRequest = params.history[0] || null;
  const rapidRepeat = Boolean(lastRequest && params.now - lastRequest.createdAt < RAPID_REPEAT_SECONDS);
  const repeatAfterReject = Boolean(lastRequest && lastRequest.decision === "rejected");
  const highFrequency = rapidRepeat || recentWindow.length >= 2;
  const spamPattern = recentWindow.length >= 4 || repeatedRejectCount >= 3;
  const rejectLockActive = Boolean(
    lastRequest && lastRequest.decision === "rejected" && params.now - lastRequest.createdAt < POST_REJECT_LOCK_SECONDS
  );

  let penalty = 0;
  const reasons: string[] = [];

  if (repeatAfterReject) {
    penalty += 10;
    reasons.push("Repeated request attempts after a rejection were detected.");
  }

  if (highFrequency) {
    penalty += 5;
    reasons.push("High frequency request behavior was detected inside the recent time window.");
  }

  if (spamPattern) {
    penalty += 15;
    reasons.push("Spam-like request behavior was detected for this wallet.");
  }

  if (rapidRepeat && !repeatAfterReject) {
    reasons.push("Rapid repeat request detected.");
  }

  return {
    penalty,
    requestCountInWindow: recentWindow.length,
    activePendingCount,
    repeatedRejectCount,
    rapidRepeat,
    repeatAfterReject,
    highFrequency,
    spamPattern,
    rejectLockActive,
    reasons,
  };
}

export function computeSmoothedRisk(previousRisks: number[], currentAiRisk: number) {
  const previousRisk = previousRisks[0] ?? currentAiRisk;
  return clampScore(previousRisk * 0.7 + currentAiRisk * 0.3);
}

export function computeHybridRisk(params: {
  currentAiRisk: number;
  previousRisks: number[];
  behavioralPenalty: number;
  trustScore: number;
  baseThreshold: number;
}): HybridRiskEvaluation {
  const smoothedRisk = computeSmoothedRisk(params.previousRisks, params.currentAiRisk);
  const effectiveRisk = clampScore(smoothedRisk + params.behavioralPenalty - params.trustScore * 0.25);
  const effectiveThreshold = clampScore(params.baseThreshold + params.trustScore * 0.2);
  const trustLevel = getTrustLevel(params.trustScore);

  return {
    smoothedRisk,
    effectiveRisk,
    effectiveThreshold,
    trustScore: params.trustScore,
    trustLevel,
  };
}

export function buildUpdatedTrustProfile(params: {
  profile: WalletTrustState;
  now: number;
  finalDecision: "approved" | "rejected";
  effectiveRisk: number;
  behavioral: BehavioralAssessment;
  cooldownViolation: boolean;
}) {
  let trustScore = params.profile.trustScore;
  let successfulRequests = params.profile.successfulRequests;
  let rejectedRequests = params.profile.rejectedRequests;
  let cooldownViolations = params.profile.cooldownViolations;
  let lowRiskRequests = params.profile.lowRiskRequests;
  let stabilityRewards = params.profile.stabilityRewards;
  let lastRejectedAt = params.profile.lastRejectedAt;

  if (params.finalDecision === "approved") {
    trustScore += 5;
    successfulRequests += 1;
    if (params.effectiveRisk < 40) {
      trustScore += 2;
      lowRiskRequests += 1;
    }
  } else {
    trustScore -= 10;
    rejectedRequests += 1;
    lastRejectedAt = params.now;
  }

  if (params.behavioral.repeatAfterReject) {
    trustScore -= 5;
  }

  if (params.behavioral.highFrequency) {
    trustScore -= 3;
  }

  if (params.behavioral.spamPattern) {
    trustScore -= 5;
  }

  if (params.cooldownViolation) {
    cooldownViolations += 1;
  }

  const riskHistory = [params.effectiveRisk, ...(params.profile.riskHistory || [])]
    .slice(0, 5)
    .map(clampScore);

  return {
    trustScore: clampScore(trustScore),
    successfulRequests,
    rejectedRequests,
    cooldownViolations,
    lowRiskRequests,
    stabilityRewards,
    riskHistory,
    lastRequestAt: params.now,
    lastRejectedAt,
    lastDecidedAt: params.now,
  };
}
