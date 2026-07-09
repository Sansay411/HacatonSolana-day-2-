use anchor_lang::prelude::*;
use crate::errors::AegisError;
use crate::events::VaultClosed;
use crate::state::{Vault, VaultMode};

pub fn handler(ctx: Context<CloseVault>) -> Result<()> {
    require!(ctx.accounts.vault.vault_mode == VaultMode::Frozen, AegisError::VaultNotFrozen);
    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.vault;
    vault.vault_mode = VaultMode::Closed;
    let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
    let rent_exempt = Rent::get()?.minimum_balance(Vault::INIT_SPACE + 8);
    if vault_lamports > rent_exempt {
        let transfer_amount = vault_lamports - rent_exempt;
        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= transfer_amount;
        **ctx.accounts.funder.to_account_info().try_borrow_mut_lamports()? += transfer_amount;
    }
    emit!(VaultClosed { vault: vault.key(), funder: ctx.accounts.funder.key(), timestamp: clock.unix_timestamp });
    Ok(())
}

#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(mut, constraint = funder.key() == vault.funder @ AegisError::UnauthorizedFunder)]
    pub funder: Signer<'info>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
}
