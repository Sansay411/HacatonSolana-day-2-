use anchor_lang::prelude::*;

use crate::errors::AegisError;
use crate::events::VaultFrozen;
use crate::state::{Vault, VaultMode};

/// Funder freezes the vault — all spend requests will be rejected.
///
/// This is the emergency escape hatch. Funder can freeze at any time
/// regardless of backend status. This is a core guardrail.
pub fn handler(ctx: Context<FreezeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    require!(
        vault.vault_mode == VaultMode::Active,
        AegisError::VaultNotActive
    );

    vault.vault_mode = VaultMode::Frozen;

    let clock = Clock::get()?;
    emit!(VaultFrozen {
        vault: vault.key(),
        funder: vault.funder,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct FreezeVault<'info> {
    /// Only the funder can freeze.
    #[account(
        constraint = funder.key() == vault.funder @ AegisError::InsufficientBalance
    )]
    pub funder: Signer<'info>,

    /// The vault to freeze.
    #[account(mut)]
    pub vault: Account<'info, Vault>,
}
