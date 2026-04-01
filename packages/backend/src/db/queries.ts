import { getDb } from "./schema";
import { randomUUID } from "crypto";

// ============================================================
// Spend Request Details (off-chain description storage)
// ============================================================

export function saveSpendRequestDetail(params: {
  vaultPubkey: string;
  requestIndex: number;
  requestPubkey: string;
  description: string;
  descriptionHash: string;
  amountLamports: number;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO spend_request_details
    (id, vault_pubkey, request_index, request_pubkey, description, description_hash, amount_lamports)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(vault_pubkey, request_index) DO UPDATE SET
      request_pubkey = excluded.request_pubkey,
      description = excluded.description,
      description_hash = excluded.description_hash,
      amount_lamports = excluded.amount_lamports
  `);
  stmt.run(
    randomUUID(),
    params.vaultPubkey,
    params.requestIndex,
    params.requestPubkey,
    params.description,
    params.descriptionHash,
    params.amountLamports
  );
}

export function updateSpendRequestProcessing(params: {
  requestPubkey: string;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string | null;
}) {
  const db = getDb();
  db.prepare(`
    UPDATE spend_request_details
    SET processing_status = ?,
        processing_error = ?,
        last_processed_at = datetime('now')
    WHERE request_pubkey = ?
  `).run(params.status, params.error || null, params.requestPubkey);
}

export function getSpendRequestDetail(requestPubkey: string) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM spend_request_details WHERE request_pubkey = ?")
    .get(requestPubkey) as any;
}

export function getVaultRequests(vaultPubkey: string) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM spend_request_details WHERE vault_pubkey = ? ORDER BY request_index ASC"
    )
    .all(vaultPubkey) as any[];
}

// ============================================================
// AI Decisions
// ============================================================

export function saveAiDecision(params: {
  requestId: string;
  provider: string;
  decision: "approve" | "reject";
  riskScore: number;
  reason: string;
  reasons: string[];
  flags: unknown;
  inputPayload: string;
  rawResponse: string;
  decisionSource: "gemini" | "fallback";
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO ai_decisions
    (id, request_id, provider, decision, risk_score, reason, reasons_json, flags_json, input_payload, raw_response, decision_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    randomUUID(),
    params.requestId,
    params.provider,
    params.decision,
    params.riskScore,
    params.reason,
    JSON.stringify(params.reasons),
    JSON.stringify(params.flags),
    params.inputPayload,
    params.rawResponse,
    params.decisionSource
  );
}

export function getAiDecision(requestId: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM ai_decisions WHERE request_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(requestId) as any;

  if (!row) {
    return null;
  }

  row.reasons_json = row.reasons_json ? JSON.parse(row.reasons_json) : [];
  row.flags_json = row.flags_json ? JSON.parse(row.flags_json) : null;
  return row;
}

export function getVaultRecentAiRequests(vaultPubkey: string, limit = 10) {
  const db = getDb();
  return db
    .prepare(`
      SELECT
        d.request_pubkey,
        d.amount_lamports,
        d.created_at,
        a.decision
      FROM spend_request_details d
      LEFT JOIN ai_decisions a
        ON a.request_id = d.request_pubkey
      WHERE d.vault_pubkey = ?
      ORDER BY d.request_index DESC
      LIMIT ?
    `)
    .all(vaultPubkey, limit) as any[];
}

// ============================================================
// Risk Evaluations
// ============================================================

export function saveRiskEvaluation(params: {
  requestPubkey: string;
  riskScore: number;
  signals: Record<string, unknown>;
  decision: string;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO risk_evaluations
    (id, request_pubkey, risk_score, signals, decision)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    randomUUID(),
    params.requestPubkey,
    params.riskScore,
    JSON.stringify(params.signals),
    params.decision
  );
}

export function getRiskEvaluation(requestPubkey: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM risk_evaluations WHERE request_pubkey = ? ORDER BY evaluated_at DESC LIMIT 1")
    .get(requestPubkey) as any;
  if (row) {
    row.signals = JSON.parse(row.signals);
  }
  return row;
}

// ============================================================
// Audit Events
// ============================================================

export function saveAuditEvent(params: {
  vaultPubkey: string;
  eventType: string;
  actorPubkey?: string;
  details?: Record<string, unknown>;
  txSignature?: string;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_events
    (id, vault_pubkey, event_type, actor_pubkey, details, tx_signature)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    randomUUID(),
    params.vaultPubkey,
    params.eventType,
    params.actorPubkey || null,
    params.details ? JSON.stringify(params.details) : null,
    params.txSignature || null
  );
}

export function getVaultAuditEvents(vaultPubkey: string) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM audit_events WHERE vault_pubkey = ? ORDER BY timestamp DESC"
    )
    .all(vaultPubkey) as any[];
}
