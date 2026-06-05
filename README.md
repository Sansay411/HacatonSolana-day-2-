# 🛡️ Aegis Funding Vault

<p align="center">
  <img src="./logo/Logo.png" alt="Aegis Vault Logo" width="120px" role="presentation"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"/>
  <img src="https://img.shields.io/badge/Solana-Anchor%200.32.1-purple.svg" alt="Solana Anchor"/>
  <img src="https://img.shields.io/badge/Language-TypeScript%20%7C%20Rust-orange.svg" alt="Languages"/>
</p>

---

### 🌐 Language / Язык
> **Looking for the Russian version of this documentation?**  
> 🇷🇺 [Читать документацию на русском языке](#-aegis-funding-vault-на-русском)

---

## 📝 Overview

**Aegis Funding Vault** is an open-source decentralized application (dApp) built on the Solana blockchain using the Anchor framework. It automates financial distributions (grants, scholarships, accelerator funding, or managed team payouts) based on programmable constraints and AI-driven validation guardrails rather than manual operations.

### Key Philosophy:
Money is never transferred instantly. The system processes the request, evaluates it using an AI agent combined with hardcoded backend rules, and only then executes the transaction on-chain.

### How It Works:
1. **Deposit:** A founder creates a vault and funds it with SOL.
2. **Request:** A recipient submits a spend request with a detailed description.
3. **AI Guardrail:** The backend analyzes the request via the Gemini API.
4. **Validation:** The backend passes the AI evaluation results through strict structural validation rules.
5. **On-Chain Settlement:** The verified decision is immutable and submitted directly to the Solana network (Approve/Reject).
6. **Fallback Mode:** A secure manual/hardware rule mode triggers automatically if the AI service becomes unavailable.

---

## 🛠 Repository Structure

| Directory | Technology | Description |
| :--- | :--- | :--- |
| `programs/aegis_vault` | **Rust / Anchor** | Smart contract storing vaults, rules, and tracking requests. |
| `packages/backend` | **Node.js / Express** | Handles Gemini API evaluations and execution routing. |
| `packages/frontend` | **TypeScript / React** | UI for wallet connection, vault creation, and decision history. |
| `packages/shared` | **TypeScript** | Universal types and configuration constants. |

---

## 🚀 Quick Start

### Prerequisites
* **Node.js** v18 or newer
* **Rust** & **Solana CLI**
* **Anchor CLI** v0.32.1

### 1. Installation
```bash
npm install
2. Smart Contract Compilation & Testing
Bash
anchor build
anchor test
3. Environment Setup
Copy the configuration templates in both backend and frontend folders:

Bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
⚠️ Important Variables to Fill:

Backend: GEMINI_API_KEY, SOLANA_RPC_URL, RISK_AUTHORITY_SECRET_KEY, PROGRAM_ID

Frontend: Firebase credentials (pre-configured defaults are included, replace if using a custom project).

4. Running the Application
Start Backend Server:

Bash
npm run dev:backend
Start Frontend Client:

Bash
npm run dev:frontend
Open http://localhost:5173/ to interact with the dApp.

🔍 Key Code Locations
Smart Contract Logic: programs/aegis_vault/src/lib.rs

AI Evaluation Module: packages/backend/src/ai/evaluateRequest.ts

Solana Event Listener: packages/backend/src/solana/listener.ts

Core UI Pages: packages/frontend/src/pages/

📄 License
Distributed under the Apache 2.0 License. See LICENSE for more information.
