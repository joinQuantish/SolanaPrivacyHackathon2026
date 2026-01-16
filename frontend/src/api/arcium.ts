/**
 * Arcium MPC API Service
 *
 * API calls for Arcium MPC integration (devnet demo)
 */

import { get, post } from './client';
import type { EncryptedOrder } from '../utils/arcium-encrypt';

/**
 * MPC Status Response from /relay/mpc/status
 */
export interface MpcStatusResponse {
  enabled: boolean;
  message?: string;
  programId?: string;
  mxeAccount?: string;
  clusterOffset?: number;
  status?: 'ready' | 'partial' | 'not_ready' | 'error';
  checks?: {
    mxeAccountExists: boolean;
    clusterAssigned: boolean;
    computationDefsRegistered: boolean;
    nodesAvailable: boolean;
  };
  nodeInfo?: {
    available: number;
    total: number;
  };
  compDefs?: {
    name: string;
    offset: number;
    registered: boolean;
  }[];
  note?: string;
  error?: string;
}

/**
 * Encrypted Order Submission Response
 */
export interface EncryptedOrderResponse {
  success: boolean;
  orderId: string;
  batchId: string;
  status: string;
  isEncrypted: boolean;
  hiddenFields: string[];
  deposit: {
    address: string;
    walletType: string;
    memo: string;
    expiresAt?: string;
    note: string;
  };
  privacy: {
    mpcEnabled: boolean;
    relayCanSee: string[];
    relayCannotSee: string[];
    note: string;
  };
}

/**
 * Get MPC status from the relay
 */
export async function getMpcStatus(): Promise<MpcStatusResponse> {
  return get<MpcStatusResponse>('/relay/mpc/status');
}

/**
 * Submit an encrypted order via MPC
 */
export async function submitEncryptedOrder(
  encryptedOrder: EncryptedOrder
): Promise<EncryptedOrderResponse> {
  return post<EncryptedOrderResponse>('/relay/order/encrypted', {
    marketId: encryptedOrder.marketId,
    side: encryptedOrder.side,
    encryptedData: {
      ciphertext: encryptedOrder.ciphertext,
      publicKey: encryptedOrder.ephemeralPubkey,
      nonce: encryptedOrder.nonce,
    },
  });
}

/**
 * Execute an encrypted batch via MPC
 */
export async function executeEncryptedBatch(batchId: string): Promise<{
  success: boolean;
  batch: unknown;
  isEncrypted: boolean;
  mpcExecution?: {
    revealedTotal: number;
    revealedCount: number;
    note: string;
  };
  error?: string;
}> {
  return post(`/relay/batch/${batchId}/execute`, {});
}
