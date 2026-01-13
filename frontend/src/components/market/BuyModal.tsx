import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { buildDepositWithMemoTransaction, OrderMemo, RELAY_WALLET } from '../../lib/transaction';
import type { MarketSearchResult } from '../../types/market';

interface BuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  market: MarketSearchResult;
  initialSide: 'YES' | 'NO';
}

export function BuyModal({ isOpen, onClose, market, initialSide }: BuyModalProps) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [side, setSide] = useState<'YES' | 'NO'>(initialSide);
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number>(0);

  // Fetch USDC balance on mount
  React.useEffect(() => {
    if (!publicKey) return;

    const fetchBalance = async () => {
      try {
        const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        const { PublicKey } = await import('@solana/web3.js');
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          mint: new PublicKey(USDC_MINT),
        });
        if (tokenAccounts.value.length > 0) {
          setUsdcBalance(tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0);
        }
      } catch (err) {
        console.error('Failed to fetch USDC balance:', err);
      }
    };

    fetchBalance();
  }, [publicKey, connection, isOpen]);

  const price = side === 'YES' ? (market.yesPrice ?? 0.5) : (market.noPrice ?? 0.5);
  const estimatedShares = parseFloat(amount || '0') / price;
  const outcomeMint = side === 'YES' ? market.yesMint : market.noMint;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!publicKey || !amount || !outcomeMint) {
      setError('Missing required information');
      return;
    }

    setIsLoading(true);

    try {
      // Build order memo
      const order: OrderMemo = {
        action: side === 'YES' ? 'buy_yes' : 'buy_no',
        marketTicker: market.ticker,
        outcomeMint: outcomeMint,
        amount: parseFloat(amount),
        slippageBps: 100, // 1% slippage
      };

      // Build transaction with USDC transfer + memo
      const transaction = await buildDepositWithMemoTransaction(
        connection,
        publicKey,
        parseFloat(amount),
        order
      );

      // Send via Phantom - user signs here
      const signature = await sendTransaction(transaction, connection);

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');

      setTxSignature(signature);
    } catch (err) {
      console.error('Transaction failed:', err);
      setError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setAmount('');
    setTxSignature(null);
    onClose();
  };

  if (txSignature) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Order Submitted">
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-accent-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-obsidian-200 mb-2">
            Order submitted for {side} on {market.ticker}
          </p>
          <p className="text-obsidian-400 text-sm mb-4">
            ~{estimatedShares.toFixed(2)} shares for ${amount}
          </p>

          <div className="bg-obsidian-900/50 rounded-lg p-3 mb-4 text-left">
            <p className="text-xs text-obsidian-400 mb-2">
              Your USDC has been sent to the relay with your order memo.
              The relay will execute your trade and distribute positions to privacy wallets.
            </p>
            <p className="text-xs text-obsidian-500">
              Relay: {RELAY_WALLET.toBase58().slice(0, 8)}...
            </p>
          </div>

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
    <Modal isOpen={isOpen} onClose={handleClose} title={`Buy ${side} - ${market.ticker}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Market Info */}
        <div className="bg-obsidian-900/50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-obsidian-200 line-clamp-2">
            {market.title}
          </h4>
        </div>

        {/* Side Selection */}
        <div>
          <label className="block text-sm font-medium text-obsidian-300 mb-2">
            Position
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSide('YES')}
              className={`
                flex-1 py-3 px-4 rounded-lg border transition-all font-medium
                ${side === 'YES'
                  ? 'border-accent-green bg-accent-green/10 text-accent-green'
                  : 'border-obsidian-600 text-obsidian-400 hover:border-obsidian-500'}
              `}
            >
              YES @ ${(market.yesPrice ?? 0.5).toFixed(2)}
            </button>
            <button
              type="button"
              onClick={() => setSide('NO')}
              className={`
                flex-1 py-3 px-4 rounded-lg border transition-all font-medium
                ${side === 'NO'
                  ? 'border-accent-red bg-accent-red/10 text-accent-red'
                  : 'border-obsidian-600 text-obsidian-400 hover:border-obsidian-500'}
              `}
            >
              NO @ ${(market.noPrice ?? 0.5).toFixed(2)}
            </button>
          </div>
        </div>

        {/* Amount */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-obsidian-300">
              Amount (USDC)
            </label>
            <span className="text-xs text-obsidian-500">
              Balance: ${usdcBalance.toFixed(2)}
            </span>
          </div>
          <div className="relative">
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              step="0.01"
              min="0"
            />
            <button
              type="button"
              onClick={() => setAmount(usdcBalance.toString())}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-accent-purple hover:text-accent-purple/80"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Estimate */}
        {parseFloat(amount || '0') > 0 && (
          <div className="bg-obsidian-900/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-obsidian-400">Estimated Shares</span>
              <span className="text-obsidian-200 font-medium">
                ~{estimatedShares.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-obsidian-400">Current Price</span>
              <span className="text-obsidian-200">
                ${price.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-obsidian-400">Slippage</span>
              <span className="text-obsidian-200">1%</span>
            </div>
            <div className="border-t border-obsidian-700 pt-2 mt-2">
              <p className="text-xs text-obsidian-500">
                Transaction includes memo with order details for relay processing
              </p>
            </div>
          </div>
        )}

        {!publicKey && (
          <p className="text-sm text-accent-yellow">
            Connect your wallet first to trade
          </p>
        )}

        {!outcomeMint && (
          <p className="text-sm text-accent-yellow">
            Market outcome mint not available
          </p>
        )}

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
            disabled={!amount || !publicKey || !outcomeMint || parseFloat(amount) > usdcBalance}
            className={`flex-1 ${
              side === 'YES'
                ? 'bg-accent-green hover:bg-accent-green/80'
                : 'bg-accent-red hover:bg-accent-red/80'
            }`}
          >
            {isLoading ? 'Confirm in Wallet...' : `Buy ${side}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
