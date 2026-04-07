import test from "node:test";
import assert from "node:assert/strict";
import { mergeChronologyPage } from "../utils/chronology";

test("chronology load more appends new wallet events without losing existing history", () => {
  const current = {
    walletAddress: "Wallet1",
    trust: {
      score: 55,
      level: "warning",
      updatedAt: null,
      reasons: [],
      successfulRequests: 1,
      rejectedRequests: 0,
      cooldownViolations: 0,
      stabilityRewards: 0,
    },
    monitoring: {
      status: "active",
      summary: "Monitoring active",
      trackedPayouts: 1,
      activePayouts: 1,
      totalPayoutAmountLamports: 10,
      lastPayoutAt: 100,
    },
    events: [
      { id: "e1", eventType: "approved", explanation: "Approved", eventTimestamp: 100 },
    ],
    nextCursor: "100",
  } as any;

  const merged = mergeChronologyPage(current, {
    items: [
      { id: "e2", eventType: "request_created", explanation: "Created", eventTimestamp: 90 },
    ],
    nextCursor: "90",
  } as any);

  assert.equal(merged?.events.length, 2);
  assert.equal(merged?.events[0]?.id, "e1");
  assert.equal(merged?.events[1]?.id, "e2");
});
