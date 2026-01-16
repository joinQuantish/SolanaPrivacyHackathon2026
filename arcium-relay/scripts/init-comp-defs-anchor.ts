/**
 * Initialize Computation Definitions via Anchor Program
 *
 * This script calls the init_*_comp_def instructions on our Anchor program
 * to register the MPC circuits with Arcium.
 */

import * as fs from 'fs';
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';

// Program configuration - Using Cluster 1 (has active nodes!)
const PROGRAM_ID = new PublicKey('8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc');
// IMPORTANT: This must match the arcium-anchor crate version
// v0.5.4 uses F3G6... (matches arcium CLI 0.5.4)
// v0.6.0-alpha uses BpaW... (different)
const ARCIUM_PROGRAM_ID = new PublicKey('F3G6Q9tRicyznCqcZLydJ6RxkwDSBeHWM458J7V6aeyk');
const RPC_URL = 'https://api.devnet.solana.com';

// Circuits to initialize
const CIRCUITS = [
  'init_batch',
  'add_to_batch',
  'reveal_batch_total',
  'compute_distribution',
];

// Compute comp_def_offset from circuit name (sha256 first 4 bytes as little-endian u32)
function computeCompDefOffset(circuitName: string): number {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(circuitName).digest();
  // First 4 bytes as little-endian u32
  return hash.readUInt32LE(0);
}

// Derive MXE PDA (seeds = ['MXEAccount', program_id], program = arcium_program)
function getMxePda(): PublicKey {
  const [mxeAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from('MXEAccount'), PROGRAM_ID.toBuffer()],
    ARCIUM_PROGRAM_ID
  );
  return mxeAddress;
}

// Derive Comp Def PDA
function getCompDefPda(offset: number): PublicKey {
  const offsetBuffer = Buffer.alloc(4);
  offsetBuffer.writeUInt32LE(offset);

  const [compDefAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from('ComputationDefinitionAccount'), PROGRAM_ID.toBuffer(), offsetBuffer],
    ARCIUM_PROGRAM_ID
  );
  return compDefAddress;
}

async function loadKeypair(): Promise<Keypair> {
  const keyPath = process.env.HOME + '/.config/solana/id.json';
  const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

async function main() {
  console.log('=== Initialize Computation Definitions ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const keypair = await loadKeypair();

  console.log(`Payer: ${keypair.publicKey.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`Arcium: ${ARCIUM_PROGRAM_ID.toBase58()}`);

  // Get MXE address
  const mxeAddress = getMxePda();
  console.log(`MXE Account: ${mxeAddress.toBase58()}\n`);

  // Check MXE exists
  const mxeAccount = await connection.getAccountInfo(mxeAddress);
  if (!mxeAccount) {
    console.error('ERROR: MXE account not found. Run arcium init-mxe first.');
    return;
  }
  console.log(`MXE account exists with ${mxeAccount.data.length} bytes\n`);

  // Load IDL
  const idlPath = '/Users/joshberns/securesoltransfer/arcium-relay/target/idl/obsidian_mpc.json';
  if (!fs.existsSync(idlPath)) {
    console.log('IDL not found. Run anchor build first.');
    return;
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));

  // Set up provider and program
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const program = new anchor.Program(idl, provider);

  // Initialize each computation definition
  const initMethods = [
    { name: 'init_batch', method: 'initInitBatchCompDef' },
    { name: 'add_to_batch', method: 'initAddToBatchCompDef' },
    { name: 'reveal_batch_total', method: 'initRevealBatchTotalCompDef' },
    { name: 'compute_distribution', method: 'initComputeDistributionCompDef' },
  ];

  for (const { name, method } of initMethods) {
    console.log(`\n=== Initializing: ${name} ===`);

    const offset = computeCompDefOffset(name);
    const compDefPda = getCompDefPda(offset);

    console.log(`  Offset: ${offset}`);
    console.log(`  Comp Def PDA: ${compDefPda.toBase58()}`);

    // Check if already initialized
    const existingAccount = await connection.getAccountInfo(compDefPda);
    if (existingAccount) {
      console.log(`  Already initialized, skipping.`);
      continue;
    }

    console.log(`  Calling: program.methods.${method}()`);

    try {
      const tx = await (program.methods as any)[method]()
        .accounts({
          payer: keypair.publicKey,
          mxeAccount: mxeAddress,
          compDefAccount: compDefPda,
          arciumProgram: ARCIUM_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`  Success: ${tx}`);
    } catch (error: any) {
      console.error(`  Error: ${error.message || error}`);
      if (error.logs) {
        console.error('  Logs:', error.logs.slice(-5).join('\n        '));
      }
    }
  }

  console.log('\n=== Done ===');
  console.log('\nNote: Full initialization requires calling the program instructions.');
  console.log('Use Anchor client or web3.js to invoke init_*_comp_def instructions.');
}

function toPascalCase(str: string): string {
  return str.split('_').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join('');
}

main().catch(console.error);
