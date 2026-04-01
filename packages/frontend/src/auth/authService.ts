import { FirebaseError } from "firebase/app";
import {
  Auth,
  User,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import {
  firebaseAuth,
  githubProvider,
  googleProvider,
  isFirebaseConfigured,
} from "../lib/firebase";

export interface AuthIdentity {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerId: string | null;
}

export class AuthServiceError extends Error {
  constructor(public readonly key: string) {
    super(key);
  }
}

function getRequiredAuth(): Auth {
  if (!isFirebaseConfigured || !firebaseAuth) {
    throw new AuthServiceError("auth.errors.notConfigured");
  }
  return firebaseAuth;
}

export function toAuthIdentity(user: User | null): AuthIdentity | null {
  if (!user) return null;
  const providerId = user.providerData.find((entry) => entry.providerId)?.providerId ?? null;

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    providerId,
  };
}

function mapFirebaseError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) {
    return error;
  }

  if (!(error instanceof FirebaseError)) {
    return new AuthServiceError("auth.errors.generic");
  }

  switch (error.code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return new AuthServiceError("auth.errors.popupClosed");
    case "auth/popup-blocked":
      return new AuthServiceError("auth.errors.popupBlocked");
    case "auth/network-request-failed":
      return new AuthServiceError("auth.errors.network");
    case "auth/email-already-in-use":
      return new AuthServiceError("auth.errors.emailInUse");
    case "auth/invalid-email":
      return new AuthServiceError("auth.errors.invalidEmail");
    case "auth/weak-password":
      return new AuthServiceError("auth.errors.weakPassword");
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return new AuthServiceError("auth.errors.invalidCredentials");
    case "auth/too-many-requests":
      return new AuthServiceError("auth.errors.tooManyRequests");
    case "auth/account-exists-with-different-credential":
      return new AuthServiceError("auth.errors.accountExists");
    case "auth/unauthorized-domain":
      return new AuthServiceError("auth.errors.unauthorizedDomain");
    default:
      return new AuthServiceError("auth.errors.generic");
  }
}

export async function initializeAuthPersistence() {
  if (!isFirebaseConfigured || !firebaseAuth) return;
  await setPersistence(firebaseAuth, browserLocalPersistence);
}

export async function signInWithGoogle() {
  try {
    const auth = getRequiredAuth();
    const result = await signInWithPopup(auth, googleProvider);
    return toAuthIdentity(result.user);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function signInWithGitHub() {
  try {
    const auth = getRequiredAuth();
    const result = await signInWithPopup(auth, githubProvider);
    return toAuthIdentity(result.user);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function signInWithEmail(email: string, password: string) {
  try {
    const auth = getRequiredAuth();
    const result = await signInWithEmailAndPassword(auth, email, password);
    return toAuthIdentity(result.user);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string
) {
  try {
    const auth = getRequiredAuth();
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName?.trim()) {
      await updateProfile(result.user, { displayName: displayName.trim() });
    }
    return toAuthIdentity(auth.currentUser);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function signOut() {
  try {
    const auth = getRequiredAuth();
    await firebaseSignOut(auth);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function getCurrentFirebaseIdToken() {
  if (!firebaseAuth) return null;
  if (!firebaseAuth.currentUser) return null;
  return firebaseAuth.currentUser.getIdToken();
}
