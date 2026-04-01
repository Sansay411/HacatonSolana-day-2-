use anchor_lang::prelude::*;

/// Custom error codes for the Aegis Vault program.
/// Each error maps to a specific invariant violation.
#[error_code]
pub enum AegisError {
    // === Policy Violations ===

    #[msg("Requested amount exceeds the per-transaction limit")]
    ExceedsPerTxLimit,

    #[msg("Disbursement would exceed the total vault limit")]
    ExceedsTotalLimit,

    #[msg("Cooldown period has not elapsed since last payout")]
    CooldownNotElapsed,

    #[msg("Risk score exceeds the policy threshold")]
    RiskScoreTooHigh,

    // === State Violations ===

    #[msg("Vault is not in Active mode")]
    VaultNotActive,

    #[msg("Vault is not in Frozen mode")]
    VaultNotFrozen,

    #[msg("Vault is already closed")]
    VaultClosed,

    #[msg("Spend request is not in Pending status")]
    RequestNotPending,

    // === Arithmetic ===

    #[msg("Arithmetic overflow detected")]
    ArithmeticOverflow,

    // === Authorization ===

    #[msg("Insufficient vault balance for this operation")]
    InsufficientBalance,

    #[msg("Deposit amount must be greater than zero")]
    ZeroDeposit,

    #[msg("Request amount must be greater than zero")]
    ZeroRequestAmount,

    #[msg("Risk score must be between 0 and 100")]
    InvalidRiskScore,
}
