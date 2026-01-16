/**
 * Private Balance Display Component
 *
 * Shows the user's private balance from spending notes stored locally.
 * The relay never sees this balance - it's computed entirely client-side.
 */

import { useEffect, useState } from 'react';
import { loadSpendingNotes, SpendingNote } from '../../utils/balance-prover';

interface PrivateBalanceProps {
  onDepositClick?: () => void;
  className?: string;
}

export function PrivateBalance({ onDepositClick, className = '' }: PrivateBalanceProps) {
  const [notes, setNotes] = useState<SpendingNote[]>([]);
  const [totalBalance, setTotalBalance] = useState<bigint>(0n);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadBalance();
  }, []);

  const loadBalance = () => {
    try {
      const storedNotes = loadSpendingNotes();
      // Only count notes with valid leaf indices (confirmed deposits)
      const validNotes = storedNotes.filter(n => n.leafIndex >= 0);
      setNotes(validNotes);

      const total = validNotes.reduce((sum, note) => sum + note.amount, 0n);
      setTotalBalance(total);
    } catch (error) {
      console.error('[PrivateBalance] Error loading notes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Format micro-USDC to dollars
  const formatBalance = (microUsdc: bigint): string => {
    const dollars = Number(microUsdc) / 1_000_000;
    return dollars.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  if (isLoading) {
    return (
      <div className={`p-4 bg-gray-800 rounded-lg ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-24 mb-2"></div>
          <div className="h-8 bg-gray-700 rounded w-32"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-gray-800 rounded-lg border border-purple-500/30 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-gray-400">Private Balance</span>
        </div>
        <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
          ZK Protected
        </span>
      </div>

      <div className="text-2xl font-bold text-white mb-3">
        {formatBalance(totalBalance)}
      </div>

      {notes.length > 0 && (
        <div className="text-xs text-gray-500 mb-3">
          {notes.length} spending note{notes.length !== 1 ? 's' : ''}
        </div>
      )}

      <div className="flex gap-2">
        {onDepositClick && (
          <button
            onClick={onDepositClick}
            className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
          >
            Deposit
          </button>
        )}
        <button
          onClick={loadBalance}
          className="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          title="Refresh balance"
        >
          Refresh
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Balance is private - the relay never sees it.
        Only you can prove you have sufficient funds.
      </p>
    </div>
  );
}

export default PrivateBalance;
