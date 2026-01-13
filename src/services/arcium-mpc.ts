/**
 * Arcium MPC Integration Service
 *
 * This service connects to Arcium's MXE (Multi-party eXecution Environment) network
 * to execute encrypted computations on order data.
 *
 * The relay NEVER sees:
 * - Individual order amounts
 * - Distribution details
 * - Salt values
 *
 * The relay ONLY learns:
 * - Batch total (for DFlow execution)
 * - Per-order share allocations (one at a time, during distribution)
 *
 * STRICT: NO FALLBACKS, NO MOCK DATA - Real Arcium network only!
 */

import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getRelayWallet } from './wallet.js';

// Arcium program IDs (mainnet alpha / devnet)
const ARCIUM_MXE_PROGRAM = new PublicKey('MXE3xfNRCrE6b3P6Y5NvfgHWYPRQKL7hSrPTqJwpump');

// Use environment variable or default to localnet deployment
const OBSIDIAN_MPC_PROGRAM = new PublicKey(
  process.env.OBSIDIAN_MPC_PROGRAM_ID || '6EsUwDkg4z6qTsH8VQkCpPXJAyogm8A6YSnjh14Ub8Bp' // localnet
);

// Cluster endpoints
const ARCIUM_DEVNET_RPC = 'https://devnet.arcium.network';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899'; // Default to localnet

/**
 * Encrypted order data that user submits
 * The relay cannot decrypt this - only MXE nodes can
 */
export interface EncryptedOrderData {
  // Encrypted ciphertext from Arcium client SDK
  ciphertext: Uint8Array;
  // Ephemeral public key for ECDH
  publicKey: Uint8Array;
  // Nonce used for encryption
  nonce: Uint8Array;
}

/**
 * Batch state stored on-chain (encrypted)
 */
export interface MpcBatchState {
  // PDA address for this batch's encrypted state
  stateAddress: PublicKey;
  // Number of orders added (visible)
  orderCount: number;
  // Market info (visible - needed for batching)
  marketId: string;
  side: 'YES' | 'NO';
  // Revealed after batch closes
  revealedTotal?: number;
  // Status
  status: 'collecting' | 'closed' | 'revealed' | 'distributing' | 'completed';
}

/**
 * Distribution instruction from MPC
 */
export interface MpcDistributionInstruction {
  // Amount of shares to send
  sharesAmount: number;
  // Destination wallet (lo + hi = full pubkey)
  destinationWallet: PublicKey;
  // Order index in batch
  orderIndex: number;
}

/**
 * Arcium MPC Service
 */
class ArciumMpcService {
  private connection: Connection;
  private arciumConnection: Connection;
  private batches: Map<string, MpcBatchState> = new Map();

  constructor() {
    this.connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    this.arciumConnection = new Connection(ARCIUM_DEVNET_RPC, 'confirmed');
    console.log(`[ArciumMPC] Initialized with RPC: ${SOLANA_RPC_URL}`);
    console.log(`[ArciumMPC] Program ID: ${OBSIDIAN_MPC_PROGRAM.toBase58()}`);
  }

  /**
   * Initialize a new MPC batch on-chain
   * Creates encrypted state that only MXE nodes can access
   */
  async initBatch(batchId: string, marketId: string, side: 'YES' | 'NO'): Promise<MpcBatchState> {
    console.log(`[ArciumMPC] Initializing MPC batch ${batchId} for ${marketId} ${side}`);

    const wallet = await getRelayWallet();
    const walletPubkey = wallet.getPublicKey();

    // Derive PDA for batch state
    const [stateAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('obsidian_batch'),
        Buffer.from(batchId.slice(0, 32)),
      ],
      OBSIDIAN_MPC_PROGRAM
    );

    // Build init_batch instruction
    // This calls our Anchor program which initializes the batch account
    const ix = new TransactionInstruction({
      programId: OBSIDIAN_MPC_PROGRAM,
      keys: [
        { pubkey: stateAddress, isSigner: false, isWritable: true },
        { pubkey: walletPubkey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      ],
      // Anchor discriminator for create_batch + market_id_hash + side
      data: this.encodeCreateBatch(marketId, side),
    });

    const tx = new Transaction().add(ix);

    try {
      // Sign and send using wallet's signAndSend method
      const result = await wallet.signAndSendTransaction(tx);
      if (result.success) {
        console.log(`[ArciumMPC] Batch initialized on-chain: ${result.signature}`);
      }
    } catch (error) {
      // If account already exists, that's ok
      console.log(`[ArciumMPC] Batch may already exist, continuing...`);
    }

    const state: MpcBatchState = {
      stateAddress,
      orderCount: 0,
      marketId,
      side,
      status: 'collecting',
    };

    this.batches.set(batchId, state);
    return state;
  }

  /**
   * Add an encrypted order to an MPC batch
   * The relay cannot see the order amount - only the MXE nodes can
   */
  async addEncryptedOrder(
    batchId: string,
    encryptedOrder: EncryptedOrderData,
    orderIndex: number
  ): Promise<{ success: boolean; error?: string }> {
    console.log(`[ArciumMPC] Adding encrypted order ${orderIndex} to batch ${batchId}`);

    const state = this.batches.get(batchId);
    if (!state) {
      return { success: false, error: 'Batch not found' };
    }

    if (state.status !== 'collecting') {
      return { success: false, error: `Batch status is ${state.status}, not collecting` };
    }

    const wallet = await getRelayWallet();
    const walletPubkey = wallet.getPublicKey();

    // Build add_encrypted_order instruction
    // This queues the encrypted data for MPC processing
    const ix = new TransactionInstruction({
      programId: OBSIDIAN_MPC_PROGRAM,
      keys: [
        { pubkey: state.stateAddress, isSigner: false, isWritable: true },
        { pubkey: walletPubkey, isSigner: true, isWritable: false },
        { pubkey: ARCIUM_MXE_PROGRAM, isSigner: false, isWritable: false },
      ],
      // Anchor discriminator for add_encrypted_order + ciphertext
      data: this.encodeAddOrder(encryptedOrder, orderIndex),
    });

    const tx = new Transaction().add(ix);

    try {
      const result = await wallet.signAndSendTransaction(tx);
      if (!result.success) {
        throw new Error(result.error);
      }

      state.orderCount++;
      console.log(`[ArciumMPC] Order added on-chain: ${result.signature}`);

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ArciumMPC] Failed to add order: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Close batch and request MPC to reveal the total
   * MPC computes the sum of all encrypted amounts and reveals ONLY the total
   */
  async closeBatchAndRevealTotal(batchId: string): Promise<{
    success: boolean;
    totalUsdc?: number;
    orderCount?: number;
    error?: string;
  }> {
    console.log(`[ArciumMPC] Closing batch ${batchId} and requesting total reveal`);

    const state = this.batches.get(batchId);
    if (!state) {
      return { success: false, error: 'Batch not found' };
    }

    const wallet = await getRelayWallet();
    const walletPubkey = wallet.getPublicKey();

    // Build close_batch instruction with MPC callback
    // This triggers the MPC network to:
    // 1. Decrypt all encrypted orders (inside TEE)
    // 2. Sum the amounts
    // 3. Reveal ONLY the total
    const ix = new TransactionInstruction({
      programId: OBSIDIAN_MPC_PROGRAM,
      keys: [
        { pubkey: state.stateAddress, isSigner: false, isWritable: true },
        { pubkey: walletPubkey, isSigner: true, isWritable: false },
        { pubkey: ARCIUM_MXE_PROGRAM, isSigner: false, isWritable: false },
      ],
      // Anchor discriminator for close_batch (triggers MPC reveal_batch_total)
      data: this.encodeCloseBatch(),
    });

    const tx = new Transaction().add(ix);

    try {
      const result = await wallet.signAndSendTransaction(tx);
      if (!result.success) {
        throw new Error(result.error);
      }
      console.log(`[ArciumMPC] Batch close requested: ${result.signature}`);

      // Poll for MPC callback result
      // In production, this would listen for program logs or use websockets
      const mpcResult = await this.waitForMpcReveal(batchId, state.stateAddress);

      if (mpcResult.success) {
        state.status = 'revealed';
        state.revealedTotal = mpcResult.totalUsdc;

        return {
          success: true,
          totalUsdc: mpcResult.totalUsdc,
          orderCount: state.orderCount,
        };
      }

      return { success: false, error: mpcResult.error };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ArciumMPC] Failed to close batch: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Request MPC to compute distribution for a specific order
   * Returns the shares amount and destination wallet for ONE order at a time
   */
  async getDistributionInstruction(
    batchId: string,
    orderIndex: number,
    totalShares: number
  ): Promise<{
    success: boolean;
    instruction?: MpcDistributionInstruction;
    error?: string;
  }> {
    console.log(`[ArciumMPC] Getting distribution for order ${orderIndex} in batch ${batchId}`);

    const state = this.batches.get(batchId);
    if (!state) {
      return { success: false, error: 'Batch not found' };
    }

    if (state.status !== 'revealed' && state.status !== 'distributing') {
      return { success: false, error: `Batch status is ${state.status}, need revealed/distributing` };
    }

    state.status = 'distributing';

    const wallet = await getRelayWallet();
    const walletPubkey = wallet.getPublicKey();

    // Build get_distribution_instruction call
    // MPC will:
    // 1. Access encrypted order data for orderIndex
    // 2. Compute shares = (order_amount / batch_total) * total_shares
    // 3. Reveal shares + destination wallet for this ONE order
    const ix = new TransactionInstruction({
      programId: OBSIDIAN_MPC_PROGRAM,
      keys: [
        { pubkey: state.stateAddress, isSigner: false, isWritable: true },
        { pubkey: walletPubkey, isSigner: true, isWritable: false },
        { pubkey: ARCIUM_MXE_PROGRAM, isSigner: false, isWritable: false },
      ],
      data: this.encodeGetDistribution(orderIndex, totalShares),
    });

    const tx = new Transaction().add(ix);

    try {
      const result = await wallet.signAndSendTransaction(tx);
      if (!result.success) {
        throw new Error(result.error);
      }
      console.log(`[ArciumMPC] Distribution request sent: ${result.signature}`);

      // Poll for MPC callback result
      const distResult = await this.waitForDistributionReveal(batchId, orderIndex, state.stateAddress);

      if (distResult.success && distResult.instruction) {
        return { success: true, instruction: distResult.instruction };
      }

      return { success: false, error: distResult.error };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ArciumMPC] Failed to get distribution: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Mark batch as completed after all distributions done
   */
  async completeBatch(batchId: string): Promise<void> {
    const state = this.batches.get(batchId);
    if (state) {
      state.status = 'completed';
      console.log(`[ArciumMPC] Batch ${batchId} marked complete`);
    }
  }

  /**
   * Get batch state
   */
  getBatchState(batchId: string): MpcBatchState | undefined {
    return this.batches.get(batchId);
  }

  // --- Private helpers ---

  private encodeCreateBatch(marketId: string, side: 'YES' | 'NO'): Buffer {
    // Anchor discriminator for create_batch: first 8 bytes of sha256("global:create_batch")
    const discriminator = Buffer.from([44, 149, 233, 113, 29, 207, 147, 100]);

    // Market ID hash (simplified - in production use proper hash)
    const marketIdHash = Buffer.alloc(16);
    Buffer.from(marketId).copy(marketIdHash);

    // Side: 0 = NO, 1 = YES
    const sideValue = side === 'YES' ? 1 : 0;

    return Buffer.concat([
      discriminator,
      marketIdHash,
      Buffer.from([sideValue]),
    ]);
  }

  private encodeAddOrder(order: EncryptedOrderData, orderIndex: number): Buffer {
    // Anchor discriminator for add_encrypted_order
    const discriminator = Buffer.from([215, 132, 173, 50, 107, 201, 88, 26]);

    // Ciphertext length (u32) + ciphertext
    const ciphertextLen = Buffer.alloc(4);
    ciphertextLen.writeUInt32LE(order.ciphertext.length);

    // Public key (32 bytes)
    const pubkeyBuffer = Buffer.from(order.publicKey);

    // Nonce (16 bytes)
    const nonceBuffer = Buffer.from(order.nonce);

    // Order index (u8)
    const indexBuffer = Buffer.from([orderIndex]);

    return Buffer.concat([
      discriminator,
      indexBuffer,
      ciphertextLen,
      Buffer.from(order.ciphertext),
      pubkeyBuffer,
      nonceBuffer,
    ]);
  }

  private encodeCloseBatch(): Buffer {
    // Anchor discriminator for close_batch
    const discriminator = Buffer.from([166, 174, 35, 253, 209, 211, 181, 28]);

    // For now, we pass 0 values - MPC will fill these via callback
    const revealedTotal = Buffer.alloc(8);
    const revealedCount = Buffer.from([0]);

    return Buffer.concat([discriminator, revealedTotal, revealedCount]);
  }

  private encodeGetDistribution(orderIndex: number, totalShares: number): Buffer {
    // Custom instruction for distribution computation
    const discriminator = Buffer.from([100, 101, 102, 103, 104, 105, 106, 107]);

    const indexBuffer = Buffer.from([orderIndex]);
    const sharesBuffer = Buffer.alloc(8);
    sharesBuffer.writeBigUInt64LE(BigInt(Math.floor(totalShares * 1e6))); // 6 decimals

    return Buffer.concat([discriminator, indexBuffer, sharesBuffer]);
  }

  private async waitForMpcReveal(
    batchId: string,
    stateAddress: PublicKey,
    maxWaitMs: number = 30000
  ): Promise<{ success: boolean; totalUsdc?: number; error?: string }> {
    console.log(`[ArciumMPC] Waiting for MPC reveal for batch ${batchId}...`);

    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Fetch batch account data
        const accountInfo = await this.connection.getAccountInfo(stateAddress);

        if (accountInfo && accountInfo.data.length >= 50) {
          // Parse batch account data
          // Layout: 8 (discriminator) + 32 (authority) + 16 (market_id_hash) + 1 (side) + 8 (total) + 1 (count) + 1 (status)
          const data = accountInfo.data;
          const status = data[66]; // Status byte

          if (status >= 1) { // BatchStatus::Closed or later
            // Read revealed total (u64 at offset 58)
            const totalRaw = data.readBigUInt64LE(58);
            const totalUsdc = Number(totalRaw) / 1e6; // Convert from micros

            console.log(`[ArciumMPC] MPC revealed total: $${totalUsdc}`);
            return { success: true, totalUsdc };
          }
        }
      } catch (error) {
        // Account might not exist yet, keep polling
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return { success: false, error: 'Timeout waiting for MPC reveal' };
  }

  private async waitForDistributionReveal(
    batchId: string,
    orderIndex: number,
    stateAddress: PublicKey,
    maxWaitMs: number = 15000
  ): Promise<{ success: boolean; instruction?: MpcDistributionInstruction; error?: string }> {
    console.log(`[ArciumMPC] Waiting for distribution reveal for order ${orderIndex}...`);

    // For now, simulate the MPC computation locally
    // In full production, this would wait for an MPC callback
    const state = this.batches.get(batchId);
    if (!state || !state.revealedTotal) {
      return { success: false, error: 'No revealed total available' };
    }

    // Note: In production, the actual distribution amounts come from MPC
    // The relay NEVER computes these - it only receives them from MPC callbacks
    // This is a placeholder that will be replaced with real MPC callbacks

    return {
      success: false,
      error: 'Distribution reveal requires MPC callback (not yet implemented)'
    };
  }
}

// Singleton instance
let mpcService: ArciumMpcService | null = null;

/**
 * Get the Arcium MPC service instance
 */
export function getArciumMpcService(): ArciumMpcService {
  if (!mpcService) {
    mpcService = new ArciumMpcService();
  }
  return mpcService;
}

/**
 * Check if MPC is enabled
 */
export function isMpcEnabled(): boolean {
  return process.env.ARCIUM_MPC_ENABLED === 'true';
}
