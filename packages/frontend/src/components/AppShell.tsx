import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  ChevronDownIcon,
  GlobeIcon,
  GridIcon,
  HomeIcon,
  LogOutIcon,
  ShieldIcon,
  WalletIcon,
} from "./Icons";
import WalletActionButton from "./WalletActionButton";
import { useI18n } from "../i18n";
import { getLastVaultAddress } from "../utils/lastVault";
import brandLogoUrl from "../../../../logo/Logo.png";
import { useAuth } from "../auth/useAuth";
import { shortWalletAddress } from "../lib/solanaWallets";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { connected, publicKey, wallet, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { lang, setLanguage, t } = useI18n();
  const { user, signOut } = useAuth();
  const lastVaultAddress = getLastVaultAddress(publicKey?.toBase58()) || getLastVaultAddress();
  const [menuOpen, setMenuOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);

  const navItems = [
    {
      label: t("shell.nav.overview"),
      to: "/console",
      active: location.pathname === "/console",
      icon: HomeIcon,
    },
    {
      label: t("shell.nav.create"),
      to: "/create",
      active: location.pathname === "/create",
      icon: ShieldIcon,
    },
    {
      label: t("shell.nav.dashboard"),
      to: location.pathname.startsWith("/vault/")
        ? location.pathname
        : lastVaultAddress
          ? `/vault/${lastVaultAddress}`
          : "/create",
      active: location.pathname.startsWith("/vault/"),
      icon: GridIcon,
    },
  ];

  const identityTitle = user?.displayName || user?.email || t("auth.account");
  const identitySubtitle =
    user?.providerId === "google.com"
      ? t("auth.provider.google")
      : user?.providerId === "github.com"
        ? t("auth.provider.github")
        : user?.providerId === "password"
          ? t("auth.provider.email")
          : t("auth.identityLayer");
  const avatarLabel = useMemo(() => {
    const source = user?.displayName || user?.email || "A";
    return source.slice(0, 1).toUpperCase();
  }, [user?.displayName, user?.email]);
  const walletProviderIcon = connected ? wallet?.adapter.icon : undefined;
  const walletProviderName = connected ? wallet?.adapter.name || t("wallet.providerUnknown") : t("shell.walletIdle");

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate("/");
  };

  const handleWalletDisconnect = async () => {
    setWalletMenuOpen(false);
    await disconnect();
  };

  return (
    <div className="shell-scene">
      <div className="scene-orb scene-orb-a" />
      <div className="scene-orb scene-orb-b" />
      <div className="scene-grid" />

      <div className="app-frame">
        <aside className="app-sidebar app-sidebar-clean">
          <Link to="/" className="brand-lockup brand-lockup-compact" aria-label="Aegis Home">
            <div className="brand-mark">
              <img src={brandLogoUrl} alt="Aegis logo" className="brand-mark-image" />
            </div>
          </Link>

          <nav className="sidebar-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`sidebar-link ${item.active ? "active" : ""}`}
                  title={item.label}
                  aria-label={item.label}
                >
                  <Icon className="sidebar-link-icon" />
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="app-main">
          <header className="app-topbar app-topbar-clean">
            <nav className="topbar-nav">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`topbar-nav-pill ${item.active ? "active" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="topbar-cluster">
              <div className="lang-switch" aria-label={t("common.language")}>
                <GlobeIcon className="icon-svg icon-svg-sm" />
                <button
                  type="button"
                  className={`lang-switch-button ${lang === "ru" ? "active" : ""}`}
                  onClick={() => setLanguage("ru")}
                >
                  {t("common.ru")}
                </button>
                <button
                  type="button"
                  className={`lang-switch-button ${lang === "en" ? "active" : ""}`}
                  onClick={() => setLanguage("en")}
                >
                  {t("common.en")}
                </button>
              </div>

              <div className="profile-menu-shell">
                <button
                  type="button"
                  className={`profile-chip profile-chip-wallet ${walletMenuOpen ? "open" : ""}`}
                  onClick={() => setWalletMenuOpen((current) => !current)}
                >
                  <div className={`profile-chip-avatar ${walletProviderIcon ? "profile-chip-avatar-wallet" : ""}`}>
                    {walletProviderIcon ? (
                      <img
                        src={walletProviderIcon}
                        alt={walletProviderName}
                        className="profile-chip-wallet-image"
                      />
                    ) : (
                      <WalletIcon className="icon-svg icon-svg-sm" />
                    )}
                  </div>
                  <div>
                    <div className="profile-chip-title">
                      {walletProviderName}
                    </div>
                    <div className="profile-chip-subtitle">
                      {connected
                        ? shortWalletAddress(publicKey?.toBase58())
                        : t("wallet.connectToStart")}
                    </div>
                  </div>
                  {connected && <div className="network-badge">{t("wallet.devnetBadge")}</div>}
                  <ChevronDownIcon className="icon-svg icon-svg-xs" />
                </button>

                {walletMenuOpen && (
                  <div className="profile-menu wallet-menu">
                    <div className="profile-menu-section">
                      <span className="surface-kicker">{t("wallet.walletLayer")}</span>
                      <strong>{connected ? t("shell.walletOnline") : t("shell.walletIdle")}</strong>
                      <p>
                        {connected
                          ? `${walletProviderName} · ${shortWalletAddress(publicKey?.toBase58())}`
                          : t("wallet.connectToStart")}
                      </p>
                    </div>
                    <div className="wallet-menu-meta">
                      <div className="wallet-menu-row">
                        <span>{t("wallet.provider")}</span>
                        <strong>{connected ? walletProviderName : t("common.none")}</strong>
                      </div>
                      <div className="wallet-menu-row">
                        <span>{t("wallet.network")}</span>
                        <strong>{t("wallet.networkValue")}</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="profile-menu-action"
                      onClick={() => {
                        setWalletMenuOpen(false);
                        setVisible(true);
                      }}
                    >
                      <WalletIcon className="icon-svg icon-svg-sm" />
                      {connected ? t("wallet.changeWallet") : t("common.connectWallet")}
                    </button>
                    {connected && (
                      <button type="button" className="profile-menu-action" onClick={handleWalletDisconnect}>
                        <LogOutIcon className="icon-svg icon-svg-sm" />
                        {t("wallet.disconnect")}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="profile-menu-shell">
                <button
                  type="button"
                  className={`profile-chip profile-chip-identity ${menuOpen ? "open" : ""}`}
                  onClick={() => setMenuOpen((current) => !current)}
                >
                  <div className="profile-chip-avatar profile-chip-avatar-auth">
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt={identityTitle} className="profile-avatar-image" />
                    ) : (
                      avatarLabel
                    )}
                  </div>
                  <div>
                    <div className="profile-chip-title">{identityTitle}</div>
                    <div className="profile-chip-subtitle">{identitySubtitle}</div>
                  </div>
                  <ChevronDownIcon className="icon-svg icon-svg-xs" />
                </button>

                {menuOpen && (
                  <div className="profile-menu">
                    <div className="profile-menu-section">
                      <span className="surface-kicker">{t("auth.account")}</span>
                      <strong>{identityTitle}</strong>
                      <p>{user?.email || t("common.notAvailable")}</p>
                    </div>
                    <button type="button" className="profile-menu-action" onClick={handleSignOut}>
                      <LogOutIcon className="icon-svg icon-svg-sm" />
                      {t("auth.signOut")}
                    </button>
                  </div>
                )}
              </div>

              {!connected && <WalletActionButton />}
            </div>
          </header>

          <main className="app-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
