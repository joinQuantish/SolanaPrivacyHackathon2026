/**
 * Types for the full relay service
 *
 * Includes support for Arcium MPC encrypted orders where the relay
 * cannot see individual order amounts or distribution details.
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
  | 'collecting'      // Accepting orders
  | 'ready'           // Full or timeout, ready to execute
  | 'mpc_computing'   // MPC computing batch total (encrypted batches)
  | 'executing'       // Trade in progress on DFlow
  | 'proving'         // Generating ZK proof
  | 'mpc_distributing'// MPC computing distributions (encrypted batches)
  | 'distributing'    // Sending shares to users
  | 'completed'       // All done
  | 'failed';         // Something went wrong

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
 * Encrypted order submission (for MPC)
 * User encrypts order client-side using Arcium SDK
 * Relay cannot see: usdcAmount, distribution details, salt
 */
export interface EncryptedOrderSubmission {
  // Visible to relay (needed for batching)
  marketId: string;
  side: 'YES' | 'NO';

  // Encrypted data (relay cannot decrypt)
  encryptedData: {
    ciphertext: string;  // Base64 encoded
    publicKey: string;   // Base64 encoded ephemeral pubkey
    nonce: string;       // Base64 encoded nonce
  };

  // Optional token mints
  yesTokenMint?: string;
  noTokenMint?: string;
}

/**
 * Order stored in the relay
 */
export interface RelayOrder {
  id: string;
  batchId: string | null;
  status: OrderStatus;

  // Is this an encrypted order (MPC)?
  isEncrypted: boolean;

  // Commitment data (NOT AVAILABLE for encrypted orders)
  marketId: string;
  side: 'YES' | 'NO';
  usdcAmount: string;         // Committed amount (HIDDEN for encrypted orders - set to "0")
  salt: string;               // HIDDEN for encrypted orders
  commitmentHash: string;     // Poseidon hash (HIDDEN for encrypted orders)

  // Distribution plan (HIDDEN for encrypted orders)
  distribution: DistributionDestination[];

  // Legacy single destination (HIDDEN for encrypted orders)
  destinationWallet: string;

  // Encrypted order data (only for isEncrypted=true)
  // Relay stores this but CANNOT decrypt it
  encryptedData?: {
    ciphertext: string;  // Base64 encoded
    publicKey: string;   // Base64 encoded
    nonce: string;       // Base64 encoded
  };
  mpcOrderIndex?: number;     // Index in MPC batch

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

  // Is this an MPC batch (encrypted orders)?
  isEncrypted: boolean;

  // Batch parameters
  marketId: string;
  side: 'YES' | 'NO';

  // Token mints (from first order with mints, or fetched)
  yesTokenMint?: string;
  noTokenMint?: string;

  // Orders in this batch
  orderIds: string[];

  // Committed totals
  // For encrypted batches, this is UNKNOWN until MPC reveals it
  totalUsdcCommitted: string;

  // MPC-specific fields (only for isEncrypted=true)
  mpcStateAddress?: string;       // On-chain PDA for encrypted batch state
  mpcRevealedTotal?: number;      // Total revealed by MPC (in USDC)
  mpcRevealedCount?: number;      // Order count revealed by MPC

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
