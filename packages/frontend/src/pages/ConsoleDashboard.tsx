import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import AppShell from "../components/AppShell";
import WalletActionButton from "../components/WalletActionButton";
import {
  ArrowDownCircleIcon,
  CheckCircleIcon,
  GridIcon,
  PlusIcon,
  WalletIcon,
} from "../components/Icons";
import { useI18n } from "../i18n";
import { getLastVaultAddress } from "../utils/lastVault";
import {
  getSelectedWalletAddress,
  getWalletSessions,
  setSelectedWalletAddress,
  upsertWalletSession,
  type WalletSessionRecord,
} from "../utils/walletRegistry";
import { useVaultCatalog } from "../hooks/useVaultCatalog";

function shortKey(key?: string | null, fallback?: string) {
  if (!key) return fallback || "";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const SUPPORTED_WALLET_APPS = [
  { key: "phantom", label: "Phantom" },
  { key: "solflare", label: "Solflare" },
  { key: "backpack", label: "Backpack" },
  { key: "trust", label: "Trust" },
  { key: "coinbase", label: "Coinbase Wallet" },
  { key: "okx", label: "OKX Wallet" },
] as const;

function resolveSupportedWalletApp(name?: string | null) {
  const normalizedName = (name || "").trim().toLowerCase();
  if (!normalizedName || normalizedName.includes("metamask")) return null;

  return (
    SUPPORTED_WALLET_APPS.find((provider) => normalizedName.includes(provider.key)) || null
  );
}

function formatWalletTime(locale: string, timestamp?: number | null) {
  if (!timestamp) return "—";

  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

export default function ConsoleDashboard() {
  const { connected, publicKey, wallet, wallets } = useWallet();
  const { t, locale } = useI18n();
  const {
    items: vaultCatalog,
    loading: vaultCatalogLoading,
    error: vaultCatalogError,
    refetch: refetchVaultCatalog,
  } = useVaultCatalog();
  const currentAddress = publicKey?.toBase58() || null;
  const [walletSessions, setWalletSessions] = useState<WalletSessionRecord[]>(() => getWalletSessions());
  const [selectedWalletAddressState, setSelectedWalletAddressState] = useState<string | null>(() =>
    getSelectedWalletAddress()
  );

  const getVaultModeLabel = (mode: "startup" | "grant" | "freelancer") => {
    if (mode === "grant") return t("vaultMode.grant");
    if (mode === "freelancer") return t("vaultMode.freelancer");
    return t("vaultMode.startup");
  };

  useEffect(() => {
    if (!connected || !currentAddress) return;

    const sessions = upsertWalletSession({
      address: currentAddress,
      walletName: wallet?.adapter.name,
      walletIcon: wallet?.adapter.icon,
      network: "Solana Devnet",
    });
    setWalletSessions(sessions);
    setSelectedWalletAddressState(currentAddress);
  }, [connected, currentAddress, wallet?.adapter.icon, wallet?.adapter.name]);

  useEffect(() => {
    if (currentAddress) return;
    if (!selectedWalletAddressState) return;

    const stillKnown = walletSessions.some((session) => session.address === selectedWalletAddressState);
    if (stillKnown) return;

    const fallback = walletSessions[0]?.address || null;
    setSelectedWalletAddress(fallback);
    setSelectedWalletAddressState(fallback);
  }, [currentAddress, selectedWalletAddressState, walletSessions]);

  const activeWorkspaceWallet = currentAddress || selectedWalletAddressState;
  const filteredVaultCatalog = useMemo(() => {
    if (!activeWorkspaceWallet) return vaultCatalog;

    const scoped = vaultCatalog.filter(
      (item) =>
        item.funderWallet === activeWorkspaceWallet ||
        item.beneficiaryWallet === activeWorkspaceWallet ||
        item.payoutWallet === activeWorkspaceWallet
    );

    return scoped.length ? scoped : vaultCatalog;
  }, [activeWorkspaceWallet, vaultCatalog]);

  const currentWalletLastVault = getLastVaultAddress(activeWorkspaceWallet);
  const lastVaultAddress = currentWalletLastVault || getLastVaultAddress() || filteredVaultCatalog[0]?.vaultAddress;

  const recentWallets = useMemo(() => walletSessions.slice(0, 4), [walletSessions]);
  const readyWalletApps = useMemo(
    () => {
      const unique = new Map<string, { entry: (typeof wallets)[number]; label: string }>();

      wallets.forEach((walletEntry) => {
        const walletName = walletEntry.adapter.name.trim();
        const supported = resolveSupportedWalletApp(walletName);
        if (!supported) return;
        if (String(walletEntry.readyState).toLowerCase() === "unsupported") return;
        if (!unique.has(supported.key)) unique.set(supported.key, { entry: walletEntry, label: supported.label });
      });

      return Array.from(unique.values()).slice(0, 3);
    },
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
                <PlusIcon className="icon-svg icon-svg-sm" />
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
          <strong>
            {activeWorkspaceWallet ? shortKey(activeWorkspaceWallet, t("shell.walletIdle")) : t("shell.walletIdle")}
          </strong>
          <p>{activeWorkspaceWallet ? t("console.metrics.walletNowText") : t("console.metrics.walletIdleText")}</p>
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
              <div className="field-block field-block-compact">
                <label className="field-label" htmlFor="workspace-wallet">{t("console.workspaceWallet")}</label>
                <select
                  id="workspace-wallet"
                  className="premium-input"
                  value={activeWorkspaceWallet || ""}
                  onChange={(e) => {
                    const value = e.target.value || null;
                    setSelectedWalletAddress(value);
                    setSelectedWalletAddressState(value);
                  }}
                >
                  <option value="">{t("console.workspaceWalletAuto")}</option>
                  {recentWallets.map((session) => (
                    <option key={session.address} value={session.address}>
                      {`${session.walletName || t("wallet.providerUnknown")} · ${shortKey(session.address, session.address)}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="console-card-list">
                <div className="console-card-row">
                  <span>{t("console.blocks.currentWallet")}</span>
                  <strong>
                    {activeWorkspaceWallet
                      ? shortKey(activeWorkspaceWallet, t("common.notAvailable"))
                      : t("shell.walletIdle")}
                  </strong>
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

            <article className="surface-card feature-surface console-ops-card">
              <span className="surface-kicker">{t("console.walletKicker")}</span>
              <h3>{t("console.walletsTitle")}</h3>
              <div className="identity-list console-identity-list">
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
              <div className="wallet-app-pill-row">
                {readyWalletApps.length ? (
                  readyWalletApps.map(({ entry, label }) => {
                    const isCurrent = wallet?.adapter.name === entry.adapter.name;

                    return (
                      <span key={label} className={`wallet-app-pill ${isCurrent ? "active" : ""}`}>
                        {entry.adapter.icon ? (
                          <img src={entry.adapter.icon} alt={label} className="wallet-provider-icon wallet-provider-icon-small" />
                        ) : (
                          <WalletIcon className="icon-svg icon-svg-sm" />
                        )}
                        {label}
                      </span>
                    );
                  })
                ) : (
                  <div className="console-inline-note">{t("console.appsEmpty")}</div>
                )}
              </div>
            </article>
          </section>
        </div>

        <aside className="workspace-aside">
          <div className="surface-card summary-panel">
            <span className="surface-kicker">{t("console.catalogKicker")}</span>
            <div className="panel-topline panel-topline-compact">
              <div>
                <h3>{t("console.catalogTitle")}</h3>
              </div>
            </div>

            {vaultCatalogLoading ? (
              <div className="console-inline-note">{t("console.catalogLoading")}</div>
            ) : vaultCatalogError ? (
              <div className="console-empty-state">
                <div className="console-inline-note">{t("console.catalogError")}</div>
                <button type="button" className="btn btn-secondary" onClick={refetchVaultCatalog}>
                  <ArrowDownCircleIcon className="icon-svg icon-svg-sm" />
                  {t("console.catalogRetry")}
                </button>
              </div>
            ) : filteredVaultCatalog.length ? (
              <div className="session-stack">
                {filteredVaultCatalog.slice(0, 2).map((item) => (
                  <article key={item.vaultAddress} className="wallet-session-card">
                    <div className="wallet-session-head">
                      <div className="wallet-session-title">
                        <WalletIcon className="icon-svg icon-svg-sm" />
                        <div>
                          <strong>{shortKey(item.vaultAddress, item.vaultAddress)}</strong>
                          <span>{item.projectName || getVaultModeLabel(item.mode)}</span>
                        </div>
                      </div>
                      <span className="status-pill status-pill-muted status-pill-inline">
                        {item.analytics.pendingRequests}
                      </span>
                    </div>

                    <div className="console-card-list wallet-session-meta">
                      <div className="console-card-row">
                        <span>{t("console.catalogRoleWallet")}</span>
                        <strong>
                          {activeWorkspaceWallet && item.funderWallet === activeWorkspaceWallet
                            ? t("vault.role.funder")
                            : activeWorkspaceWallet && item.beneficiaryWallet === activeWorkspaceWallet
                              ? t("vault.role.beneficiary")
                              : t("vault.role.observer")}
                        </strong>
                      </div>
                      <div className="console-card-row">
                        <span>{t("console.catalogRequests")}</span>
                        <strong>{item.analytics.totalRequests}</strong>
                      </div>
                      <div className="console-card-row">
                        <span>{t("console.catalogProtected")}</span>
                        <strong>{(item.analytics.protectedFundsLamports / 1_000_000_000).toFixed(2)} SOL</strong>
                      </div>
                    </div>

                    <Link to={`/vault/${item.vaultAddress}`} className="btn btn-secondary console-inline-action">
                      <GridIcon className="icon-svg icon-svg-sm" />
                      {t("console.catalogOpen")}
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="console-inline-note">{t("console.catalogEmpty")}</div>
            )}
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
                {recentWallets.slice(0, 1).map((session) => {
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
        </aside>
      </section>
    </AppShell>
  );
}
