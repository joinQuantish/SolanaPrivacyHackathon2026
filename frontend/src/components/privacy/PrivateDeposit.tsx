/**
 * Private Deposit Component
 *
 * Allows users to deposit USDC to create a private spending note.
 * The deposit creates a commitment that goes into the Merkle tree,
 * but the actual balance is only known to the user.
 *
 * Flow:
 * 1. User enters amount
 * 2. Generate secret + commitment client-side
 * 3. (In production) Call Privacy Pool deposit instruction
 * 4. Register commitment with relay
 * 5. Save spending note to localStorage
 */

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  createSpendingNote,
  saveSpendingNotes,
  loadSpendingNotes,
  SpendingNote,
} from '../../utils/balance-prover';

interface PrivateDepositProps {
  onSuccess?: (note: SpendingNote) => void;
  onClose?: () => void;
}

export function PrivateDeposit({ onSuccess, onClose }: PrivateDepositProps) {
  const { publicKey, connected } = useWallet();
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'input' | 'generating' | 'depositing' | 'complete'>('input');
  const [error, setError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState<SpendingNote | null>(null);

  const handleDeposit = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Generate spending note client-side
      setStep('generating');
      const microUsdc = BigInt(Math.floor(amountNum * 1_000_000));
      const { note, commitment } = createSpendingNote(microUsdc);

      console.log('[PrivateDeposit] Generated commitment:', commitment.slice(0, 16) + '...');

      // Step 2: In production, this would send USDC to Privacy Pool on-chain
      // For demo, we simulate the deposit
      setStep('depositing');

      // Register commitment with relay backend
      const response = await fetch('/api/privacy/balance-proof/commitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitment }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to register commitment');
      }

      const { leafIndex, merkleRoot } = await response.json();

      // Update note with leaf index
      note.leafIndex = leafIndex;

      // Save to localStorage
      const existingNotes = loadSpendingNotes();
      saveSpendingNotes([...existingNotes, note]);

      console.log('[PrivateDeposit] Deposit complete! Leaf index:', leafIndex);

      setNewNote(note);
      setStep('complete');

      if (onSuccess) {
        onSuccess(note);
      }
    } catch (err: any) {
      console.error('[PrivateDeposit] Error:', err);
      setError(err.message || 'Deposit failed');
      setStep('input');
    } finally {
      setIsLoading(false);
    }
  };

  const formatAmount = (microUsdc: bigint): string => {
    return (Number(microUsdc) / 1_000_000).toFixed(2);
  };

  return (
    <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Private Deposit</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            Close
          </button>
        )}
      </div>

      {step === 'input' && (
        <>
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2">
              Amount (USDC)
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-white text-lg focus:border-purple-500 focus:outline-none"
                min="0"
                step="0.01"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                USDC
              </span>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-300 mb-2">
              How Private Deposits Work
            </h3>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>1. A random secret is generated in your browser</li>
              <li>2. A commitment hash(secret, amount) is created</li>
              <li>3. Only the commitment is sent to the relay</li>
              <li>4. Your actual balance remains private</li>
            </ul>
          </div>

          <button
            onClick={handleDeposit}
            disabled={isLoading || !connected || !amount}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {!connected ? 'Connect Wallet' : isLoading ? 'Processing...' : 'Create Private Deposit'}
          </button>
        </>
      )}

      {step === 'generating' && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-300">Generating spending note...</p>
          <p className="text-xs text-gray-500 mt-2">
            Creating secret and commitment client-side
          </p>
        </div>
      )}

      {step === 'depositing' && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-300">Registering deposit...</p>
          <p className="text-xs text-gray-500 mt-2">
            Adding commitment to Merkle tree
          </p>
        </div>
      )}

      {step === 'complete' && newNote && (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Deposit Complete!</h3>
          <p className="text-gray-400 mb-4">
            ${formatAmount(newNote.amount)} added to your private balance
          </p>
          <div className="bg-gray-800 rounded-lg p-3 text-left mb-4">
            <p className="text-xs text-gray-500 mb-1">Leaf Index</p>
            <p className="text-sm text-white font-mono">{newNote.leafIndex}</p>
          </div>
          <p className="text-xs text-gray-500">
            Your spending note is saved locally.
            Only you can prove you have these funds.
          </p>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-6 w-full py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Done
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default PrivateDeposit;
