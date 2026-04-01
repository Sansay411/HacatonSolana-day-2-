import { PublicKey } from "@solana/web3.js";

// ============================================================
// Program ID — UPDATE after first `anchor build`
// ============================================================
export const PROGRAM_ID = new PublicKey(
  "9Z6HNGC1wz6ukVCD3qNqnfFMDfCffNPBz6dG5k8fakHc"
);

// ============================================================
// PDA Seeds — MUST match on-chain program exactly
// DO NOT CHANGE without migration
// ============================================================
export const SEEDS = {
  VAULT: Buffer.from("vault"),
  POLICY: Buffer.from("policy"),
  SPEND_REQUEST: Buffer.from("spend_request"),
} as const;

// ============================================================
// Enums — mirroring on-chain state
// ============================================================
export enum VaultMode {
  Active = 0,
  Frozen = 1,
  Closed = 2,
}

export enum SpendRequestStatus {
  Pending = 0,
  Approved = 1,
  Rejected = 2,
}

// ============================================================
// Risk Engine Constants
// ============================================================
export const RISK = {
  /** Max possible risk score */
  MAX_SCORE: 100,
  /** Default threshold: reject above this score */
  DEFAULT_THRESHOLD: 70,
  /** Scores above this get flagged for review (post-MVP) */
  REVIEW_THRESHOLD: 50,
} as const;

// ============================================================
// Lamport helpers
// ============================================================
export const SOL_TO_LAMPORTS = 1_000_000_000;
export const lamportsToSol = (lamports: number | bigint): number =>
  Number(lamports) / SOL_TO_LAMPORTS;
export const solToLamports = (sol: number): number =>
  Math.floor(sol * SOL_TO_LAMPORTS);
