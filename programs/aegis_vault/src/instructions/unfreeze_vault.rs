use anchor_lang::prelude::*;

use crate::errors::AegisError;
use crate::events::VaultUnfrozen;
use crate::state::{Vault, VaultMode};

/// Funder unfreezes a frozen vault, returning it to Active mode.
pub fn handler(ctx: Context<UnfreezeVault>) -> Result<()> {
    require!(
        ctx.accounts.vault.vault_mode == VaultMode::Frozen,
        AegisError::VaultNotFrozen
    );

    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.vault;
    vault.vault_mode = VaultMode::Active;

    emit!(VaultUnfrozen {
        vault: vault.key(),
        funder: ctx.accounts.funder.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UnfreezeVault<'info> {
    /// The funder unfreezing the vault.
    #[account(
        mut,
        constraint = funder.key() == vault.funder @ AegisError::UnauthorizedFunder
    )]
    pub funder: Signer<'info>,

    /// The vault to unfreeze.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
}
