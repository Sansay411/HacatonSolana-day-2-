import React, { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  GlobeIcon,
  GridIcon,
  SparklesIcon,
  WalletIcon,
} from "../components/Icons";
import { useI18n } from "../i18n";
import brandLogoUrl from "../../../../logo/Logo.png";
import AuthPanel from "../auth/AuthPanel";
import { useAuth } from "../auth/useAuth";
import WalletActionButton from "../components/WalletActionButton";
import { SOLANA_NETWORK_LABEL, shortWalletAddress } from "../lib/solanaWallets";
import { getLastVaultAddress } from "../utils/lastVault";
import { useVaultCatalog } from "../hooks/useVaultCatalog";

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { connected, connecting, publicKey } = useWallet();
  const { lang, setLanguage, t } = useI18n();
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const { items: vaultItems, loading: vaultsLoading, error: vaultsError, refetch } = useVaultCatalog();

  const authProviderLabel =
    user?.providerId === "google.com"
      ? t("auth.provider.google")
      : user?.providerId === "github.com"
        ? t("auth.provider.github")
        : user?.providerId === "password"
          ? t("auth.provider.email")
          : t("common.notAvailable");

  const getVaultModeLabel = (mode: "startup" | "grant" | "freelancer") => {
    if (mode === "grant") return t("vaultMode.grant");
    if (mode === "freelancer") return t("vaultMode.freelancer");
    return t("vaultMode.startup");
  };

  const nextRoute = searchParams.get("next") || "/console";
  const lastVaultAddress =
    getLastVaultAddress(publicKey?.toBase58()) ||
    getLastVaultAddress() ||
    vaultItems[0]?.vaultAddress ||
    null;

  const heroStats = useMemo(
    () => [
      { label: t("landing.stats.primaryOne"), value: t("landing.stats.primaryOneValue") },
      { label: t("landing.stats.primaryTwo"), value: t("landing.stats.primaryTwoValue") },
      { label: t("landing.stats.primaryThree"), value: t("landing.stats.primaryThreeValue") },
    ],
    [t]
  );

  const howSteps = useMemo(
    () => [
      { step: "01", title: t("landing.how.twoTitle"), text: t("landing.how.twoText") },
      { step: "02", title: t("landing.how.threeTitle"), text: t("landing.how.threeText") },
      { step: "03", title: t("landing.features.ai.title"), text: t("landing.security.policy.text") },
      { step: "04", title: t("landing.how.fourTitle"), text: t("landing.security.chain.text") },
    ],
    [t]
  );

  const useCases = useMemo(
    () => [
      {
        title: t("landing.useCases.startup.title"),
        text: t("landing.useCases.startup.text"),
        why: t("landing.useCases.startup.why"),
      },
      {
        title: t("landing.useCases.grants.title"),
        text: t("landing.useCases.grants.text"),
        why: t("landing.useCases.grants.why"),
      },
      {
        title: t("landing.useCases.dao.title"),
        text: t("landing.useCases.dao.text"),
        why: t("landing.useCases.dao.why"),
      },
      {
        title: t("landing.useCases.freelancer.title"),
        text: t("landing.useCases.freelancer.text"),
        why: t("landing.useCases.freelancer.why"),
      },
    ],
    [t]
  );

  const securityBlocks = useMemo(
    () => [
      { title: t("landing.security.ai.title"), text: t("landing.security.ai.text") },
      { title: t("landing.security.backend.title"), text: t("landing.security.backend.text") },
      { title: t("landing.security.policy.title"), text: t("landing.security.policy.text") },
      { title: t("landing.security.safe.title"), text: t("landing.security.safe.text") },
      { title: t("landing.security.chain.title"), text: t("landing.security.chain.text") },
    ],
    [t]
  );

  const systemProperties = useMemo(
    () => [
      t("landing.properties.deterministic"),
      t("landing.properties.ai"),
      t("landing.properties.failSafe"),
      t("landing.properties.audit"),
    ],
    [t]
  );

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goToProduct = () => {
    if (!isAuthenticated) {
      scrollToSection("landing-auth");
      return;
    }

    if (connected && lastVaultAddress) {
      navigate(`/vault/${lastVaultAddress}`);
      return;
    }

    navigate(nextRoute);
  };

  return (
    <div className="shell-scene marketing-page">
      <div className="scene-orb scene-orb-a" />
      <div className="scene-orb scene-orb-b" />
      <div className="scene-grid" />

      <div className="marketing-frame">
        <header className="marketing-header">
          <button
            type="button"
            className="marketing-brand"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <span className="brand-mark">
              <img src={brandLogoUrl} alt="Aegis logo" className="brand-mark-image" />
            </span>
            <span className="marketing-brand-copy">
              <strong>{t("landing.productName")}</strong>
              <em>{t("landing.brandSubtitle")}</em>
            </span>
          </button>

          <nav className="marketing-nav">
            <button type="button" onClick={() => scrollToSection("landing-features")}>
              {t("landing.nav.features")}
            </button>
            <button type="button" onClick={() => scrollToSection("landing-how")}>
              {t("landing.nav.how")}
            </button>
            <button type="button" onClick={() => scrollToSection("landing-security")}>
              {t("landing.nav.security")}
            </button>
          </nav>

          <div className="marketing-header-actions">
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

            <button type="button" className="btn btn-primary" onClick={goToProduct}>
              <SparklesIcon className="icon-svg icon-svg-sm" />
              {connected ? t("landing.cta.console") : t("landing.cta.getStarted")}
            </button>
          </div>
        </header>

        <section className="marketing-hero marketing-hero-auth">
          <div className="hero-copy-panel marketing-hero-copy">
            <div className="eyebrow-pill">{t("landing.eyebrow")}</div>
            <h1 className="hero-display">{t("landing.tagline")}</h1>
            <p className="hero-paragraph">{t("landing.heroExplanation")}</p>

            <div className="hero-action-row">
              <button type="button" className="btn btn-primary btn-xl" onClick={goToProduct}>
                <SparklesIcon className="icon-svg icon-svg-sm" />
                {connected ? t("landing.cta.console") : t("landing.cta.getStarted")}
              </button>
              {connected ? (
                <Link
                  to={lastVaultAddress ? `/vault/${lastVaultAddress}` : "/console"}
                  className="btn btn-secondary btn-xl"
                >
                  <GridIcon className="icon-svg icon-svg-sm" />
                  {t("landing.resume.open")}
                </Link>
              ) : (
                <WalletActionButton className="btn-secondary btn-xl" />
              )}
            </div>

            <div className="hero-stat-row">
              {heroStats.map((item) => (
                <div key={item.label} className="hero-stat-card">
                  <span className="hero-stat-value">{item.value}</span>
                  <span className="hero-stat-label">{item.label}</span>
                </div>
              ))}
            </div>

            <div className="landing-next-step-strip">
              <div className="landing-next-step-card">
                <span className="surface-kicker">{t("landing.valueKicker")}</span>
                <strong>{t("landing.valueTitle")}</strong>
                <p>{t("landing.valueText")}</p>
              </div>
              <div className="landing-next-step-card">
                <span className="surface-kicker">{t("landing.accessKicker")}</span>
                <strong>
                  {connected ? t("landing.accessConnected") : t("landing.accessSeparate")}
                </strong>
                <p>
                  {connected
                    ? `${t("landing.resume.connectedWallet")}: ${shortWalletAddress(publicKey?.toBase58())}`
                    : t("wallet.connectAfterAuthHint")}
                </p>
              </div>
            </div>
          </div>

          <div id="landing-auth" className="marketing-preview landing-auth-column">
            {isAuthenticated ? (
              <section className="auth-panel surface-card">
                <div className="auth-panel-topline">
                  <span className="surface-kicker">{t("landing.workspaceKicker")}</span>
                  <span className="status-pill status-pill-success">{t("auth.signedIn")}</span>
                </div>

                <div className="auth-copy">
                  <h2>{t("landing.workspaceTitle")}</h2>
                  <p>{t("landing.workspaceText")}</p>
                </div>

                <div className="auth-state-stack">
                  <div className="auth-state-row">
                    <span>{t("auth.identityLayer")}</span>
                    <strong>{authProviderLabel}</strong>
                  </div>
                  <div className="auth-state-row">
                    <span>{t("auth.walletLayer")}</span>
                    <strong>{connected ? t("shell.walletOnline") : t("auth.walletPending")}</strong>
                  </div>
                  <div className="auth-state-row">
                    <span>{t("wallet.network")}</span>
                    <strong>{SOLANA_NETWORK_LABEL}</strong>
                  </div>
                  <div className="auth-state-row">
                    <span>{t("landing.resume.knownVaults")}</span>
                    <strong>{vaultItems.length}</strong>
                  </div>
                </div>

                <div className="auth-next-actions">
                  <button type="button" className="btn btn-primary" onClick={goToProduct}>
                    <GridIcon className="icon-svg icon-svg-sm" />
                    {t("landing.cta.console")}
                  </button>
                  <WalletActionButton className="btn-secondary" />
                </div>

                {!connected && <p className="auth-wallet-hint">{t("wallet.connectAfterAuthHint")}</p>}

                <div className="landing-catalog-panel">
                  <span className="surface-kicker">{t("landing.vaultsKicker")}</span>
                  {authLoading || connecting ? (
                    <p className="muted-copy">{t("landing.vaultsLoading")}</p>
                  ) : vaultsLoading ? (
                    <p className="muted-copy">{t("landing.vaultsLoading")}</p>
                  ) : vaultsError ? (
                    <div className="landing-empty-state">
                      <p className="muted-copy">{t("landing.vaultsError")}</p>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={refetch}>
                        <AlertCircleIcon className="icon-svg icon-svg-sm" />
                        {t("common.retry")}
                      </button>
                    </div>
                  ) : vaultItems.length ? (
                    <div className="landing-catalog-list">
                      {vaultItems.slice(0, 3).map((item) => (
                        <Link key={item.vaultAddress} to={`/vault/${item.vaultAddress}`} className="landing-catalog-item">
                          <div>
                            <strong>{item.name || shortWalletAddress(item.vaultAddress, item.vaultAddress)}</strong>
                            <span>{getVaultModeLabel(item.mode)}</span>
                          </div>
                          <em>{item.analytics.totalRequests}</em>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="landing-empty-state">
                      <p className="muted-copy">{t("landing.vaultsEmpty")}</p>
                      <Link to="/create" className="btn btn-secondary btn-sm">
                        <GridIcon className="icon-svg icon-svg-sm" />
                        {t("landing.finalPrimary")}
                      </Link>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <AuthPanel onAuthenticated={() => navigate(nextRoute)} />
            )}
          </div>
        </section>

        <section id="landing-features" className="marketing-section">
          <div className="section-heading">
            <span className="surface-kicker">{t("landing.howKicker")}</span>
            <h2>{t("landing.howTitle")}</h2>
            <p>{t("landing.howText")}</p>
          </div>

          <div className="how-grid">
            {howSteps.map((item) => (
              <article key={item.step} className="surface-card how-card">
                <span className="how-step">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="landing-how" className="marketing-section">
          <div className="section-heading">
            <span className="surface-kicker">{t("landing.useCasesKicker")}</span>
            <h2>{t("landing.useCasesTitle")}</h2>
            <p>{t("landing.useCasesText")}</p>
          </div>

          <div className="marketing-feature-grid">
            {useCases.map((item) => (
              <article key={item.title} className="surface-card feature-surface use-case-card">
                <span className="surface-kicker">{t("landing.useCasesKicker")}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <div className="use-case-why">
                  <CheckCircleIcon className="icon-svg icon-svg-sm" />
                  <span>{item.why}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section">
          <div className="surface-card landing-compare-grid">
            <div className="section-heading section-heading-tight">
              <span className="surface-kicker">{t("landing.whyKicker")}</span>
              <h2>{t("landing.whyTitle")}</h2>
              <p>{t("landing.whyText")}</p>
            </div>

            <div className="landing-compare-cards">
              <article className="surface-card feature-surface feature-surface-soft">
                <span className="surface-kicker">{t("landing.problemTitle")}</span>
                <ul className="landing-bullet-list">
                  <li>{t("landing.problem.one")}</li>
                  <li>{t("landing.problem.two")}</li>
                  <li>{t("landing.problem.three")}</li>
                </ul>
              </article>

              <article className="surface-card feature-surface feature-surface-dark">
                <span className="surface-kicker">{t("landing.solutionTitle")}</span>
                <ul className="landing-bullet-list">
                  <li>{t("landing.solution.one")}</li>
                  <li>{t("landing.solution.two")}</li>
                  <li>{t("landing.solution.three")}</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section id="landing-security" className="marketing-section">
          <div className="surface-card trust-section">
            <div className="section-heading section-heading-tight">
              <span className="surface-kicker">{t("landing.securityLead")}</span>
              <h2>{t("landing.securityLeadTitle")}</h2>
              <p>{t("landing.securityLeadText")}</p>
            </div>

            <div className="trust-grid trust-grid-extended">
              {securityBlocks.map((item) => (
                <article key={item.title} className="trust-card">
                  <CheckCircleIcon className="icon-svg icon-svg-sm" />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-section">
          <div className="section-heading">
            <span className="surface-kicker">{t("landing.propertiesKicker")}</span>
            <h2>{t("landing.propertiesTitle")}</h2>
          </div>

          <div className="marketing-feature-grid landing-properties-grid">
            {systemProperties.map((item) => (
              <article key={item} className="surface-card feature-surface feature-surface-soft">
                <div className="feature-icon-badge">
                  <SparklesIcon className="icon-svg icon-svg-sm" />
                </div>
                <h3>{item}</h3>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section">
          <div className="surface-card landing-final-cta">
            <div>
              <span className="surface-kicker">{t("landing.productName")}</span>
              <h2>{t("landing.finalTitle")}</h2>
              <p>{t("landing.finalText")}</p>
            </div>

            <div className="hero-action-row">
              <button type="button" className="btn btn-primary btn-xl" onClick={goToProduct}>
                <SparklesIcon className="icon-svg icon-svg-sm" />
                {t("landing.finalPrimary")}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xl"
                onClick={() => scrollToSection("landing-security")}
              >
                <AlertCircleIcon className="icon-svg icon-svg-sm" />
                {t("landing.finalSecondary")}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
