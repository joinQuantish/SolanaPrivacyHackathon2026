# Obsidian Relay - Private Prediction Markets

A privacy-preserving prediction market relay integrating **three independent privacy layers** for the Solana Privacy Hackathon.

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

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-repo/obsidian-relay

# Install dependencies
cd obsidian-relay
npm install
cd frontend && npm install && cd ..

# Start backend server
npm run dev

# In another terminal, start frontend
cd frontend && npm run dev
```

Backend runs on `http://localhost:3000`, frontend on `http://localhost:5173`.

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

## Deployed Addresses (Devnet)

| Component | Address |
|-----------|---------|
| Arcium Program | `8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc` |
| MXE Account | `2EYXHVLZGSTGmPN3VFdHb6DroZBfpir6mgYZuFvpxfJG` |
| Cluster | 1 (Node 0 active) |
| Arcium Program ID | `F3G6Q9tRicyznCqcZLydJ6RxkwDSBeHWM458J7V6aeyk` |

View on Solscan: [Program](https://solscan.io/account/8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc?cluster=devnet) | [MXE Account](https://solscan.io/account/2EYXHVLZGSTGmPN3VFdHb6DroZBfpir6mgYZuFvpxfJG?cluster=devnet)

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

## Project Structure

```
obsidian-relay/
├── src/                      # Backend relay service
│   ├── routes/               # API routes
│   ├── services/             # Business logic
│   │   ├── batch.ts          # Order batching
│   │   ├── prover.ts         # Noir proof generation
│   │   ├── arcium-mpc.ts     # MPC integration
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
```

## Technology Details

### Privacy Cash
- Zero-knowledge shielded pool for breaking wallet linkability
- Ephemeral wallets created for each transaction
- Poseidon hash-based commitment scheme
- ~0.35% fee + SOL for transaction costs

### zkNoir
- Noir circuits for proving correct share distribution
- UltraHonk proving backend
- Verifies each participant received proportional shares
- Proof generated after every batch execution

### Arcium MPC
- x25519 ECDH key exchange for encryption
- Rescue cipher (XOR demonstration mode)
- Multi-party computation in Arcium MXE nodes
- Only batch totals revealed; individual amounts hidden

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

## Environment Variables

```env
# Backend
PORT=3000
SOLANA_RPC_URL=https://api.devnet.solana.com
ARCIUM_MPC_ENABLED=true

# Arcium Configuration
OBSIDIAN_MPC_PROGRAM_ID=8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc
ARCIUM_CLUSTER_OFFSET=1
MXE_ACCOUNT_ADDRESS=2EYXHVLZGSTGmPN3VFdHb6DroZBfpir6mgYZuFvpxfJG
```

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

## License

MIT

---

Built for the Solana Privacy Hackathon 2025
