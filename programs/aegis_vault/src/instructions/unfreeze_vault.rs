use anchor_lang::prelude::*;

use crate::errors::AegisError;
use crate::events::VaultUnfrozen;
use crate::state::{Vault, VaultMode};

/// Funder unfreezes the vault — normal operation resumes.
pub fn handler(ctx: Context<UnfreezeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    require!(
        vault.vault_mode == VaultMode::Frozen,
        AegisError::VaultNotFrozen
    );

    vault.vault_mode = VaultMode::Active;

    let clock = Clock::get()?;
    emit!(VaultUnfrozen {
        vault: vault.key(),
        funder: vault.funder,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UnfreezeVault<'info> {
    /// Only the funder can unfreeze.
    #[account(
        constraint = funder.key() == vault.funder @ AegisError::InsufficientBalance
    )]
    pub funder: Signer<'info>,

    /// The vault to unfreeze.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
}
