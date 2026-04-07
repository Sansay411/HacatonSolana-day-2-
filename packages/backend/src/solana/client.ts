import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { config } from "../config";
import bs58 from "bs58";
import fs from "fs";
import path from "path";

let connection: Connection;
let riskAuthorityKeypair: Keypair;
let program: anchor.Program<any>;
let isConfiguredRiskAuthority = false;

const MIN_EXECUTION_BALANCE_LAMPORTS = Math.floor(0.02 * LAMPORTS_PER_SOL);
const DEVNET_TOP_UP_TARGET_LAMPORTS = Math.floor(0.1 * LAMPORTS_PER_SOL);

/**
 * Initialize the Solana client.
 * Must be called before any other client functions.
 */
export function initSolanaClient(): {
  connection: Connection;
  riskAuthority: Keypair;
} {
  connection = new Connection(config.solana.rpcUrl, "confirmed");

  // Load risk authority keypair from env
  if (config.solana.riskAuthoritySecretKey) {
    const secretKey = bs58.decode(config.solana.riskAuthoritySecretKey);
    riskAuthorityKeypair = Keypair.fromSecretKey(secretKey);
    isConfiguredRiskAuthority = true;
  } else {
    // Generate ephemeral keypair for development
    riskAuthorityKeypair = Keypair.generate();
    isConfiguredRiskAuthority = false;
    console.warn(
      "⚠ No RISK_AUTHORITY_SECRET_KEY set — using ephemeral keypair:",
      riskAuthorityKeypair.publicKey.toBase58()
    );
  }

  const wallet = new anchor.Wallet(riskAuthorityKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const repoRootIdlPath = path.resolve(
    __dirname,
    "../../../../target/idl/aegis_vault.json"
  );
  const cwdIdlPath = path.resolve(process.cwd(), "target/idl/aegis_vault.json");
  const idlPath = fs.existsSync(repoRootIdlPath) ? repoRootIdlPath : cwdIdlPath;
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  program = new anchor.Program(idl, provider);

  return { connection, riskAuthority: riskAuthorityKeypair };
}

export function getConnection(): Connection {
  if (!connection) initSolanaClient();
  return connection;
}

export function getRiskAuthority(): Keypair {
  if (!riskAuthorityKeypair) initSolanaClient();
  return riskAuthorityKeypair;
}

export function getRiskAuthorityPublicKey(): PublicKey {
  return getRiskAuthority().publicKey;
}

export function hasConfiguredRiskAuthority(): boolean {
  if (!riskAuthorityKeypair) initSolanaClient();
  return isConfiguredRiskAuthority;
}

function isDevnetRpc(): boolean {
  return config.solana.rpcUrl.includes("devnet");
}

export interface RiskAuthorityStatus {
  publicKey: string;
  balanceLamports: number;
  balanceSol: number;
  ready: boolean;
  isConfigured: boolean;
  isEphemeral: boolean;
  warnings: string[];
}

export async function getRiskAuthorityStatus(): Promise<RiskAuthorityStatus> {
  const conn = getConnection();
  const authority = getRiskAuthority();
  const balanceLamports = await conn.getBalance(authority.publicKey, "confirmed");
  const warnings: string[] = [];

  if (!hasConfiguredRiskAuthority()) {
    warnings.push(
      "Backend is using an ephemeral risk authority. Set RISK_AUTHORITY_SECRET_KEY for a stable demo executor."
    );
  }

  if (balanceLamports < MIN_EXECUTION_BALANCE_LAMPORTS) {
    warnings.push(
      "Risk authority balance is too low to reliably pay transaction fees for approve/reject instructions."
    );
  }

  return {
    publicKey: authority.publicKey.toBase58(),
    balanceLamports,
    balanceSol: balanceLamports / LAMPORTS_PER_SOL,
    ready: balanceLamports >= MIN_EXECUTION_BALANCE_LAMPORTS,
    isConfigured: hasConfiguredRiskAuthority(),
    isEphemeral: !hasConfiguredRiskAuthority(),
    warnings,
  };
}

export async function ensureRiskAuthorityReady(): Promise<RiskAuthorityStatus> {
  let status = await getRiskAuthorityStatus();

  if (!status.ready && isDevnetRpc()) {
    try {
      const conn = getConnection();
      const authority = getRiskAuthority();
      const lamportsNeeded = Math.max(
        DEVNET_TOP_UP_TARGET_LAMPORTS - status.balanceLamports,
        MIN_EXECUTION_BALANCE_LAMPORTS
      );
      const signature = await conn.requestAirdrop(authority.publicKey, lamportsNeeded);
      const latestBlockhash = await conn.getLatestBlockhash("confirmed");
      await conn.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );
      status = await getRiskAuthorityStatus();
    } catch (error) {
      console.warn("⚠ Failed to top up risk authority on devnet:", error);
      status = await getRiskAuthorityStatus();
    }
  }

  return status;
}

export function getProgram(): anchor.Program<any> {
  if (!program) initSolanaClient();
  return program;
}

/**
 * Fetch a vault account from on-chain.
 */
export async function fetchVaultAccount(vaultPubkey: PublicKey) {
  const conn = getConnection();
  const info = await conn.getAccountInfo(vaultPubkey);
  return info;
}

/**
 * Send a signed transaction using the risk authority keypair.
 */
export async function sendRiskAuthorityTransaction(
  instructions: TransactionInstruction[]
): Promise<string> {
  const conn = getConnection();
  const authority = getRiskAuthority();

  const latestBlockhash = await conn.getLatestBlockhash("confirmed");

  const messageV0 = new TransactionMessage({
    payerKey: authority.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([authority]);

  const simulation = await conn.simulateTransaction(tx, {
    commitment: "processed",
  });

  if (simulation.value.err) {
    const logs = simulation.value.logs || [];
    throw new SendTransactionError({
      action: "simulate",
      signature: "",
      transactionMessage: `Risk authority simulation failed: ${JSON.stringify(
        simulation.value.err
      )}`,
      logs,
    });
  }

  const signature = await conn.sendTransaction(tx);
  await conn.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed"
  );

  return signature;
}

export async function approveSpendRequestOnChain(params: {
  vaultPubkey: PublicKey;
  spendRequestPubkey: PublicKey;
  policyPubkey: PublicKey;
  beneficiaryPubkey: PublicKey;
  riskScore: number;
}): Promise<string> {
  const authority = getRiskAuthority();
  const anchorProgram = getProgram();
  const instruction = await anchorProgram.methods
    .approveSpendRequest(params.riskScore)
    .accountsPartial({
      riskAuthority: authority.publicKey,
      vault: params.vaultPubkey,
      policy: params.policyPubkey,
      spendRequest: params.spendRequestPubkey,
      beneficiary: params.beneficiaryPubkey,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return sendRiskAuthorityTransaction([instruction]);
}

export async function rejectSpendRequestOnChain(params: {
  vaultPubkey: PublicKey;
  spendRequestPubkey: PublicKey;
  riskScore: number;
}): Promise<string> {
  const authority = getRiskAuthority();
  const anchorProgram = getProgram();
  const instruction = await anchorProgram.methods
    .rejectSpendRequest(params.riskScore)
    .accountsPartial({
      riskAuthority: authority.publicKey,
      vault: params.vaultPubkey,
      spendRequest: params.spendRequestPubkey,
    })
    .instruction();

  return sendRiskAuthorityTransaction([instruction]);
}
