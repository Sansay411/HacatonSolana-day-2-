import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultTrustState,
  buildUpdatedTrustProfile,
  computeHybridRisk,
} from "./stability";

test("trust score increases on stable approve and decreases on reject with abuse signals", () => {
  const baseProfile = buildDefaultTrustState();

  const approved = buildUpdatedTrustProfile({
    profile: baseProfile,
    now: 1_000_000,
    finalDecision: "approved",
    effectiveRisk: 28,
    cooldownViolation: false,
    behavioral: {
      penalty: 0,
      requestCountInWindow: 1,
      activePendingCount: 0,
      repeatedRejectCount: 0,
      rapidRepeat: false,
      repeatAfterReject: false,
      highFrequency: false,
      spamPattern: false,
      rejectLockActive: false,
      reasons: [],
    },
  });

  assert.equal(approved.trustScore, 57);
  assert.equal(approved.successfulRequests, 1);
  assert.equal(approved.lowRiskRequests, 1);

  const rejected = buildUpdatedTrustProfile({
    profile: {
      ...baseProfile,
      trustScore: 57,
    },
    now: 1_000_120,
    finalDecision: "rejected",
    effectiveRisk: 82,
    cooldownViolation: true,
    behavioral: {
      penalty: 30,
      requestCountInWindow: 3,
      activePendingCount: 0,
      repeatedRejectCount: 1,
      rapidRepeat: true,
      repeatAfterReject: true,
      highFrequency: true,
      spamPattern: true,
      rejectLockActive: true,
      reasons: [],
    },
  });

  assert.equal(rejected.trustScore, 34);
  assert.equal(rejected.rejectedRequests, 1);
  assert.equal(rejected.cooldownViolations, 1);
});

test("hybrid risk uses smoothing and trust to stabilize the final score", () => {
  const result = computeHybridRisk({
    currentAiRisk: 80,
    previousRisks: [20],
    behavioralPenalty: 10,
    trustScore: 60,
    baseThreshold: 70,
  });

  assert.equal(result.smoothedRisk, 38);
  assert.equal(result.effectiveRisk, 33);
  assert.equal(result.effectiveThreshold, 82);
});
