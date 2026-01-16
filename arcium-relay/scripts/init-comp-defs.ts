/**
 * Initialize Computation Definitions on Arcium Devnet
 *
 * This script uploads our MPC circuits and initializes computation definitions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import {
  uploadCircuit,
  buildFinalizeCompDefTx,
  getCompDefAccAddress,
  getMXEAccAddress,
  getArciumProgram,
  getMXEPublicKey,
} from '@arcium-hq/client';

// Config
const PROGRAM_ID = new PublicKey('6EsUwDkg4z6qTsH8VQkCpPXJAyogm8A6YSnjh14Ub8Bp');
const RPC_URL = 'https://api.devnet.solana.com';

// Circuits to initialize
const CIRCUITS = [
  'init_batch',
  'add_to_batch',
  'reveal_batch_total',
  'compute_distribution',
];

async function loadKeypair(): Promise<Keypair> {
  const keyPath = process.env.HOME + '/.config/solana/id.json';
  const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

async function initializeCompDef(
  provider: AnchorProvider,
  circuitName: string,
): Promise<void> {
  console.log(`\n=== Initializing: ${circuitName} ===`);

  // Load raw circuit
  const rawCircuitPath = path.join(__dirname, '..', 'artifacts', `${circuitName}_raw_circuit_0.json`);
  if (!fs.existsSync(rawCircuitPath)) {
    console.log(`  Raw circuit not found: ${rawCircuitPath}`);
    return;
  }

  const rawCircuit = fs.readFileSync(rawCircuitPath);
  console.log(`  Circuit size: ${rawCircuit.length} bytes`);

  try {
    // Upload circuit
    console.log('  Uploading circuit...');
    const txSigs = await uploadCircuit(
      provider,
      circuitName,
      PROGRAM_ID,
      rawCircuit,
      true, // logging
      800,  // chunk size
    );
    console.log(`  Upload complete: ${txSigs.length} transactions`);

    // Finalize
    console.log('  Finalizing computation definition...');
    const compDefOffset = getCompDefOffset(circuitName);
    const finalizeTx = await buildFinalizeCompDefTx(
      provider,
      compDefOffset,
      PROGRAM_ID,
    );
    const sig = await provider.sendAndConfirm(finalizeTx);
    console.log(`  Finalized: ${sig}`);
  } catch (error) {
    console.error(`  Error: ${error}`);
  }
}

function getCompDefOffset(circuitName: string): number {
  // Generate offset from circuit name (simple hash)
  let hash = 0;
  for (let i = 0; i < circuitName.length; i++) {
    const char = circuitName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % 256;
}

async function main() {
  console.log('=== Arcium Computation Definition Initializer ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const keypair = await loadKeypair();
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

  console.log(`Payer: ${keypair.publicKey.toBase58()}`);
  console.log(`Program ID: ${PROGRAM_ID.toBase58()}`);

  // Check MXE
  const mxeAddress = getMXEAccAddress(PROGRAM_ID);
  console.log(`MXE Address: ${mxeAddress.toBase58()}`);

  const mxePublicKey = await getMXEPublicKey(provider, PROGRAM_ID);
  console.log(`MXE Public Key: ${mxePublicKey ? 'Available' : 'Not set'}`);

  // Initialize each circuit
  for (const circuit of CIRCUITS) {
    await initializeCompDef(provider, circuit);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
