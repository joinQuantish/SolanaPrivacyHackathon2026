/**
 * Balance Merkle Tree Service
 *
 * Manages the Merkle tree of balance commitments.
 * In production, this would sync from on-chain state.
 * For demo, we maintain an in-memory tree.
 */

import { poseidon2 } from 'poseidon-lite';

// Tree depth - must match circuit and on-chain program
// Demo uses depth 5 (32 leaves), production would use depth 20+
const MERKLE_DEPTH = 5;
const MAX_LEAVES = 1 << MERKLE_DEPTH; // 32

// In-memory tree state
interface MerkleTreeState {
  leaves: bigint[];
  root: bigint;
  lastUpdated: number;
}

let treeState: MerkleTreeState = {
  leaves: [],
  root: 0n,
  lastUpdated: 0,
};

// Zero hashes for empty nodes at each level
const ZERO_HASHES: bigint[] = [];

/**
 * Initialize zero hashes for empty tree nodes
 */
function initializeZeroHashes(): void {
  if (ZERO_HASHES.length > 0) return;

  // Level 0: empty leaf is just 0
  ZERO_HASHES.push(0n);

  // Each level up is hash(prev_zero, prev_zero)
  for (let i = 1; i <= MERKLE_DEPTH; i++) {
    const prev = ZERO_HASHES[i - 1];
    ZERO_HASHES.push(poseidon2([prev, prev]));
  }
}

/**
 * Get current Merkle root
 */
export function getMerkleRoot(): string {
  initializeZeroHashes();

  if (treeState.leaves.length === 0) {
    // Empty tree root
    return fieldToHex(ZERO_HASHES[MERKLE_DEPTH]);
  }

  return fieldToHex(treeState.root);
}

/**
 * Get Merkle path for a leaf at given index
 */
export function getMerklePath(leafIndex: number): string[] {
  initializeZeroHashes();

  if (leafIndex < 0 || leafIndex >= MAX_LEAVES) {
    throw new Error(`Invalid leaf index: ${leafIndex}`);
  }

  const path: bigint[] = [];
  let currentIndex = leafIndex;

  // Build full tree level by level
  let currentLevel: bigint[] = [];

  // Initialize leaves (pad with zeros)
  for (let i = 0; i < MAX_LEAVES; i++) {
    if (i < treeState.leaves.length) {
      currentLevel.push(treeState.leaves[i]);
    } else {
      currentLevel.push(ZERO_HASHES[0]);
    }
  }

  // Traverse up the tree
  for (let level = 0; level < MERKLE_DEPTH; level++) {
    // Get sibling index
    const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

    // Add sibling to path
    path.push(currentLevel[siblingIndex] ?? ZERO_HASHES[level]);

    // Move to parent level
    const nextLevel: bigint[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1] ?? ZERO_HASHES[level];
      nextLevel.push(poseidon2([left, right]));
    }
    currentLevel = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return path.map(fieldToHex);
}

/**
 * Add a new commitment to the tree
 * Returns the leaf index
 */
export function addCommitment(commitmentHex: string): number {
  initializeZeroHashes();

  if (treeState.leaves.length >= MAX_LEAVES) {
    throw new Error('Merkle tree is full');
  }

  const commitment = hexToField(commitmentHex);
  const leafIndex = treeState.leaves.length;

  treeState.leaves.push(commitment);
  treeState.root = computeMerkleRoot();
  treeState.lastUpdated = Date.now();

  console.log(`[BalanceMerkle] Added commitment at index ${leafIndex}`);
  console.log(`[BalanceMerkle] New root: ${fieldToHex(treeState.root).slice(0, 16)}...`);

  return leafIndex;
}

/**
 * Compute the Merkle root from current leaves
 */
function computeMerkleRoot(): bigint {
  if (treeState.leaves.length === 0) {
    return ZERO_HASHES[MERKLE_DEPTH];
  }

  let currentLevel: bigint[] = [];

  // Initialize leaves (pad with zeros)
  for (let i = 0; i < MAX_LEAVES; i++) {
    if (i < treeState.leaves.length) {
      currentLevel.push(treeState.leaves[i]);
    } else {
      currentLevel.push(ZERO_HASHES[0]);
    }
  }

  // Hash up the tree
  for (let level = 0; level < MERKLE_DEPTH; level++) {
    const nextLevel: bigint[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1] ?? ZERO_HASHES[level];
      nextLevel.push(poseidon2([left, right]));
    }
    currentLevel = nextLevel;
  }

  return currentLevel[0];
}

/**
 * Get the number of commitments in the tree
 */
export function getCommitmentCount(): number {
  return treeState.leaves.length;
}

/**
 * Verify a Merkle proof
 */
export function verifyMerklePath(
  leafHex: string,
  leafIndex: number,
  pathHex: string[],
  expectedRootHex: string
): boolean {
  initializeZeroHashes();

  const leaf = hexToField(leafHex);
  const path = pathHex.map(hexToField);
  const expectedRoot = hexToField(expectedRootHex);

  let current = leaf;
  let idx = leafIndex;

  for (let i = 0; i < MERKLE_DEPTH; i++) {
    const sibling = path[i] ?? ZERO_HASHES[i];
    const isRight = idx % 2 === 1;

    if (isRight) {
      current = poseidon2([sibling, current]);
    } else {
      current = poseidon2([current, sibling]);
    }

    idx = Math.floor(idx / 2);
  }

  return current === expectedRoot;
}

/**
 * Sync tree state from on-chain (for production)
 */
export async function syncFromChain(): Promise<void> {
  // In production, this would:
  // 1. Connect to Solana RPC
  // 2. Fetch Privacy Pool account
  // 3. Parse leaves from account data
  // 4. Update local state

  console.log('[BalanceMerkle] Sync from chain not implemented (demo mode)');
}

/**
 * Check if a root was valid recently (for race conditions)
 */
export function isRecentRoot(rootHex: string): boolean {
  // In demo mode, just check if it matches current root
  // Production would keep a history of recent roots
  const root = hexToField(rootHex);
  return root === treeState.root || (treeState.leaves.length === 0 && root === ZERO_HASHES[MERKLE_DEPTH]);
}

// ============================================
// HELPERS
// ============================================

function fieldToHex(value: bigint): string {
  return '0x' + value.toString(16).padStart(64, '0');
}

function hexToField(hex: string): bigint {
  return BigInt(hex);
}

// ============================================
// STATS
// ============================================

export function getTreeStats(): {
  depth: number;
  maxLeaves: number;
  currentLeaves: number;
  root: string;
  lastUpdated: number;
} {
  initializeZeroHashes();

  return {
    depth: MERKLE_DEPTH,
    maxLeaves: MAX_LEAVES,
    currentLeaves: treeState.leaves.length,
    root: getMerkleRoot(),
    lastUpdated: treeState.lastUpdated,
  };
}
