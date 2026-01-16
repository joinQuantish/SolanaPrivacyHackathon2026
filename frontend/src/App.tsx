import React, { useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { AppShell } from './components/layout/AppShell';
import { MarketSearch } from './components/market/MarketSearch';
import { MarketList } from './components/market/MarketList';
import { SubWalletList } from './components/wallet/SubWalletList';
import { Button } from './components/common/Button';
import { Card } from './components/common/Card';
import { FullPageSpinner } from './components/common/Spinner';
import { DemoTabs, DemoTab } from './components/common/DemoTabs';
import { ArciumDemo } from './components/arcium/ArciumDemo';
import { useWalletStore } from './store/walletStore';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

function WelcomeScreen() {
  const { setVisible } = useWalletModal();

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-8">
        <h1 className="text-3xl font-bold text-obsidian-100 mb-3">
          Private Prediction Markets
        </h1>
        <p className="text-obsidian-400 max-w-lg mx-auto">
          Trade prediction markets without linking your wallet to your positions.
          Powered by Privacy Cash zero-knowledge proofs.
        </p>
      </div>

      {/* How It Works - 3 Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-obsidian-800/50 rounded-xl p-5 border border-obsidian-700">
          <div className="w-10 h-10 rounded-full bg-accent-purple/20 flex items-center justify-center mb-3">
            <span className="text-accent-purple font-bold">1</span>
          </div>
          <h3 className="font-semibold text-obsidian-100 mb-1">Connect Wallet</h3>
          <p className="text-sm text-obsidian-400">
            Connect your Phantom wallet. This is your funding source.
          </p>
        </div>

        <div className="bg-obsidian-800/50 rounded-xl p-5 border border-obsidian-700">
          <div className="w-10 h-10 rounded-full bg-accent-purple/20 flex items-center justify-center mb-3">
            <span className="text-accent-purple font-bold">2</span>
          </div>
          <h3 className="font-semibold text-obsidian-100 mb-1">Choose a Market</h3>
          <p className="text-sm text-obsidian-400">
            Browse prediction markets and pick your position (YES/NO).
          </p>
        </div>

        <div className="bg-obsidian-800/50 rounded-xl p-5 border border-obsidian-700">
          <div className="w-10 h-10 rounded-full bg-[rgb(56,190,231)]/20 flex items-center justify-center mb-3">
            <span className="text-[rgb(56,190,231)] font-bold">3</span>
          </div>
          <h3 className="font-semibold text-obsidian-100 mb-1">Buy Privately</h3>
          <p className="text-sm text-obsidian-400">
            Enable Privacy Mode to break the on-chain link between your wallet and position.
          </p>
        </div>
      </div>

      {/* Connect Button */}
      <div className="flex justify-center">
        <Button
          variant="primary"
          onClick={() => setVisible(true)}
          className="px-8 py-3 text-lg"
        >
          Connect Phantom to Start
        </Button>
      </div>

      {/* Markets Preview */}
      <section className="pt-8 border-t border-obsidian-700">
        <h2 className="text-lg font-semibold text-obsidian-100 mb-4">
          Available Markets
        </h2>
        <div className="space-y-4">
          <MarketSearch />
          <MarketList />
        </div>
      </section>
    </div>
  );
}

function ConnectedDashboard() {
  const { publicKey, disconnect } = useWallet();
  const { connection } = useConnection();
  const { initialize, subWallets, isInitialized } = useWalletStore();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [showSubWallets, setShowSubWallets] = useState(false);

  const address = publicKey?.toBase58() || '';
  const shortAddress = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : '';

  // Initialize wallet store (loads sub-wallets from localStorage)
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  useEffect(() => {
    if (!publicKey) return;

    const fetchBalances = async () => {
      setIsLoadingBalance(true);
      try {
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / LAMPORTS_PER_SOL);

        const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          mint: new PublicKey(USDC_MINT),
        });

        if (tokenAccounts.value.length > 0) {
          setUsdcBalance(tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount);
        } else {
          setUsdcBalance(0);
        }
      } catch (error) {
        console.error('Failed to fetch balances:', error);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 15000);
    return () => clearInterval(interval);
  }, [publicKey, connection]);

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2 text-sm">
        <span className="flex items-center gap-1.5 text-accent-green">
          <span className="w-5 h-5 rounded-full bg-accent-green flex items-center justify-center text-xs text-black font-bold">✓</span>
          Connected
        </span>
        <span className="w-8 h-px bg-obsidian-600"></span>
        <span className="flex items-center gap-1.5 text-obsidian-400">
          <span className="w-5 h-5 rounded-full bg-obsidian-700 flex items-center justify-center text-xs font-bold">2</span>
          Choose Market
        </span>
        <span className="w-8 h-px bg-obsidian-600"></span>
        <span className="flex items-center gap-1.5 text-obsidian-400">
          <span className="w-5 h-5 rounded-full bg-obsidian-700 flex items-center justify-center text-xs font-bold">3</span>
          Buy
        </span>
      </div>

      {/* Wallet Card */}
      <Card className="bg-gradient-to-br from-obsidian-800 to-obsidian-900 border-accent-purple/30">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-xs font-medium text-accent-purple uppercase tracking-wider">
              Your Wallet
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-obsidian-300 font-mono text-sm">{shortAddress}</span>
              <button
                onClick={() => navigator.clipboard.writeText(address)}
                className="text-obsidian-500 hover:text-obsidian-300"
                title="Copy"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <a
                href={`https://solscan.io/account/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-obsidian-500 hover:text-obsidian-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
          <button
            onClick={disconnect}
            className="text-obsidian-500 hover:text-accent-red text-xs"
          >
            Disconnect
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-obsidian-500 text-xs">SOL</span>
            <p className="text-xl font-semibold text-obsidian-100">
              {isLoadingBalance ? '...' : `${solBalance?.toFixed(4) || '0'}`}
            </p>
          </div>
          <div>
            <span className="text-obsidian-500 text-xs">USDC</span>
            <p className="text-xl font-semibold text-accent-green">
              {isLoadingBalance ? '...' : `$${usdcBalance?.toFixed(2) || '0.00'}`}
            </p>
          </div>
        </div>
      </Card>

      {/* Privacy Info Banner */}
      <div className="rounded-xl p-4 border border-[rgb(56,190,231)]/30 bg-[rgb(56,190,231)]/5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[rgb(56,190,231)]/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xl">🔒</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-obsidian-100">
              How Privacy Mode Works
            </h3>
            <p className="text-xs text-obsidian-400 mt-1">
              When you buy with <span className="text-[rgb(56,190,231)]">Privacy Mode</span> enabled:
            </p>
            <ol className="text-xs text-obsidian-400 mt-2 space-y-1 list-decimal list-inside">
              <li>Your USDC goes to a temporary wallet (you sign once in Phantom)</li>
              <li>That wallet deposits into Privacy Cash's ZK pool</li>
              <li>A <span className="text-[rgb(56,190,231)]">new unlinked wallet</span> withdraws and places your order</li>
              <li>Result: <span className="text-accent-green">No on-chain connection</span> between you and your position</li>
            </ol>
            <p className="text-[10px] text-obsidian-500 mt-2">
              Fee: 0.35% + ~0.006 SOL • Powered by Privacy Cash
            </p>
          </div>
        </div>
      </div>

      {/* Sub-Wallets Section (for receiving shares privately) */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setShowSubWallets(!showSubWallets)}
            className="flex items-center gap-2 text-lg font-semibold text-obsidian-100 hover:text-obsidian-50"
          >
            <span className="text-[rgb(56,190,231)]">🔐</span>
            Privacy Wallets
            <span className="text-xs text-obsidian-500">
              ({subWallets.length})
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${showSubWallets ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {showSubWallets && (
          <div className="mb-6">
            <p className="text-sm text-obsidian-400 mb-4">
              These wallets receive your shares when using Privacy Mode.
              They are <span className="text-[rgb(56,190,231)]">not linked</span> to your main wallet on-chain.
            </p>
            <SubWalletList />
          </div>
        )}
      </section>

      {/* Markets Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-obsidian-100">
            Step 2: Choose a Market
          </h2>
        </div>
        <p className="text-sm text-obsidian-400 mb-4">
          Click <span className="text-accent-green">Buy Yes</span> or <span className="text-accent-red">Buy No</span> on any market.
          You'll see the Privacy Mode toggle in the order form.
        </p>
        <div className="space-y-4">
          <MarketSearch />
          <MarketList />
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const { connected, connecting } = useWallet();
  const [activeTab, setActiveTab] = useState<DemoTab>('mainnet');

  if (connecting) {
    return <FullPageSpinner />;
  }

  return (
    <AppShell>
      {/* Demo Tab Navigation */}
      <DemoTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === 'mainnet' ? (
        // Mainnet Demo: Privacy Cash + zkNoir + Real Trading
        connected ? <ConnectedDashboard /> : <WelcomeScreen />
      ) : (
        // Devnet Demo: Arcium MPC Integration
        <ArciumDemo />
      )}
    </AppShell>
  );
}
