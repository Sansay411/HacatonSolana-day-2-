use anchor_lang::prelude::*;

// ============================================================
// VAULT — core funding vault account
// ============================================================

#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// The funder who created this vault
    pub funder: Pubkey,
    /// The beneficiary who can submit spend requests
    pub beneficiary: Pubkey,
    /// Backend keypair authorized to approve/reject requests
    pub risk_authority: Pubkey,
    /// Current operating mode of the vault
    pub vault_mode: VaultMode,
    /// Total SOL ever deposited into this vault (lamports)
    pub total_deposited: u64,
    /// Total SOL ever disbursed from this vault (lamports)
    pub total_disbursed: u64,
    /// Unix timestamp of the last successful payout
    pub last_payout_at: i64,
    /// Sequential counter for deriving spend request PDAs
    pub request_count: u64,
    /// Unique identifier for PDA derivation
    pub vault_id: u64,
    /// Creation timestamp
    pub created_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl Vault {
    /// Returns the remaining balance available for disbursement (total_deposited - total_disbursed)
    pub fn available_balance(&self) -> u64 {
        self.total_deposited
            .checked_sub(self.total_disbursed)
            .unwrap_or(0)
    }
}

// ============================================================
// VAULT MODE — state machine for vault access control
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum VaultMode {
    /// Spend requests are processed normally
    Active,
    /// All spend requests are rejected; funder can unfreeze
    Frozen,
    /// Vault is closed; remaining funds returned to funder
    Closed,
}

// ============================================================
// POLICY — on-chain funding rules for a vault
// ============================================================

#[account]
#[derive(InitSpace)]
pub struct Policy {
    /// The vault this policy is associated with
    pub vault: Pubkey,
    /// Maximum amount (lamports) per single payout
    pub per_tx_limit: u64,
    /// Maximum total amount (lamports) that can ever be disbursed
    pub total_limit: u64,
    /// Minimum seconds between consecutive payouts
    pub cooldown_seconds: i64,
    /// Risk score threshold (0-100): requests above this are rejected
    pub risk_threshold: u8,
    /// PDA bump seed
    pub bump: u8,
}

// ============================================================
// SPEND REQUEST — beneficiary's request to access funds
// ============================================================

#[account]
#[derive(InitSpace)]
pub struct SpendRequest {
    /// The vault this request is against
    pub vault: Pubkey,
    /// The beneficiary who submitted this request
    pub beneficiary: Pubkey,
    /// Requested amount in lamports
    pub amount: u64,
    /// Current status
    pub status: SpendRequestStatus,
    /// SHA-256 hash of the description text (stored off-chain)
    pub description_hash: [u8; 32],
    /// Risk score assigned by the risk authority (0-100)
    pub risk_score: u8,
    /// Sequential index within the vault
    pub request_index: u64,
    /// Creation timestamp
    pub created_at: i64,
    /// Resolution timestamp (0 if unresolved)
    pub resolved_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

// ============================================================
// SPEND REQUEST STATUS
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum SpendRequestStatus {
    /// Submitted, awaiting risk evaluation
    Pending,
    /// Approved: risk check passed, payout executed
    Approved,
    /// Rejected: risk check failed or policy violation
    Rejected,
}
