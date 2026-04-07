import { getDb } from "./schema";
import { randomUUID } from "crypto";

export interface AllowedTimeWindowRecord {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
}

export interface CategoryRuleRecord {
  id: string;
  category: string;
  label: string;
  maxAmountSol: number;
  requiresReview: boolean;
  enabled: boolean;
}

export interface VaultProfileRecord {
  vaultPubkey: string;
  name: string | null;
  projectName: string | null;
  purposeType: "startup" | "grant" | "infra" | "public_project";
  description: string | null;
  allowedCategories: string[];
  funderWallet: string | null;
  beneficiaryWallet: string | null;
  payoutWallet: string | null;
  mode: "startup" | "grant" | "freelancer";
  dailyLimitLamports: number;
  allowedTimeWindows: AllowedTimeWindowRecord[];
  categoryRules: CategoryRuleRecord[];
  emergencyStopEnabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface VaultCatalogItemRecord {
  vaultPubkey: string;
  name: string | null;
  projectName: string | null;
  purposeType: "startup" | "grant" | "infra" | "public_project";
  description: string | null;
  allowedCategories: string[];
  funderWallet: string | null;
  beneficiaryWallet: string | null;
  payoutWallet: string | null;
  mode: "startup" | "grant" | "freelancer";
  dailyLimitLamports: number;
  emergencyStopEnabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  analytics: ReturnType<typeof getVaultAnalytics>;
}

export interface WalletMonitorRecord {
  id: string;
  vaultPubkey: string;
  walletPubkey: string;
  requestPubkey: string;
  payoutAmountLamports: number;
  payoutTxSignature: string | null;
  payoutTimestamp: number;
  monitoringStatus: "active" | "completed";
  trustScore: number;
  trustLevel: "stable" | "warning" | "high_risk";
  lastEvaluatedAt: string | null;
  notes: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WalletTrustProfileRecord {
  id: string;
  vaultPubkey: string;
  walletPubkey: string;
  trustScore: number;
  successfulRequests: number;
  rejectedRequests: number;
  cooldownViolations: number;
  lowRiskRequests: number;
  stabilityRewards: number;
  riskHistory: number[];
  lastRequestAt: number | null;
  lastRejectedAt: number | null;
  lastDecidedAt: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WalletChronologyEventRecord {
  id: string;
  vaultPubkey: string;
  walletPubkey: string;
  requestPubkey: string | null;
  eventKey: string;
  eventType: string;
  explanation: string;
  txSignature: string | null;
  metadata: Record<string, unknown> | null;
  eventTimestamp: number;
  createdAt: string | null;
}

export interface WalletChronologyPageRecord {
  items: WalletChronologyEventRecord[];
  nextCursor: string | null;
}

// ============================================================
// Spend Request Details (off-chain description storage)
// ============================================================

export function saveSpendRequestDetail(params: {
  vaultPubkey: string;
  requestIndex: number;
  requestPubkey: string;
  requesterWalletPubkey?: string | null;
  description: string;
  descriptionHash: string;
  amountLamports: number;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO spend_request_details
    (id, vault_pubkey, request_index, request_pubkey, requester_wallet_pubkey, description, description_hash, amount_lamports)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(vault_pubkey, request_index) DO UPDATE SET
      request_pubkey = excluded.request_pubkey,
      requester_wallet_pubkey = COALESCE(excluded.requester_wallet_pubkey, spend_request_details.requester_wallet_pubkey),
      description = excluded.description,
      description_hash = excluded.description_hash,
      amount_lamports = excluded.amount_lamports
  `);
  stmt.run(
    randomUUID(),
    params.vaultPubkey,
    params.requestIndex,
    params.requestPubkey,
    params.requesterWalletPubkey || null,
    params.description,
    params.descriptionHash,
    params.amountLamports
  );
}

export function updateSpendRequestRequesterWallet(params: {
  requestPubkey: string;
  walletPubkey: string;
}) {
  const db = getDb();
  db.prepare(`
    UPDATE spend_request_details
    SET requester_wallet_pubkey = ?
    WHERE request_pubkey = ?
  `).run(params.walletPubkey, params.requestPubkey);
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

export function findRecentDuplicateSpendRequest(params: {
  vaultPubkey: string;
  walletPubkey: string;
  descriptionHash: string;
  amountLamports: number;
  windowSeconds: number;
}) {
  const db = getDb();
  return db
    .prepare(
      `
        SELECT *
        FROM spend_request_details
        WHERE vault_pubkey = ?
          AND requester_wallet_pubkey = ?
          AND description_hash = ?
          AND amount_lamports = ?
          AND strftime('%s', created_at) >= strftime('%s', 'now') - ?
        ORDER BY datetime(created_at) DESC
        LIMIT 1
      `
    )
    .get(
      params.vaultPubkey,
      params.walletPubkey,
      params.descriptionHash,
      params.amountLamports,
      params.windowSeconds
    ) as any;
}

// ============================================================
// Vault Profiles
// ============================================================

export function saveVaultProfile(params: {
  vaultPubkey: string;
  name?: string;
  projectName?: string;
  purposeType?: "startup" | "grant" | "infra" | "public_project";
  description?: string;
  allowedCategories?: string[];
  funderWallet?: string;
  beneficiaryWallet?: string;
  payoutWallet?: string;
  mode: "startup" | "grant" | "freelancer";
  dailyLimitLamports: number;
  allowedTimeWindows: AllowedTimeWindowRecord[];
  categoryRules: CategoryRuleRecord[];
  emergencyStopEnabled?: boolean;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO vault_profiles
      (vault_pubkey, name, project_name, purpose_type, description, allowed_categories_json, funder_wallet_pubkey, beneficiary_wallet_pubkey, payout_wallet_pubkey, mode, daily_limit_lamports, allowed_time_windows_json, category_rules_json, emergency_stop_enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(vault_pubkey) DO UPDATE SET
      name = excluded.name,
      project_name = excluded.project_name,
      purpose_type = excluded.purpose_type,
      description = excluded.description,
      allowed_categories_json = excluded.allowed_categories_json,
      funder_wallet_pubkey = COALESCE(excluded.funder_wallet_pubkey, vault_profiles.funder_wallet_pubkey),
      beneficiary_wallet_pubkey = COALESCE(excluded.beneficiary_wallet_pubkey, vault_profiles.beneficiary_wallet_pubkey),
      payout_wallet_pubkey = COALESCE(excluded.payout_wallet_pubkey, vault_profiles.payout_wallet_pubkey),
      mode = excluded.mode,
      daily_limit_lamports = excluded.daily_limit_lamports,
      allowed_time_windows_json = excluded.allowed_time_windows_json,
      category_rules_json = excluded.category_rules_json,
      emergency_stop_enabled = excluded.emergency_stop_enabled,
      updated_at = datetime('now')
  `).run(
    params.vaultPubkey,
    params.name || null,
    params.projectName || null,
    params.purposeType || "startup",
    params.description || null,
    JSON.stringify(params.allowedCategories || []),
    params.funderWallet || null,
    params.beneficiaryWallet || null,
    params.payoutWallet || null,
    params.mode,
    params.dailyLimitLamports,
    JSON.stringify(params.allowedTimeWindows || []),
    JSON.stringify(params.categoryRules || []),
    params.emergencyStopEnabled ? 1 : 0
  );
}

export function getVaultProfile(vaultPubkey: string): VaultProfileRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM vault_profiles WHERE vault_pubkey = ?").get(vaultPubkey) as any;

  if (!row) {
    return null;
  }

  return {
    vaultPubkey: row.vault_pubkey,
    name: row.name,
    projectName: row.project_name || null,
    purposeType:
      row.purpose_type === "grant" ||
      row.purpose_type === "infra" ||
      row.purpose_type === "public_project"
        ? row.purpose_type
        : "startup",
    description: row.description,
    allowedCategories: row.allowed_categories_json ? JSON.parse(row.allowed_categories_json) : [],
    funderWallet: row.funder_wallet_pubkey || null,
    beneficiaryWallet: row.beneficiary_wallet_pubkey || null,
    payoutWallet: row.payout_wallet_pubkey || null,
    mode: row.mode,
    dailyLimitLamports: Number(row.daily_limit_lamports || 0),
    allowedTimeWindows: row.allowed_time_windows_json ? JSON.parse(row.allowed_time_windows_json) : [],
    categoryRules: row.category_rules_json ? JSON.parse(row.category_rules_json) : [],
    emergencyStopEnabled: Boolean(row.emergency_stop_enabled),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function listVaultProfiles(): VaultCatalogItemRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT *
        FROM vault_profiles
        ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
      `
    )
    .all() as any[];

  return rows.map((row) => ({
    vaultPubkey: row.vault_pubkey,
    name: row.name,
    projectName: row.project_name || null,
    purposeType:
      row.purpose_type === "grant" ||
      row.purpose_type === "infra" ||
      row.purpose_type === "public_project"
        ? row.purpose_type
        : "startup",
    description: row.description,
    allowedCategories: row.allowed_categories_json ? JSON.parse(row.allowed_categories_json) : [],
    funderWallet: row.funder_wallet_pubkey || null,
    beneficiaryWallet: row.beneficiary_wallet_pubkey || null,
    payoutWallet: row.payout_wallet_pubkey || null,
    mode: row.mode,
    dailyLimitLamports: Number(row.daily_limit_lamports || 0),
    emergencyStopEnabled: Boolean(row.emergency_stop_enabled),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    analytics: getVaultAnalytics(row.vault_pubkey),
  }));
}

export function getVaultAnalytics(vaultPubkey: string) {
  const requests = getVaultRequests(vaultPubkey);
  let approvedRequests = 0;
  let rejectedRequests = 0;
  let pendingRequests = 0;
  let protectedFundsLamports = 0;
  let totalRequestedLamports = 0;

  for (const request of requests) {
    const amountLamports = Number(request.amount_lamports || 0);
    totalRequestedLamports += amountLamports;

    const aiDecision = getAiDecision(request.request_pubkey);
    if (aiDecision?.decision === "approve") {
      approvedRequests += 1;
      continue;
    }

    if (aiDecision?.decision === "reject" || request.processing_status === "failed") {
      rejectedRequests += 1;
      protectedFundsLamports += amountLamports;
      continue;
    }

    pendingRequests += 1;
  }

  const totalRequests = requests.length;
  return {
    totalRequests,
    approvedRequests,
    rejectedRequests,
    pendingRequests,
    protectedFundsLamports,
    totalRequestedLamports,
    approvalRate: totalRequests > 0 ? approvedRequests / totalRequests : 0,
  };
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
  category?: string | null;
  patterns?: string[];
  inputPayload: string;
  rawResponse: string;
  decisionSource: "gemini" | "fallback";
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO ai_decisions
    (id, request_id, provider, decision, risk_score, reason, reasons_json, flags_json, category, patterns_json, input_payload, raw_response, decision_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    params.category || null,
    JSON.stringify(params.patterns || []),
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
  row.patterns_json = row.patterns_json ? JSON.parse(row.patterns_json) : [];
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

export function getAuditEventForRequest(requestPubkey: string) {
  const db = getDb();
  return db
    .prepare(
      `
        SELECT *
        FROM audit_events
        WHERE details LIKE ?
        ORDER BY timestamp DESC
        LIMIT 1
      `
    )
    .get(`%"requestPubkey":"${requestPubkey}"%`) as any;
}

export interface WalletRequestActivityRecord {
  requestPubkey: string;
  vaultPubkey: string;
  walletPubkey: string | null;
  requestIndex: number;
  amountLamports: number;
  description: string;
  createdAt: number;
  lastProcessedAt: number | null;
  processingStatus: "pending" | "processing" | "completed" | "failed";
  decision: "approved" | "rejected" | "pending";
  aiDecisionSource: "gemini" | "fallback" | null;
  riskScore: number | null;
}

export function listWalletRequestActivity(vaultPubkey: string, walletPubkey: string, limit = 25) {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT
          d.vault_pubkey,
          d.request_pubkey,
          d.requester_wallet_pubkey,
          d.request_index,
          d.amount_lamports,
          d.description,
          CAST(strftime('%s', d.created_at) AS INTEGER) AS created_at_epoch,
          CAST(strftime('%s', d.last_processed_at) AS INTEGER) AS last_processed_epoch,
          d.processing_status,
          a.decision AS ai_decision,
          a.decision_source AS ai_decision_source,
          a.risk_score AS ai_risk_score
        FROM spend_request_details d
        LEFT JOIN ai_decisions a
          ON a.id = (
            SELECT ai.id
            FROM ai_decisions ai
            WHERE ai.request_id = d.request_pubkey
            ORDER BY ai.created_at DESC
            LIMIT 1
          )
        WHERE d.vault_pubkey = ? AND d.requester_wallet_pubkey = ?
        ORDER BY d.request_index DESC
        LIMIT ?
      `
    )
    .all(vaultPubkey, walletPubkey, limit) as any[];

  return rows.map(
    (row): WalletRequestActivityRecord => ({
      requestPubkey: row.request_pubkey,
      vaultPubkey: row.vault_pubkey,
      walletPubkey: row.requester_wallet_pubkey || null,
      requestIndex: Number(row.request_index || 0),
      amountLamports: Number(row.amount_lamports || 0),
      description: row.description || "",
      createdAt: Number(row.created_at_epoch || 0),
      lastProcessedAt: row.last_processed_epoch ? Number(row.last_processed_epoch) : null,
      processingStatus:
        row.processing_status === "processing" || row.processing_status === "completed" || row.processing_status === "failed"
          ? row.processing_status
          : "pending",
      decision:
        row.ai_decision === "approve"
          ? "approved"
          : row.ai_decision === "reject"
            ? "rejected"
            : "pending",
      aiDecisionSource:
        row.ai_decision_source === "gemini" || row.ai_decision_source === "fallback"
          ? row.ai_decision_source
          : null,
      riskScore: row.ai_risk_score === null || row.ai_risk_score === undefined ? null : Number(row.ai_risk_score),
    })
  );
}

// ============================================================
// Wallet monitoring
// ============================================================

function mapWalletMonitorRow(row: any): WalletMonitorRecord {
  return {
    id: row.id,
    vaultPubkey: row.vault_pubkey,
    walletPubkey: row.wallet_pubkey,
    requestPubkey: row.request_pubkey,
    payoutAmountLamports: Number(row.payout_amount_lamports || 0),
    payoutTxSignature: row.payout_tx_signature || null,
    payoutTimestamp: Number(row.payout_timestamp || 0),
    monitoringStatus: row.monitoring_status === "completed" ? "completed" : "active",
    trustScore: Number(row.trust_score || 50),
    trustLevel:
      row.trust_level === "stable" || row.trust_level === "high_risk"
        ? row.trust_level
        : "warning",
    lastEvaluatedAt: row.last_evaluated_at || null,
    notes: row.notes_json ? JSON.parse(row.notes_json) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapWalletEventRow(row: any): WalletChronologyEventRecord {
  return {
    id: row.id,
    vaultPubkey: row.vault_pubkey,
    walletPubkey: row.wallet_pubkey,
    requestPubkey: row.request_pubkey || null,
    eventKey: row.event_key,
    eventType: row.event_type,
    explanation: row.explanation,
    txSignature: row.tx_signature || null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    eventTimestamp: Number(row.event_timestamp || 0),
    createdAt: row.created_at || null,
  };
}

function mapWalletTrustProfileRow(row: any): WalletTrustProfileRecord {
  return {
    id: row.id,
    vaultPubkey: row.vault_pubkey,
    walletPubkey: row.wallet_pubkey,
    trustScore: Number(row.trust_score || 50),
    successfulRequests: Number(row.successful_requests || 0),
    rejectedRequests: Number(row.rejected_requests || 0),
    cooldownViolations: Number(row.cooldown_violations || 0),
    lowRiskRequests: Number(row.low_risk_requests || 0),
    stabilityRewards: Number(row.stability_rewards || 0),
    riskHistory: row.risk_history_json ? JSON.parse(row.risk_history_json) : [],
    lastRequestAt: row.last_request_at ? Number(row.last_request_at) : null,
    lastRejectedAt: row.last_rejected_at ? Number(row.last_rejected_at) : null,
    lastDecidedAt: row.last_decided_at ? Number(row.last_decided_at) : null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function getWalletTrustProfile(vaultPubkey: string, walletPubkey: string) {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT *
        FROM wallet_trust_profiles
        WHERE vault_pubkey = ? AND wallet_pubkey = ?
      `
    )
    .get(vaultPubkey, walletPubkey) as any;

  return row ? mapWalletTrustProfileRow(row) : null;
}

export function listVaultTrustProfiles(vaultPubkey: string) {
  const db = getDb();
  return db
    .prepare(
      `
        SELECT *
        FROM wallet_trust_profiles
        WHERE vault_pubkey = ?
        ORDER BY updated_at DESC, created_at DESC
      `
    )
    .all(vaultPubkey)
    .map(mapWalletTrustProfileRow);
}

export function saveWalletTrustProfile(params: {
  vaultPubkey: string;
  walletPubkey: string;
  trustScore: number;
  successfulRequests: number;
  rejectedRequests: number;
  cooldownViolations: number;
  lowRiskRequests: number;
  stabilityRewards: number;
  riskHistory: number[];
  lastRequestAt?: number | null;
  lastRejectedAt?: number | null;
  lastDecidedAt?: number | null;
  metadata?: Record<string, unknown> | null;
}) {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO wallet_trust_profiles
        (id, vault_pubkey, wallet_pubkey, trust_score, successful_requests, rejected_requests, cooldown_violations, low_risk_requests, stability_rewards, risk_history_json, last_request_at, last_rejected_at, last_decided_at, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(vault_pubkey, wallet_pubkey) DO UPDATE SET
        trust_score = excluded.trust_score,
        successful_requests = excluded.successful_requests,
        rejected_requests = excluded.rejected_requests,
        cooldown_violations = excluded.cooldown_violations,
        low_risk_requests = excluded.low_risk_requests,
        stability_rewards = excluded.stability_rewards,
        risk_history_json = excluded.risk_history_json,
        last_request_at = excluded.last_request_at,
        last_rejected_at = excluded.last_rejected_at,
        last_decided_at = excluded.last_decided_at,
        metadata_json = excluded.metadata_json,
        updated_at = datetime('now')
    `
  ).run(
    randomUUID(),
    params.vaultPubkey,
    params.walletPubkey,
    params.trustScore,
    params.successfulRequests,
    params.rejectedRequests,
    params.cooldownViolations,
    params.lowRiskRequests,
    params.stabilityRewards,
    JSON.stringify(params.riskHistory || []),
    params.lastRequestAt ?? null,
    params.lastRejectedAt ?? null,
    params.lastDecidedAt ?? null,
    params.metadata ? JSON.stringify(params.metadata) : null
  );
}

export function saveWalletMonitor(params: {
  vaultPubkey: string;
  walletPubkey: string;
  requestPubkey: string;
  payoutAmountLamports: number;
  payoutTxSignature?: string | null;
  payoutTimestamp: number;
  monitoringStatus?: "active" | "completed";
  trustScore?: number;
  trustLevel?: "stable" | "warning" | "high_risk";
  notes?: Record<string, unknown> | null;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO wallet_monitors
      (id, vault_pubkey, wallet_pubkey, request_pubkey, payout_amount_lamports, payout_tx_signature, payout_timestamp, monitoring_status, trust_score, trust_level, notes_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(request_pubkey) DO UPDATE SET
      vault_pubkey = excluded.vault_pubkey,
      wallet_pubkey = excluded.wallet_pubkey,
      payout_amount_lamports = excluded.payout_amount_lamports,
      payout_tx_signature = excluded.payout_tx_signature,
      payout_timestamp = excluded.payout_timestamp,
      monitoring_status = excluded.monitoring_status,
      trust_score = excluded.trust_score,
      trust_level = excluded.trust_level,
      notes_json = excluded.notes_json,
      updated_at = datetime('now')
  `).run(
    randomUUID(),
    params.vaultPubkey,
    params.walletPubkey,
    params.requestPubkey,
    params.payoutAmountLamports,
    params.payoutTxSignature || null,
    params.payoutTimestamp,
    params.monitoringStatus || "active",
    params.trustScore ?? 50,
    params.trustLevel || "warning",
    params.notes ? JSON.stringify(params.notes) : null
  );
}

export function updateWalletMonitorEvaluation(params: {
  requestPubkey: string;
  monitoringStatus: "active" | "completed";
  trustScore: number;
  trustLevel: "stable" | "warning" | "high_risk";
  notes?: Record<string, unknown> | null;
}) {
  const db = getDb();
  db.prepare(`
    UPDATE wallet_monitors
    SET monitoring_status = ?,
        trust_score = ?,
        trust_level = ?,
        notes_json = ?,
        last_evaluated_at = datetime('now'),
        updated_at = datetime('now')
    WHERE request_pubkey = ?
  `).run(
    params.monitoringStatus,
    params.trustScore,
    params.trustLevel,
    params.notes ? JSON.stringify(params.notes) : null,
    params.requestPubkey
  );
}

export function getWalletMonitors(vaultPubkey: string, walletPubkey: string) {
  const db = getDb();
  return db
    .prepare(
      `
        SELECT *
        FROM wallet_monitors
        WHERE vault_pubkey = ? AND wallet_pubkey = ?
        ORDER BY payout_timestamp DESC
      `
    )
    .all(vaultPubkey, walletPubkey)
    .map(mapWalletMonitorRow);
}

export function listVaultMonitorWallets(vaultPubkey: string) {
  const db = getDb();
  return db
    .prepare(
      `
        SELECT
          wallet_pubkey,
          COUNT(*) AS payout_count,
          MAX(payout_timestamp) AS last_payout_timestamp,
          MAX(updated_at) AS last_updated_at,
          AVG(trust_score) AS avg_trust_score,
          SUM(payout_amount_lamports) AS total_payout_amount_lamports
        FROM wallet_monitors
        WHERE vault_pubkey = ?
        GROUP BY wallet_pubkey
        ORDER BY MAX(payout_timestamp) DESC
      `
    )
    .all(vaultPubkey) as Array<{
      wallet_pubkey: string;
      payout_count: number;
      last_payout_timestamp: number | null;
      last_updated_at: string | null;
      avg_trust_score: number | null;
      total_payout_amount_lamports: number | null;
    }>;
}

export function saveWalletChronologyEvent(params: {
  vaultPubkey: string;
  walletPubkey: string;
  requestPubkey?: string | null;
  eventKey: string;
  eventType: string;
  explanation: string;
  txSignature?: string | null;
  metadata?: Record<string, unknown> | null;
  eventTimestamp: number;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO wallet_chronology_events
      (id, vault_pubkey, wallet_pubkey, request_pubkey, event_key, event_type, explanation, tx_signature, metadata_json, event_timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_key) DO NOTHING
  `).run(
    randomUUID(),
    params.vaultPubkey,
    params.walletPubkey,
    params.requestPubkey || null,
    params.eventKey,
    params.eventType,
    params.explanation,
    params.txSignature || null,
    params.metadata ? JSON.stringify(params.metadata) : null,
    params.eventTimestamp
  );
}

export function getWalletChronologyEvents(vaultPubkey: string, walletPubkey: string) {
  const db = getDb();
  return db
    .prepare(
      `
        SELECT *
        FROM wallet_chronology_events
        WHERE vault_pubkey = ? AND wallet_pubkey = ?
        ORDER BY event_timestamp DESC, created_at DESC
      `
    )
    .all(vaultPubkey, walletPubkey)
    .map(mapWalletEventRow);
}

export function getWalletChronologyPage(params: {
  walletPubkey: string;
  vaultPubkey?: string | null;
  limit?: number;
  cursor?: string | null;
}): WalletChronologyPageRecord {
  const db = getDb();
  const limit = Math.max(1, Math.min(params.limit || 4, 20));
  const cursorValue = params.cursor ? Number(params.cursor) : null;

  const rows = (
    params.vaultPubkey
      ? db
          .prepare(
            `
              SELECT *
              FROM wallet_chronology_events
              WHERE wallet_pubkey = ?
                AND vault_pubkey = ?
                AND (? IS NULL OR event_timestamp < ?)
              ORDER BY event_timestamp DESC, created_at DESC
              LIMIT ?
            `
          )
          .all(params.walletPubkey, params.vaultPubkey, cursorValue, cursorValue, limit + 1)
      : db
          .prepare(
            `
              SELECT *
              FROM wallet_chronology_events
              WHERE wallet_pubkey = ?
                AND (? IS NULL OR event_timestamp < ?)
              ORDER BY event_timestamp DESC, created_at DESC
              LIMIT ?
            `
          )
          .all(params.walletPubkey, cursorValue, cursorValue, limit + 1)
  ) as any[];

  const mapped = rows.map(mapWalletEventRow);
  const hasMore = mapped.length > limit;
  const items = hasMore ? mapped.slice(0, limit) : mapped;
  const nextCursor = hasMore ? String(items[items.length - 1]?.eventTimestamp || "") : null;

  return {
    items,
    nextCursor: nextCursor || null,
  };
}
