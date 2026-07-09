use anchor_lang::prelude::*;

use crate::errors::AegisError;
use crate::events::VaultFrozen;
use crate::state::{Vault, VaultMode};

/// Funder freezes the vault, preventing new spend requests and disbursements.
pub fn handler(ctx: Context<FreezeVault>) -> Result<()> {
    require!(
        ctx.accounts.vault.vault_mode == VaultMode::Active,
        AegisError::VaultNotActive
    );

    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.vault;
    vault.vault_mode = VaultMode::Frozen;

    emit!(VaultFrozen {
        vault: vault.key(),
        funder: ctx.accounts.funder.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct FreezeVault<'info> {
    /// The funder freezing the vault.
    #[account(
        mut,
        constraint = funder.key() == vault.funder @ AegisError::UnauthorizedFunder
    )]
    pub funder: Signer<'info>,

    /// The vault to freeze.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
}
