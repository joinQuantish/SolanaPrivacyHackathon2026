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
          <div className="w-16 h-16 bg-accent-green/10 border-2 border-accent-green flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-qn-gray-600 mb-4 font-mono">
            Successfully sent {amount} {token}
          </p>
          <a
            href={`https://solscan.io/tx/${txSignature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-green hover:text-accent-green/80 text-sm font-bold uppercase"
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
          <label className="block text-xs font-bold text-qn-gray-600 uppercase tracking-wider font-mono mb-2">
            Token
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setToken('USDC')}
              className={`
                flex-1 py-2 px-3 border-2 transition-all flex items-center justify-center gap-2 font-bold uppercase text-xs tracking-wider
                ${token === 'USDC'
                  ? 'border-accent-green bg-accent-green/10 text-accent-green'
                  : 'border-qn-gray-300 text-qn-gray-400 hover:border-qn-black'}
              `}
            >
              <div className="w-4 h-4 bg-accent-green" />
              USDC
            </button>
            <button
              type="button"
              onClick={() => setToken('SOL')}
              className={`
                flex-1 py-2 px-3 border-2 transition-all flex items-center justify-center gap-2 font-bold uppercase text-xs tracking-wider
                ${token === 'SOL'
                  ? 'border-qn-black bg-qn-black/5 text-qn-black'
                  : 'border-qn-gray-300 text-qn-gray-400 hover:border-qn-black'}
              `}
            >
              <div className="w-4 h-4 bg-qn-black" />
              SOL
            </button>
          </div>
        </div>

        {/* From */}
        <div>
          <label className="block text-xs font-bold text-qn-gray-600 uppercase tracking-wider font-mono mb-1.5">
            From
          </label>
          <div className="bg-qn-gray-100 border-2 border-qn-black px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-qn-black font-bold uppercase text-sm">{sourceWallet.label}</span>
              <span className="text-sm text-qn-gray-500 font-mono">
                {maxAmount?.toFixed(token === 'SOL' ? 4 : 2) ?? '—'} {token}
              </span>
            </div>
          </div>
        </div>

        {/* To */}
        <div>
          <label className="block text-xs font-bold text-qn-gray-600 uppercase tracking-wider font-mono mb-1.5">
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
          <label className="block text-xs font-bold text-qn-gray-600 uppercase tracking-wider font-mono mb-1.5">
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-accent-green hover:text-accent-green/80 font-bold uppercase"
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
