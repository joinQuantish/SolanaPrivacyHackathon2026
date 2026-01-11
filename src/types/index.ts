// Maximum batch size - must match circuit constant
export const MAX_BATCH_SIZE = 32;
export const MERKLE_DEPTH = 5; // log2(32) = 5

// Order commitment structure (matches Noir struct)
export interface OrderCommitment {
  marketId: string;
  side: 'YES' | 'NO';
  usdcAmount: string; // Field as decimal string (6 decimals stored as integer)
  destinationWallet: string; // Solana pubkey
  salt: string; // 256-bit hex string
}

// Share allocation result
export interface ShareAllocation {
  destinationWallet: string;
  sharesAmount: string; // Field as decimal string
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
    destination_wallet: string;
    salt: string;
  }>;
  allocations: Array<{
    destination_wallet: string;
    shares_amount: string;
  }>;
  merkle_paths: string[][];
  num_orders: string;
}
