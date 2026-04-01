use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::AegisError;
use crate::events::VaultDeposited;
use crate::state::{Vault, VaultMode};

/// Deposits SOL into the vault.
///
/// Funder transfers lamports to the vault PDA. The vault PDA holds
/// the funds directly (native SOL, not SPL tokens for MVP simplicity).
pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, AegisError::ZeroDeposit);
    require!(
        ctx.accounts.vault.vault_mode != VaultMode::Closed,
        AegisError::VaultClosed
    );

    // Transfer SOL from funder to vault PDA
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.funder.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.total_deposited = vault
        .total_deposited
        .checked_add(amount)
        .ok_or(AegisError::ArithmeticOverflow)?;

    let clock = Clock::get()?;

    emit!(VaultDeposited {
        vault: vault.key(),
        funder: vault.funder,
        amount,
        total_deposited: vault.total_deposited,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    /// The funder depositing SOL.
    #[account(
        mut,
        constraint = funder.key() == vault.funder @ AegisError::InsufficientBalance
    )]
    pub funder: Signer<'info>,

    /// The vault receiving the deposit.
    #[account(mut)]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}
