import * as dotenv from "dotenv";
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  server: {
    port: process.env.PORT ?? "3001",
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
  },
  solana: {
    rpcUrl: requireEnv("SOLANA_RPC_URL"),
    programId: requireEnv("SOLANA_PROGRAM_ID"),
    riskAuthoritySecretKey: process.env.RISK_AUTHORITY_SECRET_KEY,
  },
  ai: {
    provider: process.env.AI_PROVIDER ?? "gemini",
    model: process.env.AI_MODEL ?? "gemini-2.0-flash",
    geminiApiKey: requireEnv("GEMINI_API_KEY"),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? "30000"),
  },
  firebase: {
    projectId: requireEnv("FIREBASE_PROJECT_ID"),
    clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
    privateKey: requireEnv("FIREBASE_PRIVATE_KEY"),
    requireVerifiedAuth: process.env.FIREBASE_REQUIRE_VERIFIED_AUTH === "true",
  },
};
