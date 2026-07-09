use anchor_lang::prelude::*;

use crate::errors::AegisError;
use crate::events::SpendRequestApproved;
use crate::state::{SpendRequest, SpendRequestStatus, Vault, VaultMode};

/// Risk authority approves a pending spend request.
///
/// Sets the risk score and transitions the request to Approved status.
/// The beneficiary can then disburse funds.
pub fn handler(ctx: Context<ApproveSpendRequest>, risk_score: u8) -> Result<()> {
    require!(risk_score <= 100, AegisError::InvalidRiskScore);
    require!(
        ctx.accounts.vault.vault_mode == VaultMode::Active,
        AegisError::VaultNotActive
    );
    require!(
        ctx.accounts.spend_request.status == SpendRequestStatus::Pending,
        AegisError::RequestNotPending
    );

    let clock = Clock::get()?;
    let spend_request = &mut ctx.accounts.spend_request;
    spend_request.risk_score = risk_score;
    spend_request.status = SpendRequestStatus::Approved;
    spend_request.resolved_at = clock.unix_timestamp;

    emit!(SpendRequestApproved {
        vault: ctx.accounts.vault.key(),
        spend_request: spend_request.key(),
        risk_score,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ApproveSpendRequest<'info> {
    /// The risk authority evaluating the request.
    #[account(
        mut,
        constraint = risk_authority.key() == vault.risk_authority @ AegisError::UnauthorizedRiskAuthority
    )]
    pub risk_authority: Signer<'info>,

    /// The vault this request belongs to.
    #[account(mut)]
    pub vault: Account<'info, Vault>,

    /// The spend request being approved.
    #[account(
        mut,
        seeds = [
            b"spend_request",
            vault.key().as_ref(),
            spend_request.request_index.to_le_bytes().as_ref()
        ],
        bump = spend_request.bump,
    )]
    pub spend_request: Account<'info, SpendRequest>,
}
