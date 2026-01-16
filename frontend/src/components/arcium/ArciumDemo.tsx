/**
 * Arcium MPC Demo Page (Devnet)
 *
 * Demonstrates encrypted order submission via Arcium MPC.
 * The relay CANNOT see order amounts - only the MPC nodes can decrypt.
 */

import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { useMpcStore } from '../../store/mpcStore';
import type { OrderData } from '../../utils/arcium-encrypt';

// Demo market for testing
const DEMO_MARKET = {
  id: 'KXBTC-26JAN25-100K',
  title: 'Will BTC reach $100,000 by Jan 25, 2026?',
  yesPrice: 0.65,
  noPrice: 0.35,
};

export function ArciumDemo() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const {
    connectionStatus,
    diagnostics,
    lastChecked,
    error,
    isSubmitting,
    lastSubmission,
    encryptedBlob,
    checkStatus,
    encryptOnly,
    encryptAndSubmit,
    clearSubmission,
  } = useMpcStore();

  // Form state
  const [amount, setAmount] = useState<string>('10');
  const [side, setSide] = useState<'YES' | 'NO'>('YES');
  const [showEncryptedData, setShowEncryptedData] = useState(false);

  // Check MPC status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  // Handle encrypt only (preview)
  const handleEncryptPreview = async () => {
    if (!publicKey) return;

    const orderData: OrderData = {
      marketId: DEMO_MARKET.id,
      side,
      usdcAmount: parseFloat(amount),
      destinationWallet: publicKey.toBase58(),
    };

    await encryptOnly(orderData);
    setShowEncryptedData(true);
  };

  // Handle full submit
  const handleSubmit = async () => {
    if (!publicKey) return;

    const orderData: OrderData = {
      marketId: DEMO_MARKET.id,
      side,
      usdcAmount: parseFloat(amount),
      destinationWallet: publicKey.toBase58(),
    };

    await encryptAndSubmit(orderData);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center py-4">
        <h1 className="text-2xl font-bold text-obsidian-100 mb-2">
          Arcium MPC Demo
        </h1>
        <p className="text-obsidian-400 text-sm">
          Submit encrypted orders on Solana Devnet. The relay cannot see your order amounts.
        </p>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgb(56,190,231)]/10 border border-[rgb(56,190,231)]/30">
          <span className="w-2 h-2 rounded-full bg-[rgb(56,190,231)]"></span>
          <span className="text-xs text-[rgb(56,190,231)]">Devnet</span>
        </div>
      </div>

      {/* MPC Status Card */}
      <Card className="bg-gradient-to-br from-obsidian-800 to-obsidian-900 border-[rgb(56,190,231)]/30">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-xs font-medium text-[rgb(56,190,231)] uppercase tracking-wider">
              MPC Status
            </span>
            <h3 className="text-lg font-semibold text-obsidian-100 mt-1">
              Arcium Cluster 1
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => checkStatus()}
            disabled={connectionStatus === 'checking'}
          >
            Refresh
          </Button>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-3 h-3 rounded-full ${
            connectionStatus === 'ready' ? 'bg-accent-green' :
            connectionStatus === 'partial' ? 'bg-yellow-500' :
            connectionStatus === 'checking' ? 'bg-blue-500 animate-pulse' :
            'bg-accent-red'
          }`} />
          <span className="text-obsidian-200 font-medium">
            {connectionStatus === 'ready' && 'Ready - Encrypted orders accepted'}
            {connectionStatus === 'partial' && 'Partial - Some checks failed'}
            {connectionStatus === 'checking' && 'Checking connection...'}
            {connectionStatus === 'disabled' && 'MPC Disabled - Enable in server config'}
            {connectionStatus === 'not_ready' && 'Not Ready - Check configuration'}
            {connectionStatus === 'error' && 'Error - Could not connect'}
          </span>
        </div>

        {/* Diagnostics */}
        {diagnostics && (
          <div className="text-xs space-y-2 border-t border-obsidian-700 pt-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-obsidian-500">Program ID:</span>
                <p className="text-obsidian-300 font-mono truncate">
                  {diagnostics.programId || '8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc'}
                </p>
              </div>
              <div>
                <span className="text-obsidian-500">MXE Account:</span>
                <p className="text-obsidian-300 font-mono truncate">
                  {diagnostics.mxeAccount || '2EYXHVLZGSTGmPN3VFdHb6DroZBfpir6mgYZuFvpxfJG'}
                </p>
              </div>
            </div>
            {diagnostics.checks && (
              <div className="flex gap-4 text-obsidian-400">
                <span className={diagnostics.checks.mxeAccountExists ? 'text-accent-green' : 'text-accent-red'}>
                  {diagnostics.checks.mxeAccountExists ? '✓' : '✗'} MXE
                </span>
                <span className={diagnostics.checks.clusterAssigned ? 'text-accent-green' : 'text-accent-red'}>
                  {diagnostics.checks.clusterAssigned ? '✓' : '✗'} Cluster
                </span>
                <span className={diagnostics.checks.nodesAvailable ? 'text-accent-green' : 'text-accent-red'}>
                  {diagnostics.checks.nodesAvailable ? '✓' : '✗'} Nodes
                </span>
              </div>
            )}
          </div>
        )}

        {lastChecked && (
          <p className="text-xs text-obsidian-500 mt-2">
            Last checked: {lastChecked.toLocaleTimeString()}
          </p>
        )}
      </Card>

      {/* How It Works */}
      <Card>
        <h3 className="text-sm font-semibold text-obsidian-100 mb-3">
          How Arcium MPC Works
        </h3>
        <div className="space-y-2 text-xs text-obsidian-400">
          <div className="flex items-start gap-2">
            <span className="text-[rgb(56,190,231)] font-bold">1.</span>
            <span>You encrypt your order client-side using x25519 + Rescue cipher</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[rgb(56,190,231)] font-bold">2.</span>
            <span>The encrypted blob is sent to the relay - <span className="text-accent-red">relay CANNOT decrypt it</span></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[rgb(56,190,231)] font-bold">3.</span>
            <span>Arcium MPC nodes decrypt and compute totals in secure enclaves</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[rgb(56,190,231)] font-bold">4.</span>
            <span>Only the <span className="text-accent-green">batch total</span> is revealed - individual amounts stay hidden</span>
          </div>
        </div>
      </Card>

      {/* Demo Market */}
      <Card className="border-accent-purple/30">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-xs text-obsidian-500">Demo Market</span>
            <h3 className="text-obsidian-100 font-medium">{DEMO_MARKET.title}</h3>
            <p className="text-xs text-obsidian-500 font-mono mt-1">{DEMO_MARKET.id}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 rounded-lg bg-accent-green/10 border border-accent-green/30">
            <span className="text-accent-green text-xl font-bold">{(DEMO_MARKET.yesPrice * 100).toFixed(0)}¢</span>
            <p className="text-xs text-obsidian-400 mt-1">YES</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-accent-red/10 border border-accent-red/30">
            <span className="text-accent-red text-xl font-bold">{(DEMO_MARKET.noPrice * 100).toFixed(0)}¢</span>
            <p className="text-xs text-obsidian-400 mt-1">NO</p>
          </div>
        </div>

        {/* Order Form */}
        {connected ? (
          <div className="space-y-4">
            {/* Side Selection */}
            <div>
              <label className="text-xs text-obsidian-400 mb-2 block">Position</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSide('YES')}
                  className={`py-2 px-4 rounded-lg font-medium transition-all ${
                    side === 'YES'
                      ? 'bg-accent-green text-white'
                      : 'bg-obsidian-700 text-obsidian-300 hover:bg-obsidian-600'
                  }`}
                >
                  Buy YES
                </button>
                <button
                  onClick={() => setSide('NO')}
                  className={`py-2 px-4 rounded-lg font-medium transition-all ${
                    side === 'NO'
                      ? 'bg-accent-red text-white'
                      : 'bg-obsidian-700 text-obsidian-300 hover:bg-obsidian-600'
                  }`}
                >
                  Buy NO
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <label className="text-xs text-obsidian-400 mb-2 block">Amount (USDC)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10.00"
                className="w-full bg-obsidian-800 border border-obsidian-600 rounded-lg px-4 py-2 text-obsidian-100 focus:outline-none focus:border-accent-purple"
              />
              <p className="text-xs text-obsidian-500 mt-1">
                This amount will be encrypted - relay won't see it
              </p>
            </div>

            {/* Wallet Display */}
            <div className="text-xs text-obsidian-400">
              <span>Destination: </span>
              <span className="font-mono text-obsidian-300">
                {publicKey?.toBase58().slice(0, 8)}...{publicKey?.toBase58().slice(-8)}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={handleEncryptPreview}
                disabled={!amount || isSubmitting}
                className="flex-1"
              >
                Preview Encrypted Data
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={isSubmitting}
                disabled={connectionStatus !== 'ready' || !amount}
                className="flex-1"
              >
                Submit Encrypted Order
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            onClick={() => setVisible(true)}
            className="w-full"
          >
            Connect Wallet to Demo
          </Button>
        )}
      </Card>

      {/* Encrypted Data Preview */}
      {encryptedBlob && showEncryptedData && (
        <Card className="border-[rgb(56,190,231)]/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-obsidian-100">
              Encrypted Order Data
            </h3>
            <button
              onClick={() => setShowEncryptedData(false)}
              className="text-obsidian-500 hover:text-obsidian-300"
            >
              Hide
            </button>
          </div>

          <div className="space-y-3 text-xs">
            {/* What relay CAN see */}
            <div>
              <span className="text-accent-green font-medium">Relay CAN see:</span>
              <div className="mt-1 p-2 bg-obsidian-800 rounded font-mono">
                <p>marketId: "{encryptedBlob.marketId}"</p>
                <p>side: "{encryptedBlob.side}"</p>
              </div>
            </div>

            {/* What relay CANNOT see */}
            <div>
              <span className="text-accent-red font-medium">Relay CANNOT see (encrypted):</span>
              <div className="mt-1 p-2 bg-obsidian-800 rounded font-mono break-all">
                <p className="text-obsidian-500">ciphertext: "{encryptedBlob.ciphertext.slice(0, 50)}..."</p>
                <p className="text-obsidian-500">ephemeralPubkey: "{encryptedBlob.ephemeralPubkey}"</p>
                <p className="text-obsidian-500">nonce: "{encryptedBlob.nonce}"</p>
              </div>
              <p className="text-obsidian-500 mt-2">
                Hidden inside ciphertext: usdcAmount=${amount}, destinationWallet
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Submission Result */}
      {lastSubmission && (
        <Card className="border-accent-green/30 bg-accent-green/5">
          <h3 className="text-sm font-semibold text-accent-green mb-3">
            Order Submitted Successfully
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-obsidian-400">Order ID:</span>
              <span className="text-obsidian-200 font-mono">{lastSubmission.orderId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-obsidian-400">Batch ID:</span>
              <span className="text-obsidian-200 font-mono">{lastSubmission.batchId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-obsidian-400">Encrypted:</span>
              <span className="text-accent-green">{lastSubmission.isEncrypted ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-obsidian-400">Hidden from relay:</span>
              <span className="text-obsidian-200">{lastSubmission.hiddenFields?.join(', ')}</span>
            </div>
            <div className="mt-3 p-2 bg-obsidian-800/50 rounded">
              <span className="text-obsidian-500 text-xs">{lastSubmission.privacy?.note}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSubmission}
            className="mt-4"
          >
            Clear & Submit Another
          </Button>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card className="border-accent-red/30 bg-accent-red/5">
          <div className="flex items-start gap-2">
            <span className="text-accent-red">Error:</span>
            <span className="text-obsidian-300 text-sm">{error}</span>
          </div>
        </Card>
      )}

      {/* Technical Details */}
      <Card className="bg-obsidian-800/30">
        <h3 className="text-xs font-semibold text-obsidian-400 mb-2 uppercase tracking-wider">
          Technical Details
        </h3>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-obsidian-500">Program:</span>
            <p className="text-obsidian-300 font-mono">8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc</p>
          </div>
          <div>
            <span className="text-obsidian-500">MXE Account:</span>
            <p className="text-obsidian-300 font-mono">2EYXHVLZGSTGmPN3VFdHb6DroZBfpir6mgYZuFvpxfJG</p>
          </div>
          <div>
            <span className="text-obsidian-500">Cluster:</span>
            <p className="text-obsidian-300">1 (Node 0 active)</p>
          </div>
          <div>
            <span className="text-obsidian-500">Encryption:</span>
            <p className="text-obsidian-300">x25519 ECDH + XOR cipher</p>
          </div>
        </div>
        <a
          href="https://solscan.io/account/8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc?cluster=devnet"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[rgb(56,190,231)] hover:underline mt-3"
        >
          View on Solscan (Devnet)
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </Card>
    </div>
  );
}
