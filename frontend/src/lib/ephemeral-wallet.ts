/**
 * Ephemeral Wallet Management for Privacy Cash Integration
 *
 * Creates disposable wallets that break the on-chain link between
 * the user's main wallet and the relay.
 *
 * Flow:
 * 1. User deposits to Privacy Pool from main wallet
 * 2. User withdraws from Pool to ephemeral wallet (ZK proof - unlinkable!)
 * 3. Ephemeral wallet sends to relay (with memo, but wallet is anonymous)
 */

import {
  Keypair,
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const EPHEMERAL_STORAGE_KEY = 'quantish_privacy_wallets';
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

interface EphemeralWalletData {
  publicKey: string;
  secretKey: string; // Base64 encoded
  createdAt: number;
  orderId?: string;
  used: boolean;
}

interface StoredWallets {
  [orderId: string]: EphemeralWalletData;
}

/**
 * Get all stored ephemeral wallets from localStorage
 */
function getStoredWallets(): StoredWallets {
  try {
    const stored = localStorage.getItem(EPHEMERAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Generate a new ephemeral wallet keypair
 */
export function createEphemeralWallet(): { keypair: Keypair; publicKey: string } {
  const keypair = Keypair.generate();
  return {
    keypair,
    publicKey: keypair.publicKey.toBase58(),
  };
}

/**
 * Store ephemeral wallet data in localStorage
 * Note: In production, consider encrypting the secret key
 */
export function storeEphemeralWallet(orderId: string, keypair: Keypair): void {
  const wallets = getStoredWallets();
  wallets[orderId] = {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Buffer.from(keypair.secretKey).toString('base64'),
    createdAt: Date.now(),
    orderId,
    used: false,
  };
  localStorage.setItem(EPHEMERAL_STORAGE_KEY, JSON.stringify(wallets));
}

/**
 * Retrieve ephemeral wallet for a specific order
 */
export function getEphemeralWallet(orderId: string): Keypair | null {
  const wallets = getStoredWallets();
  const data = wallets[orderId];
  if (!data) return null;

  try {
    const secretKey = Buffer.from(data.secretKey, 'base64');
    return Keypair.fromSecretKey(secretKey);
  } catch {
    return null;
  }
}

/**
 * Mark an ephemeral wallet as used
 */
export function markWalletUsed(orderId: string): void {
  const wallets = getStoredWallets();
  if (wallets[orderId]) {
    wallets[orderId].used = true;
    localStorage.setItem(EPHEMERAL_STORAGE_KEY, JSON.stringify(wallets));
  }
}

/**
 * Clean up old ephemeral wallets (older than 24 hours)
 */
export function cleanupOldWallets(): void {
  const wallets = getStoredWallets();
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  const cleaned: StoredWallets = {};
  for (const [orderId, data] of Object.entries(wallets)) {
    if (now - data.createdAt < maxAge && !data.used) {
      cleaned[orderId] = data;
    }
  }

  localStorage.setItem(EPHEMERAL_STORAGE_KEY, JSON.stringify(cleaned));
}

/**
 * Check if ephemeral wallet has SOL for transaction fees
 */
export async function checkEphemeralBalance(
  connection: Connection,
  ephemeralPubkey: PublicKey
): Promise<{ sol: number; usdc: number }> {
  try {
    const solBalance = await connection.getBalance(ephemeralPubkey);

    let usdcBalance = 0;
    try {
      const usdcAta = await getAssociatedTokenAddress(USDC_MINT, ephemeralPubkey);
      const tokenBalance = await connection.getTokenAccountBalance(usdcAta);
      usdcBalance = tokenBalance.value.uiAmount || 0;
    } catch {
      // No USDC account yet
    }

    return {
      sol: solBalance / LAMPORTS_PER_SOL,
      usdc: usdcBalance,
    };
  } catch {
    return { sol: 0, usdc: 0 };
  }
}

/**
 * Build transaction to transfer USDC from ephemeral wallet to relay
 * Includes memo with order details for relay matching
 */
export async function buildEphemeralToRelayTransaction(
  connection: Connection,
  ephemeralKeypair: Keypair,
  relayWallet: PublicKey,
  usdcAmount: number,
  memo: string
): Promise<Transaction> {
  const ephemeralPubkey = ephemeralKeypair.publicKey;

  // Get token accounts
  const ephemeralUsdcAta = await getAssociatedTokenAddress(USDC_MINT, ephemeralPubkey);
  const relayUsdcAta = await getAssociatedTokenAddress(USDC_MINT, relayWallet);

  const transaction = new Transaction();

  // Check if relay USDC ATA exists, create if not
  const relayAtaInfo = await connection.getAccountInfo(relayUsdcAta);
  if (!relayAtaInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        ephemeralPubkey, // payer
        relayUsdcAta, // ata
        relayWallet, // owner
        USDC_MINT // mint
      )
    );
  }

  // Add USDC transfer instruction
  const amountInSmallestUnit = Math.floor(usdcAmount * Math.pow(10, USDC_DECIMALS));
  transaction.add(
    createTransferInstruction(
      ephemeralUsdcAta, // source
      relayUsdcAta, // destination
      ephemeralPubkey, // owner
      amountInSmallestUnit // amount
    )
  );

  // Add memo instruction
  // Memo program ID: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  transaction.add({
    keys: [{ pubkey: ephemeralPubkey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = ephemeralPubkey;

  return transaction;
}

/**
 * Fund ephemeral wallet with SOL for transaction fees
 * Returns a transaction that the user needs to sign
 */
export async function buildFundEphemeralTransaction(
  connection: Connection,
  userWallet: PublicKey,
  ephemeralPubkey: PublicKey,
  solAmount: number = 0.01 // Default 0.01 SOL for fees
): Promise<Transaction> {
  const transaction = new Transaction();

  transaction.add(
    SystemProgram.transfer({
      fromPubkey: userWallet,
      toPubkey: ephemeralPubkey,
      lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
    })
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = userWallet;

  return transaction;
}
