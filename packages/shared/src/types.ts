import { PublicKey } from "@solana/web3.js";
import { VaultMode, SpendRequestStatus } from "./constants";

// ============================================================
// On-chain account types (TypeScript mirrors of Anchor structs)
// These are generated/synced from the Anchor IDL after first build.
// For now, defined manually to unblock development.
// ============================================================

export interface VaultAccount {
  funder: PublicKey;
  beneficiary: PublicKey;
  riskAuthority: PublicKey;
  vaultMode: VaultMode;
  totalDeposited: bigint;
  totalDisbursed: bigint;
  lastPayoutAt: bigint;
  requestCount: bigint;
  vaultId: bigint;
  createdAt: bigint;
  bump: number;
}

export interface PolicyAccount {
  vault: PublicKey;
  perTxLimit: bigint;
  totalLimit: bigint;
  cooldownSeconds: bigint;
  riskThreshold: number;
  bump: number;
}

export interface SpendRequestAccount {
  vault: PublicKey;
  beneficiary: PublicKey;
  amount: bigint;
  status: SpendRequestStatus;
  descriptionHash: Uint8Array; // 32 bytes
  riskScore: number;
  requestIndex: bigint;
  createdAt: bigint;
  resolvedAt: bigint;
  bump: number;
}

// ============================================================
// Frontend display types (derived from on-chain data)
// ============================================================

export interface VaultDisplay {
  address: string;
  funder: string;
  beneficiary: string;
  mode: VaultMode;
  totalDeposited: number; // in SOL
  totalDisbursed: number; // in SOL
  availableBalance: number; // in SOL
  requestCount: number;
  createdAt: Date;
  policy: PolicyDisplay;
}

export interface PolicyDisplay {
  perTxLimit: number; // in SOL
  totalLimit: number; // in SOL
  cooldownSeconds: number;
  riskThreshold: number;
}

export interface SpendRequestDisplay {
  address: string;
  vaultAddress: string;
  amount: number; // in SOL
  status: SpendRequestStatus;
  description: string; // from off-chain DB
  riskScore: number;
  requestIndex: number;
  createdAt: Date;
  resolvedAt: Date | null;
}
