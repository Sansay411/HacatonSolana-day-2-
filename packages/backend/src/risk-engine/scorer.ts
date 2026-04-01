/**
 * Risk Engine — Rule-Based Scorer
 *
 * MVP risk engine: deterministic, rule-based scoring.
 * No ML, no external APIs. Purely based on on-chain vault state
 * and spend request parameters.
 *
 * Architecture principle: backend is ADVISORY, not EXECUTIVE.
 * Even if this scorer is wrong, on-chain policy enforcement
 * catches violations (limits, cooldown, etc.)
 */

export interface RiskInput {
  /** Requested amount in lamports */
  requestAmount: number;
  /** Remaining vault balance in lamports */
  vaultBalance: number;
  /** Total ever disbursed in lamports */
  totalDisbursed: number;
  /** Policy per-transaction limit in lamports */
  perTxLimit: number;
  /** Policy total limit in lamports */
  totalLimit: number;
  /** Number of requests submitted in last 24 hours */
  recentRequestCount: number;
  /** Average request amount historically (lamports), 0 if first request */
  averageRequestAmount: number;
  /** Hour of day (0-23) when request was submitted */
  requestHour: number;
}

export interface RiskOutput {
  /** Composite score 0-100 (higher = riskier) */
  score: number;
  /** Individual signal values for audit */
  signals: {
    amountRatio: number;
    velocity: number;
    timeAnomaly: number;
    amountAnomaly: number;
  };
  /** Human-readable explanation */
  reasoning: string;
}

/**
 * Compute risk score for a spend request.
 *
 * Signal weights are tuned for a grants / accelerator context:
 * - amount_ratio is the strongest signal (draining vault = highest risk)
 * - velocity catches rapid repeated requests
 * - amount_anomaly catches unusual request sizes
 * - time_anomaly is a weak signal (grants don't have strict hours)
 */
export function computeRiskScore(input: RiskInput): RiskOutput {
  const signals = {
    amountRatio: 0,
    velocity: 0,
    timeAnomaly: 0,
    amountAnomaly: 0,
  };

  const reasons: string[] = [];

  // === Signal 1: Amount Ratio (weight: 40%) ===
  // How much of remaining balance is being requested
  if (input.vaultBalance > 0) {
    signals.amountRatio = Math.min(
      input.requestAmount / input.vaultBalance,
      1.0
    );
  } else {
    signals.amountRatio = 1.0;
  }
  if (signals.amountRatio > 0.5) {
    reasons.push(
      `High amount ratio: requesting ${(signals.amountRatio * 100).toFixed(0)}% of remaining balance`
    );
  }

  // === Signal 2: Velocity (weight: 30%) ===
  // Number of requests in last 24h normalized to [0,1]
  // 3+ requests per day is considered unusual for grants
  signals.velocity = Math.min(input.recentRequestCount / 5, 1.0);
  if (input.recentRequestCount >= 3) {
    reasons.push(
      `High velocity: ${input.recentRequestCount} requests in last 24h`
    );
  }

  // === Signal 3: Amount Anomaly (weight: 20%) ===
  // How different is this request from the average
  if (input.averageRequestAmount > 0) {
    const deviation = Math.abs(
      input.requestAmount - input.averageRequestAmount
    );
    signals.amountAnomaly = Math.min(
      deviation / input.averageRequestAmount,
      1.0
    );
    if (signals.amountAnomaly > 0.5) {
      reasons.push(
        `Amount anomaly: request differs from average by ${(signals.amountAnomaly * 100).toFixed(0)}%`
      );
    }
  }

  // === Signal 4: Time Anomaly (weight: 10%) ===
  // Requests between midnight and 5am are slightly more suspicious
  if (input.requestHour >= 0 && input.requestHour < 5) {
    signals.timeAnomaly = 0.5;
    reasons.push(`Unusual request hour: ${input.requestHour}:00`);
  }

  // === Composite Score ===
  const weighted =
    signals.amountRatio * 0.4 +
    signals.velocity * 0.3 +
    signals.amountAnomaly * 0.2 +
    signals.timeAnomaly * 0.1;

  const score = Math.round(weighted * 100);

  return {
    score: Math.min(score, 100),
    signals,
    reasoning:
      reasons.length > 0
        ? reasons.join("; ")
        : "All signals within normal range",
  };
}
