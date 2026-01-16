/**
 * Privacy Cash Deposit Flow (Client-side orchestration)
 *
 * 5-step process for fully unlinkable deposits:
 *
 * Step 1: Create TWO ephemeral wallets (deposit wallet + withdraw wallet)
 * Step 2: User sends USDC from Phantom to Ephemeral 1 (Phantom signs)
 * Step 3-5: Backend handles Privacy Pool deposit, withdrawal, and relay transfer
 *
 * Result: No on-chain link between user wallet and relay!
 */

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction } from '@solana/spl-token';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import {
  createEphemeralWallet,
  storeEphemeralWallet,
  markWalletUsed,
} from './ephemeral-wallet';

export interface PrivacyDepositResult {
  success: boolean;
  ephemeralWallet1: string;
  ephemeralWallet2: string;
  steps: {
    step1_createWallets: boolean;
    step2_fundEphemeral: boolean;
    step3_depositToPool: boolean;
    step4_withdrawToEphemeral2: boolean;
    step5_sendToRelay: boolean;
  };
  transactions: {
    fundTx?: string;
    depositTx?: string;
    withdrawTx?: string;
    relayTx?: string;
  };
  error?: string;
}

export type PrivacyStepCallback = (step: string, status: 'pending' | 'processing' | 'done' | 'error') => void;

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

// Backend API URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Execute the full 5-step privacy deposit flow
 *
 * Steps 1-2 happen client-side (user signs with Phantom)
 * Steps 3-5 happen server-side (Privacy Cash SDK requires Node.js)
 */
export interface PrivacyOrderDetails {
  action: 'buy_yes' | 'buy_no';
  marketTicker: string;
  outcomeMint: string;
  slippageBps?: number;
  destinationWallet: string;
}

export async function executePrivacyDeposit(
  connection: Connection,
  wallet: WalletContextState,
  amount: number,
  orderId: string,
  relayWallet: PublicKey,
  orderDetails: PrivacyOrderDetails,
  onStepChange?: PrivacyStepCallback
): Promise<PrivacyDepositResult> {
  const result: PrivacyDepositResult = {
    success: false,
    ephemeralWallet1: '',
    ephemeralWallet2: '',
    steps: {
      step1_createWallets: false,
      step2_fundEphemeral: false,
      step3_depositToPool: false,
      step4_withdrawToEphemeral2: false,
      step5_sendToRelay: false,
    },
    transactions: {},
  };

  try {
    if (!wallet.publicKey || !wallet.sendTransaction) {
      throw new Error('Wallet not connected');
    }

    // ========================================
    // STEP 1: Create TWO Ephemeral Wallets
    // ========================================
    onStepChange?.('Creating privacy wallets...', 'processing');

    // Ephemeral 1: Receives USDC from user, deposits to Privacy Pool
    const ephemeral1 = createEphemeralWallet();
    storeEphemeralWallet(`${orderId}-deposit`, ephemeral1.keypair);
    result.ephemeralWallet1 = ephemeral1.publicKey;

    // Ephemeral 2: Receives USDC from Privacy Pool (ZK unlinkable!), sends to relay
    const ephemeral2 = createEphemeralWallet();
    storeEphemeralWallet(`${orderId}-withdraw`, ephemeral2.keypair);
    result.ephemeralWallet2 = ephemeral2.publicKey;

    result.steps.step1_createWallets = true;
    onStepChange?.('Privacy wallets created', 'done');

    // ========================================
    // STEP 2: User sends USDC + SOL to Ephemeral 1
    // ========================================
    onStepChange?.('Checking balances...', 'processing');

    // Pre-flight check: verify user has enough USDC
    const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    let userUsdcBalance = 0;
    try {
      const balance = await connection.getTokenAccountBalance(userUsdcAta);
      userUsdcBalance = balance.value.uiAmount || 0;
      console.log('[Privacy] User USDC balance:', userUsdcBalance);
    } catch (e) {
      console.error('[Privacy] User has no USDC account');
      throw new Error('You need USDC in your wallet to use Privacy Mode');
    }

    if (userUsdcBalance < amount) {
      throw new Error(`Insufficient USDC: you have $${userUsdcBalance.toFixed(2)} but need $${amount}`);
    }

    // Also check SOL balance for fees (need ~0.05 SOL for Privacy Cash txs + relay)
    const solBalance = await connection.getBalance(wallet.publicKey);
    const solNeeded = 0.06 * LAMPORTS_PER_SOL; // 0.05 for ephemeral + network fees
    if (solBalance < solNeeded) {
      throw new Error(`Insufficient SOL for fees: you have ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL but need ~0.06 SOL`);
    }
    console.log('[Privacy] User SOL balance:', solBalance / LAMPORTS_PER_SOL);

    onStepChange?.('Funding privacy wallet (sign in Phantom)...', 'processing');

    const fundTx = await buildFundEphemeralTransaction(
      connection,
      wallet.publicKey,
      ephemeral1.keypair.publicKey,
      amount
    );

    // User signs this with Phantom
    console.log('[Privacy] Sending funding transaction...');
    const fundTxSig = await wallet.sendTransaction(fundTx, connection);
    console.log('[Privacy] Funding TX submitted:', fundTxSig);

    // Wait for confirmation and check for errors
    const confirmation = await connection.confirmTransaction(fundTxSig, 'confirmed');
    if (confirmation.value.err) {
      throw new Error(`Funding transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    console.log('[Privacy] Funding TX confirmed');

    result.transactions.fundTx = fundTxSig;
    result.steps.step2_fundEphemeral = true;
    onStepChange?.('Privacy wallet funded', 'done');

    // Wait for balance to be available and verify it
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify ephemeral 1 actually received the USDC
    const ephemeralAta = await getAssociatedTokenAddress(USDC_MINT, ephemeral1.keypair.publicKey);
    let verifiedBalance = 0;
    try {
      const balance = await connection.getTokenAccountBalance(ephemeralAta);
      verifiedBalance = balance.value.uiAmount || 0;
      console.log('[Privacy] Ephemeral 1 verified balance:', verifiedBalance, 'USDC');
    } catch (e) {
      console.error('[Privacy] Failed to check ephemeral balance:', e);
    }

    if (verifiedBalance < amount) {
      throw new Error(`Funding failed - ephemeral wallet only has ${verifiedBalance} USDC (need ${amount}). Check your USDC balance.`);
    }

    // ========================================
    // STEPS 3-5: Call Backend API
    // (Privacy Cash SDK requires Node.js)
    // ========================================
    onStepChange?.('Executing privacy deposit via backend...', 'processing');

    // Encode ephemeral private keys for backend
    const ephemeral1SecretKey = Buffer.from(ephemeral1.keypair.secretKey).toString('base64');
    const ephemeral2SecretKey = Buffer.from(ephemeral2.keypair.secretKey).toString('base64');

    const response = await fetch(`${API_BASE}/api/privacy/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ephemeral1SecretKey,
        ephemeral2SecretKey,
        amount: amount.toString(),
        orderId,
        action: orderDetails.action,
        marketTicker: orderDetails.marketTicker,
        outcomeMint: orderDetails.outcomeMint,
        slippageBps: orderDetails.slippageBps || 100,
        destinationWallet: orderDetails.destinationWallet,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Privacy deposit failed');
    }

    // Update results with backend response
    result.transactions.depositTx = data.transactions.depositTx;
    result.transactions.withdrawTx = data.transactions.withdrawTx;
    result.transactions.relayTx = data.transactions.relayTx;

    result.steps.step3_depositToPool = true;
    result.steps.step4_withdrawToEphemeral2 = true;
    result.steps.step5_sendToRelay = true;

    // Mark wallets as used
    markWalletUsed(`${orderId}-deposit`);
    markWalletUsed(`${orderId}-withdraw`);

    onStepChange?.('Complete! No on-chain link to your wallet.', 'done');

    result.success = true;
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Privacy] Error:', error);
    result.error = errorMessage;
    onStepChange?.(errorMessage, 'error');
    return result;
  }
}

/**
 * Build transaction to fund ephemeral wallet with USDC + SOL
 */
async function buildFundEphemeralTransaction(
  connection: Connection,
  userWallet: PublicKey,
  ephemeralPubkey: PublicKey,
  usdcAmount: number
): Promise<Transaction> {
  const transaction = new Transaction();

  // 1. Send SOL for transaction fees (0.05 SOL to cover Privacy Cash + relay tx)
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: userWallet,
      toPubkey: ephemeralPubkey,
      lamports: Math.floor(0.05 * LAMPORTS_PER_SOL),
    })
  );

  // 2. Create USDC ATA for ephemeral wallet
  const ephemeralUsdcAta = await getAssociatedTokenAddress(USDC_MINT, ephemeralPubkey);
  const ataInfo = await connection.getAccountInfo(ephemeralUsdcAta);
  if (!ataInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        userWallet,
        ephemeralUsdcAta,
        ephemeralPubkey,
        USDC_MINT
      )
    );
  }

  // 3. Transfer USDC to ephemeral wallet
  const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, userWallet);
  const amountInBaseUnits = Math.floor(usdcAmount * Math.pow(10, USDC_DECIMALS));

  transaction.add(
    createTransferInstruction(
      userUsdcAta,
      ephemeralUsdcAta,
      userWallet,
      amountInBaseUnits
    )
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = userWallet;

  return transaction;
}

/**
 * Check if Privacy Cash is available via backend
 */
export async function isPrivacyCashAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/privacy/status`);
    const data = await response.json();
    return data.success && data.available;
  } catch {
    console.warn('[Privacy] Backend not available');
    return false;
  }
}

/**
 * Get Privacy Cash pool info
 */
export async function getPoolInfo(): Promise<{
  available: boolean;
  tvl?: number;
  supportedTokens?: string[];
}> {
  try {
    const response = await fetch(`${API_BASE}/api/privacy/status`);
    const data = await response.json();
    if (data.success) {
      return {
        available: data.available,
        tvl: data.stats?.tvl,
        supportedTokens: data.stats?.supportedTokens,
      };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

/**
 * Calculate total fees for privacy deposit
 */
export function calculatePrivacyFees(amount: number): {
  depositFee: number;
  withdrawFee: number;
  solFee: number;
  totalFee: number;
  netAmount: number;
} {
  const depositFee = 0; // 0% deposit fee
  const withdrawFee = amount * 0.0035; // 0.35% withdrawal fee
  const solFee = 0.006; // ~0.006 SOL for transactions

  return {
    depositFee,
    withdrawFee,
    solFee,
    totalFee: withdrawFee, // Only USDC fee
    netAmount: amount - withdrawFee,
  };
}
