import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';
import { getRelayWallet } from './wallet.js';
import { getOrder, activateOrder, refundOrder } from './batch.js';

// USDC mint on mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Solana Memo Program ID
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Polling interval (ms)
const POLL_INTERVAL = 5000; // 5 seconds

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
 * Parse memo from transaction
 */
function parseMemo(tx: ParsedTransactionWithMeta): string | undefined {
  if (!tx.meta?.logMessages) return undefined;

  for (const log of tx.meta.logMessages) {
    // Memo program logs the memo content
    if (log.includes('Program log: Memo')) {
      const match = log.match(/Memo \(len \d+\): "(.+)"/);
      if (match) return match[1];
    }
    // Also check for raw memo data
    if (log.startsWith('Program log: ') && !log.includes('Instruction:')) {
      const memoContent = log.replace('Program log: ', '').trim();
      // Check if it looks like an order ID (UUID format)
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memoContent)) {
        return memoContent;
      }
    }
  }

  // Check instruction data for memo program
  if (tx.transaction.message.instructions) {
    for (const ix of tx.transaction.message.instructions) {
      if ('programId' in ix && ix.programId.equals(MEMO_PROGRAM_ID)) {
        if ('data' in ix && typeof ix.data === 'string') {
          try {
            // Memo data is UTF-8 encoded
            return Buffer.from(ix.data, 'base64').toString('utf-8');
          } catch {
            return ix.data;
          }
        }
      }
    }
  }

  return undefined;
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
  console.log(`Deposit detected: ${transfer.amount} USDC from ${transfer.sender}, memo: ${memo || 'none'}`);

  // Try to match to an order
  if (memo) {
    const order = getOrder(memo);
    if (order) {
      // Validate amount matches
      const expectedAmount = parseFloat(order.usdcAmount);
      const receivedAmount = parseFloat(transfer.amount);

      if (Math.abs(expectedAmount - receivedAmount) < 0.01) {
        // Amount matches - activate order
        console.log(`Deposit matched to order ${memo}. Activating...`);
        await activateOrder(memo, signature, transfer.sender);
        return;
      } else {
        // Amount mismatch - refund
        console.log(`Amount mismatch for order ${memo}. Expected ${expectedAmount}, got ${receivedAmount}. Refunding...`);
        await refundOrder(memo, transfer.sender, transfer.amount, 'Amount mismatch');
        return;
      }
    } else {
      console.log(`Order ${memo} not found. Holding deposit for manual review.`);
    }
  }

  // No memo or order not found - store for manual matching
  unmatchedDeposits.set(signature, {
    signature,
    amount: transfer.amount,
    sender: transfer.sender,
    memo,
    timestamp: new Date(),
  });

  console.log(`Unmatched deposit stored: ${signature}`);
}

/**
 * Monitor relay wallet for incoming USDC deposits
 */
export async function startDepositMonitor(rpcUrl?: string): Promise<void> {
  const connection = new Connection(
    rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    'confirmed'
  );

  const wallet = await getRelayWallet();
  const relayAddress = wallet.getAddress();

  console.log(`Starting deposit monitor for wallet: ${relayAddress}`);

  // Get initial signature to start from
  let lastSignature: string | undefined;

  const signatures = await connection.getSignaturesForAddress(
    new PublicKey(relayAddress),
    { limit: 1 }
  );

  if (signatures.length > 0) {
    lastSignature = signatures[0].signature;
    processedSignatures.add(lastSignature);
  }

  // Polling loop
  const poll = async () => {
    try {
      const newSignatures = await connection.getSignaturesForAddress(
        new PublicKey(relayAddress),
        lastSignature ? { until: lastSignature } : { limit: 10 }
      );

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
