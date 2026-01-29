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
        <h1 className="text-2xl font-bold text-qn-black mb-2 uppercase tracking-tight">
          Arcium MPC Demo
        </h1>
        <p className="text-qn-gray-500 text-sm">
          Submit encrypted orders on Solana Devnet. The relay cannot see your order amounts.
        </p>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 border-2 border-accent-cyan bg-accent-cyan/10">
          <span className="w-2 h-2 bg-accent-cyan"></span>
          <span className="text-xs text-accent-cyan font-bold font-mono uppercase">Devnet</span>
        </div>
      </div>

      {/* MPC Status Card */}
      <div className="bg-white border-2 border-qn-black p-6" style={{ boxShadow: '4px 4px 0px 0px rgba(14, 165, 233, 0.3)' }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-xs font-bold text-accent-cyan uppercase tracking-widest font-mono">
              MPC Status
            </span>
            <h3 className="text-lg font-bold text-qn-black mt-1 uppercase">
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
          <div className={`w-3 h-3 ${
            connectionStatus === 'ready' ? 'bg-accent-green' :
            connectionStatus === 'partial' ? 'bg-accent-orange' :
            connectionStatus === 'checking' ? 'bg-accent-blue animate-pulse' :
            'bg-accent-red'
          }`} />
          <span className="text-qn-black font-bold text-sm">
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
          <div className="text-xs space-y-2 border-t-2 border-qn-black pt-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-qn-gray-400 font-mono uppercase">Program ID:</span>
                <p className="text-qn-gray-600 font-mono truncate">
                  {diagnostics.programId || '8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc'}
                </p>
              </div>
              <div>
                <span className="text-qn-gray-400 font-mono uppercase">MXE Account:</span>
                <p className="text-qn-gray-600 font-mono truncate">
                  {diagnostics.mxeAccount || '2EYXHVLZGSTGmPN3VFdHb6DroZBfpir6mgYZuFvpxfJG'}
                </p>
              </div>
            </div>
            {diagnostics.checks && (
              <div className="flex gap-4 font-mono font-bold uppercase">
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
          <p className="text-xs text-qn-gray-400 mt-2 font-mono">
            Last checked: {lastChecked.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* How It Works */}
      <div className="bg-white border-2 border-qn-black p-4" style={{ boxShadow: '2px 2px 0px 0px rgb(13, 13, 13)' }}>
        <h3 className="text-sm font-bold text-qn-black mb-3 uppercase tracking-wide">
          How Arcium MPC Works
        </h3>
        <div className="space-y-2 text-xs text-qn-gray-500">
          <div className="flex items-start gap-2">
            <span className="text-qn-black font-bold font-mono">1.</span>
            <span>You encrypt your order client-side using x25519 + Rescue cipher</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-qn-black font-bold font-mono">2.</span>
            <span>The encrypted blob is sent to the relay - <span className="text-accent-red font-bold">relay CANNOT decrypt it</span></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-qn-black font-bold font-mono">3.</span>
            <span>Arcium MPC nodes decrypt and compute totals in secure enclaves</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-qn-black font-bold font-mono">4.</span>
            <span>Only the <span className="text-accent-green font-bold">batch total</span> is revealed - individual amounts stay hidden</span>
          </div>
        </div>
      </div>

      {/* Demo Market */}
      <div className="bg-white border-2 border-qn-black p-4" style={{ boxShadow: '4px 4px 0px 0px rgb(13, 13, 13)' }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-xs text-qn-gray-400 font-mono uppercase">Demo Market</span>
            <h3 className="text-qn-black font-bold uppercase tracking-tight">{DEMO_MARKET.title}</h3>
            <p className="text-xs text-qn-gray-400 font-mono mt-1">{DEMO_MARKET.id}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 border-2 border-accent-green bg-accent-green/5">
            <span className="text-accent-green text-xl font-bold font-mono">{(DEMO_MARKET.yesPrice * 100).toFixed(0)}¢</span>
            <p className="text-xs text-qn-gray-500 mt-1 font-mono uppercase">YES</p>
          </div>
          <div className="text-center p-3 border-2 border-accent-red bg-accent-red/5">
            <span className="text-accent-red text-xl font-bold font-mono">{(DEMO_MARKET.noPrice * 100).toFixed(0)}¢</span>
            <p className="text-xs text-qn-gray-500 mt-1 font-mono uppercase">NO</p>
          </div>
        </div>

        {/* Order Form */}
        {connected ? (
          <div className="space-y-4">
            {/* Side Selection */}
            <div>
              <label className="text-xs text-qn-gray-400 mb-2 block font-mono uppercase font-bold">Position</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSide('YES')}
                  className={`py-2 px-4 font-bold transition-all duration-100 uppercase tracking-wider border-2 ${
                    side === 'YES'
                      ? 'bg-accent-green text-white border-accent-green'
                      : 'bg-white text-qn-gray-500 border-qn-gray-300 hover:border-qn-black'
                  }`}
                >
                  Buy YES
                </button>
                <button
                  onClick={() => setSide('NO')}
                  className={`py-2 px-4 font-bold transition-all duration-100 uppercase tracking-wider border-2 ${
                    side === 'NO'
                      ? 'bg-accent-red text-white border-accent-red'
                      : 'bg-white text-qn-gray-500 border-qn-gray-300 hover:border-qn-black'
                  }`}
                >
                  Buy NO
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <label className="text-xs text-qn-gray-400 mb-2 block font-mono uppercase font-bold">Amount (USDC)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10.00"
                className="w-full bg-white border-2 border-qn-black px-4 py-2 text-qn-black font-mono focus:outline-none focus:shadow-brutal"
              />
              <p className="text-xs text-qn-gray-400 mt-1 font-mono">
                This amount will be encrypted - relay won't see it
              </p>
            </div>

            {/* Wallet Display */}
            <div className="text-xs text-qn-gray-500 font-mono">
              <span className="uppercase">Destination: </span>
              <span className="text-qn-gray-600">
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
                Preview Encrypted
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={isSubmitting}
                disabled={connectionStatus !== 'ready' || !amount}
                className="flex-1"
              >
                Submit Encrypted
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setVisible(true)}
            className="w-full bg-qn-black text-white font-bold py-3 uppercase tracking-wider border-2 border-qn-black transition-all duration-100 hover:shadow-brutal"
          >
            Connect Wallet to Demo
          </button>
        )}
      </div>

      {/* Encrypted Data Preview */}
      {encryptedBlob && showEncryptedData && (
        <div className="bg-white border-2 border-accent-cyan p-4" style={{ boxShadow: '4px 4px 0px 0px rgba(14, 165, 233, 0.3)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-qn-black uppercase tracking-wide">
              Encrypted Order Data
            </h3>
            <button
              onClick={() => setShowEncryptedData(false)}
              className="text-qn-gray-400 hover:text-qn-black font-bold text-xs uppercase"
            >
              Hide
            </button>
          </div>

          <div className="space-y-3 text-xs">
            {/* What relay CAN see */}
            <div>
              <span className="text-accent-green font-bold uppercase">Relay CAN see:</span>
              <div className="mt-1 p-2 bg-qn-gray-100 border border-qn-gray-200 font-mono text-qn-gray-600">
                <p>marketId: "{encryptedBlob.marketId}"</p>
                <p>side: "{encryptedBlob.side}"</p>
              </div>
            </div>

            {/* What relay CANNOT see */}
            <div>
              <span className="text-accent-red font-bold uppercase">Relay CANNOT see (encrypted):</span>
              <div className="mt-1 p-2 bg-qn-gray-100 border border-qn-gray-200 font-mono break-all text-qn-gray-500">
                <p>ciphertext: "{encryptedBlob.ciphertext.slice(0, 50)}..."</p>
                <p>ephemeralPubkey: "{encryptedBlob.ephemeralPubkey}"</p>
                <p>nonce: "{encryptedBlob.nonce}"</p>
              </div>
              <p className="text-qn-gray-400 mt-2 font-mono">
                Hidden inside ciphertext: usdcAmount=${amount}, destinationWallet
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Submission Result */}
      {lastSubmission && (
        <div className="bg-white border-2 border-accent-green p-4" style={{ boxShadow: '4px 4px 0px 0px rgba(28, 202, 91, 0.3)' }}>
          <h3 className="text-sm font-bold text-accent-green mb-3 uppercase tracking-wide">
            Order Submitted Successfully
          </h3>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-qn-gray-400 uppercase">Order ID:</span>
              <span className="text-qn-black">{lastSubmission.orderId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-qn-gray-400 uppercase">Batch ID:</span>
              <span className="text-qn-black">{lastSubmission.batchId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-qn-gray-400 uppercase">Encrypted:</span>
              <span className="text-accent-green font-bold">{lastSubmission.isEncrypted ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-qn-gray-400 uppercase">Hidden from relay:</span>
              <span className="text-qn-black">{lastSubmission.hiddenFields?.join(', ')}</span>
            </div>
            <div className="mt-3 p-2 bg-qn-gray-100 border border-qn-gray-200">
              <span className="text-qn-gray-500">{lastSubmission.privacy?.note}</span>
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
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-white border-2 border-accent-red p-4">
          <div className="flex items-start gap-2">
            <span className="text-accent-red font-bold uppercase">Error:</span>
            <span className="text-qn-gray-600 text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Technical Details */}
      <div className="bg-qn-gray-100 border-2 border-qn-black p-4">
        <h3 className="text-xs font-bold text-qn-gray-500 mb-2 uppercase tracking-widest font-mono">
          Technical Details
        </h3>
        <div className="grid grid-cols-2 gap-4 text-xs font-mono">
          <div>
            <span className="text-qn-gray-400 uppercase">Program:</span>
            <p className="text-qn-gray-600">8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc</p>
          </div>
          <div>
            <span className="text-qn-gray-400 uppercase">MXE Account:</span>
            <p className="text-qn-gray-600">2EYXHVLZGSTGmPN3VFdHb6DroZBfpir6mgYZuFvpxfJG</p>
          </div>
          <div>
            <span className="text-qn-gray-400 uppercase">Cluster:</span>
            <p className="text-qn-gray-600">1 (Node 0 active)</p>
          </div>
          <div>
            <span className="text-qn-gray-400 uppercase">Encryption:</span>
            <p className="text-qn-gray-600">x25519 ECDH + XOR cipher</p>
          </div>
        </div>
        <a
          href="https://solscan.io/account/8postM9mUCTKTu6a1vkrhfg8erso2g8eHo8bmc9JZjZc?cluster=devnet"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-qn-black hover:underline mt-3 font-bold uppercase"
        >
          View on Solscan (Devnet)
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  );
}
