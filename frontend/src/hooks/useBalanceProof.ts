/**
 * useBalanceProof Hook
 *
 * Provides balance proof functionality for the order flow.
 * Allows users to place orders without revealing their balance to the relay.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  initializeProver,
  generateBalanceProof,
  loadSpendingNotes,
  saveSpendingNotes,
  findNoteForOrder,
  SpendingNote,
  BalanceProofOutput,
} from '../utils/balance-prover';

interface UseBalanceProofResult {
  // State
  isInitialized: boolean;
  isGenerating: boolean;
  notes: SpendingNote[];
  totalBalance: bigint;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  refreshNotes: () => void;
  generateProof: (orderAmountUsdc: number) => Promise<{
    success: boolean;
    proof?: BalanceProofOutput;
    error?: string;
  }>;
  submitProofToRelay: (proof: BalanceProofOutput) => Promise<{
    success: boolean;
    newLeafIndex?: number;
    error?: string;
  }>;
  hasEnoughBalance: (amountUsdc: number) => boolean;
}

export function useBalanceProof(): UseBalanceProofResult {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notes, setNotes] = useState<SpendingNote[]>([]);
  const [totalBalance, setTotalBalance] = useState<bigint>(0n);
  const [error, setError] = useState<string | null>(null);

  // Load notes on mount
  useEffect(() => {
    refreshNotes();
  }, []);

  const refreshNotes = useCallback(() => {
    try {
      const storedNotes = loadSpendingNotes();
      const validNotes = storedNotes.filter(n => n.leafIndex >= 0);
      setNotes(validNotes);

      const total = validNotes.reduce((sum, note) => sum + note.amount, 0n);
      setTotalBalance(total);
    } catch (err: any) {
      console.error('[useBalanceProof] Error loading notes:', err);
      setError(err.message);
    }
  }, []);

  const initialize = useCallback(async () => {
    if (isInitialized) return;

    try {
      console.log('[useBalanceProof] Initializing prover...');
      await initializeProver();
      setIsInitialized(true);
      console.log('[useBalanceProof] Prover initialized');
    } catch (err: any) {
      console.error('[useBalanceProof] Failed to initialize:', err);
      setError(err.message);
    }
  }, [isInitialized]);

  const hasEnoughBalance = useCallback((amountUsdc: number): boolean => {
    const microUsdc = BigInt(Math.floor(amountUsdc * 1_000_000));
    return totalBalance >= microUsdc;
  }, [totalBalance]);

  const generateProof = useCallback(async (orderAmountUsdc: number): Promise<{
    success: boolean;
    proof?: BalanceProofOutput;
    error?: string;
  }> => {
    setIsGenerating(true);
    setError(null);

    try {
      // Initialize prover if needed
      if (!isInitialized) {
        await initialize();
      }

      const orderAmount = BigInt(Math.floor(orderAmountUsdc * 1_000_000));

      // Find a note with sufficient balance
      const note = findNoteForOrder(notes, orderAmount);
      if (!note) {
        return {
          success: false,
          error: 'No spending note found with sufficient balance',
        };
      }

      console.log(`[useBalanceProof] Found note with ${note.amount} microUSDC`);

      // Fetch merkle path from relay
      const pathResponse = await fetch(`/api/privacy/balance-proof/merkle-path/${note.leafIndex}`);
      if (!pathResponse.ok) {
        throw new Error('Failed to fetch Merkle path');
      }
      const { path: merklePath, root: merkleRoot } = await pathResponse.json();

      console.log('[useBalanceProof] Generating proof...');

      // Generate the balance proof
      const proof = await generateBalanceProof({
        note,
        orderAmount,
        merkleRoot,
        merklePath,
      });

      console.log('[useBalanceProof] Proof generated!');

      return {
        success: true,
        proof,
      };
    } catch (err: any) {
      console.error('[useBalanceProof] Error generating proof:', err);
      setError(err.message);
      return {
        success: false,
        error: err.message,
      };
    } finally {
      setIsGenerating(false);
    }
  }, [isInitialized, initialize, notes]);

  const submitProofToRelay = useCallback(async (proof: BalanceProofOutput): Promise<{
    success: boolean;
    newLeafIndex?: number;
    error?: string;
  }> => {
    try {
      // Submit proof to relay for verification
      const response = await fetch('/api/privacy/balance-proof/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof: Array.from(proof.proof),
          publicInputs: proof.publicInputs,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        return {
          success: false,
          error: data.error || 'Proof verification failed',
        };
      }

      // If we have a change note, update our local notes
      if (proof.changeNote) {
        const existingNotes = loadSpendingNotes();

        // Find and remove the old note (by commitment)
        const oldNoteIndex = existingNotes.findIndex(n =>
          n.commitment === findNoteForOrder(existingNotes, 0n)?.commitment
        );

        const updatedNotes = existingNotes.filter((_, i) => i !== oldNoteIndex);

        // Add the change note with the new leaf index from relay
        if (data.newLeafIndex !== undefined) {
          proof.changeNote.leafIndex = data.newLeafIndex;
          updatedNotes.push(proof.changeNote);
        }

        saveSpendingNotes(updatedNotes);
        refreshNotes();
      }

      return {
        success: true,
        newLeafIndex: data.newLeafIndex,
      };
    } catch (err: any) {
      console.error('[useBalanceProof] Error submitting proof:', err);
      return {
        success: false,
        error: err.message,
      };
    }
  }, [refreshNotes]);

  return {
    isInitialized,
    isGenerating,
    notes,
    totalBalance,
    error,
    initialize,
    refreshNotes,
    generateProof,
    submitProofToRelay,
    hasEnoughBalance,
  };
}

export default useBalanceProof;
