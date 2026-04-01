import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  PublicKey,
} from "@solana/web3.js";
import { expect } from "chai";
import { createHash } from "crypto";

// NOTE: After first `anchor build`, import the generated IDL type:
// import { AegisVault } from "../target/types/aegis_vault";

describe("aegis_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Program will be loaded from workspace after build
  const program = anchor.workspace.AegisVault as Program<any>;

  // === TEST ACCOUNTS ===
  const funder = provider.wallet as anchor.Wallet;
  const beneficiary = Keypair.generate();
  const riskAuthority = Keypair.generate();
  const vaultId = new BN(1);

  // PDA addresses (computed in before())
  let vaultPda: PublicKey;
  let vaultBump: number;
  let policyPda: PublicKey;
  let policyBump: number;

  // Policy params for tests
  const perTxLimit = new BN(2 * LAMPORTS_PER_SOL); // 2 SOL
  const totalLimit = new BN(10 * LAMPORTS_PER_SOL); // 10 SOL
  const cooldownSeconds = new BN(5); // 5 seconds for tests
  const riskThreshold = 70;

  before(async () => {
    // Airdrop to beneficiary for rent
    const sig = await provider.connection.requestAirdrop(
      beneficiary.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    // Derive PDAs
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        funder.publicKey.toBuffer(),
        beneficiary.publicKey.toBuffer(),
        vaultId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    [policyPda, policyBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), vaultPda.toBuffer()],
      program.programId
    );
  });

  // ============================================================
  // 1. Initialize Vault
  // ============================================================
  it("creates a vault with policy", async () => {
    await program.methods
      .initializeVault(vaultId, perTxLimit, totalLimit, cooldownSeconds, riskThreshold)
      .accounts({
        funder: funder.publicKey,
        beneficiary: beneficiary.publicKey,
        riskAuthority: riskAuthority.publicKey,
        vault: vaultPda,
        policy: policyPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify vault state
    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.funder.toBase58()).to.equal(funder.publicKey.toBase58());
    expect(vault.beneficiary.toBase58()).to.equal(beneficiary.publicKey.toBase58());
    expect(vault.riskAuthority.toBase58()).to.equal(riskAuthority.publicKey.toBase58());
    expect(vault.totalDeposited.toNumber()).to.equal(0);
    expect(vault.totalDisbursed.toNumber()).to.equal(0);
    expect(vault.requestCount.toNumber()).to.equal(0);

    // Verify policy state
    const policy = await program.account.policy.fetch(policyPda);
    expect(policy.perTxLimit.toNumber()).to.equal(perTxLimit.toNumber());
    expect(policy.totalLimit.toNumber()).to.equal(totalLimit.toNumber());
    expect(policy.cooldownSeconds.toNumber()).to.equal(cooldownSeconds.toNumber());
    expect(policy.riskThreshold).to.equal(riskThreshold);
  });

  // ============================================================
  // 2. Deposit
  // ============================================================
  it("funder deposits SOL into vault", async () => {
    const depositAmount = new BN(5 * LAMPORTS_PER_SOL);

    await program.methods
      .deposit(depositAmount)
      .accounts({
        funder: funder.publicKey,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.totalDeposited.toNumber()).to.equal(depositAmount.toNumber());
  });

  // ============================================================
  // 3. Submit Spend Request
  // ============================================================
  it("beneficiary submits a spend request", async () => {
    const amount = new BN(1 * LAMPORTS_PER_SOL);
    const description = "Development tools subscription";
    const descriptionHash = createHash("sha256")
      .update(description)
      .digest();

    // Derive spend request PDA at index 0
    const [spendRequestPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("spend_request"),
        vaultPda.toBuffer(),
        new BN(0).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .submitSpendRequest(amount, Array.from(descriptionHash))
      .accounts({
        beneficiary: beneficiary.publicKey,
        vault: vaultPda,
        spendRequest: spendRequestPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([beneficiary])
      .rpc();

    const request = await program.account.spendRequest.fetch(spendRequestPda);
    expect(request.amount.toNumber()).to.equal(amount.toNumber());
    expect(request.requestIndex.toNumber()).to.equal(0);
    // Status should be Pending (enum index 0)
    expect(JSON.stringify(request.status)).to.include("pending");

    // Vault request count should increment
    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.requestCount.toNumber()).to.equal(1);
  });

  // ============================================================
  // 4. Approve Spend Request (with policy enforcement)
  // ============================================================
  it("risk authority approves request and payout executes", async () => {
    const [spendRequestPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("spend_request"),
        vaultPda.toBuffer(),
        new BN(0).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const beneficiaryBalanceBefore = await provider.connection.getBalance(
      beneficiary.publicKey
    );

    const riskScore = 30; // below threshold of 70

    await program.methods
      .approveSpendRequest(riskScore)
      .accounts({
        riskAuthority: riskAuthority.publicKey,
        vault: vaultPda,
        policy: policyPda,
        spendRequest: spendRequestPda,
        beneficiary: beneficiary.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([riskAuthority])
      .rpc();

    // Verify payout
    const beneficiaryBalanceAfter = await provider.connection.getBalance(
      beneficiary.publicKey
    );
    expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(
      1 * LAMPORTS_PER_SOL
    );

    // Verify request is Approved
    const request = await program.account.spendRequest.fetch(spendRequestPda);
    expect(JSON.stringify(request.status)).to.include("approved");
    expect(request.riskScore).to.equal(riskScore);

    // Verify vault state updated
    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.totalDisbursed.toNumber()).to.equal(1 * LAMPORTS_PER_SOL);
  });

  // ============================================================
  // 5. Cooldown enforcement
  // ============================================================
  it("rejects spend request if cooldown not elapsed", async () => {
    // Submit another request immediately
    const amount = new BN(0.5 * LAMPORTS_PER_SOL);
    const descriptionHash = createHash("sha256")
      .update("Server costs")
      .digest();

    const [spendRequestPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("spend_request"),
        vaultPda.toBuffer(),
        new BN(1).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .submitSpendRequest(amount, Array.from(descriptionHash))
      .accounts({
        beneficiary: beneficiary.publicKey,
        vault: vaultPda,
        spendRequest: spendRequestPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([beneficiary])
      .rpc();

    // Try to approve immediately — should fail due to cooldown
    try {
      await program.methods
        .approveSpendRequest(20)
        .accounts({
          riskAuthority: riskAuthority.publicKey,
          vault: vaultPda,
          policy: policyPda,
          spendRequest: spendRequestPda,
          beneficiary: beneficiary.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([riskAuthority])
        .rpc();
      expect.fail("Should have thrown CooldownNotElapsed");
    } catch (err: any) {
      expect(err.toString()).to.include("CooldownNotElapsed");
    }
  });

  // ============================================================
  // 6. Per-tx limit enforcement
  // ============================================================
  it("rejects spend request exceeding per-tx limit", async () => {
    const amount = new BN(3 * LAMPORTS_PER_SOL); // exceeds 2 SOL limit
    const descriptionHash = createHash("sha256")
      .update("Large purchase")
      .digest();

    const [spendRequestPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("spend_request"),
        vaultPda.toBuffer(),
        new BN(2).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .submitSpendRequest(amount, Array.from(descriptionHash))
      .accounts({
        beneficiary: beneficiary.publicKey,
        vault: vaultPda,
        spendRequest: spendRequestPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([beneficiary])
      .rpc();

    try {
      await program.methods
        .approveSpendRequest(20)
        .accounts({
          riskAuthority: riskAuthority.publicKey,
          vault: vaultPda,
          policy: policyPda,
          spendRequest: spendRequestPda,
          beneficiary: beneficiary.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([riskAuthority])
        .rpc();
      expect.fail("Should have thrown ExceedsPerTxLimit");
    } catch (err: any) {
      expect(err.toString()).to.include("ExceedsPerTxLimit");
    }
  });

  // ============================================================
  // 7. Freeze vault
  // ============================================================
  it("funder freezes the vault", async () => {
    await program.methods
      .freezeVault()
      .accounts({
        funder: funder.publicKey,
        vault: vaultPda,
      })
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(JSON.stringify(vault.vaultMode)).to.include("frozen");
  });

  // ============================================================
  // 8. Spend request rejected when vault frozen
  // ============================================================
  it("rejects spend request when vault is frozen", async () => {
    const amount = new BN(0.1 * LAMPORTS_PER_SOL);
    const descriptionHash = createHash("sha256")
      .update("Blocked request")
      .digest();

    const [spendRequestPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("spend_request"),
        vaultPda.toBuffer(),
        new BN(3).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    try {
      await program.methods
        .submitSpendRequest(amount, Array.from(descriptionHash))
        .accounts({
          beneficiary: beneficiary.publicKey,
          vault: vaultPda,
          spendRequest: spendRequestPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([beneficiary])
        .rpc();
      expect.fail("Should have thrown VaultNotActive");
    } catch (err: any) {
      expect(err.toString()).to.include("VaultNotActive");
    }
  });

  // ============================================================
  // 9. Unfreeze vault
  // ============================================================
  it("funder unfreezes the vault", async () => {
    await program.methods
      .unfreezeVault()
      .accounts({
        funder: funder.publicKey,
        vault: vaultPda,
      })
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(JSON.stringify(vault.vaultMode)).to.include("active");
  });

  // ============================================================
  // 10. Risk score threshold enforcement
  // ============================================================
  it("rejects approval with risk score above threshold", async () => {
    // Wait for cooldown
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // Use the request at index 1 (still pending)
    const [spendRequestPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("spend_request"),
        vaultPda.toBuffer(),
        new BN(1).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    try {
      await program.methods
        .approveSpendRequest(85) // above threshold of 70
        .accounts({
          riskAuthority: riskAuthority.publicKey,
          vault: vaultPda,
          policy: policyPda,
          spendRequest: spendRequestPda,
          beneficiary: beneficiary.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([riskAuthority])
        .rpc();
      expect.fail("Should have thrown RiskScoreTooHigh");
    } catch (err: any) {
      expect(err.toString()).to.include("RiskScoreTooHigh");
    }
  });

  // ============================================================
  // 11. Reject spend request
  // ============================================================
  it("risk authority rejects a spend request", async () => {
    const [spendRequestPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("spend_request"),
        vaultPda.toBuffer(),
        new BN(1).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .rejectSpendRequest(85)
      .accounts({
        riskAuthority: riskAuthority.publicKey,
        vault: vaultPda,
        spendRequest: spendRequestPda,
      })
      .signers([riskAuthority])
      .rpc();

    const request = await program.account.spendRequest.fetch(spendRequestPda);
    expect(JSON.stringify(request.status)).to.include("rejected");
    expect(request.riskScore).to.equal(85);
  });

  // ============================================================
  // 12. Close vault — return remaining funds to funder
  // ============================================================
  it("funder closes vault and receives remaining funds", async () => {
    const funderBalanceBefore = await provider.connection.getBalance(
      funder.publicKey
    );

    await program.methods
      .closeVault()
      .accounts({
        funder: funder.publicKey,
        vault: vaultPda,
      })
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(JSON.stringify(vault.vaultMode)).to.include("closed");

    // Funder should have received remaining SOL
    const funderBalanceAfter = await provider.connection.getBalance(
      funder.publicKey
    );
    expect(funderBalanceAfter).to.be.greaterThan(funderBalanceBefore);
  });
});
