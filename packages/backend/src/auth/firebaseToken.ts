import type { NextFunction, Request, Response } from "express";

export interface FirebaseAuthContext {
  idToken: string | null;
}

export function extractFirebaseBearerToken(header?: string | null) {
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export function attachFirebaseAuthContext(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  req.firebaseAuth = {
    idToken: extractFirebaseBearerToken(req.headers.authorization),
  };
  next();
}

