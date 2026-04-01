import dotenv from "dotenv";
dotenv.config();

export const config = {
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    riskAuthoritySecretKey: process.env.RISK_AUTHORITY_SECRET_KEY || "",
    programId:
      process.env.PROGRAM_ID || "9Z6HNGC1wz6ukVCD3qNqnfFMDfCffNPBz6dG5k8fakHc",
  },
  server: {
    port: parseInt(process.env.PORT || "3001", 10),
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },
  ai: {
    provider: process.env.AI_PROVIDER || "gemini",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || "3000", 10),
    model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  },
  risk: {
    /** Auto-approve below this score */
    approveThreshold: 50,
    /** Auto-reject above this score */
    rejectThreshold: 70,
    /** Polling interval for new spend requests (ms) */
    pollInterval: parseInt(process.env.RISK_POLL_INTERVAL_MS || "12000", 10),
  },
};
