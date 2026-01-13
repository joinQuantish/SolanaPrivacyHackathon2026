import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

// Memo Program ID
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// USDC Mint on mainnet
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Relay wallet address (receives deposits)
export const RELAY_WALLET = new PublicKey(
  import.meta.env.VITE_RELAY_WALLET || 'GzK8x3mQv7qJXHNz9yQtLVnME5VhKj6VGKFzY8n4Ywm'
);

export interface OrderMemo {
  action: 'buy_yes' | 'buy_no' | 'sell';
  marketTicker: string;
  outcomeMint: string;
  amount: number; // USDC amount in human units (e.g., 10 for $10)
  slippageBps?: number;
  returnWallet?: string; // Optional different wallet for returns
}

/**
 * Encode order details into a memo string
 * Format: OBSIDIAN|action|marketTicker|outcomeMint|amount|slippageBps|returnWallet
 */
export function encodeOrderMemo(order: OrderMemo): string {
  const parts = [
    'OBSIDIAN',
    order.action,
    order.marketTicker,
    order.outcomeMint,
    order.amount.toString(),
    (order.slippageBps || 100).toString(),
    order.returnWallet || '',
  ];
  return parts.join('|');
}

/**
 * Create a memo instruction with order details
 */
export function createMemoInstruction(memo: string, signer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });
}

/**
 * Build a complete deposit transaction with embedded order memo
 * This is the key transaction that users sign from Phantom
 */
export async function buildDepositWithMemoTransaction(
  connection: Connection,
  senderWallet: PublicKey,
  usdcAmount: number,
  order: OrderMemo,
): Promise<Transaction> {
  const transaction = new Transaction();

  // Get sender's USDC token account
  const senderAta = await getAssociatedTokenAddress(
    USDC_MINT,
    senderWallet,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Get relay's USDC token account
  const relayAta = await getAssociatedTokenAddress(
    USDC_MINT,
    RELAY_WALLET,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Check if relay ATA exists, create if not
  const relayAtaInfo = await connection.getAccountInfo(relayAta);
  if (!relayAtaInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        senderWallet, // payer
        relayAta, // ata
        RELAY_WALLET, // owner
        USDC_MINT, // mint
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  // USDC has 6 decimals
  const usdcAmountLamports = BigInt(Math.floor(usdcAmount * 1_000_000));

  // Add USDC transfer instruction
  transaction.add(
    createTransferInstruction(
      senderAta, // from
      relayAta, // to
      senderWallet, // owner
      usdcAmountLamports, // amount
      [], // multiSigners
      TOKEN_PROGRAM_ID
    )
  );

  // Add memo instruction with order details
  const memoString = encodeOrderMemo(order);
  transaction.add(createMemoInstruction(memoString, senderWallet));

  // Get latest blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = senderWallet;

  return transaction;
}

/**
 * Build a simple SOL transfer transaction (for funding relay with SOL for fees)
 */
export async function buildSolTransferTransaction(
  connection: Connection,
  senderWallet: PublicKey,
  recipient: PublicKey,
  solAmount: number,
): Promise<Transaction> {
  const transaction = new Transaction();

  const lamports = Math.floor(solAmount * 1_000_000_000);

  transaction.add(
    SystemProgram.transfer({
      fromPubkey: senderWallet,
      toPubkey: recipient,
      lamports,
    })
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = senderWallet;

  return transaction;
}

/**
 * Parse a memo string back into an order (used by relay)
 */
export function parseOrderMemo(memoString: string): OrderMemo | null {
  const parts = memoString.split('|');
  if (parts[0] !== 'OBSIDIAN' || parts.length < 5) {
    return null;
  }

  return {
    action: parts[1] as OrderMemo['action'],
    marketTicker: parts[2],
    outcomeMint: parts[3],
    amount: parseFloat(parts[4]),
    slippageBps: parts[5] ? parseInt(parts[5]) : 100,
    returnWallet: parts[6] || undefined,
  };
}
