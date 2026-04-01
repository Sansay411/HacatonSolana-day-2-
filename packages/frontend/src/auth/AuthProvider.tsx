import React, { createContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth, isFirebaseConfigured } from "../lib/firebase";
import {
  AuthIdentity,
  initializeAuthPersistence,
  signInWithEmail as signInWithEmailService,
  signInWithGitHub as signInWithGitHubService,
  signInWithGoogle as signInWithGoogleService,
  signOut as signOutService,
  signUpWithEmail as signUpWithEmailService,
  toAuthIdentity,
} from "./authService";

interface EmailCredentials {
  email: string;
  password: string;
  displayName?: string;
}

interface AuthContextValue {
  user: AuthIdentity | null;
  loading: boolean;
  isAuthenticated: boolean;
  isFirebaseConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signInWithEmail: (credentials: EmailCredentials) => Promise<void>;
  signUpWithEmail: (credentials: EmailCredentials) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = firebaseAuth;

    if (!auth) {
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | null = null;

    initializeAuthPersistence()
      .catch(() => undefined)
      .finally(() => {
        unsubscribe = onAuthStateChanged(auth, (nextUser) => {
          setUser(toAuthIdentity(nextUser));
          setLoading(false);
        });
      });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      isFirebaseConfigured,
      signInWithGoogle: async () => {
        await signInWithGoogleService();
      },
      signInWithGitHub: async () => {
        await signInWithGitHubService();
      },
      signInWithEmail: async ({ email, password }) => {
        await signInWithEmailService(email, password);
      },
      signUpWithEmail: async ({ email, password, displayName }) => {
        await signUpWithEmailService(email, password, displayName);
      },
      signOut: async () => {
        await signOutService();
      },
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthServiceError } from "./authService";
