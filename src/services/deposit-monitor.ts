import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';
import { getRelayWallet } from './wallet.js';
import { getMcpWalletAddress } from './dflow.js';
import { getOrder, activateOrder, refundOrder } from './batch.js';

// USDC mint on mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Solana Memo Program ID
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Polling interval (ms) - use longer interval to avoid rate limits on public RPC
const POLL_INTERVAL = 15000; // 15 seconds

// Track processed signatures to avoid duplicates
const processedSignatures = new Set<string>();

// Pending deposits that couldn't be matched
interface UnmatchedDeposit {
  signature: string;
  amount: string;
  sender: string;
  memo?: string;
  timestamp: Date;
}
const unmatchedDeposits: Map<string, UnmatchedDeposit> = new Map();

/**
 * Parsed memo structure for OBSIDIAN orders
 */
interface ParsedOrderMemo {
  raw: string;
  action?: 'buy_yes' | 'buy_no';
  marketTicker?: string;
  outcomeMint?: string;
  amount?: number;
  slippageBps?: number;
  destinationWallets?: string[]; // Multiple wallets separated by ; in memo
}

/**
 * Parse memo from transaction
 * Supports both:
 * - New format: OBSIDIAN|action|marketTicker|outcomeMint|amount|slippageBps|destinationWallet
 * - Legacy format: UUID order IDs
 */
function parseMemo(tx: ParsedTransactionWithMeta): ParsedOrderMemo | undefined {
  let memoContent: string | undefined;

  // First, try to extract memo from logs
  if (tx.meta?.logMessages) {
    for (const log of tx.meta.logMessages) {
      // Memo program logs the memo content
      if (log.includes('Program log: Memo')) {
        const match = log.match(/Memo \(len \d+\): "(.+)"/);
        if (match) {
          memoContent = match[1];
          break;
        }
      }
    }
  }

  // Check instruction data for memo program
  if (!memoContent && tx.transaction.message.instructions) {
    for (const ix of tx.transaction.message.instructions) {
      if ('programId' in ix && ix.programId.equals(MEMO_PROGRAM_ID)) {
        if ('data' in ix && typeof ix.data === 'string') {
          try {
            // Memo data is UTF-8 encoded
            memoContent = Buffer.from(ix.data, 'base64').toString('utf-8');
            break;
          } catch {
            memoContent = ix.data;
            break;
          }
        }
      }
    }
  }

  if (!memoContent) return undefined;

  // Parse OBSIDIAN format: OBSIDIAN|action|marketTicker|outcomeMint|amount|slippageBps|destinationWallets
  // destinationWallets can be multiple addresses separated by semicolons
  if (memoContent.startsWith('OBSIDIAN|')) {
    const parts = memoContent.split('|');
    if (parts.length >= 7) {
      // Split destination wallets by semicolon (supports multiple)
      const destinationWallets = parts[6].split(';').filter(w => w.length > 0);

      console.log(`[Deposit Monitor] Parsed OBSIDIAN memo:`, {
        action: parts[1],
        marketTicker: parts[2],
        outcomeMint: parts[3].slice(0, 8) + '...',
        amount: parts[4],
        slippageBps: parts[5],
        destinationWallets: destinationWallets.length,
      });

      return {
        raw: memoContent,
        action: parts[1] as 'buy_yes' | 'buy_no',
        marketTicker: parts[2],
        outcomeMint: parts[3],
        amount: parseFloat(parts[4]),
        slippageBps: parseInt(parts[5], 10),
        destinationWallets,
      };
    }
  }

  // Legacy UUID format
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memoContent)) {
    return { raw: memoContent };
  }

  // Return raw memo for any other format
  return { raw: memoContent };
}

/**
 * Extract USDC transfer details from transaction
 */
function extractUsdcTransfer(
  tx: ParsedTransactionWithMeta,
  relayAddress: string
): { amount: string; sender: string } | null {
  if (!tx.meta || tx.meta.err) return null;

  const preBalances = tx.meta.preTokenBalances || [];
  const postBalances = tx.meta.postTokenBalances || [];

  // Find USDC transfer to relay wallet
  for (const post of postBalances) {
    if (
      post.mint === USDC_MINT.toBase58() &&
      post.owner === relayAddress
    ) {
      // Find corresponding pre-balance
      const pre = preBalances.find(
        p => p.accountIndex === post.accountIndex
      );

      const preAmount = pre?.uiTokenAmount.uiAmount || 0;
      const postAmount = post.uiTokenAmount.uiAmount || 0;
      const transferAmount = postAmount - preAmount;

      if (transferAmount > 0) {
        // Find sender (account with decreased balance)
        for (const preBal of preBalances) {
          if (preBal.mint === USDC_MINT.toBase58() && preBal.owner !== relayAddress) {
            const postBal = postBalances.find(
              p => p.accountIndex === preBal.accountIndex
            );
            const senderPre = preBal.uiTokenAmount.uiAmount || 0;
            const senderPost = postBal?.uiTokenAmount.uiAmount || 0;

            if (senderPre - senderPost >= transferAmount * 0.99) {
              return {
                amount: transferAmount.toFixed(6),
                sender: preBal.owner!,
              };
            }
          }
        }

        // If we can't find sender, still return the transfer
        return {
          amount: transferAmount.toFixed(6),
          sender: 'unknown',
        };
      }
    }
  }

  return null;
}

/**
 * Execute trade via Kalshi MCP and distribute shares to multiple wallets
 */
async function executeTradeAndDistribute(
  memo: ParsedOrderMemo,
  usdcAmount: number,
  depositSignature: string
): Promise<{ success: boolean; tradeTx?: string; distributeTxs?: string[]; error?: string }> {
  // Dynamic imports to avoid circular dependencies
  const { buyYes, buyNo } = await import('./mcp-wallet.js');
  const { distributeTokensViaMcp } = await import('./dflow.js');

  if (!memo.action || !memo.marketTicker || !memo.outcomeMint || !memo.destinationWallets || memo.destinationWallets.length === 0) {
    return { success: false, error: 'Missing required order details in memo' };
  }

  console.log(`[Trade] Executing ${memo.action} for ${usdcAmount} USDC on ${memo.marketTicker}`);
  console.log(`[Trade] Will distribute to ${memo.destinationWallets.length} wallet(s)`);

  // Execute the trade
  let tradeResult;
  if (memo.action === 'buy_yes') {
    tradeResult = await buyYes(
      memo.marketTicker,
      memo.outcomeMint,
      usdcAmount,
      memo.slippageBps || 100
    );
  } else {
    tradeResult = await buyNo(
      memo.marketTicker,
      memo.outcomeMint,
      usdcAmount,
      memo.slippageBps || 100
    );
  }

  if (!tradeResult.success) {
    console.error(`[Trade] Failed:`, tradeResult.error);
    return { success: false, error: tradeResult.error };
  }

  console.log(`[Trade] Success! TX: ${tradeResult.txSignature}, shares: ${tradeResult.sharesReceived}`);

  // Distribute shares evenly to all destination wallets
  if (tradeResult.sharesReceived && memo.destinationWallets.length > 0) {
    const sharesPerWallet = tradeResult.sharesReceived / memo.destinationWallets.length;

    console.log(`[Trade] Distributing ${sharesPerWallet.toFixed(4)} shares to each of ${memo.destinationWallets.length} wallets`);

    // Build distribution list
    const distributions = memo.destinationWallets.map(wallet => ({
      wallet,
      amount: sharesPerWallet,
    }));

    const distResults = await distributeTokensViaMcp(memo.outcomeMint, distributions);

    const successfulTxs = distResults.filter(r => r.success).map(r => r.txSignature!);
    const failedWallets = distResults.filter(r => !r.success);

    if (failedWallets.length > 0) {
      console.error(`[Trade] ${failedWallets.length} distribution(s) failed:`, failedWallets.map(f => f.error));
    }

    if (successfulTxs.length > 0) {
      console.log(`[Trade] Distribution complete! ${successfulTxs.length}/${memo.destinationWallets.length} succeeded`);
      return {
        success: true,
        tradeTx: tradeResult.txSignature,
        distributeTxs: successfulTxs,
        error: failedWallets.length > 0
          ? `${failedWallets.length} distribution(s) failed`
          : undefined,
      };
    } else {
      return {
        success: true,
        tradeTx: tradeResult.txSignature,
        error: 'All distributions failed',
      };
    }
  }

  return { success: true, tradeTx: tradeResult.txSignature };
}

/**
 * Process a deposit transaction
 */
async function processDeposit(
  signature: string,
  tx: ParsedTransactionWithMeta,
  relayAddress: string
): Promise<void> {
  const transfer = extractUsdcTransfer(tx, relayAddress);
  if (!transfer) return;

  const memo = parseMemo(tx);
  console.log(`Deposit detected: ${transfer.amount} USDC from ${transfer.sender}, memo: ${memo?.raw || 'none'}`);

  // Handle OBSIDIAN format (new privacy deposits)
  if (memo?.action && memo.marketTicker && memo.outcomeMint && memo.destinationWallets && memo.destinationWallets.length > 0) {
    console.log(`[Deposit Monitor] Processing OBSIDIAN order from privacy deposit`);
    console.log(`[Deposit Monitor] ${memo.destinationWallets.length} destination wallet(s)`);

    const result = await executeTradeAndDistribute(
      memo,
      parseFloat(transfer.amount),
      signature
    );

    if (result.success) {
      console.log(`[Deposit Monitor] Order complete! Trade: ${result.tradeTx}, Distributions: ${result.distributeTxs?.length || 0}`);
    } else {
      console.error(`[Deposit Monitor] Order failed:`, result.error);
      // Store for manual review
      unmatchedDeposits.set(signature, {
        signature,
        amount: transfer.amount,
        sender: transfer.sender,
        memo: memo.raw,
        timestamp: new Date(),
      });
    }
    return;
  }

  // Legacy format - try to match to an existing order
  if (memo?.raw) {
    const order = getOrder(memo.raw);
    if (order) {
      // Validate amount matches
      const expectedAmount = parseFloat(order.usdcAmount);
      const receivedAmount = parseFloat(transfer.amount);

      if (Math.abs(expectedAmount - receivedAmount) < 0.01) {
        // Amount matches - activate order
        console.log(`Deposit matched to order ${memo.raw}. Activating...`);
        await activateOrder(memo.raw, signature, transfer.sender);
        return;
      } else {
        // Amount mismatch - refund
        console.log(`Amount mismatch for order ${memo.raw}. Expected ${expectedAmount}, got ${receivedAmount}. Refunding...`);
        await refundOrder(memo.raw, transfer.sender, transfer.amount, 'Amount mismatch');
        return;
      }
    } else {
      console.log(`Order ${memo.raw} not found. Holding deposit for manual review.`);
    }
  }

  // No memo or order not found - store for manual matching
  unmatchedDeposits.set(signature, {
    signature,
    amount: transfer.amount,
    sender: transfer.sender,
    memo: memo?.raw,
    timestamp: new Date(),
  });

  console.log(`Unmatched deposit stored: ${signature}`);
}

/**
 * Monitor relay wallet for incoming USDC deposits
 * Prioritizes MCP wallet if available, falls back to legacy relay wallet
 *
 * IMPORTANT: We watch the USDC Associated Token Account (ATA) address,
 * not the wallet address, because getSignaturesForAddress only returns
 * transactions that directly involve an address as a signer/account.
 */
export async function startDepositMonitor(rpcUrl?: string): Promise<void> {
  const connection = new Connection(
    rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    'confirmed'
  );

  // Try to use MCP wallet first (Kalshi integration)
  let relayAddress: string;
  const mcpAddress = await getMcpWalletAddress();
  if (mcpAddress) {
    relayAddress = mcpAddress;
    console.log(`Using MCP wallet for deposit monitoring: ${relayAddress}`);
  } else {
    const wallet = await getRelayWallet();
    relayAddress = wallet.getAddress();
    console.log(`Using legacy relay wallet for deposit monitoring: ${relayAddress}`);
  }

  // Get the USDC ATA for the relay wallet - this is what we actually monitor
  // because token transfers go to the ATA, not the wallet itself
  const { getAssociatedTokenAddress } = await import('@solana/spl-token');
  const relayUsdcAta = await getAssociatedTokenAddress(
    USDC_MINT,
    new PublicKey(relayAddress)
  );
  const monitorAddress = relayUsdcAta.toBase58();

  console.log(`Starting deposit monitor for wallet: ${relayAddress}`);
  console.log(`[Deposit Monitor] Watching USDC ATA: ${monitorAddress}`);

  // Get initial signature to start from
  let lastSignature: string | undefined;

  const signatures = await connection.getSignaturesForAddress(
    new PublicKey(monitorAddress),
    { limit: 1 }
  );

  if (signatures.length > 0) {
    lastSignature = signatures[0].signature;
    processedSignatures.add(lastSignature);
    console.log(`[Deposit Monitor] Starting from signature: ${lastSignature.slice(0, 20)}...`);
  } else {
    console.log(`[Deposit Monitor] No previous transactions found, watching from start`);
  }

  // Polling loop
  const poll = async () => {
    try {
      const newSignatures = await connection.getSignaturesForAddress(
        new PublicKey(monitorAddress),
        lastSignature ? { until: lastSignature } : { limit: 10 }
      );

      if (newSignatures.length > 0) {
        console.log(`[Deposit Monitor] Found ${newSignatures.length} new transaction(s)`);
      }

      // Process new transactions (oldest first)
      for (const sig of newSignatures.reverse()) {
        if (processedSignatures.has(sig.signature)) continue;

        try {
          const tx = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (tx) {
            await processDeposit(sig.signature, tx, relayAddress);
          }

          processedSignatures.add(sig.signature);
          lastSignature = sig.signature;
        } catch (err) {
          console.error(`Error processing tx ${sig.signature}:`, err);
        }
      }
    } catch (err) {
      console.error('Error polling for deposits:', err);
    }

    // Schedule next poll
    setTimeout(poll, POLL_INTERVAL);
  };

  // Start polling
  poll();
}

/**
 * Get unmatched deposits (for admin review)
 */
export function getUnmatchedDeposits(): UnmatchedDeposit[] {
  return Array.from(unmatchedDeposits.values());
}

/**
 * Manually match a deposit to an order
 */
export async function manualMatchDeposit(
  signature: string,
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const deposit = unmatchedDeposits.get(signature);
  if (!deposit) {
    return { success: false, error: 'Deposit not found' };
  }

  const order = getOrder(orderId);
  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  // Activate the order
  await activateOrder(orderId, signature, deposit.sender);
  unmatchedDeposits.delete(signature);

  return { success: true };
}

/**
 * Refund an unmatched deposit
 */
export async function refundUnmatchedDeposit(
  signature: string
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  const deposit = unmatchedDeposits.get(signature);
  if (!deposit) {
    return { success: false, error: 'Deposit not found' };
  }

  if (deposit.sender === 'unknown') {
    return { success: false, error: 'Cannot refund - sender unknown' };
  }

  const wallet = await getRelayWallet();
  const result = await wallet.transferUsdc(deposit.sender, parseFloat(deposit.amount));

  if (result.success) {
    unmatchedDeposits.delete(signature);
    return { success: true, txSignature: result.signature };
  }

  return { success: false, error: result.error };
}
