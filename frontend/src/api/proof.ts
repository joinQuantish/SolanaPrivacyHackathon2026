/**
 * Proof API Service
 *
 * API calls for zkNoir proof status
 */

import { get } from './client';

/**
 * Proof status values
 */
export type ProofStatus = 'pending' | 'generating' | 'verified' | 'none';

/**
 * Batch proof response from /relay/batch/:batchId/proof
 */
export interface BatchProofResponse {
  success: boolean;
  batchId: string;
  hasProof: boolean;
  status: ProofStatus;
  verified?: boolean;
  proofHash?: string;
  message?: string;
  publicInputs?: string[];
  publicInputsExplained?: {
    merkleRoot: string;
    totalUsdc: string;
    totalShares: string;
  };
  circuitInfo?: {
    name: string;
    type: string;
    purpose: string;
  };
  executionInfo?: {
    actualUsdcSpent?: string;
    actualSharesReceived?: string;
    fillPercentage?: number;
  };
  error?: string;
}

/**
 * Get proof status for a batch
 */
export async function getBatchProofStatus(batchId: string): Promise<BatchProofResponse> {
  return get<BatchProofResponse>(`/relay/batch/${batchId}/proof`);
}
