import { Router, Request, Response } from "express";
import {
  getWalletChronologyPage,
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

function respondWalletScopeError(res: Response, err: unknown, defaultMessage: string) {
  const message = err instanceof Error ? err.message : defaultMessage;
  if (/does not belong to this vault context/i.test(message)) {
    return res.status(404).json({ error: "not_found", message });
  }
  return res.status(500).json({ error: "internal", message: defaultMessage });
}

vaultRoutes.get("/wallet/:walletAddress/history", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    const vaultAddress = String(req.query.vaultAddress || "").trim() || null;
    const limit = Number(req.query.limit || 4);
    const cursor = String(req.query.cursor || "").trim() || null;

    if (vaultAddress) {
      await refreshWalletMonitoring({
        vaultPubkey: vaultAddress,
        walletPubkey: walletAddress,
      });
    }

    const page = getWalletChronologyPage({
      walletPubkey: walletAddress,
      vaultPubkey: vaultAddress,
      limit,
      cursor,
    });

    res.json({
      walletAddress,
      vaultAddress,
      items: page.items,
      nextCursor: page.nextCursor,
    });
  } catch (err) {
    console.error("Error fetching wallet history:", err);
    respondWalletScopeError(res, err, "Failed to fetch wallet history");
  }
});

vaultRoutes.get("/", (_req: Request, res: Response) => {
  try {
    const items = listVaultProfiles();

    res.json({
      items: items.map((item) => ({
        vaultAddress: item.vaultPubkey,
        name: item.name,
        projectName: item.projectName,
        purposeType: item.purposeType,
        description: item.description,
        allowedCategories: item.allowedCategories,
        funderWallet: item.funderWallet,
        beneficiaryWallet: item.beneficiaryWallet,
        payoutWallet: item.payoutWallet,
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
      projectName,
      purposeType,
      description,
      allowedCategories,
      funderWallet,
      beneficiaryWallet,
      payoutWallet,
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
      projectName,
      purposeType,
      description,
      allowedCategories: Array.isArray(allowedCategories)
        ? allowedCategories.filter(Boolean).map((item: unknown) => String(item))
        : [],
      funderWallet: funderWallet ? String(funderWallet) : undefined,
      beneficiaryWallet: beneficiaryWallet ? String(beneficiaryWallet) : undefined,
      payoutWallet: payoutWallet ? String(payoutWallet) : undefined,
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
          key: "payout_wallet",
          label: "Payout Wallet",
          capabilities: ["receive approved payout"],
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
    respondWalletScopeError(res, err, "Failed to fetch wallet trust");
  }
});

vaultRoutes.get("/:address/wallets/:walletAddress/chronology", async (req: Request, res: Response) => {
  try {
    const { address, walletAddress } = req.params;
    const monitoring = await refreshWalletMonitoring({
      vaultPubkey: address,
      walletPubkey: walletAddress,
    });
    const limit = Number(req.query.limit || 4);
    const cursor = String(req.query.cursor || "").trim() || null;
    const page = getWalletChronologyPage({
      walletPubkey: walletAddress,
      vaultPubkey: address,
      limit,
      cursor,
    });

    res.json({
      ...monitoring,
      events: page.items,
      nextCursor: page.nextCursor,
    });
  } catch (err) {
    console.error("Error fetching wallet chronology:", err);
    respondWalletScopeError(res, err, "Failed to fetch wallet chronology");
  }
});
