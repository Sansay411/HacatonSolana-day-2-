import React from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import AppShell from "../components/AppShell";
import WalletActionButton from "../components/WalletActionButton";
import { ArrowDownCircleIcon, CheckCircleIcon, ShieldIcon, SparklesIcon } from "../components/Icons";
import { useI18n } from "../i18n";
import { getLastVaultAddress } from "../utils/lastVault";

function shortKey(key?: string | null, fallback?: string) {
  if (!key) return fallback || "";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function ConsoleDashboard() {
  const { connected, publicKey } = useWallet();
  const { t } = useI18n();
  const lastVaultAddress = getLastVaultAddress();

  return (
    <AppShell>
      <section className="page-heading">
        <div>
          <div className="eyebrow-pill">{t("console.eyebrow")}</div>
          <h1 className="page-title">{t("console.title")}</h1>
          <p className="page-subtitle">{t("console.subtitle")}</p>
        </div>

        <div className="page-heading-actions">
          {connected ? (
            <>
              {lastVaultAddress && (
                <Link to={`/vault/${lastVaultAddress}`} className="btn btn-secondary">
                  <ArrowDownCircleIcon className="icon-svg icon-svg-sm" />
                  {t("console.lastVault")}
                </Link>
              )}
              <Link to="/create" className="btn btn-primary">
                <ShieldIcon className="icon-svg icon-svg-sm" />
                {t("console.cta")}
              </Link>
            </>
          ) : (
            <WalletActionButton />
          )}
        </div>
      </section>

      <section className="vault-command-ribbon">
        <div className="surface-card command-ribbon-card command-ribbon-card-accent">
          <span className="surface-kicker">{t("console.metrics.balance")}</span>
          <strong>0.00 SOL</strong>
          <p>{t("console.metrics.balanceText")}</p>
        </div>
        <div className="surface-card command-ribbon-card">
          <span className="surface-kicker">{t("console.metrics.risk")}</span>
          <strong>{t("console.metrics.riskValue")}</strong>
          <p>{t("console.metrics.riskText")}</p>
        </div>
        <div className="surface-card command-ribbon-card command-ribbon-card-dark">
          <span className="surface-kicker">{t("console.metrics.cooldown")}</span>
          <strong>{t("console.metrics.cooldownValue")}</strong>
          <p>{t("console.metrics.cooldownText")}</p>
        </div>
      </section>

      <section className="workspace-grid workspace-grid-enhanced">
        <div className="workspace-main-stack">
          <div className="surface-card workspace-panel workspace-panel-primary">
            <div className="panel-topline">
              <div>
                <span className="surface-kicker">{t("console.nextKicker")}</span>
                <h2>{t("console.nextTitle")}</h2>
              </div>
              <span className="status-pill status-pill-success">{t("console.status")}</span>
            </div>

            <div className="flow-list">
              <div className="flow-item">
                <strong>1</strong>
                <div>
                  <h4>{t("console.steps.oneTitle")}</h4>
                  <p>{t("console.steps.oneText")}</p>
                </div>
              </div>
              <div className="flow-item">
                <strong>2</strong>
                <div>
                  <h4>{t("console.steps.twoTitle")}</h4>
                  <p>{t("console.steps.twoText")}</p>
                </div>
              </div>
              <div className="flow-item">
                <strong>3</strong>
                <div>
                  <h4>{t("console.steps.threeTitle")}</h4>
                  <p>{t("console.steps.threeText")}</p>
                </div>
              </div>
            </div>
          </div>

          <section className="content-grid content-grid-console">
            <article className="surface-card feature-surface">
              <span className="surface-kicker">{t("console.blocks.dashboard")}</span>
              <h3>{t("console.blocks.dashboardTitle")}</h3>
              <p>{t("console.blocks.dashboardText")}</p>
            </article>
            <article className="surface-card feature-surface">
              <span className="surface-kicker">{t("console.blocks.create")}</span>
              <h3>{t("console.blocks.createTitle")}</h3>
              <p>{t("console.blocks.createText")}</p>
            </article>
            <article className="surface-card feature-surface">
              <span className="surface-kicker">{t("console.blocks.vault")}</span>
              <h3>{t("console.blocks.vaultTitle")}</h3>
              <p>{t("console.blocks.vaultText")}</p>
            </article>
          </section>
        </div>

        <aside className="workspace-aside">
          <div className="surface-card summary-panel">
            <span className="surface-kicker">{t("console.walletKicker")}</span>
            <div className="identity-list">
              <div className="identity-row">
                <span className="identity-title">{t("console.walletStatus")}</span>
                <strong>{connected ? t("shell.walletOnline") : t("shell.walletIdle")}</strong>
              </div>
              <div className="identity-row">
                <span className="identity-title">{t("console.walletAddress")}</span>
                <strong>{shortKey(publicKey?.toBase58(), t("common.notAvailable"))}</strong>
              </div>
              <div className="identity-row">
                <span className="identity-title">{t("console.network")}</span>
                <strong>Solana Devnet</strong>
              </div>
            </div>
          </div>

          <div className="surface-card summary-panel summary-panel-dark">
            <span className="surface-kicker">{t("console.controlKicker")}</span>
            <div className="flow-list">
              <div className="flow-item">
                <strong>
                  <CheckCircleIcon className="icon-svg icon-svg-sm" />
                </strong>
                <div>
                  <h4>{t("console.control.oneTitle")}</h4>
                  <p>{t("console.control.oneText")}</p>
                </div>
              </div>
              <div className="flow-item">
                <strong>
                  <SparklesIcon className="icon-svg icon-svg-sm" />
                </strong>
                <div>
                  <h4>{t("console.control.twoTitle")}</h4>
                  <p>{t("console.control.twoText")}</p>
                </div>
              </div>
              <div className="flow-item">
                <strong>
                  <ArrowDownCircleIcon className="icon-svg icon-svg-sm" />
                </strong>
                <div>
                  <h4>{t("console.control.threeTitle")}</h4>
                  <p>{t("console.control.threeText")}</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
