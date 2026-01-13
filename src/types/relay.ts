/**
 * Types for the full relay service
 */

// Order status in the relay
export type OrderStatus =
  | 'pending_deposit' // Waiting for user to send USDC
  | 'pending'         // Deposit confirmed, waiting for batch to fill
  | 'committed'       // In a batch, waiting for execution
  | 'executing'       // Trade in progress
  | 'completed'       // Shares distributed
  | 'refunded'        // Partially/fully refunded
  | 'failed'          // Execution failed
  | 'expired';        // Deposit not received in time

// Batch status
export type BatchStatus =
  | 'collecting'   // Accepting orders
  | 'ready'        // Full or timeout, ready to execute
  | 'executing'    // Trade in progress on DFlow
  | 'proving'      // Generating ZK proof
  | 'distributing' // Sending shares to users
  | 'completed'    // All done
  | 'failed';      // Something went wrong

/**
 * Distribution destination (wallet + percentage)
 */
export interface DistributionDestination {
  wallet: string;             // Solana wallet address
  percentage: number;         // Percentage in basis points (100 = 1%, 10000 = 100%)
}

/**
 * User order submission
 */
export interface OrderSubmission {
  // Public data
  marketId: string;
  side: 'YES' | 'NO';
  usdcAmount: string;         // Amount in USDC (e.g., "100.00")

  // Token mints (optional - user can provide for any market)
  // If not provided, we try to look up from cache or fetch from API
  yesTokenMint?: string;      // Solana SPL token mint for YES outcome
  noTokenMint?: string;       // Solana SPL token mint for NO outcome

  // Distribution plan (up to 10 destinations, must total 100%)
  // If not provided, defaults to single wallet at 100%
  distribution: DistributionDestination[];

  // Legacy: single destination (converted to distribution internally)
  destinationWallet?: string;

  // For commitment (user provides salt, or we generate)
  salt?: string;
}

// Maximum number of distribution destinations per order
export const MAX_DISTRIBUTION_DESTINATIONS = 10;

/**
 * Order stored in the relay
 */
export interface RelayOrder {
  id: string;
  batchId: string | null;
  status: OrderStatus;

  // Commitment data
  marketId: string;
  side: 'YES' | 'NO';
  usdcAmount: string;         // Committed amount
  salt: string;
  commitmentHash: string;     // Poseidon hash

  // Distribution plan (up to 10 destinations)
  distribution: DistributionDestination[];

  // Legacy single destination (first in distribution array)
  destinationWallet: string;

  // Token mints (user-provided or fetched from API)
  yesTokenMint?: string;
  noTokenMint?: string;

  // Execution results (filled after trade)
  effectiveUsdcSpent?: string;    // Actual USDC used (may be less due to partial fill)
  sharesReceived?: string;        // Total shares allocated to this order
  refundAmount?: string;          // USDC refunded (if partial fill)

  // Per-destination results (filled after distribution)
  distributionResults?: Array<{
    wallet: string;
    sharesAmount: string;
    txSignature?: string;
  }>;

  // Refund transaction (if any)
  refundTxSignature?: string;
  refundWallet?: string;          // Where refund was sent (first distribution wallet)
  refundReason?: string;          // Why refund occurred

  // Deposit tracking
  depositTxSignature?: string;    // User's deposit transaction
  depositSenderWallet?: string;   // Wallet that sent the deposit
  depositConfirmedAt?: Date;      // When deposit was confirmed
  depositExpiresAt?: Date;        // When deposit window expires

  // Timestamps
  createdAt: Date;
  executedAt?: Date;
  completedAt?: Date;
}

/**
 * Batch of orders to execute together
 */
export interface RelayBatch {
  id: string;
  status: BatchStatus;

  // Batch parameters
  marketId: string;
  side: 'YES' | 'NO';

  // Token mints (from first order with mints, or fetched)
  yesTokenMint?: string;
  noTokenMint?: string;

  // Orders in this batch
  orderIds: string[];

  // Committed totals
  totalUsdcCommitted: string;

  // Merkle tree
  merkleRoot?: string;

  // Execution results (from DFlow)
  actualUsdcSpent?: string;       // May differ from committed
  actualSharesReceived?: string;  // Based on market price
  fillPercentage?: number;        // 0-100, how much of order filled
  executionPrice?: string;        // Average price per share

  // DFlow transaction
  dflowOrderId?: string;
  dflowTxSignature?: string;

  // ZK proof
  proof?: string;
  publicInputs?: string[];
  proofVerified?: boolean;

  // Timestamps
  createdAt: Date;
  executionStartedAt?: Date;
  executionCompletedAt?: Date;
  distributionCompletedAt?: Date;
}

/**
 * DFlow execution result
 */
export interface DFlowExecutionResult {
  success: boolean;
  orderId?: string;
  txSignature?: string;

  // What was actually executed
  usdcSpent: string;
  sharesReceived: string;
  averagePrice: string;

  // Fill info
  fillPercentage: number;       // 0-100
  partialFill: boolean;

  // Token info for share distribution
  shareTokenMint: string;       // The YES or NO token mint

  // MCP wallet info (when using MCP for execution)
  mcpWallet?: string;           // MCP wallet that holds the tokens

  error?: string;
}

/**
 * Distribution plan for a batch
 */
export interface DistributionPlan {
  batchId: string;

  // Per-order allocations
  allocations: Array<{
    orderId: string;
    destinationWallet: string;
    sharesAmount: string;
    refundAmount: string;
  }>;

  // Totals (should match batch actuals)
  totalSharesDistributed: string;
  totalRefundsDistributed: string;
}

/**
 * API response for order submission
 */
export interface OrderSubmissionResponse {
  success: boolean;
  orderId?: string;
  batchId?: string;
  commitmentHash?: string;
  depositAddress?: string;    // Where to send USDC
  status?: OrderStatus;
  error?: string;
}

/**
 * API response for batch status
 */
export interface BatchStatusResponse {
  success: boolean;
  batch?: RelayBatch;
  orders?: RelayOrder[];
  error?: string;
}

/**
 * API response for order status
 */
export interface OrderStatusResponse {
  success: boolean;
  order?: RelayOrder;
  error?: string;
}

/**
 * Proof request for updated circuit (with partial fill support)
 */
export interface RelayProveRequest {
  batchId: string;
  merkleRoot: string;

  // Actual execution results
  actualUsdcSpent: string;
  actualSharesReceived: string;

  marketId: string;
  side: 'YES' | 'NO';

  // Order commitments (what users committed to)
  commitments: Array<{
    marketId: string;
    side: 'YES' | 'NO';
    usdcAmount: string;         // Original committed amount
    destinationWallet: string;
    salt: string;
  }>;

  // Calculated allocations based on actual execution
  allocations: Array<{
    destinationWallet: string;
    effectiveUsdcSpent: string;  // Proportional share of actual spend
    sharesAmount: string;        // Proportional share of actual shares
    refundAmount: string;        // Original - effective
  }>;
}

/**
 * Relay configuration
 */
export interface RelayConfig {
  // Batch settings
  maxBatchSize: number;           // Max orders per batch (default: 32)
  batchTimeoutSeconds: number;    // How long to wait before executing undersized batch
  minBatchSize: number;           // Minimum orders to execute

  // Fee settings
  relayFeePercent: number;        // Fee taken by relay (e.g., 0.1 = 0.1%)

  // Slippage settings
  maxSlippagePercent: number;     // Max acceptable slippage

  // Market restrictions
  allowedMarkets?: string[];      // If set, only these markets allowed
  allowedSides?: ('YES' | 'NO')[]; // If set, only these sides allowed
}

/**
 * Default relay configuration
 */
export const DEFAULT_RELAY_CONFIG: RelayConfig = {
  maxBatchSize: 32,
  batchTimeoutSeconds: 60,
  minBatchSize: 1,
  relayFeePercent: 0,
  maxSlippagePercent: 2,
};
