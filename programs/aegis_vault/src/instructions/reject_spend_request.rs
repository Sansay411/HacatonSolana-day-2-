use anchor_lang::prelude::*;

use crate::errors::AegisError;
use crate::events::SpendRequestRejected;
use crate::state::{SpendRequest, SpendRequestStatus, Vault};

/// Risk authority rejects a spend request.
///
/// No payout is executed. The spend request status changes to Rejected
/// with the risk score recorded on-chain for auditability.
pub fn handler(ctx: Context<RejectSpendRequest>, risk_score: u8) -> Result<()> {
    require!(risk_score <= 100, AegisError::InvalidRiskScore);
    require!(
        ctx.accounts.spend_request.status == SpendRequestStatus::Pending,
        AegisError::RequestNotPending
    );

    let clock = Clock::get()?;

    let spend_request = &mut ctx.accounts.spend_request;
    spend_request.status = SpendRequestStatus::Rejected;
    spend_request.risk_score = risk_score;
    spend_request.resolved_at = clock.unix_timestamp;

    emit!(SpendRequestRejected {
        vault: ctx.accounts.vault.key(),
        spend_request: spend_request.key(),
        beneficiary: spend_request.beneficiary,
        amount: spend_request.amount,
        risk_score,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RejectSpendRequest<'info> {
    /// The risk authority (backend keypair) rejecting the request.
    #[account(
        constraint = risk_authority.key() == vault.risk_authority @ AegisError::InsufficientBalance
    )]
    pub risk_authority: Signer<'info>,

    /// The vault this request belongs to.
    pub vault: Account<'info, Vault>,

    /// The spend request to reject.
    #[account(
        mut,
        constraint = spend_request.vault == vault.key()
    )]
    pub spend_request: Account<'info, SpendRequest>,
}
