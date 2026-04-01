# Aegis Funding Vault

> **Programmable, policy-enforced funding vaults on Solana where capital stays program-controlled and access adapts to risk.**

## What is this?

Aegis is a programmable funding layer on Solana. Funders deposit capital into program-owned vaults, and beneficiaries access funds through spend requests controlled by on-chain policy and risk scoring.

**Not a dashboard. Not an escrow. A funding state machine.**

## Architecture

```
┌────────────────────────────────────────┐
│              FRONTEND                  │
│  React + Vite + Solana Wallet Adapter  │
│  Funder Dashboard | Beneficiary View   │
└──────────────┬────────────┬────────────┘
               │            │
               │  REST API  │  Direct RPC
               │            │
┌──────────────▼──────┐  ┌──▼─────────────┐
│      BACKEND        │  │  SOLANA PROGRAM │
│  Express + SQLite   │  │  Anchor / Rust  │
│  Risk Engine        │──│                 │
│  Event Listener     │  │  Vault PDA      │
│  TX Builder         │  │  Policy PDA     │
└─────────────────────┘  │  SpendReq PDA   │
                         └─────────────────┘
```

## Quick Start

### Prerequisites

- **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Solana CLI**: `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`
- **Anchor CLI**: `cargo install --git https://github.com/coral-xyz/anchor avm --force && avm install 0.32.1 && avm use 0.32.1`
- **Node.js**: v18+

### Setup

```bash
# Clone and install
cd aegis-funding-vault
npm install

# Build Solana program
anchor build

# Program ID is already aligned with target/deploy/aegis_vault-keypair.json
# Rebuild after any on-chain code change:
anchor build

# Run tests (starts local validator)
anchor test

# Start backend
cp packages/backend/.env.example packages/backend/.env
# Edit .env with your risk authority keypair
npm run dev:backend

# Start frontend (in another terminal)
npm run dev:frontend
```

### Devnet Deployment

```bash
# Configure Solana CLI for devnet
solana config set --url devnet

# Airdrop for deployment
solana airdrop 5

# Deploy
anchor deploy --provider.cluster devnet
```

## Project Structure

```
├── programs/aegis_vault/src/     # On-chain Anchor program
│   ├── lib.rs                    # Program entrypoint
│   ├── instructions/             # 8 instruction handlers
│   ├── state/                    # Vault, Policy, SpendRequest
│   ├── errors.rs                 # Custom error codes
│   └── events.rs                 # Audit trail events
├── packages/
│   ├── shared/src/               # Shared types, PDA helpers, constants
│   ├── backend/src/              # Express server, risk engine, Solana client
│   └── frontend/src/             # React + Vite dashboard
└── tests/                        # Anchor integration tests
```

## Trust Model

| Layer | Role |
|-------|------|
| **Solana Program** | Enforces policy rules unconditionally |
| **Backend (Risk Authority)** | Recommends approve/reject, signs txs |
| **Funder** | Emergency control (freeze/close) |
| **Beneficiary** | Can request, cannot extract directly |

**Key invariant**: Even if the backend is compromised, on-chain policy enforcement prevents any payout that violates limits, cooldowns, or risk thresholds.

## License

MIT
