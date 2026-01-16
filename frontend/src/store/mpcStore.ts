/**
 * MPC Store - Zustand store for Arcium MPC state management
 */

import { create } from 'zustand';
import { getMpcStatus, submitEncryptedOrder, type MpcStatusResponse, type EncryptedOrderResponse } from '../api/arcium';
import { encryptOrder, type OrderData, type EncryptedOrder } from '../utils/arcium-encrypt';

export type MpcConnectionStatus = 'checking' | 'ready' | 'partial' | 'not_ready' | 'error' | 'disabled';

interface MpcState {
  // Status
  connectionStatus: MpcConnectionStatus;
  diagnostics: MpcStatusResponse | null;
  lastChecked: Date | null;
  error: string | null;

  // Encrypted order submission
  isSubmitting: boolean;
  lastSubmission: EncryptedOrderResponse | null;
  encryptedBlob: EncryptedOrder | null;

  // Actions
  checkStatus: () => Promise<void>;
  encryptAndSubmit: (orderData: OrderData) => Promise<EncryptedOrderResponse | null>;
  encryptOnly: (orderData: OrderData) => Promise<EncryptedOrder | null>;
  clearSubmission: () => void;
  clearError: () => void;
}

export const useMpcStore = create<MpcState>((set, get) => ({
  // Initial state
  connectionStatus: 'checking',
  diagnostics: null,
  lastChecked: null,
  error: null,
  isSubmitting: false,
  lastSubmission: null,
  encryptedBlob: null,

  // Check MPC status
  checkStatus: async () => {
    set({ connectionStatus: 'checking', error: null });

    try {
      const status = await getMpcStatus();

      let connectionStatus: MpcConnectionStatus = 'error';

      if (!status.enabled) {
        connectionStatus = 'disabled';
      } else if (status.status === 'ready') {
        connectionStatus = 'ready';
      } else if (status.status === 'partial') {
        connectionStatus = 'partial';
      } else if (status.status === 'not_ready') {
        connectionStatus = 'not_ready';
      }

      set({
        connectionStatus,
        diagnostics: status,
        lastChecked: new Date(),
      });
    } catch (error) {
      set({
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : 'Failed to check MPC status',
        lastChecked: new Date(),
      });
    }
  },

  // Encrypt order only (for display purposes)
  encryptOnly: async (orderData: OrderData) => {
    try {
      const encrypted = await encryptOrder(orderData);
      set({ encryptedBlob: encrypted });
      return encrypted;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Encryption failed',
      });
      return null;
    }
  },

  // Encrypt and submit order
  encryptAndSubmit: async (orderData: OrderData) => {
    set({ isSubmitting: true, error: null, encryptedBlob: null, lastSubmission: null });

    try {
      // Step 1: Encrypt the order client-side
      const encrypted = await encryptOrder(orderData);
      set({ encryptedBlob: encrypted });

      // Step 2: Submit encrypted order to relay
      const response = await submitEncryptedOrder(encrypted);

      set({
        isSubmitting: false,
        lastSubmission: response,
      });

      return response;
    } catch (error) {
      set({
        isSubmitting: false,
        error: error instanceof Error ? error.message : 'Failed to submit encrypted order',
      });
      return null;
    }
  },

  // Clear submission state
  clearSubmission: () => {
    set({
      lastSubmission: null,
      encryptedBlob: null,
      error: null,
    });
  },

  // Clear error
  clearError: () => set({ error: null }),
}));
