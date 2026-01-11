import { MERKLE_DEPTH, MAX_BATCH_SIZE } from '../types/index.js';

// Poseidon hash will be imported from noir_js
// For now, we define the interface and will integrate with barretenberg

export interface MerkleTree {
  root: string;
  leaves: string[];
  layers: string[][];
}

export interface MerkleProof {
  path: string[];
  indices: number[];
}

/**
 * Build a Merkle tree from commitment hashes using Poseidon
 * Pads to MAX_BATCH_SIZE with zeros
 */
export async function buildMerkleTree(
  commitmentHashes: string[],
  poseidonHash2: (a: string, b: string) => Promise<string>
): Promise<MerkleTree> {
  // Pad leaves to MAX_BATCH_SIZE
  const leaves = [...commitmentHashes];
  while (leaves.length < MAX_BATCH_SIZE) {
    leaves.push('0');
  }

  // Build tree layer by layer
  const layers: string[][] = [leaves];
  let currentLayer = leaves;

  for (let depth = 0; depth < MERKLE_DEPTH; depth++) {
    const nextLayer: string[] = [];

    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i];
      const right = currentLayer[i + 1] || '0';
      const parent = await poseidonHash2(left, right);
      nextLayer.push(parent);
    }

    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  return {
    root: currentLayer[0],
    leaves,
    layers,
  };
}

/**
 * Get Merkle proof (sibling path) for a leaf at given index
 */
export function getMerkleProof(tree: MerkleTree, leafIndex: number): MerkleProof {
  const path: string[] = [];
  const indices: number[] = [];

  let currentIndex = leafIndex;

  for (let depth = 0; depth < MERKLE_DEPTH; depth++) {
    const layer = tree.layers[depth];
    const isRightNode = currentIndex % 2 === 1;
    const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

    // Get sibling (or 0 if out of bounds)
    const sibling = siblingIndex < layer.length ? layer[siblingIndex] : '0';
    path.push(sibling);
    indices.push(isRightNode ? 1 : 0);

    // Move to parent index
    currentIndex = Math.floor(currentIndex / 2);
  }

  return { path, indices };
}

/**
 * Verify a Merkle proof
 */
export async function verifyMerkleProof(
  leaf: string,
  proof: MerkleProof,
  root: string,
  poseidonHash2: (a: string, b: string) => Promise<string>
): Promise<boolean> {
  let current = leaf;

  for (let i = 0; i < proof.path.length; i++) {
    const sibling = proof.path[i];
    const isRight = proof.indices[i] === 1;

    if (isRight) {
      current = await poseidonHash2(sibling, current);
    } else {
      current = await poseidonHash2(current, sibling);
    }
  }

  return current === root;
}

/**
 * Get all Merkle paths for a batch
 * Returns paths as string[][] for circuit input
 */
export function getAllMerklePaths(
  tree: MerkleTree,
  numOrders: number
): string[][] {
  const paths: string[][] = [];

  for (let i = 0; i < MAX_BATCH_SIZE; i++) {
    if (i < numOrders) {
      const proof = getMerkleProof(tree, i);
      paths.push(proof.path);
    } else {
      // Pad with zero paths
      paths.push(Array(MERKLE_DEPTH).fill('0'));
    }
  }

  return paths;
}
