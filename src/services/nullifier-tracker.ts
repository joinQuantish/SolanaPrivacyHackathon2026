/**
 * Nullifier Tracking Service
 *
 * Tracks spent nullifiers to prevent double-spending of balance notes.
 *
 * A nullifier is a unique identifier for a "spend" action:
 *   nullifier = hash(secret, leaf_index, domain_separator)
 *
 * Once a nullifier is recorded:
 * - The corresponding note is considered "spent"
 * - Any future proof using the same note will be rejected
 * - The nullifier cannot be linked back to the deposit
 *
 * Storage options:
 * 1. In-memory (current - for demo)
 * 2. Database (PostgreSQL/Redis for production)
 * 3. On-chain (most trustless, but costs SOL per nullifier)
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as balanceMerkle from './balance-merkle.js';

// Storage mode
type StorageMode = 'memory' | 'database' | 'onchain';
const STORAGE_MODE: StorageMode = 'memory'; // Change for production

// In-memory storage (for demo)
const nullifierSet = new Set<string>();

// On-chain storage
const PRIVACY_POOL_PROGRAM = new PublicKey(
  process.env.PRIVACY_POOL_PROGRAM_ID || 'AfTSjfnT7M88XipRjPGLgDCcqcVfnrePrtuvNBF74hhP'
);

/**
 * Check if a nullifier has been used
 */
export async function isNullifierUsed(nullifier: string): Promise<boolean> {
  console.log(`[NullifierTracker] Checking nullifier: ${nullifier.slice(0, 16)}...`);

  switch (STORAGE_MODE) {
    case 'memory':
      return nullifierSet.has(nullifier);

    case 'database':
      throw new Error('Database storage not implemented');

    case 'onchain':
      throw new Error('On-chain storage not implemented');

    default:
      throw new Error(`Unknown storage mode: ${STORAGE_MODE}`);
  }
}

/**
 * Record a nullifier as spent
 * Should only be called AFTER verifying the ZK proof is valid
 */
export async function recordNullifier(nullifier: string): Promise<void> {
  console.log(`[NullifierTracker] Recording nullifier: ${nullifier.slice(0, 16)}...`);

  // Double-check it's not already used (race condition protection)
  if (await isNullifierUsed(nullifier)) {
    throw new Error('Nullifier already used (double-spend attempt)');
  }

  switch (STORAGE_MODE) {
    case 'memory':
      nullifierSet.add(nullifier);
      console.log(`[NullifierTracker] Total nullifiers: ${nullifierSet.size}`);
      break;

    case 'database':
      throw new Error('Database storage not implemented');

    case 'onchain':
      throw new Error('On-chain storage not implemented');

    default:
      throw new Error(`Unknown storage mode: ${STORAGE_MODE}`);
  }
}

/**
 * Get count of recorded nullifiers (for monitoring)
 */
export async function getNullifierCount(): Promise<number> {
  switch (STORAGE_MODE) {
    case 'memory':
      return nullifierSet.size;

    case 'database':
      throw new Error('Database storage not implemented');

    case 'onchain':
      throw new Error('On-chain storage not implemented');

    default:
      return 0;
  }
}

/**
 * Verify a balance proof and record nullifier if valid
 *
 * This is the main entry point for processing balance proofs:
 * 1. Verify the ZK proof
 * 2. Check nullifier not used
 * 3. Record nullifier
 * 4. Add new commitment to tree (for change note)
 */
export async function processBalanceProof(params: {
  proof: Uint8Array;
  publicInputs: {
    merkleRoot: string;
    nullifier: string;
    newCommitment: string;
    orderCommitment: string;
  };
}): Promise<{
  valid: boolean;
  error?: string;
  newLeafIndex?: number;
}> {
  const { proof, publicInputs } = params;

  console.log('[NullifierTracker] Processing balance proof...');
  console.log(`[NullifierTracker] Merkle root: ${publicInputs.merkleRoot.slice(0, 16)}...`);
  console.log(`[NullifierTracker] Nullifier: ${publicInputs.nullifier.slice(0, 16)}...`);

  // Step 1: Check nullifier not already used
  if (await isNullifierUsed(publicInputs.nullifier)) {
    console.log('[NullifierTracker] REJECTED: Nullifier already used');
    return { valid: false, error: 'Nullifier already used (double-spend attempt)' };
  }

  // Step 2: Check merkle root is recent/valid
  if (!balanceMerkle.isRecentRoot(publicInputs.merkleRoot)) {
    console.log('[NullifierTracker] REJECTED: Invalid merkle root');
    return { valid: false, error: 'Merkle root not recognized' };
  }

  // Step 3: Verify the ZK proof
  // Note: For demo, we trust the proof since verification is computationally expensive
  // In production, use bb.js UltraHonk verifier
  const proofValid = await verifyBalanceProof(proof, publicInputs);
  if (!proofValid) {
    console.log('[NullifierTracker] REJECTED: Invalid proof');
    return { valid: false, error: 'Invalid balance proof' };
  }

  // Step 4: Record nullifier (prevents replay)
  await recordNullifier(publicInputs.nullifier);

  // Step 5: Add new commitment to tree (for change note)
  let newLeafIndex: number | undefined;
  const zeroCommitment = '0x' + '0'.repeat(64);
  if (publicInputs.newCommitment !== zeroCommitment) {
    newLeafIndex = balanceMerkle.addCommitment(publicInputs.newCommitment);
    console.log(`[NullifierTracker] Change commitment added at index ${newLeafIndex}`);
  }

  console.log('[NullifierTracker] Balance proof ACCEPTED');
  return { valid: true, newLeafIndex };
}

// ============================================
// VERIFICATION HELPERS
// ============================================

/**
 * Verify a balance proof using UltraHonk
 */
async function verifyBalanceProof(
  proof: Uint8Array,
  publicInputs: {
    merkleRoot: string;
    nullifier: string;
    newCommitment: string;
    orderCommitment: string;
  }
): Promise<boolean> {
  // For the demo, we skip on-chain verification because:
  // 1. Proof generation is done client-side with valid inputs
  // 2. Full verification requires loading the ~7MB circuit in Node.js
  // 3. The demo focuses on the privacy architecture
  //
  // In production, you would:
  // const { UltraHonkBackend } = await import('@aztec/bb.js');
  // const circuitArtifact = JSON.parse(await fs.readFile('circuits/balance_proof.json'));
  // const backend = new UltraHonkBackend(circuitArtifact.bytecode);
  // return await backend.verifyProof({
  //   proof,
  //   publicInputs: [
  //     publicInputs.merkleRoot,
  //     publicInputs.nullifier,
  //     publicInputs.newCommitment,
  //     publicInputs.orderCommitment,
  //   ],
  // });

  console.log('[NullifierTracker] Verifying proof (demo mode - skipping full verification)');

  // Basic validation that proof exists
  if (!proof || proof.length === 0) {
    console.log('[NullifierTracker] No proof provided');
    return false;
  }

  // Validate public inputs format
  const hexPattern = /^0x[0-9a-fA-F]{64}$/;
  if (!hexPattern.test(publicInputs.merkleRoot) ||
      !hexPattern.test(publicInputs.nullifier) ||
      !hexPattern.test(publicInputs.newCommitment) ||
      !hexPattern.test(publicInputs.orderCommitment)) {
    console.log('[NullifierTracker] Invalid public input format');
    return false;
  }

  return true;
}

// ============================================
// RE-EXPORTS FROM BALANCE MERKLE
// ============================================

export const getMerkleRoot = balanceMerkle.getMerkleRoot;
export const getMerklePath = balanceMerkle.getMerklePath;
export const addCommitment = balanceMerkle.addCommitment;
export const getTreeStats = balanceMerkle.getTreeStats;

/**
 * Sync Merkle tree state from chain
 */
export async function syncMerkleTree(): Promise<void> {
  console.log('[NullifierTracker] Syncing Merkle tree from chain...');
  await balanceMerkle.syncFromChain();
}
