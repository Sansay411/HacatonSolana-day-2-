import { Router, Request, Response } from "express";
import {
  getVaultAnalytics,
  getVaultAuditEvents,
  getVaultProfile,
  listVaultProfiles,
  saveVaultProfile,
  type AllowedTimeWindowRecord,
  type CategoryRuleRecord,
} from "../db/queries";
import { listVaultWallets, refreshWalletMonitoring } from "../monitoring/service";

export const vaultRoutes = Router();

vaultRoutes.get("/", (_req: Request, res: Response) => {
  try {
    const items = listVaultProfiles();

    res.json({
      items: items.map((item) => ({
        vaultAddress: item.vaultPubkey,
        name: item.name,
        description: item.description,
        mode: item.mode,
        dailyLimitLamports: item.dailyLimitLamports,
        emergencyStopEnabled: item.emergencyStopEnabled,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        analytics: item.analytics,
      })),
    });
  } catch (err) {
    console.error("Error listing vault profiles:", err);
    res.status(500).json({ error: "internal", message: "Failed to list vaults" });
  }
});

vaultRoutes.post("/", (req: Request, res: Response) => {
  try {
    const {
      vaultAddress,
      name,
      description,
      mode,
      dailyLimitLamports,
      allowedTimeWindows,
      categoryRules,
      emergencyStopEnabled,
    } = req.body;

    if (!vaultAddress || !mode) {
      return res.status(400).json({
        error: "validation",
        message: "Missing required fields: vaultAddress, mode",
      });
    }

    saveVaultProfile({
      vaultPubkey: vaultAddress,
      name,
      description,
      mode,
      dailyLimitLamports: Number(dailyLimitLamports || 0),
      allowedTimeWindows: Array.isArray(allowedTimeWindows)
        ? allowedTimeWindows
            .filter(Boolean)
            .map((window: any, index: number): AllowedTimeWindowRecord => ({
              id: window.id || `window-${index + 1}`,
              label: String(window.label || `Window ${index + 1}`),
              startHour: Number(window.startHour || 0),
              endHour: Number(window.endHour || 23),
            }))
        : [],
      categoryRules: Array.isArray(categoryRules)
        ? categoryRules
            .filter(Boolean)
            .map((rule: any, index: number): CategoryRuleRecord => ({
              id: rule.id || `rule-${index + 1}`,
              category: String(rule.category || "general"),
              label: String(rule.label || rule.category || `Rule ${index + 1}`),
              maxAmountSol: Number(rule.maxAmountSol || 0),
              requiresReview: Boolean(rule.requiresReview),
              enabled: rule.enabled !== false,
            }))
        : [],
      emergencyStopEnabled: Boolean(emergencyStopEnabled),
    });

    res.status(201).json({
      vaultAddress,
      saved: true,
    });
  } catch (err) {
    console.error("Error saving vault profile:", err);
    res.status(500).json({ error: "internal", message: "Failed to save vault profile" });
  }
});

vaultRoutes.get("/:address/config", (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const profile = getVaultProfile(address);
    const analytics = getVaultAnalytics(address);

    res.json({
      vaultAddress: address,
      profile,
      analytics,
      roles: [
        {
          key: "funder",
          label: "Funder",
          capabilities: ["create vault", "deposit", "freeze vault", "emergency stop"],
        },
        {
          key: "beneficiary",
          label: "Beneficiary",
          capabilities: ["submit spend request"],
        },
        {
          key: "risk_authority",
          label: "Risk Authority",
          capabilities: ["evaluate request", "approve", "reject"],
        },
        {
          key: "observer",
          label: "Observer",
          capabilities: ["view analytics", "review history"],
        },
      ],
    });
  } catch (err) {
    console.error("Error fetching vault config:", err);
    res.status(500).json({ error: "internal", message: "Failed to fetch vault config" });
  }
});

/**
 * GET /api/vaults/:address/activity
 * Returns audit event timeline for a vault.
 */
vaultRoutes.get("/:address/activity", (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const events = getVaultAuditEvents(address);

    res.json({
      vaultAddress: address,
      events: events.map((e: any) => ({
        id: e.id,
        eventType: e.event_type,
        actorAddress: e.actor_pubkey,
        details: e.details ? JSON.parse(e.details) : null,
        txSignature: e.tx_signature,
        timestamp: e.timestamp,
      })),
    });
  } catch (err) {
    console.error("Error fetching vault activity:", err);
    res.status(500).json({ error: "internal", message: "Failed to fetch activity" });
  }
});

vaultRoutes.get("/:address/wallets", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const wallets = await listVaultWallets(address);

    res.json({
      vaultAddress: address,
      items: wallets,
    });
  } catch (err) {
    console.error("Error fetching vault wallets:", err);
    res.status(500).json({ error: "internal", message: "Failed to fetch vault wallets" });
  }
});

vaultRoutes.get("/:address/wallets/:walletAddress/trust", async (req: Request, res: Response) => {
  try {
    const { address, walletAddress } = req.params;
    const monitoring = await refreshWalletMonitoring({
      vaultPubkey: address,
      walletPubkey: walletAddress,
    });

    res.json({
      vaultAddress: address,
      walletAddress,
      trust: monitoring.trust,
      monitoring: monitoring.monitoring,
    });
  } catch (err) {
    console.error("Error fetching wallet trust:", err);
    res.status(500).json({ error: "internal", message: "Failed to fetch wallet trust" });
  }
});

vaultRoutes.get("/:address/wallets/:walletAddress/chronology", async (req: Request, res: Response) => {
  try {
    const { address, walletAddress } = req.params;
    const monitoring = await refreshWalletMonitoring({
      vaultPubkey: address,
      walletPubkey: walletAddress,
    });

    res.json(monitoring);
  } catch (err) {
    console.error("Error fetching wallet chronology:", err);
    res.status(500).json({ error: "internal", message: "Failed to fetch wallet chronology" });
  }
});
