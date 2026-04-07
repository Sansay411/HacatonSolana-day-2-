import type { NextFunction, Request, Response } from "express";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { config } from "../config";

export interface FirebaseAuthContext {
  idToken: string | null;
  verified: boolean;
  user: DecodedIdToken | null;
}

function hasServiceAccountConfig() {
  return Boolean(
    config.firebase.projectId &&
      config.firebase.clientEmail &&
      config.firebase.privateKey
  );
}

function ensureFirebaseAdmin() {
  if (getApps().length > 0) {
    return getAuth();
  }

  if (!hasServiceAccountConfig()) {
    return null;
  }

  initializeApp({
    credential: cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey,
    }),
    projectId: config.firebase.projectId,
  });

  return getAuth();
}

const firebaseAdminAuth = ensureFirebaseAdmin();

export function extractFirebaseBearerToken(header?: string | null) {
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function attachFirebaseAuthContext(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const idToken = extractFirebaseBearerToken(req.headers.authorization);

  req.firebaseAuth = {
    idToken,
    verified: false,
    user: null,
  };

  if (!idToken || !firebaseAdminAuth) {
    return next();
  }

  try {
    const decoded = await firebaseAdminAuth.verifyIdToken(idToken);
    req.firebaseAuth = {
      idToken,
      verified: true,
      user: decoded,
    };
  } catch {
    req.firebaseAuth = {
      idToken,
      verified: false,
      user: null,
    };
  }

  next();
}

export function requireVerifiedFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!config.firebase.requireVerifiedAuth) {
    return next();
  }

  if (!req.firebaseAuth?.idToken) {
    return res.status(401).json({
      error: "auth_required",
      message: "Firebase authentication is required",
      errorCode: "AUTH_REQUIRED",
    });
  }

  if (!req.firebaseAuth.verified || !req.firebaseAuth.user) {
    return res.status(401).json({
      error: "invalid_auth",
      message: "Firebase ID token verification failed",
      errorCode: "INVALID_AUTH",
    });
  }

  next();
}

export function isFirebaseVerificationConfigured() {
  return Boolean(firebaseAdminAuth);
}
