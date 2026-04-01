import express from "express";
import cors from "cors";
import { config } from "./config";
import { initDatabase } from "./db/schema";
import { startListener } from "./solana/listener";
import { ensureRiskAuthorityReady } from "./solana/client";
import { vaultRoutes } from "./routes/vault";
import { spendRequestRoutes } from "./routes/spend-request";
import { systemRoutes } from "./routes/system";
import { attachFirebaseAuthContext } from "./auth/firebaseToken";

const app = express();

// Middleware
app.use(cors({ origin: config.server.corsOrigin }));
app.use(express.json());
app.use(attachFirebaseAuthContext);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/vaults", vaultRoutes);
app.use("/api/spend-requests", spendRequestRoutes);
app.use("/api/system", systemRoutes);

// Initialize
async function main() {
  // Init database
  initDatabase();
  console.log("✓ Database initialized");

  const runtimeStatus = await ensureRiskAuthorityReady();
  console.log(`✓ Risk authority: ${runtimeStatus.publicKey}`);
  console.log(`  Balance: ${runtimeStatus.balanceSol.toFixed(4)} SOL`);
  for (const warning of runtimeStatus.warnings) {
    console.warn(`  Warning: ${warning}`);
  }

  // Start on-chain event listener
  startListener().catch((err) => {
    console.error("Listener error:", err);
  });
  console.log("✓ On-chain listener started");

  // Start server
  app.listen(config.server.port, () => {
    console.log(`✓ Aegis Backend running on port ${config.server.port}`);
    console.log(`  RPC: ${config.solana.rpcUrl}`);
    console.log(`  Program: ${config.solana.programId}`);
    console.log(`  AI Provider: ${config.ai.provider}`);
    console.log(`  AI Timeout: ${config.ai.timeoutMs}ms`);
  });
}

main().catch(console.error);
