use poseidon::poseidon::bn254::{hash_2, hash_3};

// Merkle tree depth for balance commitments
// Supports up to 2^20 = 1,048,576 deposits
global MERKLE_DEPTH: u32 = 20;

/**
 * Balance Proof Circuit
 *
 * This circuit proves that a user has sufficient balance to place an order
 * WITHOUT revealing their actual balance or identity.
 *
 * Privacy guarantees:
 * - Relay cannot see user's total balance
 * - Relay cannot see order amount (encrypted separately via Arcium)
 * - Relay cannot link deposits to withdrawals
 * - Double-spending is prevented via nullifiers
 *
 * Used in conjunction with:
 * - Arcium MPC: Encrypts order amounts from relay
 * - Distribution Verifier: Proves correct share allocation
 */

// Spending note structure (user keeps this private)
struct SpendingNote {
    // Random secret chosen by user at deposit time
    secret: Field,
    // Amount in micro-USDC (6 decimals)
    amount: Field,
    // Index in Merkle tree (for computing path)
    leaf_index: Field,
}

fn main(
    // ============================================
    // PUBLIC INPUTS - Relay sees these
    // ============================================

    // Current Merkle root of all deposits
    merkle_root: pub Field,

    // Nullifier - unique identifier for this spend
    // Relay stores all nullifiers to prevent double-spending
    // Computed as: hash(secret, leaf_index, "nullifier")
    nullifier: pub Field,

    // New commitment for remaining balance (change note)
    // If order_amount < balance, user gets a new note for the remainder
    // Computed as: hash(new_secret, remaining_amount)
    new_commitment: pub Field,

    // Encrypted order amount commitment (for Arcium verification)
    // This binds the ZK proof to a specific Arcium-encrypted order
    // Computed as: hash(order_amount, order_salt)
    order_commitment: pub Field,

    // ============================================
    // PRIVATE INPUTS - Only user knows these
    // ============================================

    // User's existing spending note
    old_secret: Field,
    old_amount: Field,
    leaf_index: Field,

    // Merkle path proving note is in the tree
    merkle_path: [Field; MERKLE_DEPTH],

    // Order details
    order_amount: Field,
    order_salt: Field,

    // New note details (for remaining balance)
    new_secret: Field,
) {
    // ============================================
    // STEP 1: Verify the old commitment exists
    // ============================================

    // Compute the commitment hash from private inputs
    // commitment = hash(secret, amount)
    let old_commitment = hash_2([old_secret, old_amount]);

    // Verify this commitment is in the Merkle tree
    let computed_root = compute_merkle_root(
        old_commitment,
        merkle_path,
        leaf_index
    );
    assert(computed_root == merkle_root);

    // ============================================
    // STEP 2: Verify the nullifier
    // ============================================

    // Nullifier = hash(secret, leaf_index, domain_separator)
    // The domain separator "1" distinguishes nullifiers from other hashes
    let computed_nullifier = hash_3([old_secret, leaf_index, 1]);
    assert(computed_nullifier == nullifier);

    // ============================================
    // STEP 3: Verify sufficient balance
    // ============================================

    // User must have at least order_amount in their note
    // We use field comparison - amounts are always positive
    let has_sufficient = old_amount as u64 >= order_amount as u64;
    assert(has_sufficient);

    // ============================================
    // STEP 4: Verify the order commitment
    // ============================================

    // This binds the ZK proof to a specific order amount
    // The same order_amount is encrypted in the Arcium blob
    let computed_order_commitment = hash_2([order_amount, order_salt]);
    assert(computed_order_commitment == order_commitment);

    // ============================================
    // STEP 5: Verify the change note
    // ============================================

    // Remaining balance after order
    let remaining_amount = old_amount - order_amount;

    // New commitment for remaining balance
    let computed_new_commitment = hash_2([new_secret, remaining_amount]);
    assert(computed_new_commitment == new_commitment);

    // ============================================
    // ADDITIONAL CONSTRAINT: Amounts are valid
    // ============================================

    // Prevent underflow by ensuring order_amount <= old_amount
    // (redundant with Step 3 but explicit for safety)
    assert(order_amount as u64 <= old_amount as u64);
}

/**
 * Helper: Compute Merkle root from leaf and path
 *
 * Given a leaf hash and a path of sibling hashes,
 * computes the Merkle root by hashing up the tree.
 */
fn compute_merkle_root(
    leaf: Field,
    path: [Field; MERKLE_DEPTH],
    index: Field
) -> Field {
    let mut current = leaf;
    let mut idx = index as u64;

    for i in 0..MERKLE_DEPTH {
        let sibling = path[i];

        // Check if current node is right child (odd index)
        let is_right = idx & 1;

        // Hash in correct order based on position
        current = if is_right == 1 {
            hash_2([sibling, current])
        } else {
            hash_2([current, sibling])
        };

        // Move up to parent level
        idx = idx / 2;
    }

    current
}

// ============================================
// TESTS
// ============================================

#[test]
fn test_basic_balance_proof() {
    // User deposited $100 (100_000_000 micro-USDC)
    let old_secret: Field = 12345;
    let old_amount: Field = 100_000_000;
    let leaf_index: Field = 0;

    // User wants to order $50 (50_000_000 micro-USDC)
    let order_amount: Field = 50_000_000;
    let order_salt: Field = 67890;

    // New secret for remaining $50
    let new_secret: Field = 11111;

    // Compute old commitment
    let old_commitment = hash_2([old_secret, old_amount]);

    // Build merkle root (single leaf, rest are zeros)
    let mut merkle_path: [Field; MERKLE_DEPTH] = [0; MERKLE_DEPTH];
    let merkle_root = compute_merkle_root(old_commitment, merkle_path, leaf_index);

    // Compute nullifier
    let nullifier = hash_3([old_secret, leaf_index, 1]);

    // Compute order commitment
    let order_commitment = hash_2([order_amount, order_salt]);

    // Compute new commitment for remaining balance
    let remaining = old_amount - order_amount;
    let new_commitment = hash_2([new_secret, remaining]);

    // Run the circuit
    main(
        merkle_root,
        nullifier,
        new_commitment,
        order_commitment,
        old_secret,
        old_amount,
        leaf_index,
        merkle_path,
        order_amount,
        order_salt,
        new_secret
    );

    println(f"Test passed! Proved balance of {old_amount} >= order of {order_amount}");
}

#[test]
fn test_exact_balance_spend() {
    // User deposited exactly $25
    let old_secret: Field = 99999;
    let old_amount: Field = 25_000_000;
    let leaf_index: Field = 5;

    // User wants to spend ALL of it
    let order_amount: Field = 25_000_000;
    let order_salt: Field = 12121;

    // New commitment will have 0 balance
    let new_secret: Field = 33333;

    // Compute values
    let old_commitment = hash_2([old_secret, old_amount]);
    let merkle_path: [Field; MERKLE_DEPTH] = [0; MERKLE_DEPTH];
    let merkle_root = compute_merkle_root(old_commitment, merkle_path, leaf_index);
    let nullifier = hash_3([old_secret, leaf_index, 1]);
    let order_commitment = hash_2([order_amount, order_salt]);
    let remaining = old_amount - order_amount; // = 0
    let new_commitment = hash_2([new_secret, remaining]);

    main(
        merkle_root,
        nullifier,
        new_commitment,
        order_commitment,
        old_secret,
        old_amount,
        leaf_index,
        merkle_path,
        order_amount,
        order_salt,
        new_secret
    );

    println(f"Test passed! Spent exact balance: {old_amount}");
}

#[test(should_fail)]
fn test_insufficient_balance_fails() {
    // User only has $10
    let old_secret: Field = 55555;
    let old_amount: Field = 10_000_000;
    let leaf_index: Field = 0;

    // User tries to order $50 (should fail!)
    let order_amount: Field = 50_000_000;
    let order_salt: Field = 77777;
    let new_secret: Field = 88888;

    let old_commitment = hash_2([old_secret, old_amount]);
    let merkle_path: [Field; MERKLE_DEPTH] = [0; MERKLE_DEPTH];
    let merkle_root = compute_merkle_root(old_commitment, merkle_path, leaf_index);
    let nullifier = hash_3([old_secret, leaf_index, 1]);
    let order_commitment = hash_2([order_amount, order_salt]);

    // This will underflow but we check balance first
    let remaining = old_amount - order_amount;
    let new_commitment = hash_2([new_secret, remaining]);

    // This should FAIL because order_amount > old_amount
    main(
        merkle_root,
        nullifier,
        new_commitment,
        order_commitment,
        old_secret,
        old_amount,
        leaf_index,
        merkle_path,
        order_amount,
        order_salt,
        new_secret
    );
}
