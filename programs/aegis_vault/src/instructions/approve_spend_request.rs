use anchor_lang::prelude::*;

use crate::errors::AegisError;
use crate::events::SpendRequestApproved;
use crate::state::{Policy, SpendRequest, SpendRequestStatus, Vault, VaultMode};

/// Risk authority approves a spend request and executes payout.
///
/// CRITICAL: Even though risk authority signs this transaction, the program
/// independently enforces ALL policy checks:
/// 1. Vault must be Active
/// 2. Risk score must be ≤ policy threshold
/// 3. Amount must be ≤ per-transaction limit
/// 4. Total disbursed + amount must be ≤ total limit
/// 5. Cooldown period must have elapsed
/// 6. Vault must have sufficient balance
///
/// This ensures the backend CANNOT bypass on-chain policy.
pub fn handler(ctx: Context<ApproveSpendRequest>, risk_score: u8) -> Result<()> {
    require!(risk_score <= 100, AegisError::InvalidRiskScore);

    let vault = &ctx.accounts.vault;
    let policy = &ctx.accounts.policy;
    let spend_request = &ctx.accounts.spend_request;

    // === STATE CHECKS ===
    require!(
        vault.vault_mode == VaultMode::Active,
        AegisError::VaultNotActive
    );
    require!(
        spend_request.status == SpendRequestStatus::Pending,
        AegisError::RequestNotPending
    );

    // === POLICY ENFORCEMENT (on-chain, non-bypassable) ===

    // 1. Risk score check
    require!(
        risk_score <= policy.risk_threshold,
        AegisError::RiskScoreTooHigh
    );

    // 2. Per-transaction limit
    require!(
        spend_request.amount <= policy.per_tx_limit,
        AegisError::ExceedsPerTxLimit
    );

    // 3. Total limit (cumulative)
    let new_total_disbursed = vault
        .total_disbursed
        .checked_add(spend_request.amount)
        .ok_or(AegisError::ArithmeticOverflow)?;
    require!(
        new_total_disbursed <= policy.total_limit,
        AegisError::ExceedsTotalLimit
    );

    // 4. Cooldown enforcement
    let clock = Clock::get()?;
    if vault.last_payout_at > 0 {
        let elapsed = clock
            .unix_timestamp
            .checked_sub(vault.last_payout_at)
            .ok_or(AegisError::ArithmeticOverflow)?;
        require!(
            elapsed >= policy.cooldown_seconds,
            AegisError::CooldownNotElapsed
        );
    }

    // 5. Sufficient balance (vault lamports minus rent-exempt minimum)
    let vault_info = vault.to_account_info();
    let rent = Rent::get()?;
    let vault_data_len = vault_info.data_len();
    let rent_exempt_min = rent.minimum_balance(vault_data_len);
    let available_lamports = vault_info
        .lamports()
        .checked_sub(rent_exempt_min)
        .ok_or(AegisError::InsufficientBalance)?;
    require!(
        spend_request.amount <= available_lamports,
        AegisError::InsufficientBalance
    );

    // === EXECUTE TRANSFER ===
    // Transfer SOL from vault PDA to beneficiary.
    // Since vault is a PDA owned by our program, we can debit directly.
    let vault_account_info = vault.to_account_info();
    let beneficiary_account_info = ctx.accounts.beneficiary.to_account_info();

    **vault_account_info.try_borrow_mut_lamports()? = vault_account_info
        .lamports()
        .checked_sub(spend_request.amount)
        .ok_or(AegisError::ArithmeticOverflow)?;
    **beneficiary_account_info.try_borrow_mut_lamports()? = beneficiary_account_info
        .lamports()
        .checked_add(spend_request.amount)
        .ok_or(AegisError::ArithmeticOverflow)?;

    // === UPDATE STATE ===
    let vault = &mut ctx.accounts.vault;
    vault.total_disbursed = new_total_disbursed;
    vault.last_payout_at = clock.unix_timestamp;

    let spend_request = &mut ctx.accounts.spend_request;
    spend_request.status = SpendRequestStatus::Approved;
    spend_request.risk_score = risk_score;
    spend_request.resolved_at = clock.unix_timestamp;

    emit!(SpendRequestApproved {
        vault: vault.key(),
        spend_request: spend_request.key(),
        beneficiary: spend_request.beneficiary,
        amount: spend_request.amount,
        risk_score,
        total_disbursed: vault.total_disbursed,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ApproveSpendRequest<'info> {
    /// The risk authority (backend keypair) approving the request.
    #[account(
        constraint = risk_authority.key() == vault.risk_authority @ AegisError::InsufficientBalance
    )]
    pub risk_authority: Signer<'info>,

    /// The vault this request belongs to.
    #[account(mut)]
    pub vault: Account<'info, Vault>,

    /// The policy for this vault.
    #[account(
        constraint = policy.vault == vault.key()
    )]
    pub policy: Account<'info, Policy>,

    /// The spend request to approve.
    #[account(
        mut,
        constraint = spend_request.vault == vault.key()
    )]
    pub spend_request: Account<'info, SpendRequest>,

    /// The beneficiary receiving the payout.
    /// CHECK: Validated against spend_request.beneficiary
    #[account(
        mut,
        constraint = beneficiary.key() == spend_request.beneficiary
    )]
    pub beneficiary: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
