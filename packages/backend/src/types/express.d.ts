import type { FirebaseAuthContext } from "../auth/firebaseToken";

declare global {
  namespace Express {
    interface Request {
      firebaseAuth?: FirebaseAuthContext;
    }
  }
}

export {};

