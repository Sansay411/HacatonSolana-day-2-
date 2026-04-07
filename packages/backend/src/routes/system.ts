import { Router } from "express";
import { config } from "../config";
import { getRiskAuthorityStatus } from "../solana/client";
import { isFirebaseVerificationConfigured } from "../auth/firebaseToken";

export const systemRoutes = Router();

systemRoutes.get("/runtime", async (_req, res) => {
  try {
    const riskAuthority = await getRiskAuthorityStatus();
    res.json({
      aiProvider: config.ai.provider,
      aiModel: config.ai.model,
      aiConfigured: Boolean(config.ai.geminiApiKey),
      aiTimeoutMs: config.ai.timeoutMs,
      firebaseAuthForwarding: true,
      firebaseVerificationConfigured: isFirebaseVerificationConfigured(),
      firebaseRequireVerifiedAuth: config.firebase.requireVerifiedAuth,
      riskAuthority,
    });
  } catch (error: any) {
    res.status(500).json({
      error: "runtime_unavailable",
      message: error?.message || "Failed to load backend runtime status",
    });
  }
});
