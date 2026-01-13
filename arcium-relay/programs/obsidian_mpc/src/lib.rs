//! Obsidian MPC Program
//!
//! Simplified Anchor program for blind batch execution.
//! Coordinates with Arcium MPC to process orders privately.

use anchor_lang::prelude::*;

declare_id!("9Ywdn11qyk6eJz1XJSyPLWkiTFxpdqAxbcftS2PgvTpM");

/// Size of encrypted batch stats (2 field elements)
pub const ENCRYPTED_STATS_SIZE: usize = 2 * 32;

#[program]
pub mod obsidian_mpc {
    use super::*;

    /// Initialize a new batch.
    pub fn create_batch(
        ctx: Context<CreateBatch>,
        market_id: String,
        side: u8,
    ) -> Result<()> {
        let batch = &mut ctx.accounts.batch;
        let clock = Clock::get()?;

        batch.authority = ctx.accounts.authority.key();
        batch.market_id = market_id.clone();
        batch.side = side;
        batch.status = BatchStatus::Open;
        batch.order_count = 0;
        batch.total_usdc = 0;
        batch.total_shares = 0;
        batch.created_at = clock.unix_timestamp;

        emit!(BatchCreated {
            batch: batch.key(),
            market_id,
            side,
        });

        Ok(())
    }

    /// Record that an order was submitted.
    /// The actual amount is hidden in the MPC.
    pub fn record_order(ctx: Context<RecordOrder>) -> Result<()> {
        let batch = &mut ctx.accounts.batch;

        require!(batch.status == BatchStatus::Open, ErrorCode::BatchNotOpen);

        batch.order_count += 1;

        emit!(OrderRecorded {
            batch: batch.key(),
            order_count: batch.order_count,
        });

        Ok(())
    }

    /// Close the batch and record the revealed total from MPC.
    pub fn close_batch(
        ctx: Context<CloseBatch>,
        revealed_total: u64,
        revealed_count: u8,
    ) -> Result<()> {
        let batch = &mut ctx.accounts.batch;

        require!(batch.status == BatchStatus::Open, ErrorCode::BatchNotOpen);
        require!(batch.order_count > 0, ErrorCode::BatchEmpty);

        batch.status = BatchStatus::Closed;
        batch.total_usdc = revealed_total;

        // Verify count matches
        require!(
            revealed_count == batch.order_count,
            ErrorCode::CountMismatch
        );

        emit!(BatchClosed {
            batch: batch.key(),
            total_usdc: revealed_total,
            order_count: revealed_count,
        });

        Ok(())
    }

    /// Record execution result from DFlow.
    pub fn record_execution(
        ctx: Context<RecordExecution>,
        total_shares: u64,
        tx_signature: String,
    ) -> Result<()> {
        let batch = &mut ctx.accounts.batch;

        require!(
            batch.status == BatchStatus::Closed,
            ErrorCode::BatchNotClosed
        );

        batch.status = BatchStatus::Executed;
        batch.total_shares = total_shares;

        emit!(ExecutionRecorded {
            batch: batch.key(),
            total_shares,
            tx_signature,
        });

        Ok(())
    }

    /// Record a distribution (revealed from MPC).
    pub fn record_distribution(
        ctx: Context<RecordDistribution>,
        order_index: u8,
        shares: u64,
        wallet: Pubkey,
    ) -> Result<()> {
        let batch = &mut ctx.accounts.batch;
        let dist = &mut ctx.accounts.distribution;

        require!(
            batch.status == BatchStatus::Executed || batch.status == BatchStatus::Distributing,
            ErrorCode::BatchNotExecuted
        );

        if batch.status == BatchStatus::Executed {
            batch.status = BatchStatus::Distributing;
        }

        dist.batch = batch.key();
        dist.order_index = order_index;
        dist.shares = shares;
        dist.wallet = wallet;
        dist.executed = false;

        emit!(DistributionRecorded {
            batch: batch.key(),
            order_index,
            shares,
            wallet,
        });

        Ok(())
    }

    /// Mark distribution as executed.
    pub fn mark_distributed(
        ctx: Context<MarkDistributed>,
        tx_signature: String,
    ) -> Result<()> {
        let batch = &mut ctx.accounts.batch;
        let dist = &mut ctx.accounts.distribution;

        require!(!dist.executed, ErrorCode::AlreadyDistributed);

        dist.executed = true;
        batch.distributions_completed += 1;

        if batch.distributions_completed == batch.order_count {
            batch.status = BatchStatus::Completed;
        }

        emit!(DistributionExecuted {
            batch: batch.key(),
            order_index: dist.order_index,
            tx_signature,
        });

        Ok(())
    }
}

// ============================================================================
// Accounts
// ============================================================================

#[account]
pub struct Batch {
    pub authority: Pubkey,
    pub market_id: String,
    pub side: u8,
    pub status: BatchStatus,
    pub order_count: u8,
    pub total_usdc: u64,
    pub total_shares: u64,
    pub created_at: i64,
    pub distributions_completed: u8,
}

#[account]
pub struct Distribution {
    pub batch: Pubkey,
    pub order_index: u8,
    pub shares: u64,
    pub wallet: Pubkey,
    pub executed: bool,
}

// ============================================================================
// Enums
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum BatchStatus {
    Open,
    Closed,
    Executed,
    Distributing,
    Completed,
}

impl Default for BatchStatus {
    fn default() -> Self {
        BatchStatus::Open
    }
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct CreateBatch<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 68 + 1 + 1 + 1 + 8 + 8 + 8 + 1,
        seeds = [b"batch", authority.key().as_ref(), market_id.as_bytes()],
        bump
    )]
    pub batch: Account<'info, Batch>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordOrder<'info> {
    #[account(mut, has_one = authority)]
    pub batch: Account<'info, Batch>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseBatch<'info> {
    #[account(mut, has_one = authority)]
    pub batch: Account<'info, Batch>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RecordExecution<'info> {
    #[account(mut, has_one = authority)]
    pub batch: Account<'info, Batch>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(order_index: u8)]
pub struct RecordDistribution<'info> {
    #[account(mut, has_one = authority)]
    pub batch: Account<'info, Batch>,
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 8 + 32 + 1,
        seeds = [b"dist", batch.key().as_ref(), &[order_index]],
        bump
    )]
    pub distribution: Account<'info, Distribution>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkDistributed<'info> {
    #[account(mut, has_one = authority)]
    pub batch: Account<'info, Batch>,
    #[account(mut, has_one = batch)]
    pub distribution: Account<'info, Distribution>,
    pub authority: Signer<'info>,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct BatchCreated {
    pub batch: Pubkey,
    pub market_id: String,
    pub side: u8,
}

#[event]
pub struct OrderRecorded {
    pub batch: Pubkey,
    pub order_count: u8,
}

#[event]
pub struct BatchClosed {
    pub batch: Pubkey,
    pub total_usdc: u64,
    pub order_count: u8,
}

#[event]
pub struct ExecutionRecorded {
    pub batch: Pubkey,
    pub total_shares: u64,
    pub tx_signature: String,
}

#[event]
pub struct DistributionRecorded {
    pub batch: Pubkey,
    pub order_index: u8,
    pub shares: u64,
    pub wallet: Pubkey,
}

#[event]
pub struct DistributionExecuted {
    pub batch: Pubkey,
    pub order_index: u8,
    pub tx_signature: String,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Batch is not open")]
    BatchNotOpen,
    #[msg("Batch is empty")]
    BatchEmpty,
    #[msg("Batch is not closed")]
    BatchNotClosed,
    #[msg("Batch is not executed")]
    BatchNotExecuted,
    #[msg("Already distributed")]
    AlreadyDistributed,
    #[msg("Order count mismatch")]
    CountMismatch,
}
