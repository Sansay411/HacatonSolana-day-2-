import { Router, Request, Response } from "express";
import { getVaultAuditEvents } from "../db/queries";

export const vaultRoutes = Router();

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
