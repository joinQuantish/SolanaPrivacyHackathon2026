// Maximum batch size - must match circuit constant
export const MAX_BATCH_SIZE = 32;
export const MERKLE_DEPTH = 5; // log2(32) = 5
export const MAX_DISTRIBUTION_DESTINATIONS = 10;

// Distribution destination for multi-wallet support
export interface DistributionEntry {
  wallet: string;       // Solana pubkey
  percentage: number;   // Basis points (100 = 1%, 10000 = 100%)
}

// Order commitment structure (matches Noir struct)
// Note: For circuit, we use distributionHash which is hash of distribution array
export interface OrderCommitment {
  marketId: string;
  side: 'YES' | 'NO';
  usdcAmount: string; // Field as decimal string (6 decimals stored as integer)
  destinationWallet: string; // Primary wallet (first in distribution or legacy)
  salt: string; // 256-bit hex string

  // Multi-wallet distribution (optional, for relay tracking)
  distribution?: DistributionEntry[];
}

// Share allocation result
export interface ShareAllocation {
  destinationWallet: string;
  sharesAmount: string; // Field as decimal string
  distributionHash?: string; // Hash of distribution plan (for circuit)
}

// Request to generate a proof
export interface ProveRequest {
  batchId: string;
  merkleRoot: string;
  totalUsdcIn: string;
  totalSharesOut: string;
  marketId: string;
  side: 'YES' | 'NO';
  commitments: OrderCommitment[];
  allocations: ShareAllocation[];
}

// Response from proof generation
export interface ProveResponse {
  success: boolean;
  proof?: string; // Hex-encoded proof bytes
  publicInputs?: string[]; // For verification
  verified?: boolean; // Self-verification result
  error?: string;
}

// Request to verify a proof
export interface VerifyRequest {
  proof: string;
  publicInputs: string[];
}

// Response from verification
export interface VerifyResponse {
  valid: boolean;
  error?: string;
}

// Internal circuit input format
export interface CircuitInputs {
  // Public inputs
  batch_id: string;
  merkle_root: string;
  total_usdc_in: string;
  total_shares_out: string;
  market_id: string;
  side: string;

  // Private inputs
  commitments: Array<{
    market_id: string;
    side: string;
    usdc_amount: string;
    distribution_hash: string;
    salt: string;
  }>;
  allocations: Array<{
    distribution_hash: string;
    shares_amount: string;
  }>;
  merkle_paths: string[][];
  num_orders: string;
}
