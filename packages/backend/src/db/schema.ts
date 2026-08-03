import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { config } from "../config";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = config.db.path;
    const dbDir = path.dirname(dbPath);
    if (dbDir && !fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(dbPath);
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
      decision_source TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}
