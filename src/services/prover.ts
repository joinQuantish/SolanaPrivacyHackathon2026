import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import type {
  ProveRequest,
  ProveResponse,
  VerifyResponse,
} from '../types/index.js';
import { buildMerkleTree, getAllMerklePaths } from './merkle.js';
import {
  computeCommitmentHash,
  commitmentToCircuitFormat,
  zeroCommitment,
} from './commitment.js';
import { pubkeyToField, sideToField, decimalToField, sharesToField, usdcToField, marketIdToField, stringToField } from '../utils/field.js';
import { poseidonHash2, poseidonHash5, poseidonHashN } from './poseidon.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Calculate the WASM path for bb.js
function getWasmPath(): string {
  // Find the bb.js module directory
  const bbJsDir = dirname(fileURLToPath(import.meta.resolve('@aztec/bb.js')));
  return join(bbJsDir, 'barretenberg_wasm', 'barretenberg-threads.wasm.gz');
}

// Cached circuit and backend instances
let cachedNoir: Noir | null = null;
let cachedBackend: UltraHonkBackend | null = null;
let cachedCircuit: object | null = null;

/**
 * Initialize the Noir circuit and UltraHonk backend
 */
async function initializeProver(): Promise<{ noir: Noir; backend: UltraHonkBackend }> {
  if (cachedNoir && cachedBackend) {
    return { noir: cachedNoir, backend: cachedBackend };
  }

  console.log('Initializing Noir prover...');

  // Load compiled circuit JSON
  const circuitPath = join(
    __dirname,
    '../../circuits/obsidian_batch_verifier/target/obsidian_batch_verifier.json'
  );

  const circuitJson = JSON.parse(await readFile(circuitPath, 'utf-8'));
  cachedCircuit = circuitJson;

  // Initialize UltraHonk backend with explicit WASM path
  const wasmPath = getWasmPath();
  console.log('Using WASM path:', wasmPath);
  const backend = new UltraHonkBackend(circuitJson.bytecode, { threads: 1, wasmPath });

  // Initialize Noir
  const noir = new Noir(circuitJson);

  cachedNoir = noir;
  cachedBackend = backend;

  console.log('Noir prover initialized successfully');

  return { noir, backend };
}

/**
 * Generate a ZK proof for a batch
 */
export async function generateProof(request: ProveRequest): Promise<ProveResponse> {
  try {
    const { noir, backend } = await initializeProver();

    const numOrders = request.commitments.length;

    // Step 1: Compute commitment hashes
    console.log(`Computing ${numOrders} commitment hashes...`);
    const commitmentHashes: string[] = [];
    for (const commitment of request.commitments) {
      const hash = await computeCommitmentHash(commitment, poseidonHash5, poseidonHash2, poseidonHashN);
      commitmentHashes.push(hash);
    }

    // Step 2: Build Merkle tree
    console.log('Building Merkle tree...');
    const tree = await buildMerkleTree(commitmentHashes, poseidonHash2);

    // Verify merkle root matches (if provided)
    if (request.merkleRoot && request.merkleRoot !== tree.root) {
      return {
        success: false,
        error: `Merkle root mismatch. Computed: ${tree.root}, Provided: ${request.merkleRoot}`,
      };
    }

    // Step 3: Get all Merkle paths
    const merklePaths = getAllMerklePaths(tree, numOrders);

    // Step 4: Prepare circuit inputs
    console.log('Preparing circuit inputs...');

    // Pad commitments to MAX_BATCH_SIZE (async because distribution hash computation)
    const paddedCommitments: Record<string, string>[] = [];
    for (let i = 0; i < 32; i++) {
      if (i < numOrders) {
        paddedCommitments.push(await commitmentToCircuitFormat(request.commitments[i], poseidonHash2, poseidonHashN));
      } else {
        paddedCommitments.push(zeroCommitment());
      }
    }

    // Pad allocations to MAX_BATCH_SIZE
    const paddedAllocations: Record<string, string>[] = [];
    for (let i = 0; i < 32; i++) {
      if (i < numOrders) {
        // Use distributionHash if provided, otherwise compute from destinationWallet
        const distHash = request.allocations[i].distributionHash || pubkeyToField(request.allocations[i].destinationWallet);
        paddedAllocations.push({
          distribution_hash: distHash,
          shares_amount: sharesToField(request.allocations[i].sharesAmount),
        });
      } else {
        paddedAllocations.push({
          distribution_hash: '0',
          shares_amount: '0',
        });
      }
    }

    const circuitInputs = {
      // Public inputs
      batch_id: stringToField(request.batchId),
      merkle_root: tree.root,
      total_usdc_in: usdcToField(request.totalUsdcIn),
      total_shares_out: sharesToField(request.totalSharesOut),
      market_id: marketIdToField(request.marketId),
      side: sideToField(request.side),

      // Private inputs
      commitments: paddedCommitments,
      allocations: paddedAllocations,
      merkle_paths: merklePaths,
      num_orders: numOrders,  // Pass as number for u32
    };

    // Debug: print circuit inputs
    console.log('Circuit inputs:', JSON.stringify({
      batch_id: circuitInputs.batch_id,
      merkle_root: circuitInputs.merkle_root,
      total_usdc_in: circuitInputs.total_usdc_in,
      total_shares_out: circuitInputs.total_shares_out,
      market_id: circuitInputs.market_id,
      side: circuitInputs.side,
      num_orders: circuitInputs.num_orders,
      commitment_0: circuitInputs.commitments[0],
      allocation_0: circuitInputs.allocations[0],
      merkle_path_0: circuitInputs.merkle_paths[0],
    }, null, 2));

    // Step 5: Generate witness and proof
    console.log('Generating proof (this may take a while)...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { witness } = await noir.execute(circuitInputs as any);
    const proof = await backend.generateProof(witness);

    // Step 6: Self-verify
    console.log('Verifying proof...');
    const verified = await backend.verifyProof(proof);

    // Extract public inputs from proof
    const publicInputs = [
      circuitInputs.batch_id,
      tree.root,
      circuitInputs.total_usdc_in,
      circuitInputs.total_shares_out,
      circuitInputs.market_id,
      circuitInputs.side,
    ];

    console.log('Proof generation complete!');

    return {
      success: true,
      proof: Buffer.from(proof.proof).toString('hex'),
      publicInputs,
      verified,
    };
  } catch (error) {
    console.error('Proof generation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during proof generation',
    };
  }
}

/**
 * Verify a ZK proof
 */
export async function verifyProof(
  proofHex: string,
  publicInputs: string[]
): Promise<VerifyResponse> {
  try {
    const { backend } = await initializeProver();

    const proofBytes = Buffer.from(proofHex, 'hex');
    const proof = {
      proof: new Uint8Array(proofBytes),
      publicInputs,
    };

    const valid = await backend.verifyProof(proof);

    return { valid };
  } catch (error) {
    console.error('Proof verification failed:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error during verification',
    };
  }
}

/**
 * Get circuit info (for debugging)
 */
export async function getCircuitInfo(): Promise<{
  initialized: boolean;
  maxBatchSize: number;
  merkleDepth: number;
}> {
  return {
    initialized: cachedNoir !== null,
    maxBatchSize: 32,
    merkleDepth: 5,
  };
}
