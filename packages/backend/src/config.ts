import * as dotenv from "dotenv";
import path from "path";
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

const DEFAULT_SOLANA_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_SOLANA_PROGRAM_ID = "9Z6HNGC1wz6ukVCD3qNQnfFMFfNCfNPB6dG5k8fakHc";
const DEFAULT_AI_MODEL = "gemini-1.5-flash";
const DEFAULT_AI_PROVIDER = "gemini";
const DEFAULT_CORS_ORIGIN = "http://localhost:5173";
const DEFAULT_PORT = "3001";
const DEFAULT_DB_DIR = "data";
const DEFAULT_DB_FILENAME = "aegis.db";

export const config = {
  server: {
    port: Number(optionalEnv("PORT", DEFAULT_PORT)),
    corsOrigin: optionalEnv("CORS_ORIGIN", DEFAULT_CORS_ORIGIN),
  },
  solana: {
    rpcUrl: optionalEnv("SOLANA_RPC_URL", DEFAULT_SOLANA_RPC_URL),
    programId: optionalEnv("SOLANA_PROGRAM_ID", DEFAULT_SOLANA_PROGRAM_ID),
    riskAuthoritySecretKey: optionalEnv("RISK_AUTHORITY_SECRET_KEY", ""),
    riskPollIntervalMs: Number(optionalEnv("RISK_POLL_INTERVAL_MS", "12000")),
  },
  ai: {
    provider: optionalEnv("AI_PROVIDER", DEFAULT_AI_PROVIDER),
    model: optionalEnv("GEMINI_MODEL", DEFAULT_AI_MODEL),
    geminiApiKey: requireEnv("GEMINI_API_KEY"),
    timeoutMs: Number(optionalEnv("AI_TIMEOUT_MS", "30000")),
  },
  firebase: {
    projectId: requireEnv("FIREBASE_PROJECT_ID"),
    clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
    privateKey: requireEnv("FIREBASE_PRIVATE_KEY"),
    requireVerifiedAuth: optionalEnv("FIREBASE_REQUIRE_VERIFIED_AUTH", "false") === "true",
  },
  db: {
    path: optionalEnv(
      "DB_PATH",
      path.join(process.cwd(), DEFAULT_DB_DIR, DEFAULT_DB_FILENAME),
    ),
  },
};
