import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="shell-scene">
        <div className="auth-route-loading">
          <div className="auth-route-loading-panel">
            <span className="surface-kicker">Identity Layer</span>
            <h1>Checking secure session...</h1>
            <p>Restoring Firebase Authentication before loading the vault console.</p>
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

