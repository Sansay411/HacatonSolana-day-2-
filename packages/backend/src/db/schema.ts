import Database from "better-sqlite3";
import path from "path";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.join(__dirname, "../../aegis.db"));
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function initDatabase(): void {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS spend_request_details (
      id TEXT PRIMARY KEY,
      vault_pubkey TEXT NOT NULL,
      request_index INTEGER NOT NULL,
      request_pubkey TEXT NOT NULL,
      requester_wallet_pubkey TEXT,
      description TEXT NOT NULL,
      description_hash TEXT NOT NULL,
      amount_lamports INTEGER DEFAULT 0,
      processing_status TEXT DEFAULT 'pending',
      processing_error TEXT,
      last_processed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(vault_pubkey, request_index)
    );

    CREATE TABLE IF NOT EXISTS vault_profiles (
      vault_pubkey TEXT PRIMARY KEY,
      name TEXT,
      project_name TEXT,
      purpose_type TEXT NOT NULL DEFAULT 'startup',
      description TEXT,
      allowed_categories_json TEXT NOT NULL DEFAULT '[]',
      funder_wallet_pubkey TEXT,
      beneficiary_wallet_pubkey TEXT,
      payout_wallet_pubkey TEXT,
      mode TEXT NOT NULL DEFAULT 'startup',
      daily_limit_lamports INTEGER NOT NULL DEFAULT 0,
      allowed_time_windows_json TEXT NOT NULL DEFAULT '[]',
      category_rules_json TEXT NOT NULL DEFAULT '[]',
      emergency_stop_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS risk_evaluations (
      id TEXT PRIMARY KEY,
      request_pubkey TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      signals TEXT NOT NULL,
      decision TEXT NOT NULL,
      evaluated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_decisions (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      decision TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reasons_json TEXT,
      flags_json TEXT,
      category TEXT,
      patterns_json TEXT,
      input_payload TEXT,
      raw_response TEXT,
      decision_source TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      vault_pubkey TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_pubkey TEXT,
      details TEXT,
      tx_signature TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallet_monitors (
      id TEXT PRIMARY KEY,
      vault_pubkey TEXT NOT NULL,
      wallet_pubkey TEXT NOT NULL,
      request_pubkey TEXT NOT NULL UNIQUE,
      payout_amount_lamports INTEGER NOT NULL,
      payout_tx_signature TEXT,
      payout_timestamp INTEGER NOT NULL,
      monitoring_status TEXT NOT NULL DEFAULT 'active',
      trust_score INTEGER NOT NULL DEFAULT 50,
      trust_level TEXT NOT NULL DEFAULT 'warning',
      last_evaluated_at TEXT,
      notes_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallet_trust_profiles (
      id TEXT PRIMARY KEY,
      vault_pubkey TEXT NOT NULL,
      wallet_pubkey TEXT NOT NULL,
      trust_score INTEGER NOT NULL DEFAULT 50,
      successful_requests INTEGER NOT NULL DEFAULT 0,
      rejected_requests INTEGER NOT NULL DEFAULT 0,
      cooldown_violations INTEGER NOT NULL DEFAULT 0,
      low_risk_requests INTEGER NOT NULL DEFAULT 0,
      stability_rewards INTEGER NOT NULL DEFAULT 0,
      risk_history_json TEXT NOT NULL DEFAULT '[]',
      last_request_at INTEGER,
      last_rejected_at INTEGER,
      last_decided_at INTEGER,
      metadata_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(vault_pubkey, wallet_pubkey)
    );

    CREATE TABLE IF NOT EXISTS wallet_chronology_events (
      id TEXT PRIMARY KEY,
      vault_pubkey TEXT NOT NULL,
      wallet_pubkey TEXT NOT NULL,
      request_pubkey TEXT,
      event_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      explanation TEXT NOT NULL,
      tx_signature TEXT,
      metadata_json TEXT,
      event_timestamp INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_vault ON audit_events(vault_pubkey);
    CREATE INDEX IF NOT EXISTS idx_requests_vault ON spend_request_details(vault_pubkey);
    CREATE INDEX IF NOT EXISTS idx_ai_decisions_request ON ai_decisions(request_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_monitors_vault_wallet ON wallet_monitors(vault_pubkey, wallet_pubkey);
    CREATE INDEX IF NOT EXISTS idx_wallet_trust_vault_wallet ON wallet_trust_profiles(vault_pubkey, wallet_pubkey);
    CREATE INDEX IF NOT EXISTS idx_wallet_events_vault_wallet ON wallet_chronology_events(vault_pubkey, wallet_pubkey);
  `);

  const requestColumns = database
    .prepare("PRAGMA table_info(spend_request_details)")
    .all() as Array<{ name: string }>;

  if (!requestColumns.some((column) => column.name === "amount_lamports")) {
    database.exec(
      "ALTER TABLE spend_request_details ADD COLUMN amount_lamports INTEGER DEFAULT 0"
    );
  }

  if (!requestColumns.some((column) => column.name === "requester_wallet_pubkey")) {
    database.exec(
      "ALTER TABLE spend_request_details ADD COLUMN requester_wallet_pubkey TEXT"
    );
  }

  if (!requestColumns.some((column) => column.name === "processing_status")) {
    database.exec(
      "ALTER TABLE spend_request_details ADD COLUMN processing_status TEXT DEFAULT 'pending'"
    );
  }

  if (!requestColumns.some((column) => column.name === "processing_error")) {
    database.exec(
      "ALTER TABLE spend_request_details ADD COLUMN processing_error TEXT"
    );
  }

  if (!requestColumns.some((column) => column.name === "last_processed_at")) {
    database.exec(
      "ALTER TABLE spend_request_details ADD COLUMN last_processed_at TEXT"
    );
  }

  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_requests_vault_wallet ON spend_request_details(vault_pubkey, requester_wallet_pubkey)"
  );
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_requests_duplicate_guard ON spend_request_details(vault_pubkey, requester_wallet_pubkey, description_hash, amount_lamports)"
  );

  const aiDecisionColumns = database
    .prepare("PRAGMA table_info(ai_decisions)")
    .all() as Array<{ name: string }>;

  if (!aiDecisionColumns.some((column) => column.name === "reasons_json")) {
    database.exec(
      "ALTER TABLE ai_decisions ADD COLUMN reasons_json TEXT"
    );
  }

  if (!aiDecisionColumns.some((column) => column.name === "flags_json")) {
    database.exec(
      "ALTER TABLE ai_decisions ADD COLUMN flags_json TEXT"
    );
  }

  if (!aiDecisionColumns.some((column) => column.name === "input_payload")) {
    database.exec(
      "ALTER TABLE ai_decisions ADD COLUMN input_payload TEXT"
    );
  }

  if (!aiDecisionColumns.some((column) => column.name === "category")) {
    database.exec(
      "ALTER TABLE ai_decisions ADD COLUMN category TEXT"
    );
  }

  if (!aiDecisionColumns.some((column) => column.name === "patterns_json")) {
    database.exec(
      "ALTER TABLE ai_decisions ADD COLUMN patterns_json TEXT"
    );
  }

  const walletMonitorColumns = database
    .prepare("PRAGMA table_info(wallet_monitors)")
    .all() as Array<{ name: string }>;

  if (walletMonitorColumns.length > 0 && !walletMonitorColumns.some((column) => column.name === "notes_json")) {
    database.exec("ALTER TABLE wallet_monitors ADD COLUMN notes_json TEXT");
  }

  const walletTrustColumns = database
    .prepare("PRAGMA table_info(wallet_trust_profiles)")
    .all() as Array<{ name: string }>;

  if (walletTrustColumns.length > 0 && !walletTrustColumns.some((column) => column.name === "metadata_json")) {
    database.exec("ALTER TABLE wallet_trust_profiles ADD COLUMN metadata_json TEXT");
  }

  const vaultProfileColumns = database
    .prepare("PRAGMA table_info(vault_profiles)")
    .all() as Array<{ name: string }>;

  if (vaultProfileColumns.length > 0 && !vaultProfileColumns.some((column) => column.name === "project_name")) {
    database.exec("ALTER TABLE vault_profiles ADD COLUMN project_name TEXT");
  }

  if (vaultProfileColumns.length > 0 && !vaultProfileColumns.some((column) => column.name === "purpose_type")) {
    database.exec("ALTER TABLE vault_profiles ADD COLUMN purpose_type TEXT NOT NULL DEFAULT 'startup'");
  }

  if (
    vaultProfileColumns.length > 0 &&
    !vaultProfileColumns.some((column) => column.name === "allowed_categories_json")
  ) {
    database.exec("ALTER TABLE vault_profiles ADD COLUMN allowed_categories_json TEXT NOT NULL DEFAULT '[]'");
  }

  if (vaultProfileColumns.length > 0 && !vaultProfileColumns.some((column) => column.name === "funder_wallet_pubkey")) {
    database.exec("ALTER TABLE vault_profiles ADD COLUMN funder_wallet_pubkey TEXT");
  }

  if (
    vaultProfileColumns.length > 0 &&
    !vaultProfileColumns.some((column) => column.name === "beneficiary_wallet_pubkey")
  ) {
    database.exec("ALTER TABLE vault_profiles ADD COLUMN beneficiary_wallet_pubkey TEXT");
  }

  if (vaultProfileColumns.length > 0 && !vaultProfileColumns.some((column) => column.name === "payout_wallet_pubkey")) {
    database.exec("ALTER TABLE vault_profiles ADD COLUMN payout_wallet_pubkey TEXT");
  }
}
