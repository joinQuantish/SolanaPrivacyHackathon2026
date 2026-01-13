import React, { useState } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { useWalletStore } from '../../store/walletStore';
import type { Wallet } from '../../types/wallet';
import { TransferModal } from '../transfer/TransferModal';

interface SubWalletCardProps {
  wallet: Wallet;
}

export function SubWalletCard({ wallet }: SubWalletCardProps) {
  const { balances, refreshBalances, deleteSubWallet } = useWalletStore();
  const [showTransfer, setShowTransfer] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const walletBalances = balances[wallet.publicKey];

  const copyAddress = async () => {
    await navigator.clipboard.writeText(wallet.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  const openExplorer = () => {
    window.open(`https://solscan.io/account/${wallet.publicKey}`, '_blank');
  };

  const handleDelete = async () => {
    if (confirm('Remove this wallet from tracking? The wallet will still exist on-chain.')) {
      await deleteSubWallet(wallet.id);
    }
    setShowMenu(false);
  };

  return (
    <>
      <Card className="relative">
        {/* Color indicator */}
        <div
          className="absolute top-3 right-3 w-3 h-3 rounded-full"
          style={{ backgroundColor: wallet.color || '#8b5cf6' }}
        />

        <h3 className="font-medium text-obsidian-100 mb-3 pr-6">
          {wallet.label}
        </h3>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-obsidian-400">SOL</span>
            <span className="text-sm font-medium text-obsidian-200">
              {walletBalances?.sol?.toFixed(4) ?? '—'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-obsidian-400">USDC</span>
            <span className="text-sm font-medium text-obsidian-200">
              ${walletBalances?.usdc?.toFixed(2) ?? '—'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <code className="text-xs text-obsidian-500 font-mono">
            {formatAddress(wallet.publicKey)}
          </code>
          <div className="flex items-center gap-1">
            <button
              onClick={copyAddress}
              className="p-1 text-obsidian-500 hover:text-obsidian-300 transition-colors"
              title="Copy address"
            >
              {copied ? (
                <svg className="w-3.5 h-3.5 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            <button
              onClick={openExplorer}
              className="p-1 text-obsidian-500 hover:text-obsidian-300 transition-colors"
              title="View on Solscan"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 text-obsidian-500 hover:text-obsidian-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-32 bg-obsidian-700 border border-obsidian-600 rounded-lg shadow-xl z-10">
                  <button
                    onClick={() => {
                      refreshBalances(wallet.publicKey);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-obsidian-200 hover:bg-obsidian-600 rounded-t-lg"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full px-3 py-2 text-left text-sm text-accent-red hover:bg-obsidian-600 rounded-b-lg"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTransfer(true)}
            className="flex-1 text-xs"
          >
            Send
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={openExplorer}
            className="flex-1 text-xs"
          >
            View
          </Button>
        </div>
      </Card>

      {showTransfer && (
        <TransferModal
          isOpen={showTransfer}
          onClose={() => setShowTransfer(false)}
          sourceWallet={wallet}
        />
      )}
    </>
  );
}
