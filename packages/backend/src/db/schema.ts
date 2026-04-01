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
      description TEXT NOT NULL,
      description_hash TEXT NOT NULL,
      amount_lamports INTEGER DEFAULT 0,
      processing_status TEXT DEFAULT 'pending',
      processing_error TEXT,
      last_processed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(vault_pubkey, request_index)
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

    CREATE INDEX IF NOT EXISTS idx_audit_vault ON audit_events(vault_pubkey);
    CREATE INDEX IF NOT EXISTS idx_requests_vault ON spend_request_details(vault_pubkey);
    CREATE INDEX IF NOT EXISTS idx_ai_decisions_request ON ai_decisions(request_id);
  `);

  const requestColumns = database
    .prepare("PRAGMA table_info(spend_request_details)")
    .all() as Array<{ name: string }>;

  if (!requestColumns.some((column) => column.name === "amount_lamports")) {
    database.exec(
      "ALTER TABLE spend_request_details ADD COLUMN amount_lamports INTEGER DEFAULT 0"
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
}
