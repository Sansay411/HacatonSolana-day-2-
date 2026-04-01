import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  CheckCircleIcon,
  GlobeIcon,
  GridIcon,
  ShieldIcon,
  SparklesIcon,
  WalletIcon,
} from "../components/Icons";
import { useI18n } from "../i18n";
import brandLogoUrl from "../../../../logo/Logo.png";
import AuthPanel from "../auth/AuthPanel";
import { useAuth } from "../auth/useAuth";
import WalletActionButton from "../components/WalletActionButton";

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { connected } = useWallet();
  const { lang, setLanguage, t } = useI18n();
  const { isAuthenticated, user } = useAuth();

  const nextRoute = searchParams.get("next") || "/console";

  const heroStats = useMemo(
    () => [
      { label: t("landing.stats.security"), value: "24/7" },
      { label: t("landing.stats.ai"), value: "<3s" },
      { label: t("landing.stats.control"), value: "100%" },
    ],
    [t]
  );

  const features = useMemo(
    () => [
      {
        icon: SparklesIcon,
        kicker: t("landing.features.ai.kicker"),
        title: t("landing.features.ai.title"),
        text: t("landing.features.ai.text"),
      },
      {
        icon: WalletIcon,
        kicker: t("landing.features.chain.kicker"),
        title: t("landing.features.chain.title"),
        text: t("landing.features.chain.text"),
      },
      {
        icon: ShieldIcon,
        kicker: t("landing.features.policy.kicker"),
        title: t("landing.features.policy.title"),
        text: t("landing.features.policy.text"),
      },
    ],
    [t]
  );

  const howItWorks = useMemo(
    () => [
      { step: "01", title: t("landing.how.oneTitle"), text: t("landing.how.oneText") },
      { step: "02", title: t("landing.how.twoTitle"), text: t("landing.how.twoText") },
      { step: "03", title: t("landing.how.threeTitle"), text: t("landing.how.threeText") },
      { step: "04", title: t("landing.how.fourTitle"), text: t("landing.how.fourText") },
    ],
    [t]
  );

  const trustBlocks = useMemo(
    () => [
      { title: t("landing.trust.oneTitle"), text: t("landing.trust.oneText") },
      { title: t("landing.trust.twoTitle"), text: t("landing.trust.twoText") },
      { title: t("landing.trust.threeTitle"), text: t("landing.trust.threeText") },
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
              <strong>Aegis</strong>
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
              {isAuthenticated ? t("landing.cta.console") : t("landing.cta.getStarted")}
            </button>
          </div>
        </header>

        <section className="marketing-hero marketing-hero-auth">
          <div className="hero-copy-panel marketing-hero-copy">
            <div className="eyebrow-pill">{t("landing.eyebrow")}</div>
            <h1 className="hero-display">{t("landing.title")}</h1>
            <p className="hero-paragraph">{t("landing.description")}</p>

            <div className="hero-action-row">
              <button type="button" className="btn btn-primary btn-xl" onClick={goToProduct}>
                <SparklesIcon className="icon-svg icon-svg-sm" />
                {isAuthenticated ? t("landing.cta.console") : t("landing.cta.getStarted")}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xl"
                onClick={() => scrollToSection("landing-how")}
              >
                <GridIcon className="icon-svg icon-svg-sm" />
                {t("landing.cta.learn")}
              </button>
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
                <span className="surface-kicker">{t("landing.identityLayer")}</span>
                <strong>
                  {isAuthenticated
                    ? user?.displayName || user?.email || t("auth.account")
                    : t("landing.identityPending")}
                </strong>
                <p>{t("landing.identityText")}</p>
              </div>
              <div className="landing-next-step-card">
                <span className="surface-kicker">{t("landing.walletLayer")}</span>
                <strong>{connected ? t("shell.walletOnline") : t("auth.walletPending")}</strong>
                <p>{t("landing.walletText")}</p>
              </div>
            </div>
          </div>

          <div id="landing-auth" className="marketing-preview landing-auth-column">
            {isAuthenticated ? (
              <section className="auth-panel surface-card">
                <div className="auth-panel-topline">
                  <span className="surface-kicker">{t("auth.accountReady")}</span>
                  <span className="status-pill status-pill-success">{t("auth.signedIn")}</span>
                </div>
                <div className="auth-copy">
                  <h2>{user?.displayName || user?.email || t("auth.account")}</h2>
                  <p>{t("landing.authenticatedCopy")}</p>
                </div>

                <div className="auth-state-stack">
                  <div className="auth-state-row">
                    <span>{t("auth.identityLayer")}</span>
                    <strong>{user?.providerId || t("common.notAvailable")}</strong>
                  </div>
                  <div className="auth-state-row">
                    <span>{t("auth.walletLayer")}</span>
                    <strong>{connected ? t("shell.walletOnline") : t("auth.walletPending")}</strong>
                  </div>
                </div>

                <div className="auth-next-actions">
                  <button type="button" className="btn btn-primary" onClick={goToProduct}>
                    <GridIcon className="icon-svg icon-svg-sm" />
                    {t("landing.cta.console")}
                  </button>
                  <WalletActionButton className="btn-secondary" />
                </div>
              </section>
            ) : (
              <AuthPanel onAuthenticated={() => navigate(nextRoute)} />
            )}
          </div>
        </section>

        <section id="landing-features" className="marketing-section">
          <div className="section-heading">
            <span className="surface-kicker">{t("landing.featuresKicker")}</span>
            <h2>{t("landing.featuresTitle")}</h2>
            <p>{t("landing.featuresText")}</p>
          </div>

          <div className="marketing-feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="surface-card feature-surface">
                  <div className="feature-icon-badge">
                    <Icon className="icon-svg icon-svg-sm" />
                  </div>
                  <span className="surface-kicker">{feature.kicker}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="landing-how" className="marketing-section">
          <div className="section-heading">
            <span className="surface-kicker">{t("landing.howKicker")}</span>
            <h2>{t("landing.howTitle")}</h2>
            <p>{t("landing.howText")}</p>
          </div>

          <div className="how-grid">
            {howItWorks.map((item) => (
              <article key={item.step} className="surface-card how-card">
                <span className="how-step">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="landing-security" className="marketing-section">
          <div className="surface-card trust-section">
            <div className="section-heading section-heading-tight">
              <span className="surface-kicker">{t("landing.trustKicker")}</span>
              <h2>{t("landing.trustTitle")}</h2>
              <p>{t("landing.trustText")}</p>
            </div>

            <div className="trust-grid">
              {trustBlocks.map((item) => (
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
      </div>
    </div>
  );
}
