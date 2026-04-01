import React, { useMemo, useState } from "react";
import {
  LockIcon,
  MailIcon,
  UserIcon,
} from "../components/Icons";
import { useI18n } from "../i18n";
import { AuthServiceError } from "./AuthProvider";
import { useAuth } from "./useAuth";
import googleLogoUrl from "../../../../logo/Google.png";
import githubLogoUrl from "../../../../logo/Git hub.png";

type AuthMode = "signin" | "signup";

interface AuthPanelProps {
  onAuthenticated?: () => void;
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const { t } = useI18n();
  const {
    isFirebaseConfigured,
    signInWithGoogle,
    signInWithGitHub,
    signInWithEmail,
    signUpWithEmail,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!validateEmail(email)) return false;
    if (password.length < 6) return false;
    if (mode === "signup" && displayName.trim().length < 2) return false;
    return true;
  }, [displayName, email, mode, password]);

  const setFriendlyError = (error: unknown) => {
    if (error instanceof AuthServiceError) {
      setErrorKey(error.key);
      return;
    }
    setErrorKey("auth.errors.generic");
  };

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setErrorKey(null);
    try {
      await action();
      onAuthenticated?.();
    } catch (error) {
      setFriendlyError(error);
    } finally {
      setBusy(null);
    }
  };

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateEmail(email)) {
      setErrorKey("auth.errors.invalidEmail");
      return;
    }

    if (password.length < 6) {
      setErrorKey("auth.errors.weakPassword");
      return;
    }

    if (mode === "signup" && displayName.trim().length < 2) {
      setErrorKey("auth.errors.invalidName");
      return;
    }

    await runAction("email", async () => {
      if (mode === "signin") {
        await signInWithEmail({ email, password });
      } else {
        await signUpWithEmail({ email, password, displayName });
      }
    });
  };

  return (
    <section className="auth-panel surface-card">
      <div className="auth-panel-topline">
        <span className="surface-kicker">{t("auth.kicker")}</span>
        <span className="status-pill status-pill-muted">{t("auth.secureSession")}</span>
      </div>

      <div className="auth-copy">
        <h2>{t("auth.title")}</h2>
        <p>{t("auth.subtitle")}</p>
      </div>

      <div className="auth-mode-switch" role="tablist" aria-label={t("auth.modeSwitch")}>
        <button
          type="button"
          className={`auth-mode-button ${mode === "signin" ? "active" : ""}`}
          onClick={() => {
            setMode("signin");
            setErrorKey(null);
          }}
        >
          {t("auth.signIn")}
        </button>
        <button
          type="button"
          className={`auth-mode-button ${mode === "signup" ? "active" : ""}`}
          onClick={() => {
            setMode("signup");
            setErrorKey(null);
          }}
        >
          {t("auth.signUp")}
        </button>
      </div>

      {!isFirebaseConfigured && (
        <div className="auth-inline-message auth-inline-message-warning">
          {t("auth.errors.notConfigured")}
        </div>
      )}

      <div className="auth-provider-stack">
        <button
          type="button"
          className="auth-provider-button"
          onClick={() => runAction("google", signInWithGoogle)}
          disabled={!!busy || !isFirebaseConfigured}
        >
          <img src={googleLogoUrl} alt="" className="auth-provider-logo" />
          <span>{t("auth.google")}</span>
          {busy === "google" && <em>{t("auth.processing")}</em>}
        </button>

        <button
          type="button"
          className="auth-provider-button"
          onClick={() => runAction("github", signInWithGitHub)}
          disabled={!!busy || !isFirebaseConfigured}
        >
          <img src={githubLogoUrl} alt="" className="auth-provider-logo" />
          <span>{t("auth.github")}</span>
          {busy === "github" && <em>{t("auth.processing")}</em>}
        </button>
      </div>

      <div className="auth-divider">
        <span>{t("auth.orEmail")}</span>
      </div>

      <form className="auth-form" onSubmit={submitEmail}>
        {mode === "signup" && (
          <label className="auth-field">
            <span>{t("auth.name")}</span>
            <div className="auth-input-shell">
              <UserIcon className="icon-svg icon-svg-sm" />
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={t("auth.namePlaceholder")}
                autoComplete="name"
              />
            </div>
          </label>
        )}

        <label className="auth-field">
          <span>{t("auth.email")}</span>
          <div className="auth-input-shell">
            <MailIcon className="icon-svg icon-svg-sm" />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              autoComplete="email"
            />
          </div>
        </label>

        <label className="auth-field">
          <span>{t("auth.password")}</span>
          <div className="auth-input-shell">
            <LockIcon className="icon-svg icon-svg-sm" />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>
        </label>

        {errorKey && <div className="auth-inline-message">{t(errorKey)}</div>}

        <button
          type="submit"
          className="btn btn-primary auth-submit-button"
          disabled={!canSubmit || !!busy || !isFirebaseConfigured}
        >
          <MailIcon className="icon-svg icon-svg-sm" />
          {busy === "email" ? t("auth.processing") : t(mode === "signin" ? "auth.emailSignIn" : "auth.emailSignUp")}
        </button>
      </form>

      <p className="auth-footnote">{t("auth.footnote")}</p>
    </section>
  );
}
