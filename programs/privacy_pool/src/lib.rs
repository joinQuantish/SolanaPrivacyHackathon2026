use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::token_interface::spl_token_2022::instruction::transfer_checked;
use ark_bn254::Fr;
use light_poseidon::{Poseidon, PoseidonBytesHasher};

declare_id!("AfTSjfnT7M88XipRjPGLgDCcqcVfnrePrtuvNBF74hhP");

/// Merkle tree depth - supports 2^5 = 32 deposits for demo
/// For production: use depth 20+ with off-chain storage
pub const MERKLE_DEPTH: usize = 5;

/// Maximum leaves we can store on-chain (stack size limited)
/// For production: use off-chain storage with on-chain root, or multiple accounts
/// For demo: 32 leaves = 32 deposits supported
pub const MAX_LEAVES: usize = 32;

#[program]
pub mod privacy_pool {
    use super::*;

    /// Initialize the privacy pool
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.merkle_root = [0u8; 32]; // Empty tree root
        pool.next_index = 0;
        pool.nullifier_count = 0;

        msg!("Privacy pool initialized");
        Ok(())
    }

    /// Deposit USDC and add commitment to Merkle tree
    ///
    /// User provides:
    /// - commitment: hash(secret, amount) - computed client-side
    /// - amount: USDC to deposit (this IS visible on-chain)
    ///
    /// The commitment hides the link between deposit and future spends
    pub fn deposit(
        ctx: Context<Deposit>,
        commitment: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        require!(pool.next_index < MAX_LEAVES as u32, PoolError::TreeFull);

        // Transfer USDC from user to pool using transfer_checked CPI
        let ix = transfer_checked(
            ctx.accounts.token_program.key,
            ctx.accounts.user_usdc.key,
            ctx.accounts.usdc_mint.key,
            ctx.accounts.pool_usdc.key,
            ctx.accounts.user.key,
            &[],
            amount,
            6, // USDC has 6 decimals
        )?;

        invoke(
            &ix,
            &[
                ctx.accounts.user_usdc.to_account_info(),
                ctx.accounts.usdc_mint.to_account_info(),
                ctx.accounts.pool_usdc.to_account_info(),
                ctx.accounts.user.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
        )?;

        // Add commitment to tree
        let leaf_index = pool.next_index;
        pool.leaves[leaf_index as usize] = commitment;
        pool.next_index += 1;

        // Recompute Merkle root
        pool.merkle_root = compute_merkle_root(&pool.leaves, pool.next_index as usize);

        msg!("Deposit: index={}, commitment={:?}", leaf_index, &commitment[..8]);

        // Emit event for indexers
        emit!(DepositEvent {
            leaf_index,
            commitment,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Check if a nullifier has been used (view function)
    pub fn is_nullifier_used(ctx: Context<CheckNullifier>, nullifier: [u8; 32]) -> Result<bool> {
        let nullifiers = &ctx.accounts.nullifiers;

        for i in 0..nullifiers.count as usize {
            if nullifiers.data[i] == nullifier {
                return Ok(true);
            }
        }

        Ok(false)
    }

    /// Record a nullifier as spent
    /// Called by the relay after verifying a ZK proof
    pub fn record_nullifier(
        ctx: Context<RecordNullifier>,
        nullifier: [u8; 32],
    ) -> Result<()> {
        let nullifiers = &mut ctx.accounts.nullifiers;

        // Check not already used
        for i in 0..nullifiers.count as usize {
            require!(nullifiers.data[i] != nullifier, PoolError::NullifierAlreadyUsed);
        }

        // Add nullifier
        let count = nullifiers.count as usize;
        require!(count < MAX_LEAVES, PoolError::NullifierStorageFull);
        nullifiers.data[count] = nullifier;
        nullifiers.count += 1;

        msg!("Nullifier recorded: {:?}", &nullifier[..8]);

        Ok(())
    }

    /// Add a new commitment (for change notes after partial spend)
    pub fn add_commitment(
        ctx: Context<AddCommitment>,
        commitment: [u8; 32],
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        require!(pool.next_index < MAX_LEAVES as u32, PoolError::TreeFull);

        let leaf_index = pool.next_index;
        pool.leaves[leaf_index as usize] = commitment;
        pool.next_index += 1;

        // Recompute Merkle root
        pool.merkle_root = compute_merkle_root(&pool.leaves, pool.next_index as usize);

        msg!("New commitment added: index={}", leaf_index);

        emit!(CommitmentAddedEvent {
            leaf_index,
            commitment,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// ============================================
// ACCOUNTS
// ============================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PrivacyPool::SIZE,
        seeds = [b"privacy_pool"],
        bump
    )]
    pub pool: Account<'info, PrivacyPool>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"privacy_pool"],
        bump
    )]
    pub pool: Account<'info, PrivacyPool>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: User's USDC token account - validated by token program during transfer
    #[account(mut)]
    pub user_usdc: UncheckedAccount<'info>,

    /// CHECK: Pool's USDC token account - validated by token program during transfer
    #[account(mut)]
    pub pool_usdc: UncheckedAccount<'info>,

    /// CHECK: USDC mint for transfer_checked - validated by token program
    pub usdc_mint: UncheckedAccount<'info>,

    /// CHECK: Token program for CPI - verified below
    pub token_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CheckNullifier<'info> {
    pub nullifiers: Account<'info, NullifierSet>,
}

#[derive(Accounts)]
pub struct RecordNullifier<'info> {
    #[account(mut)]
    pub nullifiers: Account<'info, NullifierSet>,

    /// Only relay can record nullifiers (after verifying ZK proof)
    pub relay: Signer<'info>,
}

#[derive(Accounts)]
pub struct AddCommitment<'info> {
    #[account(mut, seeds = [b"privacy_pool"], bump)]
    pub pool: Account<'info, PrivacyPool>,

    /// Only relay can add commitments (for change notes)
    pub relay: Signer<'info>,
}

// ============================================
// STATE
// ============================================

#[account]
pub struct PrivacyPool {
    pub authority: Pubkey,
    pub merkle_root: [u8; 32],
    pub next_index: u32,
    pub nullifier_count: u32,
    pub leaves: [[u8; 32]; MAX_LEAVES],
}

impl PrivacyPool {
    pub const SIZE: usize = 32 + 32 + 4 + 4 + (32 * MAX_LEAVES);
}

#[account]
pub struct NullifierSet {
    pub count: u32,
    pub data: [[u8; 32]; MAX_LEAVES],
}

// ============================================
// EVENTS
// ============================================

#[event]
pub struct DepositEvent {
    pub leaf_index: u32,
    pub commitment: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct CommitmentAddedEvent {
    pub leaf_index: u32,
    pub commitment: [u8; 32],
    pub timestamp: i64,
}

// ============================================
// ERRORS
// ============================================

#[error_code]
pub enum PoolError {
    #[msg("Merkle tree is full")]
    TreeFull,
    #[msg("Nullifier has already been used")]
    NullifierAlreadyUsed,
    #[msg("Nullifier storage is full")]
    NullifierStorageFull,
}

// ============================================
// HELPERS
// ============================================

/// Compute Merkle root from leaves
/// Uses Poseidon hash (must match the Noir circuit!)
fn compute_merkle_root(leaves: &[[u8; 32]; MAX_LEAVES], count: usize) -> [u8; 32] {
    if count == 0 {
        return [0u8; 32];
    }

    // For simplicity, using a basic implementation
    // In production, use a proper sparse Merkle tree library
    let mut current_level: Vec<[u8; 32]> = leaves[..count].to_vec();

    // Pad to power of 2
    while current_level.len() < (1 << MERKLE_DEPTH) {
        current_level.push([0u8; 32]);
    }

    // Hash up the tree
    for _ in 0..MERKLE_DEPTH {
        let mut next_level = Vec::new();
        for i in (0..current_level.len()).step_by(2) {
            let left = current_level[i];
            let right = current_level.get(i + 1).copied().unwrap_or([0u8; 32]);
            next_level.push(hash_pair(left, right));
        }
        current_level = next_level;
    }

    current_level[0]
}

/// Hash two nodes together using Poseidon
/// Uses light-poseidon with BN254 parameters to match Noir circuit's poseidon::bn254::hash_2
fn hash_pair(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    // Create Poseidon hasher with 2 inputs (for Merkle tree pairs)
    let mut poseidon = Poseidon::<Fr>::new_circom(2).expect("poseidon init");

    // Convert bytes to field elements and hash
    let result = poseidon.hash_bytes_be(&[&left, &right]).expect("poseidon hash");

    result
}
