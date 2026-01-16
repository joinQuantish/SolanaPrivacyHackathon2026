# Obsidian Relay + Arcium MPC Deployment Guide

## Hackathon Submission: Solana Privacy Hackathon - Arcium Track

### What We Built
A **blind prediction market relay** where the operator CANNOT see individual order amounts.
Orders are encrypted client-side using Arcium's x25519 + Rescue cipher, and only MPC nodes can decrypt them.

### Privacy Guarantees
- **Relay sees:** Market ID, side (YES/NO), encrypted ciphertext
- **Relay CANNOT see:** USDC amounts, distribution plans, salts
- **Only revealed:** Batch total (for DFlow execution)

## Deployment Configuration

### Environment Variables (Required for Railway)

```bash
# Kalshi/DFlow API
MCP_API_KEY=pk_kalshi_xxxx

# Arcium MPC Configuration
ARCIUM_MPC_ENABLED=true
ARCIUM_CLUSTER_OFFSET=123
SOLANA_RPC_URL=https://api.devnet.solana.com
OBSIDIAN_MPC_PROGRAM_ID=B5sAU4NDJPFVTE9mfKyzow7vXfpZR9vdpzKdfAie3QWd
MXE_ACCOUNT_ADDRESS=CUx5EJ6PtgWTHfiqmYbMgeDepaiqj1xu3Y2C6Q11Nqkb

# Relay Wallet (for signing Solana transactions)
RELAY_WALLET_PRIVATE_KEY=<base58 encoded private key>
```

### Railway Deployment Steps

1. **Connect to Railway:**
   ```bash
   railway login
   railway init
   ```

2. **Set environment variables:**
   ```bash
   railway variables set MCP_API_KEY=pk_kalshi_xxxx
   railway variables set ARCIUM_MPC_ENABLED=true
   railway variables set ARCIUM_CLUSTER_OFFSET=123
   railway variables set SOLANA_RPC_URL=https://api.devnet.solana.com
   railway variables set OBSIDIAN_MPC_PROGRAM_ID=B5sAU4NDJPFVTE9mfKyzow7vXfpZR9vdpzKdfAie3QWd
   railway variables set MXE_ACCOUNT_ADDRESS=CUx5EJ6PtgWTHfiqmYbMgeDepaiqj1xu3Y2C6Q11Nqkb
   ```

3. **Deploy:**
   ```bash
   railway up
   ```

### Local Development

```bash
npm install
npm run dev
```

## Arcium Integration Details

### Solana Programs (Devnet)

| Program | Address |
|---------|---------|
| Obsidian MPC Program | `B5sAU4NDJPFVTE9mfKyzow7vXfpZR9vdpzKdfAie3QWd` |
| Arcium Program | `F3G6Q9tRicyznCqcZLydJ6RxkwDSBeHWM458J7V6aeyk` |
| MXE Account | `CUx5EJ6PtgWTHfiqmYbMgeDepaiqj1xu3Y2C6Q11Nqkb` |

### MPC Computation Definitions

| Circuit | Offset | PDA |
|---------|--------|-----|
| init_batch | 3167146940 | HcF78B6k1xKpeGbJ4ec1gtYd8WwHor47ConXEy3cJ8iB |
| add_to_batch | 448552201 | ATH9uoxHikGiFSMa13dpkkpoJjT5aq6aACJWRsCStFyr |
| reveal_batch_total | 1072107248 | FhtdfFsXPjfrTLiNgu3sSsRgHphHRanSPHmc5jwnkrKm |
| compute_distribution | 623176224 | J3uC4D1xxX49ieNdq3EvphsCJY7htPVjZCfn5dVV9ygo |

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /relay/mpc/status` | Check MPC integration status |
| `POST /relay/order/encrypted` | Submit encrypted order |
| `GET /relay/order/:id` | Get order status |
| `GET /health` | Health check |

## Demo

1. **Submit encrypted order:**
   ```bash
   curl -X POST http://localhost:3000/relay/order/encrypted \
     -H "Content-Type: application/json" \
     -d '{
       "marketId": "KXSB-26-BUF",
       "side": "YES",
       "encryptedData": {
         "ciphertext": "<base64 encrypted data>",
         "publicKey": "<32 byte hex>",
         "nonce": "<base64 nonce>"
       }
     }'
   ```

2. **Check MPC status:**
   ```bash
   curl http://localhost:3000/relay/mpc/status | jq .
   ```

## Architecture

```
User (Browser) → Encrypt Order → Relay (Blind) → MPC Network → Reveal Total → DFlow → Distribute
                                    ↓
                            Cannot see amounts
```

The relay batches orders and triggers MPC computations, but NEVER sees the actual USDC amounts.
Only the batch total is revealed for execution.
