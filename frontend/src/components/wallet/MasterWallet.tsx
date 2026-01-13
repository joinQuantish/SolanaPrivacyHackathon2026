import React, { useState } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { useWalletStore } from '../../store/walletStore';
import { TransferModal } from '../transfer/TransferModal';

export function MasterWallet() {
  const { master, balances, refreshBalances } = useWalletStore();
  const [showTransfer, setShowTransfer] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!master) return null;

  const walletBalances = balances[master.publicKey];

  const copyAddress = async () => {
    await navigator.clipboard.writeText(master.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const openExplorer = () => {
    window.open(`https://solscan.io/account/${master.publicKey}`, '_blank');
  };

  return (
    <>
      <Card variant="master" className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-obsidian-100">
            {master.label}
          </h2>
          <span className="badge badge-purple">Master</span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-obsidian-900/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-400 to-blue-500" />
              <span className="text-sm text-obsidian-400">SOL</span>
            </div>
            <div className="text-2xl font-bold text-obsidian-50">
              {walletBalances?.sol?.toFixed(4) ?? '—'}
            </div>
          </div>

          <div className="bg-obsidian-900/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-emerald-500" />
              <span className="text-sm text-obsidian-400">USDC</span>
            </div>
            <div className="text-2xl font-bold text-obsidian-50">
              ${walletBalances?.usdc?.toFixed(2) ?? '—'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <code className="text-sm text-obsidian-400 font-mono">
              {formatAddress(master.publicKey)}
            </code>
            <button
              onClick={copyAddress}
              className="text-obsidian-400 hover:text-obsidian-200 transition-colors"
              title="Copy address"
            >
              {copied ? (
                <svg className="w-4 h-4 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            <button
              onClick={openExplorer}
              className="text-obsidian-400 hover:text-obsidian-200 transition-colors"
              title="View on Solscan"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>
          <button
            onClick={() => refreshBalances(master.publicKey)}
            className="text-obsidian-400 hover:text-obsidian-200 transition-colors"
            title="Refresh balances"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowTransfer(true)}
            className="flex-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Send
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={copyAddress}
            className="flex-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Receive
          </Button>
        </div>
      </Card>

      {showTransfer && (
        <TransferModal
          isOpen={showTransfer}
          onClose={() => setShowTransfer(false)}
          sourceWallet={master}
        />
      )}
    </>
  );
}
