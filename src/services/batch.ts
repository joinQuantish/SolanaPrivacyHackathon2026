import { v4 as uuidv4 } from 'uuid';
import type {
  RelayOrder,
  RelayBatch,
  OrderSubmission,
  BatchStatus,
  OrderStatus,
  DistributionPlan,
  DFlowExecutionResult,
  RelayConfig,
  DistributionDestination,
  MAX_DISTRIBUTION_DESTINATIONS,
} from '../types/relay.js';
import { DEFAULT_RELAY_CONFIG } from '../types/relay.js';
import { buildMerkleTree } from './merkle.js';
import { computeCommitmentHash } from './commitment.js';
import { poseidonHash2, poseidonHash5, poseidonHashN } from './poseidon.js';
import { generateProof } from './prover.js';
import { getRelayWallet } from './wallet.js';
import { decimalToField, pubkeyToField, sideToField } from '../utils/field.js';
import type { DistributionEntry } from '../types/index.js';

// In-memory storage (use database in production)
const orders: Map<string, RelayOrder> = new Map();
const batches: Map<string, RelayBatch> = new Map();

// Current collecting batch per market+side
const collectingBatches: Map<string, string> = new Map(); // "marketId:side" -> batchId

/**
 * Get or create a collecting batch for a market+side
 */
function getOrCreateCollectingBatch(
  marketId: string,
  side: 'YES' | 'NO',
  config: RelayConfig
): RelayBatch {
  const key = `${marketId}:${side}`;
  const existingBatchId = collectingBatches.get(key);

  if (existingBatchId) {
    const batch = batches.get(existingBatchId);
    if (batch && batch.status === 'collecting' && batch.orderIds.length < config.maxBatchSize) {
      return batch;
    }
  }

  // Create new batch
  const batch: RelayBatch = {
    id: uuidv4(),
    status: 'collecting',
    marketId,
    side,
    orderIds: [],
    totalUsdcCommitted: '0',
    createdAt: new Date(),
  };

  batches.set(batch.id, batch);
  collectingBatches.set(key, batch.id);

  console.log(`Created new batch ${batch.id} for ${marketId} ${side}`);
  return batch;
}

/**
 * Validate distribution array (must sum to 10000 basis points = 100%)
 */
function validateDistribution(distribution: DistributionDestination[]): { valid: boolean; error?: string } {
  if (!distribution || distribution.length === 0) {
    return { valid: false, error: 'Distribution array cannot be empty' };
  }

  if (distribution.length > 10) {
    return { valid: false, error: 'Maximum 10 distribution destinations allowed' };
  }

  const totalPercentage = distribution.reduce((sum, d) => sum + d.percentage, 0);
  if (totalPercentage !== 10000) {
    return { valid: false, error: `Distribution must sum to 10000 basis points (100%), got ${totalPercentage}` };
  }

  for (const dest of distribution) {
    if (dest.percentage <= 0) {
      return { valid: false, error: 'Each distribution percentage must be positive' };
    }
    if (!dest.wallet || dest.wallet.length < 32) {
      return { valid: false, error: 'Invalid wallet address in distribution' };
    }
  }

  return { valid: true };
}

/**
 * Submit a new order to the relay
 */
export async function submitOrder(
  submission: OrderSubmission,
  config: RelayConfig = { ...DEFAULT_RELAY_CONFIG }
): Promise<RelayOrder> {
  // Generate salt if not provided
  const salt = submission.salt || Math.floor(Math.random() * 1e15).toString();

  // Handle distribution: use provided or convert legacy destinationWallet
  let distribution: DistributionDestination[];
  if (submission.distribution && submission.distribution.length > 0) {
    distribution = submission.distribution;
  } else if (submission.destinationWallet) {
    // Legacy: single wallet gets 100%
    distribution = [{ wallet: submission.destinationWallet, percentage: 10000 }];
  } else {
    throw new Error('Either distribution array or destinationWallet must be provided');
  }

  // Validate distribution
  const validation = validateDistribution(distribution);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Primary destination wallet (first in distribution)
  const destinationWallet = distribution[0].wallet;

  // Convert to DistributionEntry for commitment
  const distributionEntries: DistributionEntry[] = distribution.map(d => ({
    wallet: d.wallet,
    percentage: d.percentage,
  }));

  // Create commitment (includes distribution hash)
  const commitment = {
    marketId: submission.marketId,
    side: submission.side,
    usdcAmount: submission.usdcAmount,
    destinationWallet, // Primary wallet for backwards compatibility
    salt,
    distribution: distributionEntries,
  };

  // Compute commitment hash (now includes distribution hash)
  const commitmentHash = await computeCommitmentHash(
    commitment,
    poseidonHash5,
    poseidonHash2,
    poseidonHashN
  );

  // Get or create batch
  const batch = getOrCreateCollectingBatch(submission.marketId, submission.side, config);

  // Deposit expires in 1 hour
  const depositExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

  // Create order
  const order: RelayOrder = {
    id: uuidv4(),
    batchId: batch.id,
    status: 'pending_deposit', // Waiting for user to send USDC
    marketId: submission.marketId,
    side: submission.side,
    usdcAmount: submission.usdcAmount,
    distribution,
    destinationWallet, // Primary wallet (first in distribution)
    salt,
    commitmentHash,
    depositExpiresAt,
    createdAt: new Date(),
  };

  // Save order
  orders.set(order.id, order);

  // Add to batch
  batch.orderIds.push(order.id);
  batch.totalUsdcCommitted = (
    parseFloat(batch.totalUsdcCommitted) + parseFloat(submission.usdcAmount)
  ).toString();

  console.log(`Order ${order.id} added to batch ${batch.id}. Batch now has ${batch.orderIds.length} orders.`);
  console.log(`  Distribution: ${distribution.map(d => `${d.wallet.slice(0, 8)}...(${d.percentage / 100}%)`).join(', ')}`);

  // Check if batch is ready
  if (batch.orderIds.length >= config.maxBatchSize) {
    batch.status = 'ready';
    console.log(`Batch ${batch.id} is full and ready for execution`);
  }

  return order;
}

/**
 * Get order by ID
 */
export function getOrder(orderId: string): RelayOrder | undefined {
  return orders.get(orderId);
}

/**
 * Get batch by ID
 */
export function getBatch(batchId: string): RelayBatch | undefined {
  return batches.get(batchId);
}

/**
 * Get all orders in a batch
 */
export function getBatchOrders(batchId: string): RelayOrder[] {
  const batch = batches.get(batchId);
  if (!batch) return [];
  return batch.orderIds.map(id => orders.get(id)!).filter(Boolean);
}

/**
 * Mark batch as ready for execution (manual trigger)
 */
export function markBatchReady(batchId: string): RelayBatch | undefined {
  const batch = batches.get(batchId);
  if (batch && batch.status === 'collecting') {
    batch.status = 'ready';
  }
  return batch;
}

/**
 * Per-wallet allocation within an order (for multi-wallet distribution)
 */
export interface WalletAllocation {
  orderId: string;
  destinationWallet: string;
  sharesAmount: string;
  percentage: number; // Basis points for this wallet
}

/**
 * Extended distribution plan with per-wallet allocations
 */
export interface ExtendedDistributionPlan extends DistributionPlan {
  // All wallet-level allocations (flattened from all orders)
  walletAllocations: WalletAllocation[];
}

/**
 * Calculate distribution plan based on actual execution
 * Now handles multi-wallet distribution per order
 */
export function calculateDistribution(
  batch: RelayBatch,
  executionResult: DFlowExecutionResult
): ExtendedDistributionPlan {
  const batchOrders = getBatchOrders(batch.id);

  const totalCommitted = parseFloat(batch.totalUsdcCommitted);
  const actualSpent = parseFloat(executionResult.usdcSpent);
  const actualShares = parseFloat(executionResult.sharesReceived);

  const walletAllocations: WalletAllocation[] = [];

  const allocations = batchOrders.map(order => {
    const committedUsdc = parseFloat(order.usdcAmount);
    const proportion = committedUsdc / totalCommitted;

    // Calculate effective amounts based on proportion of batch
    const effectiveUsdcSpent = proportion * actualSpent;
    const orderShares = proportion * actualShares;
    const refundAmount = committedUsdc - effectiveUsdcSpent;

    // Split shares across distribution wallets
    for (const dest of order.distribution) {
      const walletSharesProportion = dest.percentage / 10000; // Convert basis points to decimal
      const walletShares = orderShares * walletSharesProportion;

      walletAllocations.push({
        orderId: order.id,
        destinationWallet: dest.wallet,
        sharesAmount: walletShares.toString(),
        percentage: dest.percentage,
      });
    }

    return {
      orderId: order.id,
      destinationWallet: order.destinationWallet, // Primary wallet (for refunds)
      sharesAmount: orderShares.toString(), // Total shares for this order
      refundAmount: refundAmount.toString(),
    };
  });

  // Calculate totals
  const totalSharesDistributed = allocations
    .reduce((sum, a) => sum + parseFloat(a.sharesAmount), 0)
    .toString();
  const totalRefundsDistributed = allocations
    .reduce((sum, a) => sum + parseFloat(a.refundAmount), 0)
    .toString();

  return {
    batchId: batch.id,
    allocations,
    walletAllocations,
    totalSharesDistributed,
    totalRefundsDistributed,
  };
}

/**
 * Generate ZK proof for a batch execution
 */
export async function generateBatchProof(
  batch: RelayBatch,
  executionResult: DFlowExecutionResult
): Promise<{ proof: string; publicInputs: string[]; verified: boolean }> {
  const batchOrders = getBatchOrders(batch.id);
  const distribution = calculateDistribution(batch, executionResult);

  // Build merkle tree from commitment hashes
  const commitmentHashes = batchOrders.map(o => o.commitmentHash);
  const tree = await buildMerkleTree(commitmentHashes, poseidonHash2);

  // Prepare commitments for circuit
  const commitments = batchOrders.map(order => ({
    marketId: order.marketId,
    side: order.side,
    usdcAmount: order.usdcAmount,
    destinationWallet: order.destinationWallet,
    salt: order.salt,
  }));

  // Prepare allocations for circuit
  const allocations = distribution.allocations.map(a => ({
    destinationWallet: a.destinationWallet,
    sharesAmount: a.sharesAmount,
  }));

  // Generate proof
  const proofResult = await generateProof({
    batchId: batch.id,
    merkleRoot: tree.root,
    totalUsdcIn: executionResult.usdcSpent,
    totalSharesOut: executionResult.sharesReceived,
    marketId: batch.marketId,
    side: batch.side,
    commitments,
    allocations,
  });

  if (!proofResult.success || !proofResult.proof) {
    throw new Error(proofResult.error || 'Proof generation failed');
  }

  return {
    proof: proofResult.proof,
    publicInputs: proofResult.publicInputs || [],
    verified: proofResult.verified || false,
  };
}

/**
 * Execute a batch (full flow)
 * This is the main orchestration function
 */
export async function executeBatch(
  batchId: string,
  dflowExecutor: (batch: RelayBatch) => Promise<DFlowExecutionResult>
): Promise<{
  success: boolean;
  batch: RelayBatch;
  distribution?: DistributionPlan;
  error?: string;
}> {
  const batch = batches.get(batchId);
  if (!batch) {
    return { success: false, batch: batch!, error: 'Batch not found' };
  }

  if (batch.status !== 'ready') {
    return { success: false, batch, error: `Batch status is ${batch.status}, not ready` };
  }

  try {
    // 1. Execute on DFlow
    console.log(`Executing batch ${batchId} on DFlow...`);
    batch.status = 'executing';
    batch.executionStartedAt = new Date();

    const executionResult = await dflowExecutor(batch);

    if (!executionResult.success) {
      batch.status = 'failed';
      return { success: false, batch, error: executionResult.error };
    }

    // Store execution results
    batch.actualUsdcSpent = executionResult.usdcSpent;
    batch.actualSharesReceived = executionResult.sharesReceived;
    batch.fillPercentage = executionResult.fillPercentage;
    batch.executionPrice = executionResult.averagePrice;
    batch.dflowOrderId = executionResult.orderId;
    batch.dflowTxSignature = executionResult.txSignature;
    batch.executionCompletedAt = new Date();

    // 2. Generate ZK proof
    console.log(`Generating ZK proof for batch ${batchId}...`);
    batch.status = 'proving';

    const proofResult = await generateBatchProof(batch, executionResult);
    batch.proof = proofResult.proof;
    batch.publicInputs = proofResult.publicInputs;
    batch.proofVerified = proofResult.verified;

    // 3. Calculate distribution
    console.log(`Calculating distribution for batch ${batchId}...`);
    const distribution = calculateDistribution(batch, executionResult);

    // 4. Distribute shares and refunds
    console.log(`Distributing shares for batch ${batchId}...`);
    batch.status = 'distributing';

    const wallet = await getRelayWallet();

    // First, update order info from allocations
    for (const allocation of distribution.allocations) {
      const order = orders.get(allocation.orderId)!;

      // Update order with allocation info
      order.effectiveUsdcSpent = (
        parseFloat(order.usdcAmount) - parseFloat(allocation.refundAmount)
      ).toString();
      order.sharesReceived = allocation.sharesAmount;
      order.refundAmount = allocation.refundAmount;
      order.distributionResults = []; // Initialize for tracking per-wallet results
    }

    // Distribute shares to all wallets (using walletAllocations for multi-wallet support)
    for (const walletAlloc of distribution.walletAllocations) {
      const order = orders.get(walletAlloc.orderId)!;

      // Transfer shares to this wallet
      if (parseFloat(walletAlloc.sharesAmount) > 0) {
        console.log(`Transferring ${walletAlloc.sharesAmount} shares (${walletAlloc.percentage / 100}%) to ${walletAlloc.destinationWallet}`);
        const shareResult = await wallet.transferToken(
          executionResult.shareTokenMint,
          walletAlloc.destinationWallet,
          parseFloat(walletAlloc.sharesAmount),
          6 // Assuming 6 decimals for share tokens
        );

        // Track per-wallet distribution results
        order.distributionResults!.push({
          wallet: walletAlloc.destinationWallet,
          sharesAmount: walletAlloc.sharesAmount,
          txSignature: shareResult.success ? shareResult.signature : undefined,
        });
      }
    }

    // Handle refunds (sent to primary wallet only)
    for (const allocation of distribution.allocations) {
      const order = orders.get(allocation.orderId)!;

      // Transfer refund to primary wallet if any
      if (parseFloat(allocation.refundAmount) > 0) {
        console.log(`Refunding ${allocation.refundAmount} USDC to ${allocation.destinationWallet}`);
        const refundResult = await wallet.transferUsdc(
          allocation.destinationWallet,
          parseFloat(allocation.refundAmount)
        );
        if (refundResult.success) {
          order.refundTxSignature = refundResult.signature;
          order.refundWallet = allocation.destinationWallet;
        }
      }

      // Update order status
      order.status = 'completed';
      order.executedAt = batch.executionCompletedAt;
      order.completedAt = new Date();
    }

    // 5. Mark batch complete
    batch.status = 'completed';
    batch.distributionCompletedAt = new Date();

    console.log(`Batch ${batchId} completed successfully!`);

    return { success: true, batch, distribution };

  } catch (error) {
    batch.status = 'failed';
    return {
      success: false,
      batch,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get all batches (for admin/debug)
 */
export function getAllBatches(): RelayBatch[] {
  return Array.from(batches.values());
}

/**
 * Get all orders (for admin/debug)
 */
export function getAllOrders(): RelayOrder[] {
  return Array.from(orders.values());
}

/**
 * Get collecting batches that are ready or timed out
 */
export function getReadyBatches(config: RelayConfig = { ...DEFAULT_RELAY_CONFIG }): RelayBatch[] {
  const now = new Date();
  const ready: RelayBatch[] = [];

  for (const batch of batches.values()) {
    if (batch.status !== 'collecting') continue;

    const age = (now.getTime() - batch.createdAt.getTime()) / 1000;
    const isTimedOut = age >= config.batchTimeoutSeconds;
    const hasMinOrders = batch.orderIds.length >= config.minBatchSize;

    if (batch.orderIds.length >= config.maxBatchSize || (isTimedOut && hasMinOrders)) {
      ready.push(batch);
    }
  }

  return ready;
}

/**
 * Activate an order after deposit is confirmed
 */
export async function activateOrder(
  orderId: string,
  depositTxSignature: string,
  senderWallet: string
): Promise<{ success: boolean; error?: string }> {
  const order = orders.get(orderId);
  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  if (order.status !== 'pending_deposit') {
    return { success: false, error: `Order status is ${order.status}, expected pending_deposit` };
  }

  // Update order with deposit info
  order.status = 'pending';
  order.depositTxSignature = depositTxSignature;
  order.depositSenderWallet = senderWallet;
  order.depositConfirmedAt = new Date();

  console.log(`Order ${orderId} activated. Deposit confirmed from ${senderWallet}`);

  // Check if batch is ready to execute
  const batch = order.batchId ? batches.get(order.batchId) : null;
  if (batch) {
    const batchOrders = getBatchOrders(batch.id);
    const activeOrders = batchOrders.filter(o => o.status === 'pending');
    console.log(`Batch ${batch.id} has ${activeOrders.length}/${batchOrders.length} active orders`);
  }

  return { success: true };
}

/**
 * Refund an order (amount mismatch or cancellation)
 */
export async function refundOrder(
  orderId: string,
  recipientWallet: string,
  amount: string,
  reason: string
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  const order = orders.get(orderId);

  // Update order status
  if (order) {
    order.status = 'refunded';
    order.refundAmount = amount;
    order.refundWallet = recipientWallet;
    order.refundReason = reason;
  }

  // Execute refund
  const wallet = await getRelayWallet();
  const result = await wallet.transferUsdc(recipientWallet, parseFloat(amount));

  if (result.success) {
    if (order) {
      order.refundTxSignature = result.signature;
    }
    console.log(`Refunded ${amount} USDC to ${recipientWallet}. Reason: ${reason}`);
    return { success: true, txSignature: result.signature };
  }

  console.error(`Refund failed for order ${orderId}: ${result.error}`);
  return { success: false, error: result.error };
}

/**
 * Get orders awaiting deposit
 */
export function getPendingDepositOrders(): RelayOrder[] {
  return Array.from(orders.values()).filter(o => o.status === 'pending_deposit');
}

/**
 * Get active orders (deposit confirmed, waiting for execution)
 */
export function getActiveOrders(): RelayOrder[] {
  return Array.from(orders.values()).filter(o => o.status === 'pending');
}
