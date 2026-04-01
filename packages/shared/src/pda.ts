import { PublicKey } from "@solana/web3.js";
import { SEEDS, PROGRAM_ID } from "./constants";

/**
 * PDA derivation helpers.
 * Seeds MUST match on-chain program seeds exactly.
 * These are shared between backend and frontend.
 */

export function findVaultPda(
  funder: PublicKey,
  beneficiary: PublicKey,
  vaultId: bigint | number
): [PublicKey, number] {
  const vaultIdBuffer = Buffer.alloc(8);
  vaultIdBuffer.writeBigUInt64LE(BigInt(vaultId));

  return PublicKey.findProgramAddressSync(
    [SEEDS.VAULT, funder.toBuffer(), beneficiary.toBuffer(), vaultIdBuffer],
    PROGRAM_ID
  );
}

export function findPolicyPda(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.POLICY, vault.toBuffer()],
    PROGRAM_ID
  );
}

export function findSpendRequestPda(
  vault: PublicKey,
  requestIndex: bigint | number
): [PublicKey, number] {
  const indexBuffer = Buffer.alloc(8);
  indexBuffer.writeBigUInt64LE(BigInt(requestIndex));

  return PublicKey.findProgramAddressSync(
    [SEEDS.SPEND_REQUEST, vault.toBuffer(), indexBuffer],
    PROGRAM_ID
  );
}
