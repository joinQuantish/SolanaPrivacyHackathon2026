import React, { useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { AppShell } from './components/layout/AppShell';
import { SubWalletList } from './components/wallet/SubWalletList';
import { MarketSearch } from './components/market/MarketSearch';
import { MarketList } from './components/market/MarketList';
import { Button } from './components/common/Button';
import { Card } from './components/common/Card';
import { FullPageSpinner } from './components/common/Spinner';
import { useWalletStore } from './store/walletStore';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

function WelcomeScreen() {
  const { setVisible } = useWalletModal();

  return (
    <div className="space-y-8">
      {/* Connect Wallet Card */}
      <div
        className="rounded-xl p-6 border"
        style={{
          backgroundColor: 'var(--background-secondary)',
          borderColor: 'var(--primary-stroke)',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '18px' }}>
              Connect Wallet to Trade
            </h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', marginTop: '4px' }}>
              Your wallet funds trades through our privacy relay
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setVisible(true)}
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Connect Phantom
          </Button>
        </div>
      </div>

      {/* Markets Section - visible even without connecting */}
      <section>
        <h2
          className="text-lg font-semibold mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          Prediction Markets
        </h2>
        <div className="space-y-4">
          <MarketSearch />
          <MarketList />
        </div>
      </section>
    </div>
  );
}

function ConnectedWallet() {
  const { publicKey, disconnect } = useWallet();
  const { connection } = useConnection();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);

  const address = publicKey?.toBase58() || '';
  const shortAddress = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : '';

  useEffect(() => {
    if (!publicKey) return;

    const fetchBalances = async () => {
      setIsLoadingBalance(true);
      try {
        // Get SOL balance
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / LAMPORTS_PER_SOL);

        // Get USDC balance
        const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          mint: new (await import('@solana/web3.js')).PublicKey(USDC_MINT),
        });

        if (tokenAccounts.value.length > 0) {
          const usdcAccount = tokenAccounts.value[0];
          setUsdcBalance(usdcAccount.account.data.parsed.info.tokenAmount.uiAmount);
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

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
  };

  return (
    <Card className="bg-gradient-to-br from-obsidian-800 to-obsidian-900 border-accent-purple/30">
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-xs font-medium text-accent-purple uppercase tracking-wider">
            Funding Wallet (Phantom)
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-obsidian-300 font-mono text-sm">{shortAddress}</span>
            <button
              onClick={copyAddress}
              className="text-obsidian-500 hover:text-obsidian-300 transition-colors"
              title="Copy address"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <a
              href={`https://solscan.io/account/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-obsidian-500 hover:text-obsidian-300 transition-colors"
              title="View on Solscan"
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

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-obsidian-500 text-xs">SOL Balance</span>
          <p className="text-xl font-semibold text-obsidian-100">
            {isLoadingBalance ? '...' : `${solBalance?.toFixed(4) || '0'} SOL`}
          </p>
        </div>
        <div>
          <span className="text-obsidian-500 text-xs">USDC Balance</span>
          <p className="text-xl font-semibold text-accent-green">
            {isLoadingBalance ? '...' : `$${usdcBalance?.toFixed(2) || '0.00'}`}
          </p>
        </div>
      </div>

      <div className="bg-obsidian-900/50 rounded-lg p-3 text-xs text-obsidian-400">
        <p>
          When you place a trade, your USDC is sent to our relay with a signed memo.
          The relay executes your order and distributes positions to privacy wallets.
        </p>
      </div>
    </Card>
  );
}

function Dashboard() {
  const { refreshAllBalances } = useWalletStore();

  useEffect(() => {
    refreshAllBalances();
    const interval = setInterval(() => {
      refreshAllBalances();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshAllBalances]);

  return (
    <div className="space-y-8">
      {/* Connected Phantom Wallet */}
      <section>
        <ConnectedWallet />
      </section>

      {/* Distribution Wallets (created via MCP for privacy) */}
      <section>
        <SubWalletList />
      </section>

      {/* Markets Section */}
      <section>
        <h2 className="text-lg font-semibold text-obsidian-100 mb-4">
          Markets
        </h2>
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
  const { initialize } = useWalletStore();
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    // Non-blocking initialization
    initialize()
      .catch(err => {
        console.error('Init error:', err);
        setInitError(err instanceof Error ? err.message : 'Initialization failed');
      })
      .finally(() => setReady(true));
  }, [initialize]);

  if (!ready || connecting) {
    return <FullPageSpinner />;
  }

  return (
    <AppShell>
      {initError && (
        <div className="mb-4 p-3 bg-accent-yellow/10 border border-accent-yellow/30 rounded-lg text-sm text-accent-yellow">
          Backend: {initError} (Phantom wallet still works)
        </div>
      )}
      {connected ? <Dashboard /> : <WelcomeScreen />}
    </AppShell>
  );
}
