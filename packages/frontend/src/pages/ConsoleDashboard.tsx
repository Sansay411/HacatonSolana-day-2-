import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import AppShell from "../components/AppShell";
import WalletActionButton from "../components/WalletActionButton";
import {
  ArrowDownCircleIcon,
  CheckCircleIcon,
  GridIcon,
  ShieldIcon,
  SparklesIcon,
  WalletIcon,
} from "../components/Icons";
import { useI18n } from "../i18n";
import { getLastVaultAddress } from "../utils/lastVault";
import { getWalletSessions, upsertWalletSession, type WalletSessionRecord } from "../utils/walletRegistry";

function shortKey(key?: string | null, fallback?: string) {
  if (!key) return fallback || "";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function formatWalletTime(locale: string, timestamp: number) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export default function ConsoleDashboard() {
  const { connected, publicKey, wallet, wallets } = useWallet();
  const { t, locale } = useI18n();
  const currentAddress = publicKey?.toBase58() || null;
  const [walletSessions, setWalletSessions] = useState<WalletSessionRecord[]>(() => getWalletSessions());

  useEffect(() => {
    if (!connected || !currentAddress) return;

    setWalletSessions(
      upsertWalletSession({
        address: currentAddress,
        walletName: wallet?.adapter.name,
        walletIcon: wallet?.adapter.icon,
        network: "Solana Devnet",
      })
    );
  }, [connected, currentAddress, wallet?.adapter.icon, wallet?.adapter.name]);

  const currentWalletLastVault = getLastVaultAddress(currentAddress);
  const lastVaultAddress = currentWalletLastVault || getLastVaultAddress();

  const recentWallets = useMemo(() => walletSessions.slice(0, 4), [walletSessions]);
  const readyWalletApps = useMemo(
    () =>
      wallets
        .filter(({ readyState }) => String(readyState).toLowerCase() !== "unsupported")
        .slice(0, 4),
    [wallets]
  );

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
          <span className="surface-kicker">{t("console.metrics.walletNow")}</span>
          <strong>{connected ? shortKey(currentAddress, t("shell.walletIdle")) : t("shell.walletIdle")}</strong>
          <p>{connected ? t("console.metrics.walletNowText") : t("console.metrics.walletIdleText")}</p>
        </div>
        <div className="surface-card command-ribbon-card">
          <span className="surface-kicker">{t("console.metrics.sessions")}</span>
          <strong>{recentWallets.length}</strong>
          <p>{t("console.metrics.sessionsText")}</p>
        </div>
        <div className="surface-card command-ribbon-card command-ribbon-card-dark">
          <span className="surface-kicker">{t("console.metrics.walletApps")}</span>
          <strong>{readyWalletApps.length}</strong>
          <p>{t("console.metrics.walletAppsText")}</p>
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
            <article className="surface-card feature-surface console-ops-card">
              <span className="surface-kicker">{t("console.blocks.wallets")}</span>
              <h3>{t("console.blocks.walletsTitle")}</h3>
              <p>{t("console.blocks.walletsText")}</p>
              <div className="console-card-list">
                <div className="console-card-row">
                  <span>{t("console.blocks.currentWallet")}</span>
                  <strong>{connected ? shortKey(currentAddress, t("common.notAvailable")) : t("shell.walletIdle")}</strong>
                </div>
                <div className="console-card-row">
                  <span>{t("console.blocks.savedWallets")}</span>
                  <strong>{recentWallets.length}</strong>
                </div>
                <div className="console-card-row">
                  <span>{t("console.blocks.availableWallets")}</span>
                  <strong>{readyWalletApps.length}</strong>
                </div>
              </div>
            </article>

            <article className="surface-card feature-surface console-ops-card">
              <span className="surface-kicker">{t("console.blocks.continue")}</span>
              <h3>{t("console.blocks.continueTitle")}</h3>
              <p>{t("console.blocks.continueText")}</p>
              {lastVaultAddress ? (
                <Link to={`/vault/${lastVaultAddress}`} className="btn btn-secondary console-inline-action">
                  <GridIcon className="icon-svg icon-svg-sm" />
                  {t("console.lastVault")}
                </Link>
              ) : (
                <div className="console-inline-note">{t("console.blocks.continueEmpty")}</div>
              )}
            </article>

            <article className="surface-card feature-surface console-ops-card">
              <span className="surface-kicker">{t("console.blocks.multi")}</span>
              <h3>{t("console.blocks.multiTitle")}</h3>
              <p>{t("console.blocks.multiText")}</p>
              <div className="console-bullet-list">
                <div className="console-bullet-item">
                  <CheckCircleIcon className="icon-svg icon-svg-sm" />
                  <span>{t("console.blocks.multiPointOne")}</span>
                </div>
                <div className="console-bullet-item">
                  <CheckCircleIcon className="icon-svg icon-svg-sm" />
                  <span>{t("console.blocks.multiPointTwo")}</span>
                </div>
              </div>
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
                <span className="identity-title">{t("console.walletProvider")}</span>
                <strong>{wallet?.adapter.name || t("common.notAvailable")}</strong>
              </div>
              <div className="identity-row">
                <span className="identity-title">{t("console.walletAddress")}</span>
                <strong>{shortKey(currentAddress, t("common.notAvailable"))}</strong>
              </div>
              <div className="identity-row">
                <span className="identity-title">{t("console.network")}</span>
                <strong>{t("wallet.networkValue")}</strong>
              </div>
            </div>
          </div>

          <div className="surface-card summary-panel">
            <div className="panel-topline panel-topline-compact">
              <div>
                <span className="surface-kicker">{t("console.sessionsKicker")}</span>
                <h3>{t("console.sessionsTitle")}</h3>
              </div>
            </div>

            {recentWallets.length ? (
              <div className="session-stack">
                {recentWallets.map((session) => {
                  const isCurrent = currentAddress === session.address;

                  return (
                    <article key={session.address} className={`wallet-session-card ${isCurrent ? "active" : ""}`}>
                      <div className="wallet-session-head">
                        <div className="wallet-session-title">
                          {session.walletIcon ? (
                            <img src={session.walletIcon} alt={session.walletName || t("wallet.providerUnknown")} className="wallet-provider-icon" />
                          ) : (
                            <WalletIcon className="icon-svg icon-svg-sm" />
                          )}
                          <div>
                            <strong>{shortKey(session.address, session.address)}</strong>
                            <span>{session.walletName || t("common.connectWallet")}</span>
                          </div>
                        </div>
                        <span className={`status-pill ${isCurrent ? "status-pill-success" : "status-pill-muted"} status-pill-inline`}>
                          {isCurrent ? t("console.sessionActive") : t("console.sessionRecent")}
                        </span>
                      </div>

                      <div className="console-card-list wallet-session-meta">
                        <div className="console-card-row">
                          <span>{t("console.sessionLastSeen")}</span>
                          <strong>{formatWalletTime(locale, session.lastSeenAt)}</strong>
                        </div>
                        <div className="console-card-row">
                          <span>{t("console.sessionVault")}</span>
                          <strong>{session.lastVaultAddress ? shortKey(session.lastVaultAddress) : t("common.none")}</strong>
                        </div>
                      </div>

                      {session.lastVaultAddress && (
                        <Link to={`/vault/${session.lastVaultAddress}`} className="btn btn-secondary console-inline-action">
                          <ArrowDownCircleIcon className="icon-svg icon-svg-sm" />
                          {t("console.sessionContinue")}
                        </Link>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="console-inline-note">{t("console.sessionsEmpty")}</div>
            )}
          </div>

          <div className="surface-card summary-panel summary-panel-dark">
            <span className="surface-kicker">{t("console.appsKicker")}</span>
            <div className="flow-list">
              {readyWalletApps.length ? (
                readyWalletApps.map(({ adapter }, index) => {
                  const isCurrent = wallet?.adapter.name === adapter.name;

                  return (
                    <div key={`${adapter.name}-${index}`} className="flow-item wallet-app-row">
                      <strong>
                        {adapter.icon ? (
                          <img src={adapter.icon} alt={adapter.name} className="wallet-provider-icon wallet-provider-icon-small" />
                        ) : (
                          <WalletIcon className="icon-svg icon-svg-sm" />
                        )}
                      </strong>
                      <div>
                        <h4>{adapter.name}</h4>
                        <p>{isCurrent ? t("console.appSelected") : t("console.appDetected")}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="console-inline-note console-inline-note-dark">{t("console.appsEmpty")}</div>
              )}
            </div>
            <p className="muted-copy console-hint">{t("console.appsHint")}</p>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
