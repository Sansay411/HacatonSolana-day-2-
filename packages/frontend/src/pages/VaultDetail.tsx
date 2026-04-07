import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Link, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import WalletActionButton from "../components/WalletActionButton";
import {
  AlertCircleIcon,
  ArrowDownCircleIcon,
  CheckCircleIcon,
  GridIcon,
  PlusIcon,
  SnowflakeIcon,
} from "../components/Icons";
import { useVault, type SpendRequestState } from "../hooks/useVault";
import { useVaultActions } from "../hooks/useVaultActions";
import { useVaultWallets, useWalletChronology } from "../hooks/useWalletChronology";
import { useI18n } from "../i18n";
import { apiFetch } from "../lib/api";
import { setLastVaultAddress } from "../utils/lastVault";
import { canSubmitRequestForm, sanitizeRequestText } from "../utils/requestForm";
import type { WalletChronologyEvent } from "../../../shared/src/api-types";

interface SpendRequestApiDetail {
  requestAddress: string;
  description: string;
  riskScore: number | null;
  decision: "approved" | "rejected" | "pending";
  reason: string | null;
  reasons: string[];
  provider: string | null;
  decisionSource: "gemini" | "fallback" | null;
  flags: {
    high_velocity: boolean;
    suspicious_pattern: boolean;
    policy_violation: boolean;
  } | null;
  aiEvaluation: {
    provider: string | null;
    status: "available" | "unavailable" | "in_progress";
    recommendation: "approve" | "reject" | null;
    decisionHint?: "approve" | "review" | "reject" | null;
    riskScore: number | null;
    effectiveRisk?: number | null;
    trustScore?: number | null;
    riskLevel: "low" | "medium" | "high" | null;
    findings: string[];
    explanation?: string | null;
    behaviorFlags?: string[];
    flags: {
      high_velocity: boolean;
      suspicious_pattern: boolean;
      policy_violation: boolean;
    } | null;
    riskSource: "gemini" | "fallback_engine" | null;
    attempted: boolean;
    inProgress: boolean;
  };
  policyEnforcement: {
    perTxLimit: "passed" | "failed" | "not_applicable";
    cooldown: "passed" | "failed" | "not_applicable";
    totalLimit: "passed" | "failed" | "not_applicable";
    vaultMode: "active" | "restricted" | "paused" | "not_applicable";
    overrideType: "none" | "policy_override" | "decision_rule";
    overrideReason: string | null;
  };
  finalDecisionSummary: {
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
  };
  evaluatedAt: string | null;
  processingStatus: "pending" | "processing" | "completed" | "failed";
  processingError: string | null;
  lastProcessedAt: string | null;
}

function shortKey(key: string) {
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function formatRelativeTime(unixSeconds: number, locale: string) {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (!unixSeconds) return formatter.format(0, "second");

  const diff = unixSeconds - Math.floor(Date.now() / 1000);
  const abs = Math.abs(diff);

  if (abs < 60) return formatter.format(diff, "second");
  if (abs < 3600) return formatter.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return formatter.format(Math.round(diff / 3600), "hour");
  return formatter.format(Math.round(diff / 86400), "day");
}

function formatAbsoluteTime(unixSeconds: number, locale: string, fallback: string) {
  if (!unixSeconds) return fallback;
  return new Date(unixSeconds * 1000).toLocaleString(locale);
}

function monitoringStorageKey(kind: "tab" | "wallet", vaultAddress?: string) {
  return vaultAddress ? `aegis-vault-v2-${kind}:${vaultAddress}` : null;
}

function readStoredMonitoringValue(kind: "tab" | "wallet", vaultAddress?: string) {
  if (typeof window === "undefined") return null;
  const key = monitoringStorageKey(kind, vaultAddress);
  if (!key) return null;
  return window.localStorage.getItem(key);
}

function writeStoredMonitoringValue(kind: "tab" | "wallet", vaultAddress: string | undefined, value: string) {
  if (typeof window === "undefined" || !vaultAddress) return;
  const key = monitoringStorageKey(kind, vaultAddress);
  if (!key) return;
  window.localStorage.setItem(key, value);
}

function dedupeList(items: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const value = (item || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function formatAiProviderName(provider?: string | null) {
  if (!provider) return "Gemini";
  const normalized = provider.trim().toLowerCase();
  if (normalized === "gemini") return "Gemini";
  return provider;
}

function normalizeAiFinding(text: string, t: (key: string) => string) {
  const value = text.trim();

  switch (value) {
    case "First request from wallet":
      return t("vault.aiFinding.firstRequest");
    case "Low transaction frequency":
      return t("vault.aiFinding.lowFrequency");
    case "Consistent small transaction amounts":
      return t("vault.aiFinding.consistentAmounts");
    case "Regular but not excessively frequent activity":
      return t("vault.aiFinding.regularActivity");
    case "Repeated transaction attempts within a short timeframe":
      return t("vault.aiFinding.repeatedAttempts");
    case "Pattern of re-attempting after rejections":
      return t("vault.aiFinding.repeatAfterReject");
    case "Attempts to bypass cooldown period":
      return t("vault.aiFinding.cooldownBypass");
    default:
      return value;
  }
}

function normalizeAiExplanation(text: string, t: (key: string) => string) {
  const value = text.trim();

  if (
    /Transaction rejected due to category mismatch and a risk score exceeding the vault's threshold\./i.test(
      value
    )
  ) {
    return t("vault.aiExplanationText.categoryMismatchThreshold");
  }

  return value;
}

function getMonitoringLevelLabel(
  level: "stable" | "warning" | "high_risk",
  t: (key: string) => string
) {
  if (level === "stable") return t("vault.monitoring.level.stable");
  if (level === "high_risk") return t("vault.monitoring.level.highRisk");
  return t("vault.monitoring.level.warning");
}

function getMonitoringStatusLabel(
  status: "idle" | "active" | "completed",
  t: (key: string) => string
) {
  if (status === "active") return t("vault.monitoring.status.active");
  if (status === "completed") return t("vault.monitoring.status.completed");
  return t("vault.monitoring.status.idle");
}

function getMonitoringEventLabel(eventType: string, t: (key: string) => string) {
  switch (eventType) {
    case "payout_received":
      return t("vault.monitoring.event.payout_received");
    case "monitoring_activated":
      return t("vault.monitoring.event.monitoring_activated");
    case "first_outgoing_detected":
      return t("vault.monitoring.event.first_outgoing_detected");
    case "rapid_movement_detected":
      return t("vault.monitoring.event.rapid_movement_detected");
    case "funds_moved":
      return t("vault.monitoring.event.funds_moved");
    case "trust_score_increased":
      return t("vault.monitoring.event.trust_score_increased");
    case "trust_score_decreased":
      return t("vault.monitoring.event.trust_score_decreased");
    case "trust_score_updated":
      return t("vault.monitoring.event.trust_score_updated");
    case "monitoring_completed":
      return t("vault.monitoring.event.monitoring_completed");
    default:
      return t("vault.monitoring.event.unknown");
  }
}

function normalizeMonitoringCopy(text: string, t: (key: string) => string) {
  const value = text.trim();

  switch (value) {
    case "No outgoing wallet activity has been detected yet.":
      return t("vault.monitoring.copy.noOutgoing");
    case "Rapid first outgoing transaction detected after payout.":
      return t("vault.monitoring.copy.fastFirstOutgoing");
    case "Funds remained stable before the first outgoing transaction.":
      return t("vault.monitoring.copy.stableBeforeFirstOutgoing");
    case "Multiple outgoing transactions were detected in the monitoring window.":
      return t("vault.monitoring.copy.multipleOutgoing");
    case "A large share of the payout amount moved quickly after release.":
      return t("vault.monitoring.copy.largeShareMoved");
    case "Only a limited portion of the payout amount has moved so far.":
      return t("vault.monitoring.copy.limitedShareMoved");
    case "Wallet behavior remains within the expected monitoring range.":
      return t("vault.monitoring.copy.withinRange");
    case "Monitoring started after the payout was released on-chain.":
      return t("vault.monitoring.copy.started");
    case "Approved payouts are tracked. Live activity refresh is temporarily limited by the Solana RPC rate limit.":
      return t("vault.monitoring.copy.rpcLimited");
    case "Estimated wallet behavior is tracked after approved payouts.":
      return t("vault.monitoring.copy.tracked");
    case "No approved payout has activated monitoring yet.":
      return t("vault.monitoring.copy.noPayouts");
    case "First outgoing wallet activity detected after payout receipt.":
      return t("vault.monitoring.copy.firstOutgoingDetected");
    case "Multiple outgoing transactions were detected soon after payout release.":
      return t("vault.monitoring.copy.rapidMovementDetected");
    case "A large portion of the payout amount moved out of the wallet in a short period.":
      return t("vault.monitoring.copy.fundsMovedFast");
    case "Monitoring window completed for this payout.":
      return t("vault.monitoring.copy.completed");
    default:
      return value;
  }
}

function useAnimatedValue(target: number, duration = 700) {
  const [animated, setAnimated] = useState(target);
  const previousTarget = useRef(target);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const initial = previousTarget.current;
    const delta = target - initial;

    if (Math.abs(delta) < 0.1) {
      setAnimated(target);
      previousTarget.current = target;
      return;
    }

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = initial + delta * eased;
      setAnimated(nextValue);
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        previousTarget.current = target;
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, target]);

  return animated;
}

function RiskBar({
  score,
  threshold,
  label,
  levelClassName,
  levelColor,
  scoreLabel,
  thresholdLabel,
  variant = "default",
}: {
  score: number;
  threshold: number;
  label: string;
  levelClassName: string;
  levelColor: string;
  scoreLabel: string;
  thresholdLabel: string;
  variant?: "default" | "primary";
}) {
  const animatedScore = useAnimatedValue(score);
  const [isUpdated, setIsUpdated] = useState(false);

  useEffect(() => {
    setIsUpdated(true);
    const timeout = window.setTimeout(() => setIsUpdated(false), 900);
    return () => window.clearTimeout(timeout);
  }, [score]);

  return (
    <div
      className={[
        "risk-section",
        variant === "primary" ? "risk-section-primary" : "",
        isUpdated ? "risk-section-updated" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="risk-track">
        <div className={`risk-fill ${levelClassName}`} style={{ width: `${animatedScore}%` }} />
        <div className="risk-threshold" style={{ left: `${threshold}%` }}>
          <span>{`${thresholdLabel}: ${threshold}`}</span>
        </div>
      </div>
      <div className="risk-meta-row">
        <div className="risk-display">
          <span className="risk-metric-copy">
            <strong>{`${scoreLabel}:`}</strong>
            <span className="risk-display-value" style={{ color: levelColor }}>
              {Math.round(animatedScore)}
            </span>
            <span className="risk-display-unit">/100</span>
          </span>
        </div>
        <span className={`status-pill status-pill-inline status-pill-${levelClassName}`}>
          {label}
        </span>
      </div>
    </div>
  );
}

function RequestCard({
  req,
  threshold,
}: {
  req: SpendRequestState;
  threshold: number;
}) {
  const { t, locale } = useI18n();
  const [detail, setDetail] = useState<SpendRequestApiDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    if (req.address.startsWith("demo")) {
      setDetailLoading(false);
      return;
    }

    let active = true;

    const loadDetail = async () => {
      try {
        const response = await apiFetch(`/api/spend-requests/${req.address}`);
        if (!response.ok) {
          if (response.status === 404 && active) {
            setDetail(null);
          }
          return;
        }
        const data = (await response.json()) as SpendRequestApiDetail;
        if (active) {
          setDetail(data);
        }
      } catch {
        if (active) {
          setDetail(null);
        }
      } finally {
        if (active) {
          setDetailLoading(false);
        }
      }
    };

    loadDetail();
    const interval = window.setInterval(loadDetail, 2500);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [req.address]);

  const effectiveStatus =
    detail?.processingStatus === "failed"
      ? "failed"
      : req.status;
  const isResolved = effectiveStatus !== "pending";
  const aiStatus =
    detail?.aiEvaluation?.status ||
    (effectiveStatus === "pending" ? "in_progress" : "unavailable");
  const aiRiskScore = detail?.aiEvaluation?.riskScore ?? null;
  const visibleRiskScore = aiStatus === "available" ? aiRiskScore : null;

  const level =
    (visibleRiskScore ?? 0) <= 30
      ? { label: `${t("vault.risk.low")} ${t("vault.riskSuffix")}`, className: "low", color: "var(--success)" }
      : (visibleRiskScore ?? 0) <= 55
        ? { label: `${t("vault.risk.medium")} ${t("vault.riskSuffix")}`, className: "medium", color: "var(--warning)" }
        : { label: `${t("vault.risk.high")} ${t("vault.riskSuffix")}`, className: "high", color: "var(--danger)" };

  const statusClass =
    effectiveStatus === "failed"
      ? "status-pill-danger"
      : effectiveStatus === "pending"
      ? "status-pill-warning"
      : effectiveStatus === "approved"
        ? "status-pill-success"
        : "status-pill-danger";

  const statusLabel =
    effectiveStatus === "failed"
      ? t("vault.failed")
      : effectiveStatus === "pending"
      ? t("vault.pending")
      : effectiveStatus === "approved"
        ? t("vault.approved")
        : t("vault.rejected");

  const decisionSourceLabel =
    detail?.finalDecisionSummary?.decisionSource === "ai_policy_validation"
      ? t("vault.decisionSource.aiPolicy")
      : detail?.finalDecisionSummary?.decisionSource === "policy_enforcement"
        ? t("vault.decisionSource.policy")
        : detail?.finalDecisionSummary?.decisionSource === "fallback_safety_engine"
          ? t("vault.decisionSource.fallback")
          : t("vault.decisionSource.pending");

  const aiRecommendationLabel =
    detail?.aiEvaluation?.recommendation === "approve"
      ? t("vault.approved")
      : detail?.aiEvaluation?.recommendation === "reject"
        ? t("vault.rejected")
        : t("vault.notApplicable");

  const aiStatusLabel =
    aiStatus === "available"
      ? t("vault.aiStatus.available")
      : aiStatus === "unavailable"
        ? t("vault.aiStatus.unavailable")
        : t("vault.aiStatus.inProgress");

  const policyStatusLabel = (value: "passed" | "failed" | "not_applicable") =>
    value === "passed"
      ? t("vault.policyStatus.passed")
      : value === "failed"
        ? t("vault.policyStatus.failed")
        : t("vault.policyStatus.notApplicable");

  const policyModeLabel =
    detail?.policyEnforcement?.vaultMode === "active"
      ? t("vault.policyMode.active")
      : detail?.policyEnforcement?.vaultMode === "restricted"
        ? t("vault.policyMode.restricted")
        : detail?.policyEnforcement?.vaultMode === "paused"
          ? t("vault.policyMode.paused")
          : t("vault.policyMode.notApplicable");

  const policyCheckClass = (value: "passed" | "failed" | "not_applicable") =>
    value === "passed"
      ? "status-pill-success"
      : value === "failed"
        ? "status-pill-danger"
        : "status-pill-muted";

  const finalDecisionReasons =
    detail?.finalDecisionSummary?.reasons?.length
      ? detail.finalDecisionSummary.reasons
      : detail?.reason
        ? [detail.reason]
        : [];

  const enforcementLabel =
    detail?.policyEnforcement?.overrideType === "policy_override"
      ? t("vault.policyOverride")
      : detail?.policyEnforcement?.overrideType === "decision_rule"
        ? t("vault.decisionRule")
        : null;

  const enforcementReasonLabel =
    detail?.policyEnforcement?.overrideType === "policy_override"
      ? t("vault.policyOverrideReason")
      : t("vault.decisionRuleReason");

  const failedPolicyChecks = [
    detail?.policyEnforcement?.perTxLimit === "failed" ? t("vault.policy.perTx") : null,
    detail?.policyEnforcement?.cooldown === "failed" ? t("vault.policy.cooldown") : null,
    detail?.policyEnforcement?.totalLimit === "failed" ? t("vault.policy.total") : null,
    detail?.policyEnforcement?.vaultMode === "restricted" || detail?.policyEnforcement?.vaultMode === "paused"
      ? t("vault.policy.vaultMode")
      : null,
  ].filter(Boolean) as string[];

  const aiConfidenceLabel =
    visibleRiskScore === null
      ? t("vault.notApplicable")
      : visibleRiskScore <= 20 || visibleRiskScore >= 80
        ? t("vault.aiConfidence.high")
        : visibleRiskScore <= 40 || visibleRiskScore >= 65
          ? t("vault.aiConfidence.medium")
          : t("vault.aiConfidence.low");

  const behaviorFlagLabels = (detail?.aiEvaluation?.behaviorFlags || []).map((flag) => {
    if (flag === "high_frequency") return t("vault.behaviorFlag.highFrequency");
    if (flag === "repeat_after_reject") return t("vault.behaviorFlag.repeatAfterReject");
    if (flag === "category_mismatch") return t("vault.behaviorFlag.categoryMismatch");
    if (flag === "suspicious_pattern") return t("vault.behaviorFlag.suspiciousPattern");
    return flag;
  });
  const localizedAiExplanation = detail?.aiEvaluation?.explanation
    ? normalizeAiExplanation(detail.aiEvaluation.explanation, t)
    : null;
  const suppressLowSignalAiFindings =
    detail?.finalDecisionSummary?.decision === "rejected" &&
    ((detail?.aiEvaluation?.behaviorFlags || []).includes("category_mismatch") ||
      (detail?.aiEvaluation?.behaviorFlags || []).includes("suspicious_pattern"));
  const localizedAiFindings = (detail?.aiEvaluation?.findings || [])
    .filter((reason) =>
      !suppressLowSignalAiFindings ||
      !["First request from wallet", "Low transaction frequency"].includes(reason.trim())
    )
    .map((reason) => normalizeAiFinding(reason, t));

  const operatingModeLabel =
    detail?.finalDecisionSummary?.operatingMode === "safe_mode"
      ? t("vault.operatingMode.safe")
      : t("vault.operatingMode.standard");
  const isFallbackMode = detail?.finalDecisionSummary?.decisionSource === "fallback_safety_engine";
  const isFallbackRejected =
    isFallbackMode && detail?.finalDecisionSummary?.decision === "rejected";
  const thresholdExceeded =
    typeof detail?.aiEvaluation?.effectiveRisk === "number" &&
    typeof threshold === "number" &&
    detail.aiEvaluation.effectiveRisk > threshold;

  const decisionReasonItems = dedupeList(
    isFallbackRejected
      ? [
          t("vault.decisionReason.fallbackMode"),
          t("vault.decisionReason.fallbackProtect"),
        ]
      : detail?.processingStatus === "failed"
      ? [
          detail.processingError,
        ]
      : detail?.finalDecisionSummary?.decision === "approved"
      ? [
          t("vault.decisionReason.approvedThreshold"),
          t("vault.decisionReason.approvedPolicy"),
        ]
      : [
          detail?.policyEnforcement?.overrideReason || detail?.aiEvaluation?.explanation || null,
          thresholdExceeded ? t("vault.decisionReason.exceedsThreshold") : null,
          behaviorFlagLabels.length > 0 ? behaviorFlagLabels[0] : null,
          failedPolicyChecks.length > 0 ? `${failedPolicyChecks.join(", ")}: FAILED.` : null,
          finalDecisionReasons[0] || null,
        ]
  ).slice(0, 3);

  return (
    <article className="surface-card request-card">
      <div className="request-card-head">
        <div>
          <span className="surface-kicker">{t("vault.request")}</span>
          <h3>{req.amount.toFixed(2)} SOL</h3>
          <p className="request-purpose-line">{detail?.description || t("vault.awaitingNarrative")}</p>
        </div>
        <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
      </div>

      <div className="request-summary-grid">
        <div className="request-meta">
          <span>{t("vault.meta.requestId")}</span>
          <strong>#{req.requestIndex}</strong>
        </div>
        <div className="request-meta">
          <span>{t("vault.meta.created")}</span>
          <strong>{formatRelativeTime(req.createdAt, locale)}</strong>
        </div>
        <div className="request-meta">
          <span>{t("vault.meta.resolved")}</span>
          <strong>{req.resolvedAt ? formatRelativeTime(req.resolvedAt, locale) : t("vault.notApplicable")}</strong>
        </div>
      </div>

      {detail?.processingError && (
        <p className="request-ai-reason request-ai-reason-error">
          <strong>{t("vault.processingErrorLabel")}</strong> {detail.processingError}
        </p>
      )}

      <div className="request-history-stack">
        <section className="request-section-block">
          <div className="request-section-head">
            <strong>{t("vault.section.aiEvaluation")}</strong>
            <div className="request-ai-strip">
              <span className="status-pill status-pill-muted">{`${t("vault.aiProvider")}: ${formatAiProviderName(detail?.aiEvaluation?.provider)}`}</span>
              <span className="status-pill status-pill-muted">{`${t("vault.aiStatus")}: ${aiStatusLabel}`}</span>
              {aiStatus === "available" ? (
                <span className="status-pill status-pill-muted">{`${t("vault.aiRecommendation")}: ${aiRecommendationLabel}`}</span>
              ) : null}
            </div>
          </div>

          {detail?.aiEvaluation?.inProgress || (effectiveStatus === "pending" && !detail?.processingError) ? (
            <p className="request-ai-reason request-ai-reason-pending">{t("vault.aiEvaluatingStructured")}</p>
          ) : visibleRiskScore !== null ? (
            <>
              <RiskBar
                score={visibleRiskScore}
                threshold={threshold}
                label={level.label}
                levelClassName={level.className}
                levelColor={level.color}
                scoreLabel={t("vault.riskScoreLabel")}
                thresholdLabel={t("vault.thresholdLabel")}
              />
              <div className="request-ai-strip">
                <span className="status-pill status-pill-muted">{`${t("vault.aiConfidence")}: ${aiConfidenceLabel}`}</span>
                {typeof detail?.aiEvaluation?.effectiveRisk === "number" && (
                  <span className="status-pill status-pill-muted">{`${t("vault.effectiveRisk")}: ${detail.aiEvaluation.effectiveRisk}/100`}</span>
                )}
                {typeof detail?.aiEvaluation?.trustScore === "number" && (
                  <span className="status-pill status-pill-muted">{`${t("vault.trustScore")}: ${detail.aiEvaluation.trustScore}/100`}</span>
                )}
                {detail?.aiEvaluation?.flags?.high_velocity && (
                  <span className="status-pill status-pill-warning">{t("vault.flagVelocity")}</span>
                )}
                {detail?.aiEvaluation?.flags?.suspicious_pattern && (
                  <span className="status-pill status-pill-danger">{t("vault.flagSuspicious")}</span>
                )}
                {behaviorFlagLabels.map((flagLabel) => (
                  <span key={`${req.address}-${flagLabel}`} className="status-pill status-pill-muted">
                    {flagLabel}
                  </span>
                ))}
              </div>
            </>
          ) : aiStatus === "unavailable" ? (
            <p className="request-ai-reason">
              {t("vault.aiSkippedFallback")}
            </p>
          ) : (
            <p className="request-ai-reason">{isResolved ? t("vault.notApplicable") : t("vault.aiPending")}</p>
          )}

          <div className="request-reasoning-block">
            {localizedAiExplanation && (
              <p className="request-ai-reason">
                <strong>{t("vault.aiExplanation")}</strong> {localizedAiExplanation}
              </p>
            )}
            <strong className="request-reasoning-title">{t("vault.aiFindings")}</strong>
            {localizedAiFindings.length ? (
              <ul className="request-reasoning-list">
                {localizedAiFindings.map((reason, index) => (
                  <li key={`${req.address}-ai-${index}`}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="request-section-empty">
                {detail?.processingStatus === "failed"
                  ? t("vault.backendFailed")
                  : aiStatus === "unavailable"
                  ? t("vault.emptyDash")
                  : effectiveStatus === "pending"
                    ? t("vault.aiPending")
                    : aiStatus === "available"
                      ? t("vault.aiFindingsNormal")
                      : t("vault.notApplicable")}
              </p>
            )}
          </div>
        </section>

        <section className="request-section-block">
          <div className="request-section-head">
            <strong>{t("vault.section.policy")}</strong>
            {enforcementLabel && (
              <span className="status-pill status-pill-danger">{enforcementLabel}</span>
            )}
          </div>

          <div className="policy-check-grid">
            <div className="policy-check-item">
              <span>{t("vault.policy.perTx")}</span>
              <span className={`status-pill ${policyCheckClass(detail?.policyEnforcement?.perTxLimit || "not_applicable")}`}>
                {policyStatusLabel(detail?.policyEnforcement?.perTxLimit || "not_applicable")}
              </span>
            </div>
            <div className="policy-check-item">
              <span>{t("vault.policy.cooldown")}</span>
              <span className={`status-pill ${policyCheckClass(detail?.policyEnforcement?.cooldown || "not_applicable")}`}>
                {policyStatusLabel(detail?.policyEnforcement?.cooldown || "not_applicable")}
              </span>
            </div>
            <div className="policy-check-item">
              <span>{t("vault.policy.total")}</span>
              <span className={`status-pill ${policyCheckClass(detail?.policyEnforcement?.totalLimit || "not_applicable")}`}>
                {policyStatusLabel(detail?.policyEnforcement?.totalLimit || "not_applicable")}
              </span>
            </div>
            <div className="policy-check-item">
              <span>{t("vault.policy.vaultMode")}</span>
              <span className="status-pill status-pill-muted">{policyModeLabel}</span>
            </div>
          </div>

          {detail?.policyEnforcement?.overrideReason ? (
            <p className="request-ai-reason">
              <strong>{enforcementReasonLabel}</strong> {detail.policyEnforcement.overrideReason}
            </p>
          ) : effectiveStatus === "pending" ? (
            <p className="request-section-empty">{t("vault.policyWaiting")}</p>
          ) : null}
        </section>

        <section className="request-section-block">
          <div className="request-section-head">
            <strong>{t("vault.section.finalDecision")}</strong>
            <div className="request-ai-strip">
              <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
              <span className="status-pill status-pill-muted">
                {detail?.processingStatus === "failed" ? t("vault.backendFailed") : decisionSourceLabel}
              </span>
              <span className="status-pill status-pill-muted">{`${t("vault.operatingMode")}: ${operatingModeLabel}`}</span>
            </div>
          </div>

          <div className="policy-check-grid">
            <div className="policy-check-item">
              <span>{t("vault.execution.requestRecorded")}</span>
              <span className={`status-pill ${detail?.finalDecisionSummary?.requestRecordedOnChain ? "status-pill-success" : "status-pill-muted"}`}>
                {detail?.finalDecisionSummary?.requestRecordedOnChain ? t("vault.execution.yes") : t("vault.execution.no")}
              </span>
            </div>
            <div className="policy-check-item">
              <span>{t("vault.execution.payoutExecuted")}</span>
              <span className={`status-pill ${detail?.finalDecisionSummary?.payoutExecutedOnChain ? "status-pill-success" : "status-pill-muted"}`}>
                {detail?.finalDecisionSummary?.payoutExecutedOnChain ? t("vault.execution.yes") : t("vault.execution.no")}
              </span>
            </div>
          </div>

          {decisionReasonItems.length > 0 && (
            <div className="request-reasoning-block">
              <strong className="request-reasoning-title">{t("vault.decisionBasis")}</strong>
              <ul className="request-reasoning-list">
                {decisionReasonItems.map((reason, index) => (
                  <li key={`${req.address}-decision-${index}`}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {detail?.processingStatus === "failed" ? (
            <p className="request-ai-reason request-impact-line">{t("vault.backendFailedLine")}</p>
          ) : detail?.finalDecisionSummary?.decision === "rejected" && (
            <p className="request-ai-reason request-impact-line">
              {isFallbackRejected ? t("vault.decisionImpact.safeMode") : t("vault.decisionImpact.rejected")}
            </p>
          )}

          {detail?.finalDecisionSummary?.decision === "approved" && (
            <p className="request-ai-reason request-impact-line">{t("vault.decisionImpact.approved")}</p>
          )}

          {detail?.evaluatedAt && (
            <div className="request-evaluated-at">
              <span>{t("vault.evaluatedAt")}</span>
              <strong>{new Date(detail.evaluatedAt).toLocaleString(locale)}</strong>
            </div>
          )}

          {detail?.finalDecisionSummary?.txSignature && (
            <div className="request-evaluated-at">
              <span>{t("vault.execution.tx")}</span>
              <strong>{shortKey(detail.finalDecisionSummary.txSignature)}</strong>
            </div>
          )}
        </section>
      </div>

      {!detail?.evaluatedAt && detail?.lastProcessedAt && (
        <div className="request-evaluated-at">
          <span>{t("vault.lastBackendAttempt")}</span>
          <strong>{new Date(detail.lastProcessedAt).toLocaleString(locale)}</strong>
        </div>
      )}
    </article>
  );
}

function MonitoringPanel({
  vaultAddress,
  beneficiaryAddress,
}: {
  vaultAddress?: string;
  beneficiaryAddress?: string;
}) {
  const { t, locale } = useI18n();
  const { items: wallets, loading: walletsLoading, error: walletsError } = useVaultWallets(vaultAddress);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(() => readStoredMonitoringValue("wallet", vaultAddress));

  useEffect(() => {
    const stored = readStoredMonitoringValue("wallet", vaultAddress);
    if (stored) {
      setSelectedWallet(stored);
      return;
    }
    setSelectedWallet(null);
  }, [vaultAddress]);

  useEffect(() => {
    if (!wallets.length) {
      if (beneficiaryAddress) {
        setSelectedWallet((current) => current || beneficiaryAddress);
      }
      return;
    }

    const preferred =
      wallets.find((item) => item.walletAddress === selectedWallet)?.walletAddress ||
      wallets.find((item) => item.walletAddress === beneficiaryAddress)?.walletAddress ||
      wallets[0]?.walletAddress ||
      null;

    if (preferred && preferred !== selectedWallet) {
      setSelectedWallet(preferred);
      writeStoredMonitoringValue("wallet", vaultAddress, preferred);
    }
  }, [beneficiaryAddress, selectedWallet, vaultAddress, wallets]);

  const selectedWalletSummary =
    wallets.find((item) => item.walletAddress === selectedWallet) ||
    (beneficiaryAddress
      ? {
          walletAddress: beneficiaryAddress,
          trackedPayouts: 0,
          lastPayoutTimestamp: null,
          lastUpdatedAt: null,
          trustScore: 50,
          trustLevel: "warning" as const,
          protectedAmountLamports: 0,
        }
      : null);
  const activeWallet =
    wallets.find((item) => item.walletAddress === selectedWallet)?.walletAddress ||
    wallets.find((item) => item.walletAddress === beneficiaryAddress)?.walletAddress ||
    (walletsLoading ? null : selectedWalletSummary?.walletAddress || null) ||
    wallets[0]?.walletAddress ||
    null;
  const { data, loading, loadingMore, hasMore, error, refetch, loadMore } = useWalletChronology(
    vaultAddress,
    activeWallet || undefined
  );

  return (
    <div className="monitoring-stack">
      <div className="surface-card monitoring-hero-card">
        <div className="panel-topline">
          <div>
            <span className="surface-kicker">{t("vault.monitoring.kicker")}</span>
            <h2>{t("vault.monitoring.title")}</h2>
          </div>
          <span className="status-pill status-pill-muted">{getMonitoringStatusLabel(data?.monitoring.status || "idle", t)}</span>
        </div>
        <p className="page-subtitle">{t("vault.monitoring.subtitle")}</p>

        <div className="monitoring-wallet-row">
          <label className="field-label" htmlFor="monitoring-wallet-select">{t("vault.monitoring.wallet")}</label>
          <select
            id="monitoring-wallet-select"
            className="premium-select"
            value={activeWallet || ""}
            onChange={(event) => {
              setSelectedWallet(event.target.value);
              writeStoredMonitoringValue("wallet", vaultAddress, event.target.value);
            }}
            disabled={walletsLoading || wallets.length <= 1}
          >
            {(wallets.length ? wallets : selectedWalletSummary ? [selectedWalletSummary] : []).map((item) => (
              <option key={item.walletAddress} value={item.walletAddress}>
                {shortKey(item.walletAddress)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {walletsLoading ? (
        <div className="surface-card empty-state-panel">
          <span className="surface-kicker">{t("vault.monitoring.kicker")}</span>
          <h3>{t("vault.monitoring.loading")}</h3>
        </div>
      ) : walletsError ? (
        <div className="surface-card empty-state-panel">
          <span className="surface-kicker">{t("vault.monitoring.kicker")}</span>
          <h3>{t("vault.monitoring.error")}</h3>
        </div>
      ) : !activeWallet ? (
        <div className="surface-card empty-state-panel">
          <span className="surface-kicker">{t("vault.monitoring.kicker")}</span>
          <h3>{t("vault.monitoring.walletEmpty")}</h3>
        </div>
      ) : loading ? (
        <div className="surface-card empty-state-panel">
          <span className="surface-kicker">{t("vault.monitoring.kicker")}</span>
          <h3>{t("vault.monitoring.loading")}</h3>
        </div>
      ) : error ? (
        <div className="surface-card empty-state-panel">
          <span className="surface-kicker">{t("vault.monitoring.kicker")}</span>
          <h3>{t("vault.monitoring.error")}</h3>
          <button type="button" className="btn btn-secondary" onClick={refetch}>
            <ArrowDownCircleIcon className="icon-svg icon-svg-sm" />
            {t("vault.monitoring.retry")}
          </button>
        </div>
      ) : data?.monitoring.trackedPayouts === 0 ? (
        <div className="surface-card empty-state-panel">
          <span className="surface-kicker">{t("vault.monitoring.kicker")}</span>
          <h3>{t("vault.monitoring.empty")}</h3>
        </div>
      ) : (
        <>
          <section className="vault-command-ribbon monitoring-ribbon">
            <div className="surface-card command-ribbon-card command-ribbon-card-dark command-ribbon-card-ai">
              <span className="surface-kicker">{t("vault.monitoring.trust")}</span>
              <strong>{`${data?.trust.score ?? 50}/100`}</strong>
              <p>{getMonitoringLevelLabel(data?.trust.level || "warning", t)}</p>
            </div>
            <div className="surface-card command-ribbon-card">
              <span className="surface-kicker">{t("vault.monitoring.status")}</span>
              <strong>{getMonitoringStatusLabel(data?.monitoring.status || "idle", t)}</strong>
              <p>{data?.monitoring.summary ? normalizeMonitoringCopy(data.monitoring.summary, t) : t("common.notAvailable")}</p>
            </div>
            <div className="surface-card command-ribbon-card command-ribbon-card-accent">
              <span className="surface-kicker">{t("vault.monitoring.totalPayouts")}</span>
              <strong>{`${((data?.monitoring.totalPayoutAmountLamports || 0) / 1_000_000_000).toFixed(2)} SOL`}</strong>
              <p>{`${t("vault.monitoring.trackedPayouts")}: ${data?.monitoring.trackedPayouts || 0}`}</p>
            </div>
          </section>

          <div className="surface-card request-timeline-shell">
            <div className="panel-topline">
              <div>
                <span className="surface-kicker">{t("vault.monitoring.timeline")}</span>
                <h2>{shortKey(activeWallet)}</h2>
              </div>
              <span className="status-pill status-pill-muted">
                {data?.events.length || 0}
              </span>
            </div>

            <div className="monitoring-summary-grid">
              <div className="surface-card feature-surface feature-surface-soft">
                <span className="surface-kicker">{t("vault.monitoring.summary")}</span>
                <ul className="request-reasoning-list">
                  {(data?.trust.reasons || []).map((reason, index) => (
                    <li key={`${activeWallet}-trust-${index}`}>{normalizeMonitoringCopy(reason, t)}</li>
                  ))}
                </ul>
              </div>
              <div className="surface-card feature-surface monitoring-metric-card">
                <span className="surface-kicker">{t("vault.monitoring.activePayouts")}</span>
                <strong className="monitoring-metric-value">{data?.monitoring.activePayouts || 0}</strong>
                <p className="monitoring-metric-note">
                  {selectedWalletSummary?.lastPayoutTimestamp
                    ? `${t("vault.meta.lastPayout")}: ${formatAbsoluteTime(
                        selectedWalletSummary.lastPayoutTimestamp,
                        locale,
                        t("common.notAvailable")
                      )}`
                    : t("vault.monitoring.copy.noLastPayout")}
                </p>
              </div>
            </div>

            <div className="monitoring-stats-grid">
              <div className="surface-card feature-surface feature-surface-soft monitoring-metric-card">
                <span className="surface-kicker">{t("vault.monitoring.successfulRequests")}</span>
                <strong className="monitoring-metric-value">{data?.trust.successfulRequests || 0}</strong>
                <p className="monitoring-metric-note">{t("vault.monitoring.copy.successfulRequests")}</p>
              </div>
              <div className="surface-card feature-surface feature-surface-soft monitoring-metric-card">
                <span className="surface-kicker">{t("vault.monitoring.rejectedRequests")}</span>
                <strong className="monitoring-metric-value">{data?.trust.rejectedRequests || 0}</strong>
                <p className="monitoring-metric-note">{t("vault.monitoring.copy.rejectedRequests")}</p>
              </div>
              <div className="surface-card feature-surface feature-surface-soft monitoring-metric-card">
                <span className="surface-kicker">{t("vault.monitoring.cooldownViolations")}</span>
                <strong className="monitoring-metric-value">{data?.trust.cooldownViolations || 0}</strong>
                <p className="monitoring-metric-note">{t("vault.monitoring.copy.cooldownViolations")}</p>
              </div>
              <div className="surface-card feature-surface feature-surface-soft monitoring-metric-card">
                <span className="surface-kicker">{t("vault.monitoring.stabilityRewards")}</span>
                <strong className="monitoring-metric-value">{data?.trust.stabilityRewards || 0}</strong>
                <p className="monitoring-metric-note">{t("vault.monitoring.copy.stabilityRewards")}</p>
              </div>
            </div>

            <div className="timeline-stack">
              {data?.events.map((event: WalletChronologyEvent) => (
                <article key={event.id} className="surface-card request-card monitoring-event-card">
                  {(() => {
                    const riskSnapshot =
                      event.metadata &&
                      typeof event.metadata === "object" &&
                      "riskSnapshot" in event.metadata
                        ? (event.metadata.riskSnapshot as
                            | {
                                aiRisk?: number;
                                effectiveRisk?: number;
                                trustScore?: number;
                                effectiveThreshold?: number;
                              }
                            | undefined)
                        : undefined;
                    const amountSol =
                      event.metadata &&
                      typeof event.metadata === "object" &&
                      "amountSol" in event.metadata
                        ? Number(event.metadata.amountSol)
                        : null;

                    return (
                      <>
                        <div className="request-card-head">
                          <div>
                            <span className="surface-kicker">{getMonitoringEventLabel(event.eventType, t)}</span>
                            <h3>{normalizeMonitoringCopy(event.explanation, t)}</h3>
                          </div>
                          <span className="status-pill status-pill-muted">
                            {formatAbsoluteTime(event.timestamp, locale, t("common.notAvailable"))}
                          </span>
                        </div>

                        {(event.txSignature || event.requestPubkey || amountSol !== null) && (
                          <div className="request-summary-grid">
                            {event.requestPubkey && (
                              <div className="request-meta">
                                <span>{t("vault.meta.requestId")}</span>
                                <strong>{shortKey(event.requestPubkey)}</strong>
                              </div>
                            )}
                            {amountSol !== null && Number.isFinite(amountSol) && (
                              <div className="request-meta">
                                <span>{t("vault.monitoring.amount")}</span>
                                <strong>{`${amountSol.toFixed(2)} SOL`}</strong>
                              </div>
                            )}
                            {event.txSignature && (
                              <div className="request-meta">
                                <span>{t("vault.monitoring.tx")}</span>
                                <strong>{shortKey(event.txSignature)}</strong>
                              </div>
                            )}
                          </div>
                        )}

                        {riskSnapshot && (
                          <div className="request-summary-grid">
                            <div className="request-meta">
                              <span>{t("vault.monitoring.aiRisk")}</span>
                              <strong>{typeof riskSnapshot.aiRisk === "number" ? `${riskSnapshot.aiRisk}/100` : t("common.notAvailable")}</strong>
                            </div>
                            <div className="request-meta">
                              <span>{t("vault.monitoring.effectiveRisk")}</span>
                              <strong>{typeof riskSnapshot.effectiveRisk === "number" ? `${riskSnapshot.effectiveRisk}/100` : t("common.notAvailable")}</strong>
                            </div>
                            <div className="request-meta">
                              <span>{t("vault.monitoring.threshold")}</span>
                              <strong>{typeof riskSnapshot.effectiveThreshold === "number" ? `${riskSnapshot.effectiveThreshold}` : t("common.notAvailable")}</strong>
                            </div>
                            <div className="request-meta">
                              <span>{t("vault.monitoring.trust")}</span>
                              <strong>{typeof riskSnapshot.trustScore === "number" ? `${riskSnapshot.trustScore}/100` : t("common.notAvailable")}</strong>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </article>
              ))}
              {hasMore && (
                <div className="timeline-load-more">
                  <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
                    <ArrowDownCircleIcon className="icon-svg icon-svg-sm" />
                    {loadingMore ? t("vault.monitoring.loadingMore") : t("vault.monitoring.loadMore")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function VaultDetail() {
  const { vaultAddress } = useParams();
  const { publicKey } = useWallet();
  const { t, locale } = useI18n();
  const { vault, policy, requests, role, loading, error } = useVault(vaultAddress);
  const { items: vaultWallets } = useVaultWallets(vaultAddress);
  const { submitSpendRequest, freezeVault, unfreezeVault, deposit, pending } = useVaultActions();

  const [reqAmount, setReqAmount] = useState("");
  const [reqDesc, setReqDesc] = useState("");
  const [depositAmount, setDepositAmount] = useState("1");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const hasConnectedWallet = Boolean(publicKey);
  const [activeTab, setActiveTab] = useState<"activity" | "monitoring">(() => {
    const stored = readStoredMonitoringValue("tab", vaultAddress);
    return stored === "monitoring" ? "monitoring" : "activity";
  });

  useEffect(() => {
    if (vaultAddress) {
      setLastVaultAddress(vaultAddress, publicKey?.toBase58());
    }
  }, [publicKey, vaultAddress]);

  useEffect(() => {
    const stored = readStoredMonitoringValue("tab", vaultAddress);
    setActiveTab(stored === "monitoring" ? "monitoring" : "activity");
  }, [vaultAddress]);

  useEffect(() => {
    if (!hasConnectedWallet && activeTab === "monitoring") {
      setActiveTab("activity");
      writeStoredMonitoringValue("tab", vaultAddress, "activity");
    }
  }, [activeTab, hasConnectedWallet, vaultAddress]);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const v = vault || {
    address: vaultAddress || "...",
    funder: "",
    beneficiary: "",
    riskAuthority: "",
    mode: "active" as const,
    totalDeposited: 0,
    totalDisbursed: 0,
    available: 0,
    lastPayoutAt: 0,
    requestCount: 0,
    createdAt: 0,
  };

  const p = policy || {
    perTxLimit: 0,
    totalLimit: 0,
    cooldownSeconds: 0,
    riskThreshold: 0,
  };

  const reqs = requests;
  const userRole = vault ? role : "none";
  const isFunder = userRole === "funder";
  const isBeneficiary = userRole === "beneficiary";
  const isFrozen = v.mode === "frozen";
  const isClosed = v.mode === "closed";
  const usagePercent = p.totalLimit > 0 ? Math.min((v.totalDisbursed / p.totalLimit) * 100, 100) : 0;
  const remainingBudget = Math.max(p.totalLimit - v.totalDisbursed, 0);
  const latestRiskRequest = reqs.find((request) => request.riskScore > 0 && request.status !== "pending") || null;
  const beneficiaryMonitoringSummary =
    vaultWallets.find((item) => item.walletAddress === v.beneficiary) ||
    (v.beneficiary ? vaultWallets[0] || null : null);
  const monitoringTrustScore = beneficiaryMonitoringSummary?.trustScore ?? null;
  const hasMonitoringTrustFallback = Boolean(
    beneficiaryMonitoringSummary &&
      (beneficiaryMonitoringSummary.trackedPayouts > 0 || beneficiaryMonitoringSummary.lastPayoutTimestamp)
  );
  const activeRisk = latestRiskRequest?.riskScore ?? 0;
  const recentStatus = reqs[0]?.status ?? "pending";

  const heroStats = useMemo(
    () => [
      { label: t("vault.stats.deposited"), value: `${v.totalDeposited.toFixed(2)} SOL` },
      { label: t("vault.stats.disbursed"), value: `${v.totalDisbursed.toFixed(2)} SOL` },
      { label: t("vault.stats.remaining"), value: `${remainingBudget.toFixed(2)} SOL` },
      { label: t("vault.stats.requests"), value: `${v.requestCount}` },
    ],
    [remainingBudget, t, v.requestCount, v.totalDeposited, v.totalDisbursed]
  );

  const recentStatusLabel =
    recentStatus === "pending"
      ? t("vault.pending")
      : recentStatus === "approved"
        ? t("vault.approved")
        : t("vault.rejected");

  const modeLabel =
    v.mode === "active"
      ? t("vault.mode.active")
      : v.mode === "frozen"
        ? t("vault.mode.frozen")
        : t("vault.mode.closed");

  const roleLabel = isFunder
    ? t("vault.role.funder")
    : isBeneficiary
      ? t("vault.role.beneficiary")
      : t("vault.role.observer");
  const walletAccessTitle = !hasConnectedWallet
    ? t("vault.readOnlyTitle")
    : userRole === "none" && vault
      ? t("vault.mismatchTitle")
      : null;
  const walletAccessText = !hasConnectedWallet
    ? t("vault.readOnlyText")
    : userRole === "none" && vault
      ? t("vault.mismatchText")
      : null;

  const handleSubmitRequest = async () => {
    const normalizedDescription = sanitizeRequestText(reqDesc);
    if (!reqAmount || !normalizedDescription || !vaultAddress || !vault) return;

    if (!isBeneficiary) {
      showToast(t("vault.onlyBeneficiary"), "error");
      return;
    }

    const result = await submitSpendRequest({
      vaultAddress,
      amount: parseFloat(reqAmount),
      description: normalizedDescription,
      requestCount: v.requestCount,
    });

    if (result.success) {
      showToast(t("vault.requestSubmitted"), "success");
      setReqAmount("");
      setReqDesc("");
    } else {
      showToast(result.error || t("vault.requestFailed"), "error");
    }
  };

  const handleFreeze = async () => {
    if (!vaultAddress || !vault) return;
    const result = await freezeVault(vaultAddress);
    showToast(
      result.success ? t("vault.frozenSuccess") : result.error || t("vault.freezeFailed"),
      result.success ? "success" : "error"
    );
  };

  const handleUnfreeze = async () => {
    if (!vaultAddress || !vault) return;
    const result = await unfreezeVault(vaultAddress);
    showToast(
      result.success ? t("vault.unfrozenSuccess") : result.error || t("vault.unfreezeFailed"),
      result.success ? "success" : "error"
    );
  };

  const handleDeposit = async () => {
    if (!vaultAddress || !vault) return;

    const result = await deposit(vaultAddress, parseFloat(depositAmount) || 0);
    if (result.success) {
      showToast(t("vault.depositSuccess"), "success");
      setDepositAmount("1");
    } else {
      showToast(result.error || t("vault.depositFailed"), "error");
    }
  };

  return (
    <AppShell>
      <section className="page-heading page-heading-vault">
        <div>
          <div className="eyebrow-pill">{t("vault.commandEyebrow")}</div>
          <h1 className="page-title page-title-vault">{t("vault.title")}</h1>
          <p className="page-subtitle page-subtitle-vault">{t("vault.subtitle")}</p>
          <div className="vault-heading-meta">
            <span className="status-pill status-pill-muted">
              {vaultAddress ? shortKey(vaultAddress) : t("vault.pendingAddress")}
            </span>
            <span className={`status-pill ${isFrozen ? "status-pill-warning" : "status-pill-success"}`}>
              {modeLabel}
            </span>
            <span className="status-pill status-pill-muted">{roleLabel}</span>
          </div>
        </div>
        <div className="page-heading-actions">
          <Link to="/create" className="btn btn-secondary">
            <GridIcon className="icon-svg icon-svg-sm" />
            {t("vault.createAnother")}
          </Link>
        </div>
      </section>

      {loading && (
        <div className="surface-card state-banner">
          <span className="surface-kicker">{t("vault.loadingKicker")}</span>
          <h3>{t("vault.loadingTitle")}</h3>
        </div>
      )}

      {!loading && error && (
        <div className="surface-card state-banner state-banner-error">
          <span className="surface-kicker">{t("vault.errorKicker")}</span>
          <h3>{error}</h3>
        </div>
      )}

      {!loading && !error && vault && walletAccessTitle && walletAccessText && (
        <div className="surface-card state-banner state-banner-warning">
          <span className="surface-kicker">{t("vault.accessKicker")}</span>
          <h3>{walletAccessTitle}</h3>
          <p>{walletAccessText}</p>
          <div className="state-banner-actions">
            <WalletActionButton className="btn-secondary" />
          </div>
        </div>
      )}

      <section className="vault-command-ribbon">
        <div className="surface-card command-ribbon-card command-ribbon-card-accent">
          <span className="surface-kicker">{t("vault.ribbon.available")}</span>
          <strong>{v.available.toFixed(2)} SOL</strong>
          <p>{t("vault.ribbon.availableText")}</p>
        </div>
        <div className="surface-card command-ribbon-card">
          <span className="surface-kicker">{t("vault.ribbon.state")}</span>
          <strong>{recentStatusLabel}</strong>
          <p>{t("vault.ribbon.stateText")}</p>
        </div>
        <div className="surface-card command-ribbon-card command-ribbon-card-dark command-ribbon-card-ai">
          <span className="surface-kicker">{t("vault.ribbon.risk")}</span>
          <strong>{`${p.riskThreshold}/100`}</strong>
          <p>{activeRisk > 0 ? t("vault.ribbon.riskText") : t("vault.ribbon.riskWaiting")}</p>
          <div className="ribbon-risk-meter">
            <div className="ribbon-risk-meter-track">
              <div
                className={`ribbon-risk-meter-fill ${activeRisk <= 30 ? "low" : activeRisk <= 55 ? "medium" : "high"}`}
                style={{ width: `${Math.max(activeRisk, 8)}%` }}
              />
            </div>
            <span className="ribbon-risk-meter-value">{`${activeRisk}/100`}</span>
          </div>
        </div>
      </section>

      <section className="vault-hero-grid">
        <div className="surface-card vault-hero-card vault-hero-card-primary">
          <div className="vault-hero-topline">
            <div>
              <span className="surface-kicker">{t("vault.availableCapital")}</span>
              <div className="vault-balance-value">{v.available.toFixed(2)} SOL</div>
              <p className="vault-address-line">{vaultAddress ? shortKey(vaultAddress) : t("vault.pendingAddress")}</p>
            </div>

            <div className="hero-badge-stack">
              <span className={`status-pill ${isFrozen ? "status-pill-warning" : "status-pill-success"}`}>
                {modeLabel}
              </span>
              <span className="status-pill status-pill-muted">{roleLabel}</span>
            </div>
          </div>

          <div className="hero-stat-grid">
            {heroStats.map((item) => (
              <div key={item.label} className="hero-stat-card hero-stat-card-dark">
                <span className="hero-stat-label">{item.label}</span>
                <strong className="hero-stat-value hero-stat-value-compact">{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="utilization-panel">
            <div className="utilization-header">
              <span>{t("vault.utilization")}</span>
              <strong>{usagePercent.toFixed(0)}%</strong>
            </div>
            <div className="utilization-track">
              <div className="utilization-fill" style={{ width: `${usagePercent}%` }} />
            </div>
            <div className="utilization-footer">
              <span>{`${v.totalDisbursed.toFixed(2)} SOL ${t("vault.released")}`}</span>
              <span>{`${p.totalLimit.toFixed(2)} SOL ${t("vault.ceiling")}`}</span>
            </div>
          </div>

          <div className="hero-action-row">
            {isFunder && v.mode === "active" && (
              <button className="btn btn-danger" onClick={handleFreeze} disabled={pending} id="btn-freeze">
                <SnowflakeIcon className="icon-svg icon-svg-sm" />
                {t("vault.freeze")}
              </button>
            )}
            {isFunder && v.mode === "frozen" && (
              <button className="btn btn-success" onClick={handleUnfreeze} disabled={pending} id="btn-unfreeze">
                <CheckCircleIcon className="icon-svg icon-svg-sm" />
                {t("vault.unfreeze")}
              </button>
            )}
            {isBeneficiary && v.mode === "active" && (
              <button
                className="btn btn-primary"
                onClick={() => document.getElementById("req-amount")?.focus()}
                id="btn-request-funds"
              >
                <ArrowDownCircleIcon className="icon-svg icon-svg-sm" />
                {t("vault.compose")}
              </button>
            )}
          </div>
        </div>

        <aside className="surface-card vault-side-intel vault-side-intel-dark vault-side-intel-primary">
          <div className="panel-topline">
            <div>
              <span className="surface-kicker">{t("vault.intelKicker")}</span>
              <h2>{t("vault.intelTitle")}</h2>
            </div>
            <span className="status-pill status-pill-muted">{t("vault.systemLabel")}</span>
          </div>

          <div className="intel-grid">
            <div className="intel-card">
              <span>{t("vault.context.funder")}</span>
              <strong>{v.funder ? shortKey(v.funder) : "—"}</strong>
            </div>
            <div className="intel-card">
              <span>{t("vault.context.beneficiary")}</span>
              <strong>{v.beneficiary ? shortKey(v.beneficiary) : "—"}</strong>
            </div>
            <div className="intel-card">
              <span>{t("vault.context.riskAuthority")}</span>
              <strong>{v.riskAuthority ? shortKey(v.riskAuthority) : "—"}</strong>
            </div>
            <div className="intel-card">
              <span>{t("vault.context.lastPayout")}</span>
              <strong>{formatAbsoluteTime(v.lastPayoutAt, locale, t("common.notAvailable"))}</strong>
            </div>
          </div>

          <div className="latest-risk-summary">
            <span className="surface-kicker">{t("vault.currentScoring")}</span>
            {latestRiskRequest && activeRisk > 0 ? (
              <RiskBar
                score={activeRisk}
                threshold={p.riskThreshold}
                scoreLabel={t("vault.riskScoreLabel")}
                thresholdLabel={t("vault.thresholdLabel")}
                label={
                  activeRisk <= 30
                    ? `${t("vault.risk.low")} ${t("vault.riskSuffix")}`
                    : activeRisk <= 55
                      ? `${t("vault.risk.medium")} ${t("vault.riskSuffix")}`
                      : `${t("vault.risk.high")} ${t("vault.riskSuffix")}`
                }
                levelClassName={activeRisk <= 30 ? "low" : activeRisk <= 55 ? "medium" : "high"}
                levelColor={activeRisk <= 30 ? "var(--success)" : activeRisk <= 55 ? "var(--warning)" : "var(--danger)"}
                variant="primary"
              />
            ) : hasMonitoringTrustFallback && monitoringTrustScore !== null ? (
              <div className="latest-risk-fallback">
                <span className="surface-kicker">{t("vault.monitoring.trust")}</span>
                <strong className="latest-risk-fallback-value">{`${monitoringTrustScore}/100`}</strong>
                <p className="latest-risk-fallback-copy">
                  {beneficiaryMonitoringSummary
                    ? `${getMonitoringLevelLabel(beneficiaryMonitoringSummary.trustLevel, t)} · ${t("vault.currentTrustMonitoring")}`
                    : t("vault.currentTrustMonitoring")}
                </p>
              </div>
            ) : (
              <p className="muted-copy">{t("vault.noAdjudicated")}</p>
            )}
          </div>
        </aside>
      </section>

      <section className="policy-ribbon">
        <div className="policy-ribbon-card">
          <span>{t("vault.policy.perTx")}</span>
          <strong>{p.perTxLimit.toFixed(2)} SOL</strong>
        </div>
        <div className="policy-ribbon-card">
          <span>{t("vault.policy.total")}</span>
          <strong>{p.totalLimit.toFixed(2)} SOL</strong>
        </div>
        <div className="policy-ribbon-card">
          <span>{t("vault.policy.cooldown")}</span>
          <strong>{p.cooldownSeconds}s</strong>
        </div>
        <div className="policy-ribbon-card">
          <span>{t("vault.policy.threshold")}</span>
          <strong>{p.riskThreshold}/100</strong>
        </div>
      </section>

      {vault && v.beneficiary && hasConnectedWallet && (
        <section className="vault-tabs">
          <button
            type="button"
            className={`vault-tab ${activeTab === "activity" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("activity");
              writeStoredMonitoringValue("tab", vaultAddress, "activity");
            }}
          >
            {t("vault.tabs.activity")}
          </button>
          <button
            type="button"
            className={`vault-tab ${activeTab === "monitoring" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("monitoring");
              writeStoredMonitoringValue("tab", vaultAddress, "monitoring");
            }}
          >
            {t("vault.tabs.monitoring")}
          </button>
        </section>
      )}

      <section className="vault-workspace-grid vault-workspace-grid-enhanced">
        <div className="vault-main-column">
          {activeTab === "activity" ? (
            <div className="surface-card request-timeline-shell">
              <div className="panel-topline">
                <div>
                  <span className="surface-kicker">{t("vault.timelineKicker")}</span>
                  <h2>{t("vault.timelineTitle")}</h2>
                </div>
                <span className="status-pill status-pill-muted">{`${reqs.length} ${t("vault.events")}`}</span>
              </div>

              <div className="timeline-stack">
                <article className="surface-card request-card request-card-origin">
                  <div className="request-card-head">
                    <div>
                      <span className="surface-kicker">{t("vault.genesisKicker")}</span>
                      <h3>{`${v.totalDeposited.toFixed(2)} ${t("vault.genesisTitle")}`}</h3>
                    </div>
                    <span className="status-pill status-pill-success">{t("vault.initialized")}</span>
                  </div>
                  <p className="request-description">{t("vault.genesisText")}</p>
                  <div className="request-meta-grid">
                    <div className="request-meta">
                      <span>{t("vault.meta.created")}</span>
                      <strong>{formatAbsoluteTime(v.createdAt, locale, t("common.notAvailable"))}</strong>
                    </div>
                    <div className="request-meta">
                      <span>{t("vault.meta.available")}</span>
                      <strong>{v.available.toFixed(2)} SOL</strong>
                    </div>
                    <div className="request-meta">
                      <span>{t("vault.meta.mode")}</span>
                      <strong>{modeLabel}</strong>
                    </div>
                  </div>
                </article>

                {reqs.map((req) => (
                  <RequestCard key={req.address} req={req} threshold={p.riskThreshold} />
                ))}

                {reqs.length === 0 && (
                  <div className="empty-state-panel">
                    <span className="surface-kicker">{t("vault.emptyKicker")}</span>
                    <h3>{t("vault.emptyTitle")}</h3>
                    <p>{t("vault.emptyText")}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <MonitoringPanel vaultAddress={vaultAddress} beneficiaryAddress={v.beneficiary || undefined} />
          )}
        </div>

        <aside className="vault-side-column">
          <div className="surface-card side-spotlight-card">
            <span className="surface-kicker">{t("vault.snapshotKicker")}</span>
            <div className="side-spotlight-grid">
              <div className="side-spotlight-metric">
                <span>{t("vault.snapshot.mode")}</span>
                <strong>{modeLabel}</strong>
              </div>
              <div className="side-spotlight-metric">
                <span>{t("vault.snapshot.queue")}</span>
                <strong>{reqs.length}</strong>
              </div>
              <div className="side-spotlight-metric">
                <span>{t("vault.snapshot.lastPayout")}</span>
                <strong>{v.lastPayoutAt ? formatRelativeTime(v.lastPayoutAt, locale) : t("vault.none")}</strong>
              </div>
              <div className="side-spotlight-metric">
                <span>{t("vault.snapshot.headroom")}</span>
                <strong>{remainingBudget.toFixed(2)} SOL</strong>
              </div>
            </div>
          </div>

          {vault && isBeneficiary && (
            <div className={`surface-card action-composer ${isFrozen ? "composer-disabled" : ""}`}>
              <div className="panel-topline">
                <div>
                  <span className="surface-kicker">{t("vault.beneficiaryKicker")}</span>
                  <h2>{t("vault.beneficiaryTitle")}</h2>
                </div>
                <span className="status-pill status-pill-muted">{t("common.submit")}</span>
              </div>

              <div className="field-block">
                <label className="field-label" htmlFor="req-amount">{t("vault.amount")}</label>
                <div className="input-with-suffix">
                  <input
                    id="req-amount"
                    className="premium-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={v.available}
                    placeholder="0.00"
                    value={reqAmount}
                    onChange={(e) => setReqAmount(e.target.value)}
                    disabled={isFrozen || isClosed}
                  />
                  <span>SOL</span>
                </div>
                <p className="field-hint">{`${t("vault.perRequestLimit")}: ${p.perTxLimit.toFixed(2)} SOL`}</p>
              </div>

              <div className="field-block">
                <label className="field-label" htmlFor="req-desc">{t("vault.purpose")}</label>
                <textarea
                  id="req-desc"
                  className="premium-input premium-textarea"
                  placeholder={t("vault.purposePlaceholder")}
                  value={reqDesc}
                  onChange={(e) => setReqDesc(e.target.value)}
                  disabled={isFrozen || isClosed}
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleSubmitRequest}
                disabled={!canSubmitRequestForm({
                  amount: reqAmount,
                  description: reqDesc,
                  pending,
                  isFrozen,
                  isClosed,
                })}
                id="btn-submit-request"
              >
                <ArrowDownCircleIcon className="icon-svg icon-svg-sm" />
                {pending ? t("vault.submitting") : t("vault.submitRequest")}
              </button>
            </div>
          )}

          {vault && isFunder && (
            <div className="surface-card action-composer">
              <div className="panel-topline">
                <div>
                  <span className="surface-kicker">{t("vault.funderKicker")}</span>
                  <h2>{t("vault.funderTitle")}</h2>
                </div>
                <span className="status-pill status-pill-muted">{t("common.deposit")}</span>
              </div>

              <div className="field-block">
                <label className="field-label" htmlFor="deposit-topup">{t("vault.additionalCapital")}</label>
                <div className="input-with-suffix">
                  <input
                    id="deposit-topup"
                    className="premium-input"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    disabled={pending || isClosed}
                  />
                  <span>SOL</span>
                </div>
              </div>

              <button
                className="btn btn-secondary"
                onClick={handleDeposit}
                disabled={pending || isClosed}
              >
                <PlusIcon className="icon-svg icon-svg-sm" />
                {pending ? t("vault.depositing") : t("vault.depositButton")}
              </button>
            </div>
          )}

          <div className="surface-card summary-panel">
            <span className="surface-kicker">{t("vault.contextKicker")}</span>
            <div className="identity-list">
              <div className="identity-row">
                <span className="identity-title">{t("vault.context.vaultAddress")}</span>
                <strong>{vaultAddress ? shortKey(vaultAddress) : "—"}</strong>
              </div>
              <div className="identity-row">
                <span className="identity-title">{t("vault.context.availableNow")}</span>
                <strong>{v.available.toFixed(2)} SOL</strong>
              </div>
              <div className="identity-row">
                <span className="identity-title">{t("vault.context.remainingBudget")}</span>
                <strong>{remainingBudget.toFixed(2)} SOL</strong>
              </div>
              <div className="identity-row">
                <span className="identity-title">{t("vault.context.threshold")}</span>
                <strong>{p.riskThreshold}/100</strong>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {toast && (
        <div className={`toast ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === "success" ? (
              <CheckCircleIcon className="icon-svg icon-svg-sm" />
            ) : (
              <AlertCircleIcon className="icon-svg icon-svg-sm" />
            )}
          </span>
          {toast.msg}
        </div>
      )}
    </AppShell>
  );
}
