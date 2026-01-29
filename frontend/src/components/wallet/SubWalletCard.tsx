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
  const { balances, holdings, refreshBalances, refreshHoldings, deleteSubWallet } = useWalletStore();
  const [showTransfer, setShowTransfer] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showHoldings, setShowHoldings] = useState(false);

  const walletBalances = balances[wallet.publicKey];
  const walletHoldings = holdings[wallet.publicKey] || [];

  // Refresh holdings on first expand
  React.useEffect(() => {
    if (showHoldings && walletHoldings.length === 0) {
      refreshHoldings(wallet.publicKey);
    }
  }, [showHoldings, wallet.publicKey, walletHoldings.length, refreshHoldings]);

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
      <div className="bg-white border-2 border-qn-black p-4 relative transition-all duration-100 hover:shadow-brutal-sm hover:translate-x-[-1px] hover:translate-y-[-1px]">
        {/* Color indicator */}
        <div
          className="absolute top-3 right-3 w-3 h-3"
          style={{ backgroundColor: wallet.color || '#0d0d0d' }}
        />

        <h3 className="font-bold text-qn-black mb-3 pr-6 uppercase text-sm tracking-wide">
          {wallet.label}
        </h3>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-qn-gray-400 font-mono uppercase">SOL</span>
            <span className="text-sm font-bold text-qn-black font-mono">
              {walletBalances?.sol?.toFixed(4) ?? '—'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-qn-gray-400 font-mono uppercase">USDC</span>
            <span className="text-sm font-bold text-qn-black font-mono">
              ${walletBalances?.usdc?.toFixed(2) ?? '—'}
            </span>
          </div>

          {/* Holdings toggle */}
          <button
            onClick={() => setShowHoldings(!showHoldings)}
            className="w-full flex items-center justify-between py-1 text-sm text-qn-gray-500 hover:text-qn-black"
          >
            <span className="flex items-center gap-1">
              <span>📊</span>
              <span className="uppercase text-xs font-bold tracking-wider">Holdings</span>
              {walletHoldings.length > 0 && (
                <span className="text-xs text-accent-green font-mono">({walletHoldings.length})</span>
              )}
            </span>
            <svg
              className={`w-3 h-3 transition-transform ${showHoldings ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showHoldings && (
            <div className="pl-2 border-l-2 border-qn-black space-y-1.5">
              {walletHoldings.length > 0 ? (
                walletHoldings.map((holding, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <span className="text-qn-gray-500 truncate max-w-[100px] font-mono" title={holding.mint}>
                      {holding.symbol || holding.mint.slice(0, 8) + '...'}
                    </span>
                    <span className="text-qn-black font-bold font-mono">
                      {holding.amount.toLocaleString()}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-qn-gray-400 font-mono">
                  No positions yet
                </p>
              )}
              <button
                onClick={() => refreshHoldings(wallet.publicKey)}
                className="text-xs text-accent-green hover:underline font-bold uppercase"
              >
                Refresh
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-3">
          <code className="text-xs text-qn-gray-500 font-mono">
            {formatAddress(wallet.publicKey)}
          </code>
          <div className="flex items-center gap-1">
            <button
              onClick={copyAddress}
              className="p-1 text-qn-gray-400 hover:text-qn-black transition-colors"
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
              className="p-1 text-qn-gray-400 hover:text-qn-black transition-colors"
              title="View on Solscan"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 text-qn-gray-400 hover:text-qn-black transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-32 bg-white border-2 border-qn-black z-10" style={{ boxShadow: '4px 4px 0px 0px rgb(13, 13, 13)' }}>
                  <button
                    onClick={() => {
                      refreshBalances(wallet.publicKey);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-qn-black hover:bg-qn-gray-100 font-bold uppercase text-xs"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full px-3 py-2 text-left text-sm text-accent-red hover:bg-accent-red/10 font-bold uppercase text-xs border-t border-qn-gray-200"
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
      </div>

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
