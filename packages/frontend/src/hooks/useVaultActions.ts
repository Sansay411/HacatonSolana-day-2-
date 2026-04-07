import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { useAegisProgram, PROGRAM_ID } from "./useAegisProgram";
import { useI18n } from "../i18n";
import { apiFetch } from "../lib/api";

interface TxResult {
  success: boolean;
  signature?: string;
  error?: string;
}

const VAULT_ACCOUNT_SPACE = 8 + 146;
const POLICY_ACCOUNT_SPACE = 8 + 58;
const CREATE_FEE_BUFFER_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;

function toLamports(amountSol: number): BN {
  return new BN(Math.round(amountSol * LAMPORTS_PER_SOL));
}

function lamportsToSolString(lamports: number) {
  return (lamports / LAMPORTS_PER_SOL).toFixed(4);
}

function extractSimulationMessage(
  logs: string[] | null | undefined,
  fallback: string
): string {
  if (!logs || logs.length === 0) {
    return fallback;
  }

  const anchorError = logs.find((line) => line.includes("AnchorError"));
  if (anchorError) {
    return anchorError.replace("Program log: ", "");
  }

  const failedLine = [...logs].reverse().find((line) => line.includes("failed:"));
  if (failedLine) {
    return failedLine.replace("Program log: ", "");
  }

  return logs[logs.length - 1].replace("Program log: ", "");
}

/**
 * Hook providing transaction builders for all vault operations.
 * Each function sends a transaction and returns the result.
 */
export function useVaultActions() {
  const program = useAegisProgram();
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [pending, setPending] = useState(false);
  const { t } = useI18n();

  const sendBuiltTransaction = useCallback(
    async (transaction: Transaction, label: string): Promise<TxResult> => {
      if (!publicKey) {
        return { success: false, error: t("actions.walletNotConnected") };
      }

      try {
        const latestBlockhash = await connection.getLatestBlockhash("confirmed");
        transaction.feePayer = publicKey;
        transaction.recentBlockhash = latestBlockhash.blockhash;
        let signature: string;

        if (signTransaction) {
          try {
            const signedTransaction = await signTransaction(transaction);
            signature = await connection.sendRawTransaction(
              signedTransaction.serialize(),
              {
                preflightCommitment: "confirmed",
                skipPreflight: false,
              }
            );
          } catch (walletSignError: any) {
            const message =
              typeof walletSignError?.message === "string"
                ? walletSignError.message
                : "";

            if (message.includes("User rejected")) {
              throw walletSignError;
            }

            if (message.includes("Unexpected error") && sendTransaction) {
              signature = await sendTransaction(transaction, connection, {
                preflightCommitment: "confirmed",
                skipPreflight: false,
              });
            } else {
              throw walletSignError;
            }
          }
        } else {
          signature = await sendTransaction(transaction, connection, {
            preflightCommitment: "confirmed",
            skipPreflight: false,
          });
        }

        await connection.confirmTransaction(
          {
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          "confirmed"
        );

        return { success: true, signature };
      } catch (err: any) {
        console.error(`${label} error:`, err);

        if (typeof err?.message === "string" && err.message.includes("User rejected")) {
          return {
            success: false,
            error: t("actions.transactionRejected"),
          };
        }

        const logs =
          err?.logs ||
          err?.transactionLogs ||
          err?.transactionError?.logs;

        if (Array.isArray(logs) && logs.length > 0) {
          return {
            success: false,
            error: extractSimulationMessage(logs, t("actions.simulationFailed")),
          };
        }

        return {
          success: false,
          error:
            (typeof err?.message === "string" && err.message.includes("Unexpected error")
              ? t("actions.walletUnexpectedError")
              : err?.message) || t("actions.transactionFailed", { label }),
        };
      }
    },
    [connection, publicKey, sendTransaction, signTransaction, t]
  );

  // ── CREATE VAULT + DEPOSIT ─────────────────────────
  const createVault = useCallback(
    async (params: {
      beneficiary: string;
      riskAuthority: string;
      depositSol: number;
      perTxLimitSol: number;
      totalLimitSol: number;
      cooldownSeconds: number;
      riskThreshold: number;
    }): Promise<TxResult & { vaultAddress?: string }> => {
      if (!program || !publicKey)
        return { success: false, error: t("actions.walletNotConnected") };

      setPending(true);
      try {
        const beneficiaryPk = new PublicKey(params.beneficiary);
        const riskAuthorityPk = new PublicKey(params.riskAuthority);
        const depositLamports = toLamports(params.depositSol);

        const [vaultRentLamports, policyRentLamports, funderBalanceLamports] = await Promise.all([
          connection.getMinimumBalanceForRentExemption(VAULT_ACCOUNT_SPACE),
          connection.getMinimumBalanceForRentExemption(POLICY_ACCOUNT_SPACE),
          connection.getBalance(publicKey, "confirmed"),
        ]);

        const estimatedRequiredLamports =
          depositLamports.toNumber() +
          vaultRentLamports +
          policyRentLamports +
          CREATE_FEE_BUFFER_LAMPORTS;

        if (funderBalanceLamports < estimatedRequiredLamports) {
          return {
            success: false,
            error: t("actions.insufficientFundsForCreate", {
              required: lamportsToSolString(estimatedRequiredLamports),
              available: lamportsToSolString(funderBalanceLamports),
            }),
          };
        }

        // Generate unique vault ID
        const vaultId = new BN(Date.now());

        // Derive PDAs
        const [vaultPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("vault"),
            publicKey.toBuffer(),
            beneficiaryPk.toBuffer(),
            vaultId.toArrayLike(Buffer, "le", 8),
          ],
          PROGRAM_ID
        );

        const [policyPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("policy"), vaultPda.toBuffer()],
          PROGRAM_ID
        );

        // Initialize vault
        const initTx = await program.methods
          .initializeVault(
            vaultId,
            toLamports(params.perTxLimitSol),
            toLamports(params.totalLimitSol),
            new BN(params.cooldownSeconds),
            params.riskThreshold
          )
          .accountsPartial({
            funder: publicKey,
            beneficiary: beneficiaryPk,
            riskAuthority: riskAuthorityPk,
            vault: vaultPda,
            policy: policyPda,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        const initResult = await sendBuiltTransaction(initTx, t("actions.createVaultLabel"));
        if (!initResult.success) {
          return initResult;
        }

        // Deposit
        if (params.depositSol > 0) {
          const depositTx = await program.methods
            .deposit(depositLamports)
            .accountsPartial({
              funder: publicKey,
              vault: vaultPda,
              systemProgram: SystemProgram.programId,
            })
            .transaction();

          const depositResult = await sendBuiltTransaction(depositTx, t("actions.depositLabel"));
          if (!depositResult.success) {
            return depositResult;
          }
        }

        return {
          success: true,
          signature: initResult.signature,
          vaultAddress: vaultPda.toBase58(),
        };
      } catch (err: any) {
        console.error("Create vault error:", err);
        return { success: false, error: err.message };
      } finally {
        setPending(false);
      }
    },
    [program, publicKey, sendBuiltTransaction, t]
  );

  // ── SUBMIT SPEND REQUEST ───────────────────────────
  const submitSpendRequest = useCallback(
    async (params: {
      vaultAddress: string;
      amount: number;
      description: string;
      requestCount: number;
    }): Promise<TxResult> => {
      if (!program || !publicKey)
        return { success: false, error: t("actions.walletNotConnected") };

      setPending(true);
      try {
        const normalizedDescription = String(params.description || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300);

        if (normalizedDescription.length < 10) {
          return {
            success: false,
            error: t("actions.invalidDescriptionLength"),
          };
        }

        if (!Number.isFinite(params.amount) || params.amount <= 0) {
          return {
            success: false,
            error: t("actions.invalidAmount"),
          };
        }

        const vaultPda = new PublicKey(params.vaultAddress);
        const vaultAccount = (await program.account.vault.fetch(vaultPda)) as any;
        const beneficiaryAddress = vaultAccount.beneficiary.toBase58();
        const requestCount = vaultAccount.requestCount.toNumber();

        if (beneficiaryAddress !== publicKey.toBase58()) {
          return {
            success: false,
            error: t("actions.onlyBeneficiaryWallet", { beneficiary: beneficiaryAddress }),
          };
        }

        // Hash description
        const descBytes = new TextEncoder().encode(normalizedDescription);
        const descBuffer = new ArrayBuffer(descBytes.byteLength);
        new Uint8Array(descBuffer).set(descBytes);
        const descHash = Array.from(
          new Uint8Array(await window.crypto.subtle.digest("SHA-256", descBuffer))
        );

        // Derive spend request PDA
        const [spendRequestPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("spend_request"),
            vaultPda.toBuffer(),
            new BN(requestCount).toArrayLike(Buffer, "le", 8),
          ],
          PROGRAM_ID
        );

        const transaction = await program.methods
          .submitSpendRequest(
            toLamports(params.amount),
            descHash
          )
          .accountsPartial({
            beneficiary: publicKey,
            vault: vaultPda,
            spendRequest: spendRequestPda,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        const submitResult = await sendBuiltTransaction(transaction, t("actions.submitLabel"));
        if (!submitResult.success) {
          return submitResult;
        }

        const backendResponse = await apiFetch("/api/spend-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vaultAddress: params.vaultAddress,
            requestIndex: requestCount,
            requestAddress: spendRequestPda.toBase58(),
            description: normalizedDescription,
            amount: params.amount * LAMPORTS_PER_SOL,
            walletAddress: publicKey.toBase58(),
          }),
        });

        if (!backendResponse.ok) {
          const payload = await backendResponse.json().catch(() => null);
          const errorCode = payload?.errorCode;
          const backendMessage = payload?.message;

          if (errorCode === "RATE_LIMIT_EXCEEDED") {
            return { success: false, error: t("actions.rateLimitExceeded") };
          }
          if (errorCode === "COOLDOWN_ACTIVE") {
            return { success: false, error: t("actions.cooldownActive") };
          }
          if (errorCode === "TRUST_TOO_LOW") {
            return { success: false, error: t("actions.trustTooLow") };
          }
          if (errorCode === "HIGH_RISK_BLOCKED") {
            return { success: false, error: t("actions.highRiskBlocked") };
          }
          if (errorCode === "INVALID_INPUT") {
            return { success: false, error: backendMessage || t("actions.invalidInput") };
          }

          return {
            success: false,
            error: backendMessage || t("actions.transactionFailed", { label: t("actions.submitLabel") }),
          };
        }

        return { success: true, signature: submitResult.signature };
      } catch (err: any) {
        console.error("Submit request error:", err);
        return { success: false, error: err.message };
      } finally {
        setPending(false);
      }
    },
    [program, publicKey, sendBuiltTransaction, t]
  );

  // ── FREEZE VAULT ───────────────────────────────────
  const freezeVault = useCallback(
    async (vaultAddress: string): Promise<TxResult> => {
      if (!program || !publicKey)
        return { success: false, error: t("actions.walletNotConnected") };

      setPending(true);
      try {
        const transaction = await program.methods
          .freezeVault()
          .accountsPartial({
            funder: publicKey,
            vault: new PublicKey(vaultAddress),
          })
          .transaction();
        return await sendBuiltTransaction(transaction, t("actions.freezeLabel"));
      } catch (err: any) {
        return { success: false, error: err.message };
      } finally {
        setPending(false);
      }
    },
    [program, publicKey, sendBuiltTransaction, t]
  );

  // ── UNFREEZE VAULT ─────────────────────────────────
  const unfreezeVault = useCallback(
    async (vaultAddress: string): Promise<TxResult> => {
      if (!program || !publicKey)
        return { success: false, error: t("actions.walletNotConnected") };

      setPending(true);
      try {
        const transaction = await program.methods
          .unfreezeVault()
          .accountsPartial({
            funder: publicKey,
            vault: new PublicKey(vaultAddress),
          })
          .transaction();
        return await sendBuiltTransaction(transaction, t("actions.unfreezeLabel"));
      } catch (err: any) {
        return { success: false, error: err.message };
      } finally {
        setPending(false);
      }
    },
    [program, publicKey, sendBuiltTransaction, t]
  );

  // ── DEPOSIT MORE ───────────────────────────────────
  const deposit = useCallback(
    async (vaultAddress: string, amountSol: number): Promise<TxResult> => {
      if (!program || !publicKey)
        return { success: false, error: t("actions.walletNotConnected") };

      setPending(true);
      try {
        const transaction = await program.methods
          .deposit(toLamports(amountSol))
          .accountsPartial({
            funder: publicKey,
            vault: new PublicKey(vaultAddress),
            systemProgram: SystemProgram.programId,
          })
          .transaction();
        return await sendBuiltTransaction(transaction, t("actions.depositLabel"));
      } catch (err: any) {
        return { success: false, error: err.message };
      } finally {
        setPending(false);
      }
    },
    [program, publicKey, sendBuiltTransaction, t]
  );

  return {
    createVault,
    submitSpendRequest,
    freezeVault,
    unfreezeVault,
    deposit,
    pending,
  };
}
