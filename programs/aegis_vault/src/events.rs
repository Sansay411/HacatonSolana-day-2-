use anchor_lang::prelude::*;

// ============================================================
// ON-CHAIN EVENTS — audit trail for all state transitions
// Every mutation emits an event. No silent mutations.
// ============================================================

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub funder: Pubkey,
    pub beneficiary: Pubkey,
    pub vault_id: u64,
    pub total_limit: u64,
    pub per_tx_limit: u64,
    pub cooldown_seconds: i64,
    pub timestamp: i64,
}

#[event]
pub struct VaultDeposited {
    pub vault: Pubkey,
    pub funder: Pubkey,
    pub amount: u64,
    pub total_deposited: u64,
    pub timestamp: i64,
}

#[event]
pub struct SpendRequestCreated {
    pub vault: Pubkey,
    pub beneficiary: Pubkey,
    pub spend_request: Pubkey,
    pub amount: u64,
    pub request_index: u64,
    pub description_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct SpendRequestApproved {
    pub vault: Pubkey,
    pub spend_request: Pubkey,
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub risk_score: u8,
    pub total_disbursed: u64,
    pub timestamp: i64,
}

#[event]
pub struct SpendRequestRejected {
    pub vault: Pubkey,
    pub spend_request: Pubkey,
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub risk_score: u8,
    pub timestamp: i64,
}

#[event]
pub struct VaultFrozen {
    pub vault: Pubkey,
    pub funder: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaultUnfrozen {
    pub vault: Pubkey,
    pub funder: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaultClosedEvent {
    pub vault: Pubkey,
    pub funder: Pubkey,
    pub remaining_lamports: u64,
    pub timestamp: i64,
}
