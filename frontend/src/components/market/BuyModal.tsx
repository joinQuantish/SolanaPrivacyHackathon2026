import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { ProofStatusCard } from '../common/ProofStatusCard';
import { buildDepositWithMemoTransaction, OrderMemo, RELAY_WALLET } from '../../lib/transaction';
import { executePrivacyDeposit, calculatePrivacyFees, PrivacyOrderDetails } from '../../lib/privacy-deposit';
import { useWalletStore } from '../../store/walletStore';
import { useBalanceProof } from '../../hooks/useBalanceProof';
import type { MarketSearchResult } from '../../types/market';

interface BuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  market: MarketSearchResult;
  initialSide: 'YES' | 'NO';
}

export function BuyModal({ isOpen, onClose, market, initialSide }: BuyModalProps) {
  const wallet = useWallet();
  const { publicKey, sendTransaction } = wallet;
  const { connection } = useConnection();
  const { subWallets, createSubWallet, isLoading: isCreatingWallet } = useWalletStore();
  const [side, setSide] = useState<'YES' | 'NO'>(initialSide);
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number>(0);
  const [usePrivacyDeposit, setUsePrivacyDeposit] = useState(false);
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);
  const [destinationWallets, setDestinationWallets] = useState<string[]>([]);
  const [showCreateWallet, setShowCreateWallet] = useState(false);
  const [newWalletName, setNewWalletName] = useState('');

  // ZK Balance Proof state
  const [useZkBalanceProof, setUseZkBalanceProof] = useState(false);
  const [zkProofStatus, setZkProofStatus] = useState<string | null>(null);

  // Use the balance proof hook
  const {
    isInitialized: isProverInitialized,
    isGenerating: isGeneratingProof,
    notes: spendingNotes,
    totalBalance: privateBalance,
    error: balanceProofError,
    initialize: initializeProver,
    generateProof,
    submitProofToRelay,
    hasEnoughBalance,
  } = useBalanceProof();

  // Toggle wallet selection
  const toggleWalletSelection = (publicKey: string) => {
    setDestinationWallets(prev =>
      prev.includes(publicKey)
        ? prev.filter(w => w !== publicKey)
        : [...prev, publicKey]
    );
  };

  // Calculate share distribution (equal split)
  const getShareDistribution = () => {
    if (destinationWallets.length === 0) return [];
    const totalShares = estimatedShares;
    const sharePerWallet = totalShares / destinationWallets.length;
    return destinationWallets.map(pubkey => {
      const wallet = subWallets.find(w => w.publicKey === pubkey);
      return {
        publicKey: pubkey,
        label: wallet?.label || 'Unknown',
        shares: sharePerWallet,
      };
    });
  };

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
    setPrivacyStatus(null);

    if (!publicKey || !amount || !outcomeMint) {
      setError('Missing required information');
      return;
    }

    setIsLoading(true);

    try {
      if (useZkBalanceProof) {
        // ========================================
        // ZK BALANCE PROOF FLOW
        // ========================================
        const orderAmountUsdc = parseFloat(amount);

        // Check if user has enough private balance
        if (!hasEnoughBalance(orderAmountUsdc)) {
          throw new Error(`Insufficient private balance. You have $${(Number(privateBalance) / 1_000_000).toFixed(2)}`);
        }

        // Initialize prover if needed
        if (!isProverInitialized) {
          setZkProofStatus('Initializing prover...');
          await initializeProver();
        }

        // Generate the balance proof
        setZkProofStatus('Generating ZK balance proof...');
        const proofResult = await generateProof(orderAmountUsdc);

        if (!proofResult.success || !proofResult.proof) {
          throw new Error(proofResult.error || 'Failed to generate balance proof');
        }

        setZkProofStatus('Submitting order with proof...');

        // Submit order with balance proof to relay
        const orderPayload = {
          action: side === 'YES' ? 'buy_yes' : 'buy_no',
          marketTicker: market.ticker,
          outcomeMint: outcomeMint,
          slippageBps: 100,
          destinationWallet: destinationWallets.length > 0 ? destinationWallets.join(';') : publicKey?.toBase58(),
          balanceProof: {
            proof: Array.from(proofResult.proof.proof),
            publicInputs: proofResult.proof.publicInputs,
          },
        };

        const response = await fetch('/api/relay/order-with-proof', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to submit order with balance proof');
        }

        // Submit proof to relay for verification and update local notes
        setZkProofStatus('Verifying proof...');
        const verifyResult = await submitProofToRelay(proofResult.proof);

        if (!verifyResult.success) {
          console.warn('Proof verification warning:', verifyResult.error);
        }

        setTxSignature(data.orderId || 'zk-proof-order');
        setBatchId(data.batchId);
        setZkProofStatus(null);

      } else if (usePrivacyDeposit) {
        // ========================================
        // PRIVACY DEPOSIT FLOW (4 steps)
        // ========================================
        if (destinationWallets.length === 0) {
          throw new Error('Please select at least one destination wallet for your shares');
        }

        const orderId = `${market.ticker}-${side}-${Date.now()}`;

        // Join multiple wallets with semicolons for the memo
        const destinationWalletsStr = destinationWallets.join(';');

        const orderDetails: PrivacyOrderDetails = {
          action: side === 'YES' ? 'buy_yes' : 'buy_no',
          marketTicker: market.ticker,
          outcomeMint: outcomeMint,
          slippageBps: 100, // 1% slippage
          destinationWallet: destinationWalletsStr, // Multiple wallets separated by ;
        };

        const result = await executePrivacyDeposit(
          connection,
          wallet,  // Pass the full wallet context from useWallet()
          parseFloat(amount),
          orderId,
          RELAY_WALLET,
          orderDetails,
          (step, status) => {
            setPrivacyStatus(step);
            console.log('[Privacy]', step, status);
          }
        );

        if (result.success && result.transactions.relayTx) {
          setTxSignature(result.transactions.relayTx);
        } else {
          throw new Error(result.error || 'Privacy deposit failed');
        }

      } else {
        // ========================================
        // STANDARD DEPOSIT FLOW (direct transfer)
        // ========================================
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
      }
    } catch (err) {
      console.error('Transaction failed:', err);
      setError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setIsLoading(false);
      setPrivacyStatus(null);
      setZkProofStatus(null);
    }
  };

  const handleClose = () => {
    setError(null);
    setAmount('');
    setTxSignature(null);
    setBatchId(null);
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
            {usePrivacyDeposit ? (
              <>
                <p className="text-xs text-[rgb(56,190,231)] mb-2 font-medium">
                  🔒 Privacy deposit complete!
                </p>
                <p className="text-xs text-obsidian-400 mb-2">
                  Your deposit used Privacy Cash - there is NO on-chain link between your wallet and this order.
                </p>
              </>
            ) : (
              <p className="text-xs text-obsidian-400 mb-2">
                Your USDC has been sent to the relay with your order memo.
                The relay will execute your trade and distribute positions to privacy wallets.
              </p>
            )}
            <p className="text-xs text-obsidian-500">
              Relay: {RELAY_WALLET.toBase58().slice(0, 8)}...
            </p>
          </div>

          {/* zkNoir Proof Info */}
          <div className="bg-accent-purple/5 border border-accent-purple/20 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-accent-purple text-sm">🔐</span>
              <span className="text-xs font-semibold text-obsidian-200">zkNoir Verification</span>
            </div>
            <p className="text-xs text-obsidian-400">
              After your batch executes, a Noir ZK proof will verify that shares were distributed correctly to all participants.
            </p>
            {batchId && (
              <div className="mt-3">
                <ProofStatusCard batchId={batchId} compact pollInterval={5000} />
              </div>
            )}
            {!batchId && (
              <p className="text-[10px] text-obsidian-500 mt-2">
                Proof status will be available once the relay batches your order.
              </p>
            )}
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

        {/* Privacy Cash Toggle - PROMINENT */}
        <div className={`p-4 rounded-lg border-2 transition-all ${
          usePrivacyDeposit
            ? 'border-[rgb(56,190,231)] bg-[rgb(56,190,231)]/10'
            : 'border-obsidian-600 bg-obsidian-900/50 hover:border-obsidian-500'
        }`}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={usePrivacyDeposit}
              onChange={(e) => setUsePrivacyDeposit(e.target.checked)}
              className="w-6 h-6 rounded accent-[rgb(56,190,231)] cursor-pointer mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔒</span>
                <span className="text-base font-semibold text-obsidian-100">
                  Privacy Mode
                </span>
                {usePrivacyDeposit && (
                  <span className="text-xs bg-[rgb(56,190,231)] text-black px-2 py-0.5 rounded-full font-medium">
                    ENABLED
                  </span>
                )}
              </div>
              <p className="text-sm text-obsidian-400 mt-1">
                {usePrivacyDeposit
                  ? 'Your wallet will NOT be linked to this order on-chain'
                  : 'Enable to hide your wallet address from blockchain observers'}
              </p>

              {!usePrivacyDeposit && (
                <div className="flex items-center gap-2 mt-2 text-xs text-obsidian-500">
                  <span>Powered by</span>
                  <span className="text-[rgb(56,190,231)] font-medium">Privacy Cash</span>
                  <span>• Fee: 0.35%</span>
                </div>
              )}
            </div>
          </label>

          {usePrivacyDeposit && (
            <div className="mt-4 p-3 bg-obsidian-900/50 rounded-lg text-sm space-y-2">
              <div className="text-xs text-obsidian-500 uppercase tracking-wide mb-2">Cost Breakdown</div>
              <div className="flex items-center justify-between">
                <span className="text-obsidian-400">Privacy Cash Fee</span>
                <span className="text-obsidian-200">0.35% of USDC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-obsidian-400">SOL Required</span>
                <span className="text-obsidian-200">~0.05 SOL</span>
              </div>
              <div className="pt-2 border-t border-obsidian-700 space-y-1">
                <p className="text-xs text-obsidian-500">
                  SOL covers: ephemeral wallet creation, ZK proof transactions, and token account initialization if needed.
                </p>
                <p className="text-xs text-[rgb(56,190,231)]">
                  Method: Zero-Knowledge Shielded Pool
                </p>
              </div>
              {parseFloat(amount || '0') > 0 && (
                <div className="pt-2 border-t border-obsidian-700">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-obsidian-400">You receive (after fees)</span>
                    <span className="text-accent-green font-medium">
                      ~${(parseFloat(amount) * 0.9965).toFixed(2)} worth
                    </span>
                  </div>
                </div>
              )}

              {/* Destination Wallet Selection - Multi-select */}
              <div className="pt-3 border-t border-obsidian-700">
                <label className="block text-xs text-obsidian-400 mb-1">
                  🎯 Destination Wallet(s) for Shares
                </label>
                <p className="text-xs text-obsidian-500 mb-2">
                  Select one or more wallets. Shares split evenly across selected wallets.
                </p>

                {subWallets.length > 0 ? (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {subWallets.map((w) => {
                      const isSelected = destinationWallets.includes(w.publicKey);
                      return (
                        <label
                          key={w.id}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-[rgb(56,190,231)]/10 border border-[rgb(56,190,231)]/50'
                              : 'bg-obsidian-800 border border-obsidian-700 hover:border-obsidian-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleWalletSelection(w.publicKey)}
                            className="w-4 h-4 rounded accent-[rgb(56,190,231)]"
                          />
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: w.color || '#8b5cf6' }}
                          />
                          <span className="text-sm text-obsidian-200 flex-1 truncate">
                            {w.label || 'Sub-Wallet'}
                          </span>
                          <span className="text-xs text-obsidian-500 font-mono">
                            {w.publicKey.slice(0, 6)}...
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-xs text-obsidian-500 mb-2">No sub-wallets found</p>
                  </div>
                )}

                {/* Distribution Preview */}
                {destinationWallets.length > 1 && parseFloat(amount || '0') > 0 && (
                  <div className="mt-2 p-2 bg-obsidian-800/50 rounded-lg">
                    <p className="text-xs text-obsidian-400 mb-1.5">Distribution Preview:</p>
                    <div className="space-y-1">
                      {getShareDistribution().map((dist, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-obsidian-300">{dist.label}</span>
                          <span className="text-accent-green">~{dist.shares.toFixed(2)} shares</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!showCreateWallet ? (
                  <button
                    type="button"
                    onClick={() => setShowCreateWallet(true)}
                    className="mt-2 text-xs text-[rgb(56,190,231)] hover:underline"
                  >
                    + Create new sub-wallet
                  </button>
                ) : (
                  <div className="mt-2 p-2 bg-obsidian-800 rounded-lg">
                    <input
                      type="text"
                      value={newWalletName}
                      onChange={(e) => setNewWalletName(e.target.value)}
                      placeholder="Wallet name (e.g., Trading)"
                      className="w-full bg-obsidian-900 border border-obsidian-600 rounded px-2 py-1 text-sm text-obsidian-200 mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateWallet(false);
                          setNewWalletName('');
                        }}
                        className="flex-1 text-xs text-obsidian-400 hover:text-obsidian-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (newWalletName.trim()) {
                            const success = await createSubWallet(newWalletName.trim());
                            if (success) {
                              setShowCreateWallet(false);
                              setNewWalletName('');
                            }
                          }
                        }}
                        disabled={!newWalletName.trim() || isCreatingWallet}
                        className="flex-1 text-xs bg-[rgb(56,190,231)] text-black px-2 py-1 rounded disabled:opacity-50"
                      >
                        {isCreatingWallet ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {privacyStatus && (
            <div className="mt-3 flex items-center gap-2 text-sm text-[rgb(56,190,231)]">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              {privacyStatus}
            </div>
          )}
        </div>

        {/* ZK Balance Proof Toggle */}
        {spendingNotes.length > 0 && (
          <div className={`p-4 rounded-lg border-2 transition-all ${
            useZkBalanceProof
              ? 'border-accent-purple bg-accent-purple/10'
              : 'border-obsidian-600 bg-obsidian-900/50 hover:border-obsidian-500'
          }`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useZkBalanceProof}
                onChange={(e) => {
                  setUseZkBalanceProof(e.target.checked);
                  if (e.target.checked) {
                    setUsePrivacyDeposit(false); // Disable other mode
                  }
                }}
                className="w-6 h-6 rounded accent-accent-purple cursor-pointer mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔐</span>
                  <span className="text-base font-semibold text-obsidian-100">
                    ZK Balance Proof
                  </span>
                  {useZkBalanceProof && (
                    <span className="text-xs bg-accent-purple text-white px-2 py-0.5 rounded-full font-medium">
                      ENABLED
                    </span>
                  )}
                </div>
                <p className="text-sm text-obsidian-400 mt-1">
                  {useZkBalanceProof
                    ? 'Proving sufficient balance without revealing the actual amount'
                    : 'Use your private balance with zero-knowledge proofs'}
                </p>

                {!useZkBalanceProof && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-obsidian-500">
                    <span>Private Balance:</span>
                    <span className="text-accent-purple font-medium">
                      ${(Number(privateBalance) / 1_000_000).toFixed(2)}
                    </span>
                    <span>• {spendingNotes.length} note{spendingNotes.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            </label>

            {useZkBalanceProof && (
              <div className="mt-4 p-3 bg-obsidian-900/50 rounded-lg text-sm space-y-2">
                <div className="text-xs text-obsidian-500 uppercase tracking-wide mb-2">Private Balance</div>
                <div className="flex items-center justify-between">
                  <span className="text-obsidian-400">Available Balance</span>
                  <span className="text-accent-purple font-bold">
                    ${(Number(privateBalance) / 1_000_000).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-obsidian-400">Spending Notes</span>
                  <span className="text-obsidian-200">{spendingNotes.length}</span>
                </div>

                {parseFloat(amount || '0') > 0 && (
                  <div className="pt-2 border-t border-obsidian-700">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-obsidian-400">Order Amount</span>
                      <span className={
                        hasEnoughBalance(parseFloat(amount))
                          ? 'text-accent-green font-medium'
                          : 'text-accent-red font-medium'
                      }>
                        ${amount} {hasEnoughBalance(parseFloat(amount)) ? '✓' : '(insufficient)'}
                      </span>
                    </div>
                    {hasEnoughBalance(parseFloat(amount)) && (
                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-obsidian-400">Remaining Balance</span>
                        <span className="text-obsidian-200">
                          ${((Number(privateBalance) / 1_000_000) - parseFloat(amount)).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-obsidian-700 space-y-1">
                  <p className="text-xs text-obsidian-500">
                    A zero-knowledge proof will be generated in your browser proving you have sufficient balance without revealing the actual amount.
                  </p>
                  <p className="text-xs text-accent-purple">
                    Method: Noir ZK Circuit (UltraHonk)
                  </p>
                </div>
              </div>
            )}

            {zkProofStatus && (
              <div className="mt-3 flex items-center gap-2 text-sm text-accent-purple">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                {zkProofStatus}
              </div>
            )}

            {balanceProofError && (
              <p className="mt-2 text-xs text-accent-red">{balanceProofError}</p>
            )}
          </div>
        )}

        {/* Link to deposit if no spending notes */}
        {spendingNotes.length === 0 && (
          <div className="p-3 rounded-lg border border-dashed border-obsidian-600 bg-obsidian-900/30">
            <div className="flex items-center gap-2 text-sm text-obsidian-400">
              <span>🔐</span>
              <span>No private balance yet.</span>
              <a href="/privacy" className="text-accent-purple hover:underline">
                Make a private deposit →
              </a>
            </div>
          </div>
        )}

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
            loading={isLoading || isGeneratingProof}
            disabled={
              !amount ||
              !publicKey ||
              !outcomeMint ||
              (useZkBalanceProof ? !hasEnoughBalance(parseFloat(amount || '0')) : parseFloat(amount) > usdcBalance) ||
              (usePrivacyDeposit && destinationWallets.length === 0)
            }
            className={`flex-1 ${
              side === 'YES'
                ? 'bg-accent-green hover:bg-accent-green/80'
                : 'bg-accent-red hover:bg-accent-red/80'
            }`}
          >
            {isLoading || isGeneratingProof
              ? (useZkBalanceProof
                  ? (zkProofStatus || 'Generating ZK proof...')
                  : usePrivacyDeposit
                    ? (privacyStatus || 'Processing privacy deposit...')
                    : 'Confirm in Wallet...')
              : `Buy ${side}${useZkBalanceProof ? ' (ZK Proof)' : usePrivacyDeposit ? ' (Private)' : ''}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
