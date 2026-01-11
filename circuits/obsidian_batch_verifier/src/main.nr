use poseidon::poseidon::bn254::{hash_2, hash_5};

// Maximum batch size (32 orders)
global MAX_BATCH_SIZE: u32 = 32;
// Merkle tree depth (log2(32) = 5)
global MERKLE_DEPTH: u32 = 5;

// Order commitment structure
struct OrderCommitment {
    market_id: Field,
    side: Field,              // 0 = NO, 1 = YES
    usdc_amount: Field,       // In smallest units (6 decimals)
    destination_wallet: Field, // Solana pubkey as field
    salt: Field,
}

// Share allocation result
struct ShareAllocation {
    destination_wallet: Field,
    shares_amount: Field,
}

// Main circuit entry point
fn main(
    // PUBLIC INPUTS - visible to all verifiers
    batch_id: pub Field,
    merkle_root: pub Field,
    total_usdc_in: pub Field,
    total_shares_out: pub Field,
    market_id: pub Field,
    side: pub Field,

    // PRIVATE INPUTS - hidden from verifiers
    commitments: [OrderCommitment; MAX_BATCH_SIZE],
    allocations: [ShareAllocation; MAX_BATCH_SIZE],
    merkle_paths: [[Field; MERKLE_DEPTH]; MAX_BATCH_SIZE],
    num_orders: u32,
) {
    // Validate num_orders is within bounds
    assert(num_orders <= MAX_BATCH_SIZE);

    // Use batch_id to prevent unused variable warning
    let _ = batch_id;

    // Accumulators for totals
    let mut computed_usdc_sum: Field = 0;
    let mut computed_shares_sum: Field = 0;

    for i in 0..MAX_BATCH_SIZE {
        let is_active = i < num_orders;

        if is_active {
            let commitment = commitments[i];
            let allocation = allocations[i];

            // ============================================
            // CONSTRAINT 1: Verify commitment hash
            // ============================================
            let commitment_hash = hash_5([
                commitment.market_id,
                commitment.side,
                commitment.usdc_amount,
                commitment.destination_wallet,
                commitment.salt,
            ]);

            // ============================================
            // CONSTRAINT 2: Verify Merkle inclusion
            // ============================================
            let computed_root = compute_merkle_root(
                commitment_hash,
                merkle_paths[i],
                i as Field
            );
            assert(computed_root == merkle_root);

            // ============================================
            // CONSTRAINT 3: Verify market and side match batch
            // ============================================
            assert(commitment.market_id == market_id);
            assert(commitment.side == side);

            // ============================================
            // CONSTRAINT 4: Verify destination matches allocation
            // ============================================
            assert(commitment.destination_wallet == allocation.destination_wallet);

            // ============================================
            // CONSTRAINT 5: Verify proportional allocation
            // ============================================
            // shares_i = (usdc_i / total_usdc) * total_shares
            // Rearranged to avoid division:
            // shares_i * total_usdc == usdc_i * total_shares
            let expected_shares_times_total = commitment.usdc_amount * total_shares_out;
            let actual_shares_times_total = allocation.shares_amount * total_usdc_in;

            // Check proportional allocation (exact match required)
            let matches = expected_shares_times_total == actual_shares_times_total;
            assert(matches);

            // Accumulate totals
            computed_usdc_sum += commitment.usdc_amount;
            computed_shares_sum += allocation.shares_amount;
        }
    }

    // ============================================
    // CONSTRAINT 6: Verify totals match
    // ============================================
    assert(computed_usdc_sum == total_usdc_in);
    assert(computed_shares_sum == total_shares_out);
}

// Helper: Compute Merkle root from leaf and path
fn compute_merkle_root(leaf: Field, path: [Field; MERKLE_DEPTH], index: Field) -> Field {
    let mut current = leaf;
    let mut idx = index;

    for i in 0..MERKLE_DEPTH {
        let sibling = path[i];
        // Check if current node is right child (odd index)
        let idx_as_u64 = idx as u64;
        let is_right = idx_as_u64 & 1;

        current = if is_right == 1 {
            hash_2([sibling, current])
        } else {
            hash_2([current, sibling])
        };

        idx = (idx_as_u64 / 2) as Field;
    }

    current
}

// Test to print commitment hash
#[test]
fn test_print_hash() {
    let commitment_hash = hash_5([1, 1, 1000000, 12345, 999]);
    println(f"Commitment hash: {commitment_hash}");

    // Build merkle root like we do in TS
    let mut current = commitment_hash;
    // Leaf 0, sibling is 0
    current = hash_2([current, 0]);
    println(f"After level 0: {current}");
}

// Test module
#[test]
fn test_single_order() {
    // Simple test with 1 order
    let commitment = OrderCommitment {
        market_id: 1,
        side: 1, // YES
        usdc_amount: 1000000, // $1
        destination_wallet: 12345,
        salt: 999,
    };

    let allocation = ShareAllocation {
        destination_wallet: 12345,
        shares_amount: 100,
    };

    // Compute commitment hash
    let commitment_hash = hash_5([
        commitment.market_id,
        commitment.side,
        commitment.usdc_amount,
        commitment.destination_wallet,
        commitment.salt,
    ]);

    // For a single leaf, build merkle root by hashing up with zeros
    let mut root = commitment_hash;
    for _ in 0..MERKLE_DEPTH {
        root = hash_2([root, 0]);
    }

    // Create zero-padded arrays
    let mut commitments: [OrderCommitment; MAX_BATCH_SIZE] = [OrderCommitment {
        market_id: 0,
        side: 0,
        usdc_amount: 0,
        destination_wallet: 0,
        salt: 0,
    }; MAX_BATCH_SIZE];
    commitments[0] = commitment;

    let mut allocations: [ShareAllocation; MAX_BATCH_SIZE] = [ShareAllocation {
        destination_wallet: 0,
        shares_amount: 0,
    }; MAX_BATCH_SIZE];
    allocations[0] = allocation;

    let merkle_paths: [[Field; MERKLE_DEPTH]; MAX_BATCH_SIZE] = [[0; MERKLE_DEPTH]; MAX_BATCH_SIZE];

    main(
        1, // batch_id
        root, // merkle_root
        1000000, // total_usdc_in
        100, // total_shares_out
        1, // market_id
        1, // side (YES)
        commitments,
        allocations,
        merkle_paths,
        1, // num_orders
    );
}
