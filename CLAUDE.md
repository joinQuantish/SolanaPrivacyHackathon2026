# Project Rules for Claude

## STRICT RULES - NO EXCEPTIONS

**ZERO FALLBACKS. ZERO MOCK DATA.**

- Every API call must hit real Arcium devnet/mainnet
- Every MPC computation must run on real MXE nodes
- Every transaction must be real Solana devnet transactions
- If something doesn't work, we fix it - we don't mock it
- No "demo mode" or "offline mode"
- No placeholder data or fake responses
- No fallback implementations

This rule applies to:
- MPC computations (must use real Arcium MXE)
- Encryption (must use real x25519 + Rescue cipher)
- Solana transactions (must be real devnet txs)
- DFlow/Kalshi API calls (must be real)

## Project Overview

This is the Obsidian Relay - a privacy-preserving prediction market relay integrating:
- Arcium MPC for blind order processing
- Noir ZK proofs for batch verification
- DFlow/Kalshi for market execution

## Architecture

### Current Flow (Being Enhanced)
- Users submit orders to relay
- Relay batches orders and executes on DFlow
- Noir proof verifies correct distribution

### Target Flow (With Arcium MPC)
- Users encrypt orders client-side
- Relay stores encrypted orders (cannot see amounts)
- MPC computes totals and allocations (hidden from relay)
- Relay blindly executes based on MPC instructions
- On-chain MPC attestation provides trustless verification

## Key Directories

- `src/` - Backend relay service (TypeScript/Express)
- `frontend/` - React frontend with Phantom wallet
- `circuits/` - Noir ZK circuits
- `arcium-relay/` - Arcium MPC program (Rust/Anchor)

## Tech Stack

- Backend: Node.js, Express, TypeScript
- Frontend: React, Vite, Zustand
- Blockchain: Solana, Anchor, Arcium
- Cryptography: Noir, Poseidon, x25519, Rescue cipher
