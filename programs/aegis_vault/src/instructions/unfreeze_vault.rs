use anchor_lang::prelude::*;
use crate::errors::AegisError;
use crate::events::VaultUnfrozen;
use crate::state::{Vault, VaultMode};

pub fn handler(ctx: Context<UnfreezeVault>) -> Result<()> {
    require!(ctx.accounts.vault.vault_mode == VaultMode::Frozen, AegisError::VaultNotFrozen);
    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.vault;
    vault.vault_mode = VaultMode::Active;
    emit!(VaultUnfrozen { vault: vault.key(), funder: ctx.accounts.funder.key(), timestamp: clock.unix_timestamp });
    Ok(())
}

#[derive(Accounts)]
pub struct UnfreezeVault<'info> {
    #[account(mut, constraint = funder.key() == vault.funder @ AegisError::UnauthorizedFunder)]
    pub funder: Signer<'info>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
}
