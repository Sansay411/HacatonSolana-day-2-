import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";
import { useI18n } from "../i18n";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (loading) {
    return (
      <div className="shell-scene">
        <div className="auth-route-loading">
          <div className="auth-route-loading-panel">
            <span className="surface-kicker">{t("auth.routeLoadingKicker")}</span>
            <h1>{t("auth.routeLoadingTitle")}</h1>
            <p>{t("auth.routeLoadingText")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}
