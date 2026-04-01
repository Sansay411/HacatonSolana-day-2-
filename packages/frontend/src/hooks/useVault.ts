import { useState, useEffect, useCallback, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useAegisProgram } from "./useAegisProgram";

const VAULT_POLL_INTERVAL_MS = 10000;

function isRateLimitError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.includes("429") || message.toLowerCase().includes("too many requests");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRpcRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (!isRateLimitError(error) || attempt >= retries) {
        throw error;
      }

      await sleep(800 * attempt);
    }
  }

  throw lastError;
}

export interface VaultState {
  address: string;
  funder: string;
  beneficiary: string;
  riskAuthority: string;
  mode: "active" | "frozen" | "closed";
  totalDeposited: number; // SOL
  totalDisbursed: number; // SOL
  available: number; // SOL
  lastPayoutAt: number; // unix timestamp
  requestCount: number;
  createdAt: number;
}

export interface PolicyState {
  perTxLimit: number; // SOL
  totalLimit: number; // SOL
  cooldownSeconds: number;
  riskThreshold: number;
}

export interface SpendRequestState {
  address: string;
  amount: number; // SOL
  status: "pending" | "approved" | "rejected";
  riskScore: number;
  requestIndex: number;
  createdAt: number;
  resolvedAt: number;
  descriptionHash: string;
}

export type UserRole = "funder" | "beneficiary" | "none";

function parseVaultMode(mode: any): "active" | "frozen" | "closed" {
  if (mode?.active !== undefined) return "active";
  if (mode?.frozen !== undefined) return "frozen";
  if (mode?.closed !== undefined) return "closed";
  return "active";
}

function parseRequestStatus(status: any): "pending" | "approved" | "rejected" {
  if (status?.pending !== undefined) return "pending";
  if (status?.approved !== undefined) return "approved";
  if (status?.rejected !== undefined) return "rejected";
  return "pending";
}

/**
 * Hook to fetch and poll vault, policy, and spend request data from on-chain.
 * Auto-detects user role (funder vs beneficiary).
 */
export function useVault(vaultAddress: string | undefined) {
  const program = useAegisProgram();
  const { publicKey } = useWallet();
  const { connection } = useConnection();

  const [vault, setVault] = useState<VaultState | null>(null);
  const [policy, setPolicy] = useState<PolicyState | null>(null);
  const [requests, setRequests] = useState<SpendRequestState[]>([]);
  const [role, setRole] = useState<UserRole>("none");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchInFlightRef = useRef(false);
  const hasLoadedDataRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!program || !vaultAddress || fetchInFlightRef.current) {
      // Demo mode: use mock data if program not available
      setLoading(false);
      return;
    }

    fetchInFlightRef.current = true;

    try {
      const vaultPda = new PublicKey(vaultAddress);

      // Fetch vault
      const vaultData = await withRpcRetry(() => program.account.vault.fetch(vaultPda));

      const vaultState: VaultState = {
        address: vaultAddress,
        funder: (vaultData as any).funder.toBase58(),
        beneficiary: (vaultData as any).beneficiary.toBase58(),
        riskAuthority: (vaultData as any).riskAuthority.toBase58(),
        mode: parseVaultMode((vaultData as any).vaultMode),
        totalDeposited: (vaultData as any).totalDeposited.toNumber() / LAMPORTS_PER_SOL,
        totalDisbursed: (vaultData as any).totalDisbursed.toNumber() / LAMPORTS_PER_SOL,
        available:
          ((vaultData as any).totalDeposited.toNumber() -
            (vaultData as any).totalDisbursed.toNumber()) / LAMPORTS_PER_SOL,
        lastPayoutAt: (vaultData as any).lastPayoutAt.toNumber(),
        requestCount: (vaultData as any).requestCount.toNumber(),
        createdAt: (vaultData as any).createdAt.toNumber(),
      };
      setVault(vaultState);

      // Determine role
      if (publicKey) {
        const walletAddr = publicKey.toBase58();
        if (walletAddr === vaultState.funder) setRole("funder");
        else if (walletAddr === vaultState.beneficiary) setRole("beneficiary");
        else setRole("none");
      }

      // Fetch policy
      const [policyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("policy"), vaultPda.toBuffer()],
        program.programId
      );
      const policyData = await withRpcRetry(() => program.account.policy.fetch(policyPda));
      setPolicy({
        perTxLimit: (policyData as any).perTxLimit.toNumber() / LAMPORTS_PER_SOL,
        totalLimit: (policyData as any).totalLimit.toNumber() / LAMPORTS_PER_SOL,
        cooldownSeconds: (policyData as any).cooldownSeconds.toNumber(),
        riskThreshold: (policyData as any).riskThreshold,
      });

      // Fetch spend requests
      const allRequests = await withRpcRetry(() =>
        program.account.spendRequest.all([
          { memcmp: { offset: 8, bytes: vaultPda.toBase58() } },
        ])
      );

      const parsed: SpendRequestState[] = allRequests
        .map((r: any) => ({
          address: r.publicKey.toBase58(),
          amount: r.account.amount.toNumber() / LAMPORTS_PER_SOL,
          status: parseRequestStatus(r.account.status),
          riskScore: r.account.riskScore,
          requestIndex: r.account.requestIndex.toNumber(),
          createdAt: r.account.createdAt.toNumber(),
          resolvedAt: r.account.resolvedAt.toNumber(),
          descriptionHash: Buffer.from(r.account.descriptionHash).toString("hex"),
        }))
        .sort((a: SpendRequestState, b: SpendRequestState) => b.requestIndex - a.requestIndex);

      setRequests(parsed);
      hasLoadedDataRef.current = true;
      setError(null);
    } catch (err: any) {
      console.error("Vault fetch error:", err);
      if (!isRateLimitError(err) || !hasLoadedDataRef.current) {
        setError(
          isRateLimitError(err)
            ? "RPC временно ограничил запросы. Повторяем загрузку..."
            : err.message
        );
      }
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [program, vaultAddress, publicKey]);

  // Initial fetch + gentle polling
  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(() => {
      if (!document.hidden) {
        fetchData();
      }
    }, VAULT_POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  return { vault, policy, requests, role, loading, error, refetch: fetchData };
}
