import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "../../../../target/idl/aegis_vault.json";
import type { AegisVault } from "../../../../target/types/aegis_vault";

/**
 * Program ID — update after `anchor build`.
 * Can be overridden with VITE_PROGRAM_ID env var.
 */
const PROGRAM_ID = new PublicKey(
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_PROGRAM_ID) ||
  "9Z6HNGC1wz6ukVCD3qNqnfFMDfCffNPBz6dG5k8fakHc"
);

/**
 * Hook to get an Anchor Program instance connected to the current wallet.
 *
 * IDL is loaded dynamically after `anchor build` generates it.
 * Until then, this returns null and the UI falls back to demo mock data.
 */
export function useAegisProgram(): anchor.Program<AegisVault> | null {
  const { connection } = useConnection();
  const wallet = useWallet();

  return useMemo(() => {
    if (!wallet.publicKey) return null;

    try {
      const provider = new anchor.AnchorProvider(connection, wallet as unknown as anchor.Wallet, {
        commitment: "confirmed",
      });
      return new anchor.Program(idl as AegisVault, provider);
    } catch {
      return null;
    }
  }, [connection, wallet, wallet.publicKey]);
}

export { PROGRAM_ID };
