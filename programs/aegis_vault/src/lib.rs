use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("9Z6HNGC1wz6ukVCD3qNqnfFMDfCffNPBz6dG5k8fakHc");

#[program]
pub mod aegis_vault {
    use super::*;

    /// Creates a new funding vault with associated policy.
    /// Signer: Funder
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        vault_id: u64,
        per_tx_limit: u64,
        total_limit: u64,
        cooldown_seconds: i64,
        risk_threshold: u8,
    ) -> Result<()> {
        instructions::initialize_vault::handler(
            ctx,
            vault_id,
            per_tx_limit,
            total_limit,
            cooldown_seconds,
            risk_threshold,
        )
    }

    /// Deposits SOL into the vault.
    /// Signer: Funder
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    /// Beneficiary submits a spend request.
    /// Signer: Beneficiary
    pub fn submit_spend_request(
        ctx: Context<SubmitSpendRequest>,
        amount: u64,
        description_hash: [u8; 32],
    ) -> Result<()> {
        instructions::submit_spend_request::handler(ctx, amount, description_hash)
    }

    /// Risk authority approves a spend request.
    /// On-chain policy enforcement runs AFTER risk authority approval.
    /// Signer: Risk Authority
    pub fn approve_spend_request(
        ctx: Context<ApproveSpendRequest>,
        risk_score: u8,
    ) -> Result<()> {
        instructions::approve_spend_request::handler(ctx, risk_score)
    }

    /// Risk authority rejects a spend request.
    /// Signer: Risk Authority
    pub fn reject_spend_request(
        ctx: Context<RejectSpendRequest>,
        risk_score: u8,
    ) -> Result<()> {
        instructions::reject_spend_request::handler(ctx, risk_score)
    }

    /// Funder freezes the vault — all spend requests will be rejected.
    /// Signer: Funder
    pub fn freeze_vault(ctx: Context<FreezeVault>) -> Result<()> {
        instructions::freeze_vault::handler(ctx)
    }

    /// Funder unfreezes the vault — normal operation resumes.
    /// Signer: Funder
    pub fn unfreeze_vault(ctx: Context<UnfreezeVault>) -> Result<()> {
        instructions::unfreeze_vault::handler(ctx)
    }

    /// Funder closes the vault — remaining funds returned to funder.
    /// Signer: Funder
    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        instructions::close_vault::handler(ctx)
    }
}
