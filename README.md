# Quantish Prediction Privacy Relay

![Solana](https://img.shields.io/badge/Solana-black?style=flat&logo=solana&logoColor=14F195)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)
![Noir](https://img.shields.io/badge/Noir-5C2D91?style=flat&logo=aztec&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?style=flat&logo=rust&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)

> **Privacy-preserving prediction market relay with three independent privacy layers:**
> wallet unlinkability (Privacy Cash), verifiable execution (Noir ZK), and hidden order amounts (Arcium MPC).

Built for the **Solana Privacy Hackathon 2025**

---

## Sponsor Integrations

![Privacy Cash](https://img.shields.io/badge/Privacy_Cash-00D395?style=for-the-badge)
![Arcium](https://img.shields.io/badge/Arcium_MPC-FF6B35?style=for-the-badge)
![Noir](https://img.shields.io/badge/Noir_by_Aztec-5C2D91?style=for-the-badge)
![Helius](https://img.shields.io/badge/Helius_RPC-E84142?style=for-the-badge)

---

## Three Privacy Layers

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                                                                │
│   PRIVACY CASH         │       zkNOIR           │       ARCIUM MPC            │
│   ZK Mixing Pool       │    Proof Verification  │      Blind Relay            │
│                        │                        │                              │
│   Breaks wallet        │   Verifies correct     │   Relay cannot see          │
│   linkability          │   share distribution   │   order amounts             │
│                        │                        │                              │
│   When: Deposit &      │   When: After batch    │   When: Order               │
│         Withdrawal     │         executes       │         submission          │
│                        │                        │                              │
│   Tech: ZK shielded    │   Tech: Noir circuit   │   Tech: x25519 ECDH +       │
│         pool proofs    │   + UltraHonk prover   │   Rescue cipher + MPC       │
│                        │                        │                              │
└────────────────────────────────────────────────────────────────────────────────┘
```

These are **separate but complementary** technologies:
- **Privacy Cash** protects your identity (wallet unlinkability)
- **zkNoir** ensures honest execution (verifiable distribution)
- **Arcium MPC** hides your strategy (encrypted order amounts)

---

## How Each Technology Is Used

### Privacy Cash - Wallet Unlinkability
**What it does:** Breaks on-chain wallet linkability using ZK shielded pool

**Where:** `src/services/privacy-cash.ts`, `frontend/src/lib/privacy-deposit.ts`

**Flow:**
1. User deposits USDC to ephemeral wallet #1
2. Ephemeral wallet deposits to Privacy Pool (shielded)
3. ZK proof allows withdrawal to ephemeral wallet #2 (unlinkable!)
4. Ephemeral wallet #2 sends to relay with order memo

**Result:** No on-chain link between user wallet and relay deposit

### Noir (Aztec) - ZK Batch Verification
**What it does:** Generates ZK proofs that relay distributed shares correctly

**Where:** `circuits/batch_verifier/src/main.nr`, `src/services/prover.ts`

**Circuit proves:**
- Commitment hashes match via Poseidon hash
- Merkle inclusion of all orders in batch
- Proportional share distribution (`shares_i * total_usdc == usdc_i * total_shares`)
- Market and side match batch parameters

**Tech:** Noir v1.0.0-beta.18, UltraHonk prover, Poseidon hashing

### Arcium MPC - Hidden Order Amounts
**What it does:** Encrypts order amounts so relay cannot see individual values

**Where:** `src/services/arcium-mpc.ts`, `frontend/src/utils/arcium-encrypt.ts`, `arcium-relay/programs/`

**On-chain program:** 4 computation definitions registered for MPC operations

**Encryption:** x25519 ECDH key exchange + Rescue cipher

**Flow:**
1. Client encrypts order with MXE public key
2. Relay stores encrypted blob (cannot decrypt)
3. MPC nodes compute batch totals privately
4. Only totals revealed to relay for execution

### Helius RPC - High-Performance Infrastructure
**What it does:** Provides reliable, high-performance Solana RPC connectivity

**Where:** Environment variable `SOLANA_RPC_URL`

**Why:** Best-in-class RPC with enhanced reliability, speed, and uptime for mainnet transactions

### Quantish MCP - Prediction Market Trading
**What it does:** Enables easy wallet creation and prediction market trading on Kalshi/DFlow

**Where:** `src/services/dflow.ts`, `src/services/mcp-wallet.ts`

**Features:**
- Create ephemeral wallets for privacy
- Execute trades on Kalshi/DFlow markets
- Fetch market data, quotes, and live pricing
- Distribute outcome tokens after execution

---

## Deployed Addresses

| Component | Address | Network | Explorer |
|-----------|---------|---------|----------|
| MPC Program | `8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc` | Devnet | [Solscan](https://solscan.io/account/8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc?cluster=devnet) |
| MXE Account | `2EYXHVLZGSTGmPN3VFdHb6DroZBfpir6mgYZuFvpxfJG` | Devnet | [Solscan](https://solscan.io/account/2EYXHVLZGSTGmPN3VFdHb6DroZBfpir6mgYZuFvpxfJG?cluster=devnet) |
| Arcium Program | `F3G6Q9tRicyznCqcZLydJ6RxkwDSBeHWM458J7V6aeyk` | Devnet | System |
| Privacy Pool | `AfTSjfnT7M88XipRjPGLgDCcqcVfnrePrtuvNBF74hhP` | Devnet | [Solscan](https://solscan.io/account/AfTSjfnT7M88XipRjPGLgDCcqcVfnrePrtuvNBF74hhP?cluster=devnet) |
| Relay Wallet | `9mNa6ScZtenajirheMFSZLUkAQtbBA7r1MNB8SahiveS` | Mainnet | [Solscan](https://solscan.io/account/9mNa6ScZtenajirheMFSZLUkAQtbBA7r1MNB8SahiveS) |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/joinQuantish/SolanaPrivacyHackathon2025.git
cd SolanaPrivacyHackathon2025

# Copy environment files
cp .env.example .env
cp frontend/.env.example frontend/.env

# Add your API keys to .env files (see Environment Variables section)

# Install dependencies
npm install
cd frontend && npm install && cd ..

# Start backend server
npm run dev

# In another terminal, start frontend
cd frontend && npm run dev
```

Backend runs on `http://localhost:3001`, frontend on `http://localhost:5173`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
│  ┌─────────────────────────────┬────────────────────────────────────────┐  │
│  │     Tab 1: Mainnet Demo     │        Tab 2: Devnet Demo              │  │
│  │  • Privacy Mode toggle      │  • MPC Status display                  │  │
│  │  • Market search & buy      │  • Encrypted order form                │  │
│  │  • Proof verification UI    │  • Ciphertext preview                  │  │
│  └─────────────────────────────┴────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             RELAY SERVER                                     │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐   │
│  │   Privacy Cash      │ │    Batch Service    │ │    Arcium MPC       │   │
│  │   Integration       │ │    + Proof Gen      │ │    Service          │   │
│  │                     │ │                     │ │                     │   │
│  │ • Shielded pool     │ │ • Order batching    │ │ • Encrypt orders    │   │
│  │ • ZK proofs         │ │ • DFlow execution   │ │ • Blind computation │   │
│  │ • Ephemeral wallets │ │ • Noir proving      │ │ • Reveal totals     │   │
│  └─────────────────────┘ └─────────────────────┘ └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
            │ Privacy Cash │ │   DFlow/     │ │  Arcium Network  │
            │   Contract   │ │   Kalshi     │ │   (Cluster 1)    │
            └──────────────┘ └──────────────┘ └──────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React, Vite, Zustand, TailwindCSS | User interface |
| Backend | Node.js, Express, TypeScript | Relay service |
| Blockchain | Solana, Anchor | On-chain programs |
| Privacy Layer 1 | Privacy Cash SDK | Wallet unlinkability |
| Privacy Layer 2 | Noir, UltraHonk | ZK proof verification |
| Privacy Layer 3 | Arcium MPC, x25519, Rescue | Hidden order amounts |
| Markets | Kalshi/DFlow, Quantish MCP | Prediction market execution |
| Infrastructure | Helius RPC | High-performance Solana access |

---

## Project Structure

```
quantish-privacy-relay/
├── src/                      # Backend relay service
│   ├── routes/               # API routes
│   ├── services/             # Business logic
│   │   ├── batch.ts          # Order batching
│   │   ├── prover.ts         # Noir proof generation
│   │   ├── arcium-mpc.ts     # MPC integration
│   │   ├── dflow.ts          # DFlow/Kalshi execution
│   │   └── privacy-cash.ts   # Privacy Cash
│   └── types/                # TypeScript types
│
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── components/       # UI components
│   │   │   ├── arcium/       # Arcium MPC demo
│   │   │   ├── common/       # Shared components
│   │   │   └── market/       # Market UI
│   │   ├── api/              # API services
│   │   ├── store/            # Zustand stores
│   │   └── utils/            # Utilities
│   │       └── arcium-encrypt.ts  # Client-side encryption
│   └── ...
│
├── arcium-relay/             # Arcium MPC program (Anchor)
│   ├── programs/             # Rust program
│   ├── circuits/             # MPC circuits
│   └── scripts/              # Deployment scripts
│
└── circuits/                 # Noir ZK circuits
    └── batch_verifier/
```

---

## API Reference

### Relay Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/relay/status` | Relay service status |
| GET | `/relay/mpc/status` | Arcium MPC integration status |
| POST | `/relay/order` | Submit a standard order |
| POST | `/relay/order/encrypted` | Submit an encrypted order (MPC) |
| GET | `/relay/order/:id` | Get order status |
| GET | `/relay/batch/:id` | Get batch status |
| GET | `/relay/batch/:id/proof` | Get zkNoir proof status |
| POST | `/relay/batch/:id/execute` | Execute a batch |

### Proof Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/prove` | Generate a zkNoir proof |
| POST | `/verify` | Verify a zkNoir proof |

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# SECRETS (required)
MCP_API_KEY=pk_kalshi_YOUR_KEY      # Quantish MCP API key
HELIUS_API_KEY=your-key              # Helius RPC API key (optional)

# PUBLIC CONFIG
PORT=3001
ARCIUM_MPC_ENABLED=true
ARCIUM_CLUSTER_OFFSET=1
SOLANA_RPC_URL_DEVNET=https://api.devnet.solana.com
MPC_PROGRAM_ID=8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc
MXE_ACCOUNT_ADDRESS=2EYXHVLZGSTGmPN3VFdHb6DroZBfpir6mgYZuFvpxfJG
PRIVACY_POOL_PROGRAM_ID=AfTSjfnT7M88XipRjPGLgDCcqcVfnrePrtuvNBF74hhP
```

See `.env.example` for full configuration options.

---

## Demo

The application has two demo tabs:

### Tab 1: Live Demo (Mainnet)
- Privacy Cash integration for wallet unlinkability
- Real DFlow/Kalshi market execution
- zkNoir proof verification after batch execution
- Actual shares delivered to your privacy wallets

### Tab 2: Arcium MPC (Devnet)
- Encrypted order submission demonstration
- Shows encrypted data vs plaintext data
- Real Arcium MPC computation on devnet
- Proves relay cannot see your order amounts

---

## Demo Script (3 minutes)

### [0:00-1:00] Privacy Cash (Mainnet Tab)
1. Connect Phantom wallet
2. Search for a market
3. Enable "Privacy Mode" toggle
4. Submit order - "No on-chain link between wallet and position"
5. Show transaction on Solscan

### [1:00-2:00] zkNoir Proof (Mainnet Tab)
1. Show batch executing
2. Watch proof status update
3. See "Verified: YES" with proof hash
4. Explain: "Noir proves correct distribution"

### [2:00-2:45] Arcium MPC (Devnet Tab)
1. Switch to "Arcium MPC (Devnet)" tab
2. Show MPC status: Cluster 1 ready
3. Enter order amount
4. Click "Preview Encrypted Data"
5. Show what relay CAN see vs CANNOT see
6. Submit encrypted order
7. "The relay literally cannot see your order amount"

### [2:45-3:00] Recap
- Three SEPARATE but COMPLEMENTARY privacy layers
- All deployed and working
- Open source on GitHub

---

## Development

### Backend
```bash
npm run dev          # Start with hot reload
npm run build        # Build for production
npm run test         # Run tests
```

### Frontend
```bash
cd frontend
npm run dev          # Start dev server
npm run build        # Build for production
```

### Arcium Program
```bash
cd arcium-relay
anchor build         # Build program
anchor deploy        # Deploy to devnet
npm run init-mxe     # Initialize MXE account
npm run init-compdefs # Register computation definitions
```

---

## License

MIT

---

Built for the **Solana Privacy Hackathon 2025**
