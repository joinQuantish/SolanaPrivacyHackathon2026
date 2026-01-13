//! Obsidian Relay - Encrypted MPC Instructions
//!
//! This module contains all MPC instructions that run inside Arcium's
//! Multi-party eXecution Environment (MXE). The relay CANNOT see any
//! of the values processed here - only the final revealed outputs.

use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;

    /// Batch statistics - simple counters
    pub struct BatchStats {
        /// Total USDC across all orders
        pub total_usdc: u64,
        /// Number of orders
        pub order_count: u8,
    }

    /// Single order data
    pub struct OrderData {
        /// USDC amount in atomic units
        pub usdc_amount: u64,
        /// Destination wallet low bits
        pub wallet_lo: u128,
        /// Destination wallet high bits
        pub wallet_hi: u128,
    }

    /// Initialize batch statistics.
    #[instruction]
    pub fn init_batch(mxe: Mxe) -> Enc<Mxe, BatchStats> {
        let stats = BatchStats {
            total_usdc: 0,
            order_count: 0,
        };
        mxe.from_arcis(stats)
    }

    /// Add an order's amount to the batch total.
    /// The individual order amount stays hidden - only the total is tracked.
    #[instruction]
    pub fn add_to_batch(
        usdc_amount: Enc<Shared, u64>,
        stats_ctxt: Enc<Mxe, BatchStats>,
    ) -> Enc<Mxe, BatchStats> {
        let amount = usdc_amount.to_arcis();
        let mut stats = stats_ctxt.to_arcis();

        stats.total_usdc = stats.total_usdc + amount;
        stats.order_count = stats.order_count + 1;

        stats_ctxt.owner.from_arcis(stats)
    }

    /// Reveal batch total for DFlow execution.
    /// This is the ONLY information revealed to the relay.
    #[instruction]
    pub fn reveal_batch_total(stats_ctxt: Enc<Mxe, BatchStats>) -> (u64, u8) {
        let stats = stats_ctxt.to_arcis();
        (stats.total_usdc.reveal(), stats.order_count.reveal())
    }

    /// Compute pro-rata share allocation for an order.
    /// order_amount is encrypted (relay can't see it).
    /// Returns revealed share amount and wallet.
    #[instruction]
    pub fn compute_distribution(
        order_amount: Enc<Shared, u64>,
        wallet_lo: Enc<Shared, u128>,
        wallet_hi: Enc<Shared, u128>,
        batch_total: u64,      // Plaintext - already revealed
        total_shares: u64,     // Plaintext - from DFlow execution
    ) -> (u64, u128, u128) {
        let amount = order_amount.to_arcis();
        let w_lo = wallet_lo.to_arcis();
        let w_hi = wallet_hi.to_arcis();

        // shares = (order_amount / batch_total) * total_shares
        let shares = if batch_total > 0 {
            ((amount as u128) * (total_shares as u128) / (batch_total as u128)) as u64
        } else {
            0u64
        };

        (shares.reveal(), w_lo.reveal(), w_hi.reveal())
    }

    /// Simple test - add two numbers in MPC
    #[instruction]
    pub fn test_add(a: Enc<Shared, u64>, b: u64) -> u64 {
        let a = a.to_arcis();
        (a + b).reveal()
    }

    /// Another test - multiply in MPC
    #[instruction]
    pub fn test_multiply(a: Enc<Shared, u64>, b: Enc<Shared, u64>) -> u64 {
        let a = a.to_arcis();
        let b = b.to_arcis();
        (a * b).reveal()
    }
}
