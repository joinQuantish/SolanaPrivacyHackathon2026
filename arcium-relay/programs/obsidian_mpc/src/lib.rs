//! Obsidian MPC Program
//!
//! Anchor program for blind batch execution.
//! Coordinates with Arcium MPC to process orders privately.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

declare_id!("8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc");

#[program]
pub mod obsidian_mpc {
    use super::*;

    // ============================================================================
    // Computation Definition Initialization
    // These must be called once to register MPC circuits with Arcium
    // ============================================================================

    /// Initialize the init_batch computation definition
    pub fn init_init_batch_comp_def(ctx: Context<InitInitBatchCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Initialize the add_to_batch computation definition
    pub fn init_add_to_batch_comp_def(ctx: Context<InitAddToBatchCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Initialize the reveal_batch_total computation definition
    pub fn init_reveal_batch_total_comp_def(ctx: Context<InitRevealBatchTotalCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Initialize the compute_distribution computation definition
    pub fn init_compute_distribution_comp_def(ctx: Context<InitComputeDistributionCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    // ============================================================================
    // Batch Management Instructions
    // ============================================================================

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
// Computation Definition Account Contexts
// ============================================================================

#[init_computation_definition_accounts("init_batch", payer)]
#[derive(Accounts)]
pub struct InitInitBatchCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: Initialized via CPI
    #[account(mut)]
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("add_to_batch", payer)]
#[derive(Accounts)]
pub struct InitAddToBatchCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: Initialized via CPI
    #[account(mut)]
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("reveal_batch_total", payer)]
#[derive(Accounts)]
pub struct InitRevealBatchTotalCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: Initialized via CPI
    #[account(mut)]
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("compute_distribution", payer)]
#[derive(Accounts)]
pub struct InitComputeDistributionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: Initialized via CPI
    #[account(mut)]
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ============================================================================
// Batch Management Account Contexts
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
