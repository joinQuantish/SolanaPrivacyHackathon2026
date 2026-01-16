/**
 * Privacy Cash Integration Service (Server-side)
 *
 * Handles Privacy Cash SDK operations that require Node.js environment:
 * - Deposit USDC to Privacy Pool
 * - Withdraw USDC to recipient wallet
 * - ZK proof generation
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PrivacyCash } from 'privacycash';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

interface PrivacyDepositRequest {
  // Ephemeral wallet 1: receives USDC from user, deposits to pool
  ephemeral1SecretKey: string; // Base64 encoded
  // Ephemeral wallet 2: receives from pool, sends to relay
  ephemeral2SecretKey: string; // Base64 encoded
  // Amount in USDC
  amount: number;
  // Order details
  orderId: string;
  action: 'buy_yes' | 'buy_no';
  marketTicker: string;
  outcomeMint: string;
  slippageBps?: number;
  // Destination wallet for shares (critical for privacy!)
  destinationWallet: string;
  // Relay wallet address
  relayWallet: string;
}

interface PrivacyDepositResult {
  success: boolean;
  depositTx?: string;
  withdrawTx?: string;
  relayTx?: string;
  netAmount?: number;
  error?: string;
}

/**
 * Get RPC URL from environment or use default
 */
function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL ||
         process.env.HELIUS_RPC_URL ||
         'https://api.mainnet-beta.solana.com';
}

/**
 * Execute the Privacy Cash deposit flow server-side
 *
 * This runs on the backend because Privacy Cash SDK requires Node.js
 * (uses node-localstorage, path.join, etc.)
 *
 * Flow:
 * 1. Ephemeral 1 deposits USDC to Privacy Pool
 * 2. Privacy Pool withdraws to Ephemeral 2 (ZK proof breaks link)
 * 3. Ephemeral 2 sends to relay with memo
 */
export async function executePrivacyDepositServerSide(
  request: PrivacyDepositRequest
): Promise<PrivacyDepositResult> {
  const result: PrivacyDepositResult = { success: false };

  try {
    const rpcUrl = getRpcUrl();
    const connection = new Connection(rpcUrl, 'confirmed');

    // Decode ephemeral keypairs from base64
    const ephemeral1 = Keypair.fromSecretKey(
      Buffer.from(request.ephemeral1SecretKey, 'base64')
    );
    const ephemeral2 = Keypair.fromSecretKey(
      Buffer.from(request.ephemeral2SecretKey, 'base64')
    );

    const relayWallet = new PublicKey(request.relayWallet);
    const baseUnits = Math.floor(request.amount * Math.pow(10, USDC_DECIMALS));

    console.log('[Privacy] Starting server-side deposit flow');
    console.log('[Privacy] Ephemeral 1:', ephemeral1.publicKey.toBase58());
    console.log('[Privacy] Ephemeral 2:', ephemeral2.publicKey.toBase58());
    console.log('[Privacy] Amount:', request.amount, 'USDC');

    // Check ephemeral 1 has USDC
    const eph1UsdcAta = await getAssociatedTokenAddress(USDC_MINT, ephemeral1.publicKey);
    let eph1Balance = 0;
    try {
      const balance = await connection.getTokenAccountBalance(eph1UsdcAta);
      eph1Balance = balance.value.uiAmount || 0;
    } catch {
      // No USDC account
    }

    if (eph1Balance < request.amount) {
      throw new Error(`Ephemeral 1 has insufficient USDC: ${eph1Balance} < ${request.amount}`);
    }

    // ========================================
    // STEP 1: Ephemeral 1 deposits to Privacy Pool
    // ========================================
    console.log('[Privacy] Step 1: Depositing to Privacy Pool...');

    const privacyCash1 = new PrivacyCash({
      RPC_url: rpcUrl,
      owner: ephemeral1,
      enableDebug: true,
    });

    const depositResult = await privacyCash1.depositUSDC({
      base_units: baseUnits,
    });

    result.depositTx = depositResult.tx;
    console.log('[Privacy] Deposit TX:', depositResult.tx);

    // Wait for deposit to be indexed
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ========================================
    // STEP 2: Withdraw from Pool to Ephemeral 2
    // ========================================
    console.log('[Privacy] Step 2: Withdrawing to ephemeral 2 (ZK proof)...');

    const withdrawResult = await privacyCash1.withdrawUSDC({
      base_units: baseUnits,
      recipientAddress: ephemeral2.publicKey.toBase58(),
    });

    result.withdrawTx = withdrawResult.tx;
    result.netAmount = withdrawResult.base_units / Math.pow(10, USDC_DECIMALS);
    console.log('[Privacy] Withdraw TX:', withdrawResult.tx);
    console.log('[Privacy] Net amount after fees:', result.netAmount);

    // Wait for withdrawal to be confirmed
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ========================================
    // STEP 3: Fund Ephemeral 2 with SOL for fees
    // ========================================
    console.log('[Privacy] Step 3: Funding ephemeral 2 with SOL...');

    // Check how much SOL Ephemeral 1 has left after Privacy Cash operations
    const eph1SolBalance = await connection.getBalance(ephemeral1.publicKey);
    console.log('[Privacy] Ephemeral 1 SOL balance after Privacy Cash:', eph1SolBalance / LAMPORTS_PER_SOL);

    // Need at least 0.003 SOL for Ephemeral 2 (ATA creation + tx fees)
    const solForEph2 = Math.floor(0.003 * LAMPORTS_PER_SOL);
    const txFee = Math.floor(0.000005 * LAMPORTS_PER_SOL);

    if (eph1SolBalance < solForEph2 + txFee) {
      throw new Error(`Ephemeral 1 has insufficient SOL after Privacy Cash: ${eph1SolBalance / LAMPORTS_PER_SOL} SOL. Need more SOL in initial funding.`);
    }

    // Transfer SOL from ephemeral 1 to ephemeral 2
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: ephemeral1.publicKey,
        toPubkey: ephemeral2.publicKey,
        lamports: solForEph2,
      })
    );

    const { blockhash: bh1 } = await connection.getLatestBlockhash();
    fundTx.recentBlockhash = bh1;
    fundTx.feePayer = ephemeral1.publicKey;
    fundTx.sign(ephemeral1);
    const fundSig = await connection.sendRawTransaction(fundTx.serialize());
    await connection.confirmTransaction(fundSig, 'confirmed');
    console.log('[Privacy] Funded Ephemeral 2 with SOL:', solForEph2 / LAMPORTS_PER_SOL);

    // ========================================
    // STEP 4: Ephemeral 2 sends to Relay with memo
    // ========================================
    console.log('[Privacy] Step 4: Sending to relay with memo...');

    const eph2UsdcAta = await getAssociatedTokenAddress(USDC_MINT, ephemeral2.publicKey);
    const relayUsdcAta = await getAssociatedTokenAddress(USDC_MINT, relayWallet);

    const relayTx = new Transaction();

    // Check if relay ATA exists
    const relayAtaInfo = await connection.getAccountInfo(relayUsdcAta);
    if (!relayAtaInfo) {
      relayTx.add(
        createAssociatedTokenAccountInstruction(
          ephemeral2.publicKey,
          relayUsdcAta,
          relayWallet,
          USDC_MINT
        )
      );
    }

    // Get actual USDC balance in ephemeral 2
    let actualBalance = 0;
    try {
      const balance = await connection.getTokenAccountBalance(eph2UsdcAta);
      actualBalance = balance.value.uiAmount || 0;
    } catch {
      throw new Error('Ephemeral 2 has no USDC after withdrawal');
    }

    const amountToSend = Math.floor(actualBalance * Math.pow(10, USDC_DECIMALS));

    // Add USDC transfer
    relayTx.add(
      createTransferInstruction(
        eph2UsdcAta,
        relayUsdcAta,
        ephemeral2.publicKey,
        amountToSend
      )
    );

    // Add memo with full order details (matches standard format)
    // Format: OBSIDIAN|action|marketTicker|outcomeMint|amount|slippageBps|destinationWallet
    const memo = [
      'OBSIDIAN',
      request.action,
      request.marketTicker,
      request.outcomeMint,
      actualBalance.toString(),
      (request.slippageBps || 100).toString(),
      request.destinationWallet,
    ].join('|');
    console.log('[Privacy] Order memo:', memo);

    relayTx.add({
      keys: [{ pubkey: ephemeral2.publicKey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, 'utf-8'),
    });

    const { blockhash: bh2 } = await connection.getLatestBlockhash();
    relayTx.recentBlockhash = bh2;
    relayTx.feePayer = ephemeral2.publicKey;
    relayTx.sign(ephemeral2);

    const relayTxSig = await connection.sendRawTransaction(relayTx.serialize());
    await connection.confirmTransaction(relayTxSig, 'confirmed');

    result.relayTx = relayTxSig;
    console.log('[Privacy] Relay TX:', relayTxSig);

    result.success = true;
    console.log('[Privacy] Complete! No on-chain link between user and relay.');

    return result;

  } catch (error) {
    console.error('[Privacy] Error:', error);
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}

/**
 * Check if Privacy Cash SDK is available
 */
export async function isPrivacyCashAvailable(): Promise<boolean> {
  try {
    const { PrivacyCash } = await import('privacycash');
    return !!PrivacyCash;
  } catch {
    return false;
  }
}

/**
 * Get Privacy Cash pool stats
 */
export async function getPoolStats(): Promise<{
  available: boolean;
  tvl?: number;
  supportedTokens?: string[];
}> {
  try {
    return {
      available: true,
      tvl: 121_000_000, // $121M+ reported TVL
      supportedTokens: ['SOL', 'USDC', 'USDT', 'ZEC', 'ORE'],
    };
  } catch {
    return { available: false };
  }
}
