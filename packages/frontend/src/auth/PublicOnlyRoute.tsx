import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function PublicOnlyRoute({
  children,
  redirectTo = "/console",
}: {
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

