use anchor_lang::prelude::*;

use crate::errors::AegisError;
use crate::events::VaultClosedEvent;
use crate::state::{Vault, VaultMode};

/// Funder closes the vault — remaining funds returned to funder.
///
/// This is a terminal state. After closing, no more deposits or
/// spend requests can be made. Any remaining SOL (above rent-exempt)
/// is transferred back to the funder.
pub fn handler(ctx: Context<CloseVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    require!(
        vault.vault_mode != VaultMode::Closed,
        AegisError::VaultClosed
    );

    let clock = Clock::get()?;

    // Calculate remaining lamports above rent-exempt minimum
    let vault_info = vault.to_account_info();
    let rent = Rent::get()?;
    let rent_exempt_min = rent.minimum_balance(vault_info.data_len());
    let remaining = vault_info
        .lamports()
        .checked_sub(rent_exempt_min)
        .unwrap_or(0);

    // Transfer remaining SOL back to funder
    if remaining > 0 {
        let funder_info = ctx.accounts.funder.to_account_info();
        **vault_info.try_borrow_mut_lamports()? = vault_info
            .lamports()
            .checked_sub(remaining)
            .ok_or(AegisError::ArithmeticOverflow)?;
        **funder_info.try_borrow_mut_lamports()? = funder_info
            .lamports()
            .checked_add(remaining)
            .ok_or(AegisError::ArithmeticOverflow)?;
    }

    vault.vault_mode = VaultMode::Closed;

    emit!(VaultClosedEvent {
        vault: vault.key(),
        funder: vault.funder,
        remaining_lamports: remaining,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct CloseVault<'info> {
    /// Only the funder can close the vault.
    #[account(
        mut,
        constraint = funder.key() == vault.funder @ AegisError::InsufficientBalance
    )]
    pub funder: Signer<'info>,

    /// The vault to close. Remaining funds go back to the funder.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
}
