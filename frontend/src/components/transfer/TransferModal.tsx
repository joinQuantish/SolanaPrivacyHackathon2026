import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useWalletStore } from '../../store/walletStore';
import type { Wallet } from '../../types/wallet';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceWallet: Wallet;
}

type TokenType = 'SOL' | 'USDC';

export function TransferModal({ isOpen, onClose, sourceWallet }: TransferModalProps) {
  const { master, subWallets, balances, transfer, isLoading, error, clearError } = useWalletStore();
  const [token, setToken] = useState<TokenType>('USDC');
  const [amount, setAmount] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const allWallets = [
    ...(master ? [master] : []),
    ...subWallets,
  ].filter(w => w.publicKey !== sourceWallet.publicKey);

  const sourceBalances = balances[sourceWallet.publicKey];
  const maxAmount = token === 'SOL' ? sourceBalances?.sol : sourceBalances?.usdc;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const destination = selectedWallet || toAddress;
    if (!destination || !amount) return;

    const sig = await transfer(
      sourceWallet.publicKey,
      destination,
      token,
      parseFloat(amount)
    );

    if (sig) {
      setTxSignature(sig);
    }
  };

  const handleClose = () => {
    clearError();
    setAmount('');
    setToAddress('');
    setSelectedWallet('');
    setTxSignature(null);
    onClose();
  };

  const setMax = () => {
    if (maxAmount !== undefined) {
      // Leave some SOL for fees if sending SOL
      const max = token === 'SOL' ? Math.max(0, maxAmount - 0.01) : maxAmount;
      setAmount(max.toString());
    }
  };

  if (txSignature) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Transfer Successful">
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-accent-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-obsidian-200 mb-4">
            Successfully sent {amount} {token}
          </p>
          <a
            href={`https://solscan.io/tx/${txSignature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-purple hover:text-accent-purple/80 text-sm"
          >
            View on Solscan →
          </a>
        </div>
        <Button variant="secondary" onClick={handleClose} className="w-full mt-4">
          Close
        </Button>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Send Funds">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Token Selection */}
        <div>
          <label className="block text-sm font-medium text-obsidian-300 mb-2">
            Token
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setToken('USDC')}
              className={`
                flex-1 py-2 px-3 rounded-lg border transition-all flex items-center justify-center gap-2
                ${token === 'USDC'
                  ? 'border-accent-green bg-accent-green/10 text-accent-green'
                  : 'border-obsidian-600 text-obsidian-400 hover:border-obsidian-500'}
              `}
            >
              <div className="w-4 h-4 rounded-full bg-gradient-to-br from-green-400 to-emerald-500" />
              USDC
            </button>
            <button
              type="button"
              onClick={() => setToken('SOL')}
              className={`
                flex-1 py-2 px-3 rounded-lg border transition-all flex items-center justify-center gap-2
                ${token === 'SOL'
                  ? 'border-accent-purple bg-accent-purple/10 text-accent-purple'
                  : 'border-obsidian-600 text-obsidian-400 hover:border-obsidian-500'}
              `}
            >
              <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-400 to-blue-500" />
              SOL
            </button>
          </div>
        </div>

        {/* From */}
        <div>
          <label className="block text-sm font-medium text-obsidian-300 mb-1.5">
            From
          </label>
          <div className="bg-obsidian-900 border border-obsidian-600 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-obsidian-200">{sourceWallet.label}</span>
              <span className="text-sm text-obsidian-400">
                {maxAmount?.toFixed(token === 'SOL' ? 4 : 2) ?? '—'} {token}
              </span>
            </div>
          </div>
        </div>

        {/* To */}
        <div>
          <label className="block text-sm font-medium text-obsidian-300 mb-1.5">
            To
          </label>
          {allWallets.length > 0 && (
            <select
              value={selectedWallet}
              onChange={e => {
                setSelectedWallet(e.target.value);
                if (e.target.value) setToAddress('');
              }}
              className="input-field mb-2"
            >
              <option value="">Select a wallet or enter address</option>
              {allWallets.map(w => (
                <option key={w.id} value={w.publicKey}>
                  {w.label} ({w.publicKey.slice(0, 6)}...)
                </option>
              ))}
            </select>
          )}
          {!selectedWallet && (
            <Input
              placeholder="Enter Solana address"
              value={toAddress}
              onChange={e => setToAddress(e.target.value)}
            />
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-obsidian-300 mb-1.5">
            Amount
          </label>
          <div className="relative">
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              step="0.000001"
              min="0"
            />
            <button
              type="button"
              onClick={setMax}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-accent-purple hover:text-accent-purple/80"
            >
              MAX
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-accent-red">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isLoading}
            disabled={!amount || (!toAddress && !selectedWallet)}
            className="flex-1"
          >
            Send {token}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
