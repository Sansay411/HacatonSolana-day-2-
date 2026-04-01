use anchor_lang::prelude::*;

use crate::errors::AegisError;
use crate::events::SpendRequestCreated;
use crate::state::{SpendRequest, SpendRequestStatus, Vault, VaultMode};

/// Beneficiary submits a spend request.
///
/// Creates a SpendRequest PDA with Pending status. The request waits
/// for the risk authority to evaluate and approve/reject it.
pub fn handler(
    ctx: Context<SubmitSpendRequest>,
    amount: u64,
    description_hash: [u8; 32],
) -> Result<()> {
    require!(amount > 0, AegisError::ZeroRequestAmount);
    require!(
        ctx.accounts.vault.vault_mode == VaultMode::Active,
        AegisError::VaultNotActive
    );

    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.vault;
    let request_index = vault.request_count;

    // Initialize spend request
    let spend_request = &mut ctx.accounts.spend_request;
    spend_request.vault = vault.key();
    spend_request.beneficiary = ctx.accounts.beneficiary.key();
    spend_request.amount = amount;
    spend_request.status = SpendRequestStatus::Pending;
    spend_request.description_hash = description_hash;
    spend_request.risk_score = 0;
    spend_request.request_index = request_index;
    spend_request.created_at = clock.unix_timestamp;
    spend_request.resolved_at = 0;
    spend_request.bump = ctx.bumps.spend_request;

    // Increment vault request counter
    vault.request_count = vault
        .request_count
        .checked_add(1)
        .ok_or(AegisError::ArithmeticOverflow)?;

    emit!(SpendRequestCreated {
        vault: vault.key(),
        beneficiary: spend_request.beneficiary,
        spend_request: spend_request.key(),
        amount,
        request_index,
        description_hash,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SubmitSpendRequest<'info> {
    /// The beneficiary submitting the request.
    #[account(
        mut,
        constraint = beneficiary.key() == vault.beneficiary @ AegisError::InsufficientBalance
    )]
    pub beneficiary: Signer<'info>,

    /// The vault this request is against.
    #[account(mut)]
    pub vault: Account<'info, Vault>,

    /// The spend request PDA — derived from vault + request_count.
    #[account(
        init,
        payer = beneficiary,
        space = 8 + SpendRequest::INIT_SPACE,
        seeds = [
            b"spend_request",
            vault.key().as_ref(),
            vault.request_count.to_le_bytes().as_ref()
        ],
        bump,
    )]
    pub spend_request: Account<'info, SpendRequest>,

    pub system_program: Program<'info, System>,
}
