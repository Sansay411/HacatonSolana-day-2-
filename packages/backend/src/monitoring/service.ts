import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  getWalletChronologyEvents,
  getWalletMonitors,
  listVaultMonitorWallets,
  saveWalletChronologyEvent,
  saveWalletMonitor,
  updateWalletMonitorEvaluation,
} from "../db/queries";
import { getConnection, getProgram } from "../solana/client";

type TrustLevel = "stable" | "warning" | "high_risk";

interface WalletActivitySnapshot {
  outgoingTransactions: Array<{
    signature: string;
    blockTime: number;
    lamportsMoved: number;
  }>;
  firstOutgoingAt: number | null;
  totalMovedLamports: number;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getTrustLevel(score: number): TrustLevel {
  if (score >= 70) return "stable";
  if (score >= 40) return "warning";
  return "high_risk";
}

function buildTrustReasoning(params: {
  score: number;
  outgoingCount: number;
  totalMovedRatio: number;
  firstOutgoingDelayMinutes: number | null;
}) {
  const items: string[] = [];

  if (params.firstOutgoingDelayMinutes !== null && params.firstOutgoingDelayMinutes <= 10) {
    items.push("Rapid first outgoing transaction detected after payout.");
  } else if (params.firstOutgoingDelayMinutes !== null && params.firstOutgoingDelayMinutes >= 180) {
    items.push("Funds remained stable before the first outgoing transaction.");
  }

  if (params.outgoingCount >= 3) {
    items.push("Multiple outgoing transactions were detected in the monitoring window.");
  } else if (params.outgoingCount === 0) {
    items.push("No outgoing wallet activity has been detected yet.");
  }

  if (params.totalMovedRatio >= 0.7) {
    items.push("A large share of the payout amount moved quickly after release.");
  } else if (params.totalMovedRatio > 0 && params.totalMovedRatio < 0.4) {
    items.push("Only a limited portion of the payout amount has moved so far.");
  }

  if (items.length === 0) {
    items.push("Wallet behavior remains within the expected monitoring range.");
  }

  return items.slice(0, 3);
}

async function fetchWalletActivity(params: {
  walletPubkey: string;
  sinceTimestamp: number;
  payoutAmountLamports: number;
  ignoreSignature?: string | null;
}): Promise<WalletActivitySnapshot> {
  const connection = getConnection();
  const walletPubkey = new PublicKey(params.walletPubkey);
  const signatures = await connection.getSignaturesForAddress(walletPubkey, { limit: 20 }, "confirmed");
  const relevantSignatures = signatures.filter(
    (item) =>
      item.signature !== params.ignoreSignature &&
      typeof item.blockTime === "number" &&
      item.blockTime >= params.sinceTimestamp
  );

  if (!relevantSignatures.length) {
    return {
      outgoingTransactions: [],
      firstOutgoingAt: null,
      totalMovedLamports: 0,
    };
  }

  const parsedTransactions = await connection.getParsedTransactions(
    relevantSignatures.map((item) => item.signature),
    {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    }
  );

  const outgoingTransactions = parsedTransactions
    .map((transaction, index) => {
      const blockTime = relevantSignatures[index]?.blockTime || null;
      if (!transaction?.meta || blockTime === null) return null;

      const accountKeys = transaction.transaction.message.accountKeys;
      const walletIndex = accountKeys.findIndex((key) => key.pubkey.toBase58() === params.walletPubkey);
      if (walletIndex < 0) return null;

      const pre = transaction.meta.preBalances?.[walletIndex] || 0;
      const post = transaction.meta.postBalances?.[walletIndex] || 0;
      const lamportsMoved = Math.max(0, pre - post);

      if (lamportsMoved <= 0) return null;

      return {
        signature: relevantSignatures[index].signature,
        blockTime,
        lamportsMoved,
      };
    })
    .filter(Boolean) as Array<{ signature: string; blockTime: number; lamportsMoved: number }>;

  const firstOutgoingAt = outgoingTransactions[0]?.blockTime || null;
  const totalMovedLamports = outgoingTransactions.reduce((sum, item) => sum + item.lamportsMoved, 0);

  return {
    outgoingTransactions,
    firstOutgoingAt,
    totalMovedLamports: Math.min(totalMovedLamports, params.payoutAmountLamports),
  };
}

async function getVaultBeneficiary(vaultPubkey: string) {
  const program = getProgram();
  const vault = (await (program.account as any).vault.fetch(new PublicKey(vaultPubkey))) as any;
  return vault.beneficiary.toBase58();
}

export async function registerApprovedPayoutMonitoring(params: {
  vaultPubkey: string;
  walletPubkey: string;
  requestPubkey: string;
  payoutAmountLamports: number;
  payoutTxSignature?: string | null;
  payoutTimestamp: number;
}) {
  saveWalletMonitor({
    vaultPubkey: params.vaultPubkey,
    walletPubkey: params.walletPubkey,
    requestPubkey: params.requestPubkey,
    payoutAmountLamports: params.payoutAmountLamports,
    payoutTxSignature: params.payoutTxSignature || null,
    payoutTimestamp: params.payoutTimestamp,
    monitoringStatus: "active",
    trustScore: 50,
    trustLevel: "warning",
    notes: {
      summary: "Monitoring started after the payout was released on-chain.",
    },
  });

  saveWalletChronologyEvent({
    vaultPubkey: params.vaultPubkey,
    walletPubkey: params.walletPubkey,
    requestPubkey: params.requestPubkey,
    eventKey: `${params.requestPubkey}:payout_received`,
    eventType: "payout_received",
    explanation: "Approved payout reached the beneficiary wallet and monitoring started.",
    txSignature: params.payoutTxSignature || null,
    metadata: {
      payoutAmountSol: params.payoutAmountLamports / LAMPORTS_PER_SOL,
    },
    eventTimestamp: params.payoutTimestamp,
  });

  saveWalletChronologyEvent({
    vaultPubkey: params.vaultPubkey,
    walletPubkey: params.walletPubkey,
    requestPubkey: params.requestPubkey,
    eventKey: `${params.requestPubkey}:monitoring_activated`,
    eventType: "monitoring_activated",
    explanation: "Post-payout monitoring activated for this beneficiary wallet.",
    metadata: {
      baselineTrustScore: 50,
    },
    eventTimestamp: params.payoutTimestamp,
  });
}

export async function listVaultWallets(vaultPubkey: string) {
  const beneficiaryWallet = await getVaultBeneficiary(vaultPubkey);
  const monitorRows = listVaultMonitorWallets(vaultPubkey);
  const indexed = new Map(
    monitorRows.map((row) => [
      row.wallet_pubkey,
      {
        walletAddress: row.wallet_pubkey,
        trackedPayouts: Number(row.payout_count || 0),
        lastPayoutTimestamp: row.last_payout_timestamp || null,
        lastUpdatedAt: row.last_updated_at || null,
        trustScore: row.avg_trust_score === null ? 50 : Math.round(row.avg_trust_score),
        trustLevel: getTrustLevel(row.avg_trust_score === null ? 50 : row.avg_trust_score),
        protectedAmountLamports: Number(row.total_payout_amount_lamports || 0),
      },
    ])
  );

  if (!indexed.has(beneficiaryWallet)) {
    indexed.set(beneficiaryWallet, {
      walletAddress: beneficiaryWallet,
      trackedPayouts: 0,
      lastPayoutTimestamp: null,
      lastUpdatedAt: null,
      trustScore: 50,
      trustLevel: "warning",
      protectedAmountLamports: 0,
    });
  }

  return Array.from(indexed.values()).sort(
    (left, right) => (right.lastPayoutTimestamp || 0) - (left.lastPayoutTimestamp || 0)
  );
}

export async function refreshWalletMonitoring(params: {
  vaultPubkey: string;
  walletPubkey: string;
}) {
  const beneficiaryWallet = await getVaultBeneficiary(params.vaultPubkey);
  const monitors = getWalletMonitors(params.vaultPubkey, params.walletPubkey);

  if (params.walletPubkey !== beneficiaryWallet && monitors.length === 0) {
    throw new Error("Wallet does not belong to this vault context.");
  }

  for (const monitor of monitors) {
    const snapshot = await fetchWalletActivity({
      walletPubkey: monitor.walletPubkey,
      sinceTimestamp: monitor.payoutTimestamp,
      payoutAmountLamports: monitor.payoutAmountLamports,
      ignoreSignature: monitor.payoutTxSignature,
    });

    const firstDelayMinutes =
      snapshot.firstOutgoingAt === null
        ? null
        : Math.max(0, Math.round((snapshot.firstOutgoingAt - monitor.payoutTimestamp) / 60));
    const movedRatio =
      monitor.payoutAmountLamports > 0
        ? snapshot.totalMovedLamports / monitor.payoutAmountLamports
        : 0;

    let trustScore = 50;
    if (firstDelayMinutes !== null && firstDelayMinutes <= 10) trustScore -= 15;
    if (snapshot.outgoingTransactions.length >= 3) trustScore -= 15;
    if (movedRatio >= 0.7) trustScore -= 20;
    if (snapshot.outgoingTransactions.length === 0) trustScore += 10;
    if (firstDelayMinutes !== null && firstDelayMinutes >= 180) trustScore += 10;
    trustScore = clampScore(trustScore);
    const trustLevel = getTrustLevel(trustScore);
    const monitoringStatus =
      monitor.payoutTimestamp <= Math.floor(Date.now() / 1000) - 72 * 3600 ? "completed" : "active";

    updateWalletMonitorEvaluation({
      requestPubkey: monitor.requestPubkey,
      monitoringStatus,
      trustScore,
      trustLevel,
      notes: {
        outgoingCount: snapshot.outgoingTransactions.length,
        movedRatio,
        firstOutgoingDelayMinutes: firstDelayMinutes,
      },
    });

    if (snapshot.firstOutgoingAt !== null) {
      saveWalletChronologyEvent({
        vaultPubkey: monitor.vaultPubkey,
        walletPubkey: monitor.walletPubkey,
        requestPubkey: monitor.requestPubkey,
        eventKey: `${monitor.requestPubkey}:first_outgoing`,
        eventType: "first_outgoing_detected",
        explanation: "First outgoing wallet activity detected after payout receipt.",
        txSignature: snapshot.outgoingTransactions[0]?.signature || null,
        metadata: {
          delayMinutes: firstDelayMinutes,
        },
        eventTimestamp: snapshot.firstOutgoingAt,
      });
    }

    if (snapshot.outgoingTransactions.length >= 3) {
      saveWalletChronologyEvent({
        vaultPubkey: monitor.vaultPubkey,
        walletPubkey: monitor.walletPubkey,
        requestPubkey: monitor.requestPubkey,
        eventKey: `${monitor.requestPubkey}:rapid_movement`,
        eventType: "rapid_movement_detected",
        explanation: "Multiple outgoing transactions were detected soon after payout release.",
        txSignature: snapshot.outgoingTransactions[0]?.signature || null,
        metadata: {
          outgoingCount: snapshot.outgoingTransactions.length,
        },
        eventTimestamp: snapshot.outgoingTransactions[0]?.blockTime || monitor.payoutTimestamp,
      });
    }

    if (movedRatio >= 0.7 && snapshot.outgoingTransactions[0]) {
      saveWalletChronologyEvent({
        vaultPubkey: monitor.vaultPubkey,
        walletPubkey: monitor.walletPubkey,
        requestPubkey: monitor.requestPubkey,
        eventKey: `${monitor.requestPubkey}:funds_moved`,
        eventType: "funds_moved",
        explanation: "A large portion of the payout amount moved out of the wallet in a short period.",
        txSignature: snapshot.outgoingTransactions[0].signature,
        metadata: {
          movedRatio,
          movedAmountSol: snapshot.totalMovedLamports / LAMPORTS_PER_SOL,
        },
        eventTimestamp: snapshot.outgoingTransactions[0].blockTime,
      });
    }

    saveWalletChronologyEvent({
      vaultPubkey: monitor.vaultPubkey,
      walletPubkey: monitor.walletPubkey,
      requestPubkey: monitor.requestPubkey,
      eventKey: `${monitor.requestPubkey}:trust:${trustScore}`,
      eventType: trustScore >= 70 ? "trust_score_increased" : trustScore < 40 ? "trust_score_decreased" : "trust_score_updated",
      explanation: buildTrustReasoning({
        score: trustScore,
        outgoingCount: snapshot.outgoingTransactions.length,
        totalMovedRatio: movedRatio,
        firstOutgoingDelayMinutes: firstDelayMinutes,
      }).join(" "),
      metadata: {
        trustScore,
        trustLevel,
      },
      eventTimestamp: Math.floor(Date.now() / 1000),
    });

    if (monitoringStatus === "completed") {
      saveWalletChronologyEvent({
        vaultPubkey: monitor.vaultPubkey,
        walletPubkey: monitor.walletPubkey,
        requestPubkey: monitor.requestPubkey,
        eventKey: `${monitor.requestPubkey}:monitoring_completed`,
        eventType: "monitoring_completed",
        explanation: "Monitoring window completed for this payout.",
        metadata: {
          trustScore,
          trustLevel,
        },
        eventTimestamp: Math.floor(Date.now() / 1000),
      });
    }
  }

  const refreshedMonitors = getWalletMonitors(params.vaultPubkey, params.walletPubkey);
  const events = getWalletChronologyEvents(params.vaultPubkey, params.walletPubkey);

  const latestTrustScore =
    refreshedMonitors.length > 0
      ? Math.round(
          refreshedMonitors.reduce((sum, item) => sum + item.trustScore, 0) / refreshedMonitors.length
        )
      : 50;
  const trustLevel = getTrustLevel(latestTrustScore);
  const activeMonitorCount = refreshedMonitors.filter((item) => item.monitoringStatus === "active").length;

  return {
    walletAddress: params.walletPubkey,
    vaultAddress: params.vaultPubkey,
    beneficiaryWallet: beneficiaryWallet,
    trust: {
      score: latestTrustScore,
      level: trustLevel,
      lastUpdatedAt:
        refreshedMonitors[0]?.lastEvaluatedAt ||
        refreshedMonitors[0]?.updatedAt ||
        null,
      reasons: buildTrustReasoning({
        score: latestTrustScore,
        outgoingCount: events.filter((event) => event.eventType === "first_outgoing_detected").length,
        totalMovedRatio:
          refreshedMonitors.reduce((sum, item) => sum + Number(item.notes?.movedRatio || 0), 0) /
          Math.max(refreshedMonitors.length, 1),
        firstOutgoingDelayMinutes:
          (refreshedMonitors[0]?.notes?.firstOutgoingDelayMinutes as number | undefined) ?? null,
      }),
    },
    monitoring: {
      status: activeMonitorCount > 0 ? "active" : refreshedMonitors.length > 0 ? "completed" : "idle",
      trackedPayouts: refreshedMonitors.length,
      activePayouts: activeMonitorCount,
      totalPayoutAmountLamports: refreshedMonitors.reduce((sum, item) => sum + item.payoutAmountLamports, 0),
      summary:
        refreshedMonitors.length > 0
          ? "Estimated wallet behavior is tracked after approved payouts."
          : "No approved payout has activated monitoring yet.",
    },
    events: events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      explanation: event.explanation,
      txSignature: event.txSignature,
      timestamp: event.eventTimestamp,
      metadata: event.metadata,
      requestPubkey: event.requestPubkey,
    })),
  };
}
