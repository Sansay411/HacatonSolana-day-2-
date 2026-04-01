use anchor_lang::prelude::*;

use crate::errors::AegisError;
use crate::events::VaultCreated;
use crate::state::{Policy, Vault, VaultMode};

/// Creates a new funding vault with associated policy.
///
/// The vault PDA owns funds. Funder sets beneficiary, risk authority, and policy params.
/// This instruction creates both the Vault and Policy accounts atomically.
pub fn handler(
    ctx: Context<InitializeVault>,
    vault_id: u64,
    per_tx_limit: u64,
    total_limit: u64,
    cooldown_seconds: i64,
    risk_threshold: u8,
) -> Result<()> {
    require!(risk_threshold <= 100, AegisError::InvalidRiskScore);

    let clock = Clock::get()?;

    // Initialize vault
    let vault = &mut ctx.accounts.vault;
    vault.funder = ctx.accounts.funder.key();
    vault.beneficiary = ctx.accounts.beneficiary.key();
    vault.risk_authority = ctx.accounts.risk_authority.key();
    vault.vault_mode = VaultMode::Active;
    vault.total_deposited = 0;
    vault.total_disbursed = 0;
    vault.last_payout_at = 0;
    vault.request_count = 0;
    vault.vault_id = vault_id;
    vault.created_at = clock.unix_timestamp;
    vault.bump = ctx.bumps.vault;

    // Initialize policy
    let policy = &mut ctx.accounts.policy;
    policy.vault = vault.key();
    policy.per_tx_limit = per_tx_limit;
    policy.total_limit = total_limit;
    policy.cooldown_seconds = cooldown_seconds;
    policy.risk_threshold = risk_threshold;
    policy.bump = ctx.bumps.policy;

    emit!(VaultCreated {
        vault: vault.key(),
        funder: vault.funder,
        beneficiary: vault.beneficiary,
        vault_id,
        total_limit,
        per_tx_limit,
        cooldown_seconds,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(vault_id: u64)]
pub struct InitializeVault<'info> {
    /// The funder creating the vault; pays for account rent.
    #[account(mut)]
    pub funder: Signer<'info>,

    /// The beneficiary who will submit spend requests.
    /// CHECK: Just stores the pubkey; no account data needed.
    pub beneficiary: UncheckedAccount<'info>,

    /// The backend risk authority keypair.
    /// CHECK: Just stores the pubkey; no account data needed.
    pub risk_authority: UncheckedAccount<'info>,

    /// The vault PDA.
    #[account(
        init,
        payer = funder,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", funder.key().as_ref(), beneficiary.key().as_ref(), vault_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    /// The policy PDA — 1:1 with vault.
    #[account(
        init,
        payer = funder,
        space = 8 + Policy::INIT_SPACE,
        seeds = [b"policy", vault.key().as_ref()],
        bump,
    )]
    pub policy: Account<'info, Policy>,

    pub system_program: Program<'info, System>,
}
