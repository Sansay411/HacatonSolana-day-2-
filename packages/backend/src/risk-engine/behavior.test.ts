import test from "node:test";
import assert from "node:assert/strict";
import { buildBehavioralContext, computeBehavioralPenalty, explainBehavioralFlags } from "./behavior";

test("behavioral analysis detects high frequency, repeat after reject, and suspicious pattern", () => {
  const now = 1_000_000;
  const result = buildBehavioralContext({
    description: "office merch campaign",
    allowedCategories: ["infra"],
    now,
    history: [
      {
        requestPubkey: "Req2",
        vaultPubkey: "Vault1",
        walletPubkey: "Wallet1",
        requestIndex: 2,
        amountLamports: 10_000_000,
        description: "infra retry",
        decision: "rejected",
        processingStatus: "completed",
        createdAt: now - 60,
        lastProcessedAt: now - 50,
        aiDecisionSource: "gemini",
        riskScore: 78,
      },
      {
        requestPubkey: "Req1",
        vaultPubkey: "Vault1",
        walletPubkey: "Wallet1",
        requestIndex: 1,
        amountLamports: 12_000_000,
        description: "infra node budget",
        decision: "rejected",
        processingStatus: "completed",
        createdAt: now - 240,
        lastProcessedAt: now - 200,
        aiDecisionSource: "gemini",
        riskScore: 72,
      },
    ],
  });

  assert.deepEqual(
    result.flags.sort(),
    ["high_frequency", "repeat_after_reject", "suspicious_pattern"].sort()
  );
  assert.equal(computeBehavioralPenalty(result.flags), 30);
  assert.ok(explainBehavioralFlags(result.flags).length >= 2);
});

test("category matching remains informational and does not block requests", () => {
  const now = 1_715_000_000;

  const result = buildBehavioralContext({
    description: "Оплата хостинга. Для поддержки работы музыкального сервиса.",
    allowedCategories: ["infra", "operations"],
    history: [],
    now,
  });

  assert.equal(result.categoryMismatch, false);
  assert.equal(result.categoryMatch, "infra");
  assert.equal(result.flags.includes("category_mismatch"), false);
});
