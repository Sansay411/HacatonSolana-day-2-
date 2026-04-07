import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import AppShell from "../components/AppShell";
import { CheckCircleIcon, GridIcon, PlusIcon, AlertCircleIcon } from "../components/Icons";
import { useVaultActions } from "../hooks/useVaultActions";
import { useI18n } from "../i18n";
import { apiFetch } from "../lib/api";

function shortKey(key?: string | null, fallback?: string) {
  if (!key) return fallback || "";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const CATEGORY_OPTIONS = [
  "operations",
  "infra",
  "payroll",
  "growth",
  "grants",
  "marketing",
  "research",
  "community",
] as const;

type AllowedCategory = (typeof CATEGORY_OPTIONS)[number];

function getDefaultCategories(purposeType: "startup" | "grant" | "infra" | "public_project"): AllowedCategory[] {
  switch (purposeType) {
    case "grant":
      return ["grants", "research", "community"];
    case "infra":
      return ["infra", "operations", "research"];
    case "public_project":
      return ["community", "research", "marketing"];
    case "startup":
    default:
      return ["operations", "infra", "payroll"];
  }
}

export default function CreateVault() {
  const { publicKey } = useWallet();
  const navigate = useNavigate();
  const { createVault, pending } = useVaultActions();
  const { t } = useI18n();

  const [beneficiary, setBeneficiary] = useState("");
  const [projectName, setProjectName] = useState("");
  const [purposeType, setPurposeType] = useState<"startup" | "grant" | "infra" | "public_project">("startup");
  const [description, setDescription] = useState("");
  const [allowedCategories, setAllowedCategories] = useState<AllowedCategory[]>(() =>
    getDefaultCategories("startup")
  );
  const [depositAmount, setDepositAmount] = useState("5");
  const [perTxLimit, setPerTxLimit] = useState("1");
  const [totalLimit, setTotalLimit] = useState("10");
  const [cooldownSeconds, setCooldownSeconds] = useState("60");
  const [riskThreshold, setRiskThreshold] = useState("70");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [runtime, setRuntime] = useState<{
    riskAuthority: {
      publicKey: string;
      balanceSol: number;
      ready: boolean;
      isEphemeral: boolean;
      warnings: string[];
    };
  } | null>(null);

  const RISK_AUTHORITY = import.meta.env.VITE_RISK_AUTHORITY || "";
  const effectiveRiskAuthority =
    runtime?.riskAuthority.publicKey || RISK_AUTHORITY || publicKey?.toBase58() || "";

  useEffect(() => {
    let active = true;

    const loadRuntime = async () => {
      try {
        const response = await apiFetch("/api/system/runtime");
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (active) {
          setRuntime(data);
        }
      } catch {
        if (active) {
          setRuntime(null);
        }
      }
    };

    loadRuntime();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setAllowedCategories(getDefaultCategories(purposeType));
  }, [purposeType]);

  const depositValue = parseFloat(depositAmount) || 0;
  const perTxValue = parseFloat(perTxLimit) || 0;
  const totalLimitValue = parseFloat(totalLimit) || 0;
  const cooldownValue = parseInt(cooldownSeconds, 10) || 0;
  const riskValue = parseInt(riskThreshold, 10) || 0;

  const summary = useMemo(
    () => [
      { label: t("create.summary.initialFunding"), value: `${depositValue.toFixed(2)} SOL` },
      { label: t("create.summary.perRequest"), value: `${perTxValue.toFixed(2)} SOL` },
      { label: t("create.summary.totalCap"), value: `${totalLimitValue.toFixed(2)} SOL` },
      { label: t("create.summary.cooldown"), value: `${cooldownValue}s` },
    ],
    [cooldownValue, depositValue, perTxValue, totalLimitValue, t]
  );
  const depositRatio = totalLimitValue > 0 ? Math.max(0, (depositValue / totalLimitValue) * 100) : 0;
  const requestRatio = totalLimitValue > 0 ? Math.max(0, (perTxValue / totalLimitValue) * 100) : 0;

  const handleCreate = async () => {
    const beneficiaryAddress = beneficiary.trim();
    if (!publicKey || !beneficiaryAddress) return;

    const result = await createVault({
      beneficiary: beneficiaryAddress,
      riskAuthority: effectiveRiskAuthority,
      depositSol: depositValue,
      perTxLimitSol: perTxValue || 1,
      totalLimitSol: totalLimitValue || 10,
      cooldownSeconds: cooldownValue || 60,
      riskThreshold: riskValue || 70,
    });

    if (result.success && result.vaultAddress) {
      try {
        await apiFetch("/api/vaults", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vaultAddress: result.vaultAddress,
            name: projectName.trim() || null,
            projectName: projectName.trim() || null,
            purposeType,
            description: description.trim() || null,
            allowedCategories,
            funderWallet: publicKey.toBase58(),
            beneficiaryWallet: beneficiaryAddress,
            payoutWallet: beneficiaryAddress,
            mode: purposeType === "grant" ? "grant" : "startup",
            dailyLimitLamports: 0,
            allowedTimeWindows: [],
            categoryRules: [],
            emergencyStopEnabled: false,
          }),
        });
      } catch {
        console.warn("Vault profile was not saved to backend catalog");
      }

      setToast({ msg: t("create.toastSuccess"), type: "success" });
      setTimeout(() => navigate(`/vault/${result.vaultAddress}`), 1500);
    } else {
      setToast({ msg: result.error || t("create.toastError"), type: "error" });
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <AppShell>
      <section className="page-heading">
        <div>
          <div className="eyebrow-pill">{t("create.eyebrow")}</div>
          <h1 className="page-title">{t("create.title")}</h1>
          <p className="page-subtitle">{t("create.subtitle")}</p>
        </div>

        <div className="page-heading-actions">
          <Link to="/console" className="btn btn-ghost">
            <GridIcon className="icon-svg icon-svg-sm" />
            {t("create.back")}
          </Link>
        </div>
      </section>

      <section className="create-hero-ribbon">
        <div className="surface-card create-ribbon-card create-ribbon-card-accent">
          <span className="surface-kicker">{t("create.ribbon.funding")}</span>
          <strong>{depositValue.toFixed(2)} SOL</strong>
          <p>{t("create.ribbon.fundingText")}</p>
        </div>
        <div className="surface-card create-ribbon-card">
          <span className="surface-kicker">{t("create.ribbon.risk")}</span>
          <strong>{riskValue}/100</strong>
          <p>{t("create.ribbon.riskText")}</p>
        </div>
        <div className="surface-card create-ribbon-card create-ribbon-card-dark">
          <span className="surface-kicker">{t("create.ribbon.execution")}</span>
          <strong>{cooldownValue}s</strong>
          <p>{t("create.ribbon.executionText")}</p>
        </div>
      </section>

      <section className="workspace-grid workspace-grid-enhanced">
        <div className="workspace-main-stack">
          <div className="surface-card workspace-panel workspace-panel-primary">
            <div className="panel-topline">
              <div>
                <span className="surface-kicker">{t("create.configKicker")}</span>
                <h2>{t("create.configTitle")}</h2>
              </div>
              <span className="status-pill status-pill-success">{t("create.ready")}</span>
            </div>

            <div className="field-block">
              <label className="field-label" htmlFor="project-name">{t("create.projectName")}</label>
              <input
                id="project-name"
                className="premium-input"
                type="text"
                placeholder={t("create.projectNamePlaceholder")}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>

            <div className="workspace-two-up create-config-row">
              <div className="field-block">
                <label className="field-label" htmlFor="purpose-type">{t("create.purposeType")}</label>
                <select
                  id="purpose-type"
                  className="premium-input"
                  value={purposeType}
                  onChange={(e) =>
                    setPurposeType(e.target.value as "startup" | "grant" | "infra" | "public_project")
                  }
                >
                  <option value="startup">{t("create.purposeType.startup")}</option>
                  <option value="grant">{t("create.purposeType.grant")}</option>
                  <option value="infra">{t("create.purposeType.infra")}</option>
                  <option value="public_project">{t("create.purposeType.publicProject")}</option>
                </select>
              </div>

              <div className="field-block">
                <label className="field-label">{t("create.allowedCategories")}</label>
                <div className="category-picker" role="group" aria-label={t("create.allowedCategories")}>
                  {CATEGORY_OPTIONS.map((category) => {
                    const active = allowedCategories.includes(category);

                    return (
                      <button
                        key={category}
                        type="button"
                        className={`category-chip ${active ? "active" : ""}`}
                        onClick={() =>
                          setAllowedCategories((current) =>
                            current.includes(category)
                              ? current.filter((item) => item !== category)
                              : [...current, category]
                          )
                        }
                      >
                        {t(`create.category.${category}`)}
                      </button>
                    );
                  })}
                </div>
                <p className="field-hint">{t("create.allowedCategoriesHint")}</p>
              </div>
            </div>

            <div className="field-block">
              <label className="field-label" htmlFor="project-description">{t("create.projectDescription")}</label>
              <textarea
                id="project-description"
                className="premium-input premium-textarea"
                rows={4}
                placeholder={t("create.projectDescriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 300))}
              />
              <p className="field-hint">{t("create.projectDescriptionHint")}</p>
            </div>

            <div className="field-block">
              <label className="field-label" htmlFor="beneficiary">{t("create.beneficiary")}</label>
              <input
                id="beneficiary"
                className="premium-input"
                type="text"
                placeholder={t("create.beneficiaryPlaceholder")}
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
              />
              <p className="field-hint">{t("create.beneficiaryHint")}</p>
            </div>

            <div className="workspace-two-up">
              <div className="field-block">
                <label className="field-label" htmlFor="deposit-amount">{t("create.deposit")}</label>
                <div className="input-with-suffix">
                  <input
                    id="deposit-amount"
                    className="premium-input"
                    type="number"
                    step="0.1"
                    min="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                  <span>SOL</span>
                </div>
              </div>

              <div className="field-block">
                <label className="field-label" htmlFor="cooldown">{t("create.cooldown")}</label>
                <div className="input-with-suffix">
                  <input
                    id="cooldown"
                    className="premium-input"
                    type="number"
                    value={cooldownSeconds}
                    onChange={(e) => setCooldownSeconds(e.target.value)}
                  />
                  <span>{t("create.cooldownUnit")}</span>
                </div>
              </div>
            </div>

            <div className="surface-card inner-panel">
              <div className="panel-topline">
                <div>
                  <span className="surface-kicker">{t("create.policyKicker")}</span>
                  <h3>{t("create.policyTitle")}</h3>
                </div>
              </div>

              <div className="workspace-two-up">
                <div className="field-block">
                  <label className="field-label" htmlFor="per-tx-limit">{t("create.perTxLimit")}</label>
                  <div className="input-with-suffix">
                    <input
                      id="per-tx-limit"
                      className="premium-input"
                      type="number"
                      step="0.1"
                      value={perTxLimit}
                      onChange={(e) => setPerTxLimit(e.target.value)}
                    />
                    <span>SOL</span>
                  </div>
                </div>

                <div className="field-block">
                  <label className="field-label" htmlFor="total-limit">{t("create.totalLimit")}</label>
                  <div className="input-with-suffix">
                    <input
                      id="total-limit"
                      className="premium-input"
                      type="number"
                      step="0.1"
                      value={totalLimit}
                      onChange={(e) => setTotalLimit(e.target.value)}
                    />
                    <span>SOL</span>
                  </div>
                </div>
              </div>

              <div className="field-block">
                <label className="field-label" htmlFor="risk-threshold">{t("create.riskThreshold")}</label>
                <div className="range-row">
                  <input
                    id="risk-threshold"
                    className="premium-range"
                    type="range"
                    min="0"
                    max="100"
                    value={riskThreshold}
                    onChange={(e) => setRiskThreshold(e.target.value)}
                  />
                  <div className="range-chip">{riskValue}/100</div>
                </div>
                <p className="field-hint">{t("create.riskHint")}</p>
              </div>
            </div>

            <div className="action-footer">
              <button
                className="btn btn-primary btn-xl"
                onClick={handleCreate}
                disabled={!publicKey || !beneficiary || pending}
                id="btn-create-vault"
              >
                <PlusIcon className="icon-svg icon-svg-sm" />
                {pending ? t("create.deploying") : t("create.createButton")}
              </button>
            </div>
          </div>

          <div className="workspace-two-up workspace-secondary-grid">
            <div className="surface-card summary-panel summary-panel-dark create-flow-panel">
              <span className="surface-kicker">{t("create.flowKicker")}</span>
              <div className="flow-list">
                <div className="flow-item">
                  <strong>1</strong>
                  <div>
                    <h4>{t("create.flow.step1Title")}</h4>
                    <p>{t("create.flow.step1Text")}</p>
                  </div>
                </div>
                <div className="flow-item">
                  <strong>2</strong>
                  <div>
                    <h4>{t("create.flow.step2Title")}</h4>
                    <p>{t("create.flow.step2Text")}</p>
                  </div>
                </div>
                <div className="flow-item">
                  <strong>3</strong>
                  <div>
                    <h4>{t("create.flow.step3Title")}</h4>
                    <p>{t("create.flow.step3Text")}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="surface-card summary-panel create-intent-panel">
              <span className="surface-kicker">{t("create.intentKicker")}</span>
              <div className="create-intent-grid">
                <div className="create-intent-metric">
                  <span className="identity-title">{t("create.intent.depositRatio")}</span>
                  <strong>{`${depositRatio.toFixed(0)}%`}</strong>
                  <p>{`${depositValue.toFixed(2)} SOL ${t("create.intent.ofProgramCap")} ${totalLimitValue.toFixed(2)} SOL`}</p>
                </div>
                <div className="create-intent-metric">
                  <span className="identity-title">{t("create.intent.requestRatio")}</span>
                  <strong>{`${requestRatio.toFixed(0)}%`}</strong>
                  <p>{`${perTxValue.toFixed(2)} SOL ${t("create.intent.maxSingleRequest")}`}</p>
                </div>
              </div>
              <div className="console-card-list create-intent-list">
                <div className="console-card-row">
                  <span>{t("create.intent.availableRequests")}</span>
                  <strong>{perTxValue > 0 ? Math.max(1, Math.floor(totalLimitValue / perTxValue)) : 0}</strong>
                </div>
                <div className="console-card-row">
                  <span>{t("create.intent.riskPolicy")}</span>
                  <strong>{`${riskValue}/100`}</strong>
                </div>
                <div className="console-card-row">
                  <span>{t("create.intent.cooldownPolicy")}</span>
                  <strong>{`${cooldownValue}s`}</strong>
                </div>
              </div>
              <p className="console-inline-note">{t("create.intent.note")}</p>
            </div>
          </div>
        </div>

        <aside className="workspace-aside">
          <div className="surface-card summary-panel">
            <div className="panel-topline">
              <div>
                <span className="surface-kicker">{t("create.summaryKicker")}</span>
                <h2>{t("create.summaryTitle")}</h2>
              </div>
            </div>

            <div className="summary-grid">
              {summary.map((item) => (
                <div key={item.label} className="summary-metric">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card summary-panel">
            <span className="surface-kicker">{t("create.authorityKicker")}</span>
            <div className="identity-list">
              <div className="identity-row">
                <span className="identity-title">{t("create.identity.funder")}</span>
                <strong>{shortKey(publicKey?.toBase58(), t("create.notConfigured"))}</strong>
              </div>
              <div className="identity-row">
                <span className="identity-title">{t("create.identity.beneficiary")}</span>
                <strong>{beneficiary ? shortKey(beneficiary) : t("create.awaitingAddress")}</strong>
              </div>
              <div className="identity-row">
                <span className="identity-title">{t("create.identity.riskAuthority")}</span>
                <strong>{shortKey(effectiveRiskAuthority, t("create.notConfigured"))}</strong>
              </div>
            </div>
          </div>

          <div className={`surface-card summary-panel ${runtime && !runtime.riskAuthority.ready ? "summary-panel-dark" : ""}`}>
            <span className="surface-kicker">{t("create.executorKicker")}</span>
            <div className="identity-list">
              <div className="identity-row">
                <span className="identity-title">{t("create.executorStatus")}</span>
                <strong>
                  {runtime
                    ? runtime.riskAuthority.ready
                      ? t("create.executorReady")
                      : t("create.executorNeedsAttention")
                    : t("create.executorLoading")}
                </strong>
              </div>
              <div className="identity-row">
                <span className="identity-title">{t("create.executorBalance")}</span>
                <strong>
                  {runtime ? `${runtime.riskAuthority.balanceSol.toFixed(4)} SOL` : "—"}
                </strong>
              </div>
              {runtime?.riskAuthority.isEphemeral && (
                <div className="identity-row">
                  <span className="identity-title">{t("create.executorMode")}</span>
                  <strong>{t("create.executorEphemeral")}</strong>
                </div>
              )}
            </div>
            {runtime?.riskAuthority.warnings?.length ? (
              <p className="field-hint">{runtime.riskAuthority.warnings[0]}</p>
            ) : (
              <p className="field-hint">{t("create.executorHint")}</p>
            )}
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
