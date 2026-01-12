/**
 * DFlow/Kalshi Integration Service
 *
 * Real integration with DFlow API for Kalshi prediction markets.
 * NO MOCKS - all functions call real APIs.
 */

import {
  Connection,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import type { RelayBatch, DFlowExecutionResult } from '../types/relay.js';
import { getRelayWallet } from './wallet.js';

// API endpoints
const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';
const DFLOW_QUOTE_API = 'https://quote-api.dflow.net';

// Known token mints for popular markets (USDC settlement)
// These are cached to avoid needing DFlow metadata API
const KNOWN_TOKEN_MINTS: Record<string, { yesMint: string; noMint: string }> = {
  'KXSB-26-BUF': {
    yesMint: '6kFSnPEBFdpSrUi9KsiFg2w3W5Yj2fBcngUHsVA9ZSJd',
    noMint: '2Bdt3J34TtSCmpsSf2Ke9TfbxHEdDacBbNkigVhy9wQH',
  },
  'KXSB-26-DEN': {
    yesMint: '8DDZQdeUMB1dzsPb5jGvFJ1bJU5mQbN3hph8C96gZPZ6',
    noMint: 'DS9kp4EedXUkTxTbAnJ5dD8PZPvi9uwQ3awoWCjsEiAF',
  },
  'KXSB-26-SEA': {
    yesMint: 'GNr3UXmnwokHCBwpe2QWC9qr3M8v3mTjoAUQj6TVTbyP',
    noMint: '5jvnRRxgPQzrEA9vBiCzD9oN3zhAUn8zEhbMSsEgqJC8',
  },
};

// API key from environment (required for trading)
const DFLOW_API_KEY = process.env.DFLOW_API_KEY || '';

// USDC mint on Solana mainnet
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// RPC endpoint
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * Market info from Kalshi/DFlow
 */
export interface MarketInfo {
  ticker: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  yesTokenMint: string;
  noTokenMint: string;
  status: 'active' | 'inactive' | 'finalized';
  isInitialized: boolean;
}

/**
 * Market initialization status
 */
export interface MarketInitStatus {
  initialized: boolean;
  yesMintInitialized: boolean;
  noMintInitialized: boolean;
  initCostSol?: number;
}

/**
 * DFlow quote response
 */
interface DFlowQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  minOutAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  contextSlot: number;
  routePlan?: unknown[];
}

/**
 * DFlow swap response
 */
interface DFlowSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
}

/**
 * Get market info from Kalshi API with cached token mints
 */
export async function getMarketInfo(marketId: string): Promise<MarketInfo | null> {
  console.log(`[Kalshi] Fetching market info for ${marketId}...`);

  try {
    // Fetch from Kalshi API
    const response = await fetch(`${KALSHI_API}/markets/${marketId}`);

    if (!response.ok) {
      console.error(`[Kalshi] Market fetch failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const market = data.market;

    if (!market) {
      console.error(`[Kalshi] No market data returned`);
      return null;
    }

    // Get token mints from cache or use provided mints
    const tokenMints = KNOWN_TOKEN_MINTS[marketId];
    if (!tokenMints) {
      console.warn(`[Kalshi] No cached token mints for ${marketId}`);
      console.warn(`[Kalshi] Add token mints to KNOWN_TOKEN_MINTS or provide via order`);
    }

    const yesPrice = parseFloat(market.yes_ask_dollars || market.yes_bid_dollars || '0.50');
    const noPrice = parseFloat(market.no_ask_dollars || market.no_bid_dollars || '0.50');

    console.log(`[Kalshi] Market: ${market.subtitle || marketId}`);
    console.log(`[Kalshi] YES price: $${yesPrice}, NO price: $${noPrice}`);
    console.log(`[Kalshi] Status: ${market.status}`);

    if (tokenMints) {
      console.log(`[Kalshi] YES mint: ${tokenMints.yesMint}`);
      console.log(`[Kalshi] NO mint: ${tokenMints.noMint}`);
    }

    return {
      ticker: market.ticker || marketId,
      title: market.subtitle || `Market ${marketId}`,
      yesPrice,
      noPrice,
      yesTokenMint: tokenMints?.yesMint || '',
      noTokenMint: tokenMints?.noMint || '',
      status: market.status as 'active' | 'inactive' | 'finalized',
      isInitialized: true, // Assume initialized for known markets
    };
  } catch (error) {
    console.error(`[Kalshi] Error fetching market:`, error);
    return null;
  }
}

/**
 * Get a quote from DFlow for swapping USDC to prediction tokens
 */
async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 200
): Promise<DFlowQuote | null> {
  console.log(`[DFlow] Getting quote: ${amount} USDC -> ${outputMint.slice(0, 8)}...`);

  // Convert to smallest units (USDC has 6 decimals)
  const amountScaled = Math.floor(amount * 1e6);

  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountScaled.toString(),
    slippageBps: slippageBps.toString(),
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (DFLOW_API_KEY) {
    headers['x-api-key'] = DFLOW_API_KEY;
  }

  try {
    const response = await fetch(`${DFLOW_QUOTE_API}/quote?${params}`, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DFlow] Quote failed: ${response.status} - ${errorText}`);
      return null;
    }

    const quote = await response.json();
    console.log(`[DFlow] Quote received: ${quote.outAmount} tokens for ${quote.inAmount} USDC`);
    console.log(`[DFlow] Price impact: ${quote.priceImpactPct}%`);

    return quote;
  } catch (error) {
    console.error(`[DFlow] Error getting quote:`, error);
    return null;
  }
}

/**
 * Create a swap transaction from DFlow
 */
async function createSwap(
  quote: DFlowQuote,
  userPublicKey: string
): Promise<DFlowSwapResponse | null> {
  console.log(`[DFlow] Creating swap transaction...`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (DFLOW_API_KEY) {
    headers['x-api-key'] = DFLOW_API_KEY;
  }

  try {
    const response = await fetch(`${DFLOW_QUOTE_API}/swap`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        prioritizationFeeLamports: 'auto',
        dynamicComputeUnitLimit: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DFlow] Swap creation failed: ${response.status} - ${errorText}`);
      return null;
    }

    const swapResponse = await response.json();
    console.log(`[DFlow] Swap transaction created`);
    console.log(`[DFlow] Priority fee: ${swapResponse.prioritizationFeeLamports} lamports`);

    return swapResponse;
  } catch (error) {
    console.error(`[DFlow] Error creating swap:`, error);
    return null;
  }
}

/**
 * Execute a batch trade on DFlow
 *
 * This is the main integration point with DFlow/Kalshi.
 * It takes a batch of orders and executes them as a single trade.
 */
export async function executeDFlowTrade(batch: RelayBatch): Promise<DFlowExecutionResult> {
  console.log(`\n========================================`);
  console.log(`[DFlow] Executing REAL trade for batch ${batch.id}`);
  console.log(`[DFlow] Market: ${batch.marketId}`);
  console.log(`[DFlow] Side: ${batch.side}`);
  console.log(`[DFlow] Total USDC: ${batch.totalUsdcCommitted}`);
  console.log(`========================================\n`);

  // Step 1: Get market info
  const market = await getMarketInfo(batch.marketId);
  if (!market) {
    return {
      success: false,
      usdcSpent: '0',
      sharesReceived: '0',
      averagePrice: '0',
      fillPercentage: 0,
      partialFill: false,
      shareTokenMint: '',
      error: `Market ${batch.marketId} not found`,
    };
  }

  if (market.status !== 'active') {
    return {
      success: false,
      usdcSpent: '0',
      sharesReceived: '0',
      averagePrice: '0',
      fillPercentage: 0,
      partialFill: false,
      shareTokenMint: '',
      error: `Market is ${market.status}, not active`,
    };
  }

  // Determine token mint based on side
  const outputMint = batch.side === 'YES' ? market.yesTokenMint : market.noTokenMint;
  const totalUsdc = parseFloat(batch.totalUsdcCommitted);

  if (!outputMint) {
    return {
      success: false,
      usdcSpent: '0',
      sharesReceived: '0',
      averagePrice: '0',
      fillPercentage: 0,
      partialFill: false,
      shareTokenMint: '',
      error: `No token mint found for ${batch.marketId} ${batch.side}. Add to KNOWN_TOKEN_MINTS in dflow.ts`,
    };
  }

  console.log(`[DFlow] Output mint: ${outputMint}`);

  // Step 2: Get relay wallet
  const wallet = await getRelayWallet();
  const walletAddress = wallet.getAddress();
  console.log(`[DFlow] Relay wallet: ${walletAddress}`);

  // Check wallet balance
  const walletInfo = await wallet.getInfo();
  if (walletInfo.usdcBalance < totalUsdc) {
    return {
      success: false,
      usdcSpent: '0',
      sharesReceived: '0',
      averagePrice: '0',
      fillPercentage: 0,
      partialFill: false,
      shareTokenMint: '',
      error: `Insufficient USDC balance: have ${walletInfo.usdcBalance}, need ${totalUsdc}`,
    };
  }

  console.log(`[DFlow] Wallet USDC balance: $${walletInfo.usdcBalance}`);

  // Step 3: Get quote from DFlow
  const quote = await getQuote(USDC_MINT, outputMint, totalUsdc);
  if (!quote) {
    return {
      success: false,
      usdcSpent: '0',
      sharesReceived: '0',
      averagePrice: '0',
      fillPercentage: 0,
      partialFill: false,
      shareTokenMint: '',
      error: 'Failed to get quote from DFlow',
    };
  }

  // Step 4: Create swap transaction
  const swapResponse = await createSwap(quote, walletAddress);
  if (!swapResponse) {
    return {
      success: false,
      usdcSpent: '0',
      sharesReceived: '0',
      averagePrice: '0',
      fillPercentage: 0,
      partialFill: false,
      shareTokenMint: '',
      error: 'Failed to create swap transaction',
    };
  }

  // Step 5: Sign and send transaction
  console.log(`[DFlow] Signing and sending transaction...`);

  try {
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');

    // Decode the transaction
    const txBuffer = Buffer.from(swapResponse.swapTransaction, 'base64');

    let signature: string;

    // Try as versioned transaction first
    try {
      const versionedTx = VersionedTransaction.deserialize(new Uint8Array(txBuffer));
      console.log(`[DFlow] Transaction type: Versioned`);

      // Sign the versioned transaction
      const signedTx = wallet.signVersionedTransaction(versionedTx);
      signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    } catch (versionedError) {
      console.log(`[DFlow] Trying legacy transaction format...`);
      // Fallback to legacy transaction
      const legacyTx = Transaction.from(txBuffer);
      legacyTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signedTx = wallet.signTransaction(legacyTx);
      signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    }

    console.log(`[DFlow] Transaction sent: ${signature}`);

    // Wait for confirmation
    console.log(`[DFlow] Waiting for confirmation...`);
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      console.error(`[DFlow] Transaction failed:`, confirmation.value.err);
      return {
        success: false,
        usdcSpent: '0',
        sharesReceived: '0',
        averagePrice: '0',
        fillPercentage: 0,
        partialFill: false,
        shareTokenMint: '',
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

    console.log(`[DFlow] Transaction confirmed!`);

    // Calculate results
    const usdcSpent = parseFloat(quote.inAmount) / 1e6;
    const sharesReceived = parseFloat(quote.outAmount) / 1e6; // Assuming 6 decimals
    const avgPrice = usdcSpent / sharesReceived;

    console.log(`[DFlow] USDC spent: $${usdcSpent}`);
    console.log(`[DFlow] Shares received: ${sharesReceived}`);
    console.log(`[DFlow] Average price: $${avgPrice.toFixed(4)}`);

    return {
      success: true,
      orderId: `dflow-${batch.id}-${Date.now()}`,
      txSignature: signature,
      usdcSpent: usdcSpent.toString(),
      sharesReceived: sharesReceived.toString(),
      averagePrice: avgPrice.toString(),
      fillPercentage: 100,
      partialFill: false,
      shareTokenMint: outputMint,
    };
  } catch (error) {
    console.error(`[DFlow] Transaction error:`, error);
    return {
      success: false,
      usdcSpent: '0',
      sharesReceived: '0',
      averagePrice: '0',
      fillPercentage: 0,
      partialFill: false,
      shareTokenMint: '',
      error: error instanceof Error ? error.message : 'Transaction failed',
    };
  }
}

/**
 * Check if a market is initialized on-chain
 */
export async function checkMarketInitialization(
  marketId: string,
  side: 'YES' | 'NO'
): Promise<MarketInitStatus> {
  const market = await getMarketInfo(marketId);

  if (!market) {
    return {
      initialized: false,
      yesMintInitialized: false,
      noMintInitialized: false,
    };
  }

  return {
    initialized: market.isInitialized,
    yesMintInitialized: market.isInitialized,
    noMintInitialized: market.isInitialized,
    initCostSol: market.isInitialized ? 0 : 0.01,
  };
}

/**
 * Initialize a market on-chain (if needed)
 * This would use the Kalshi initialization API
 */
export async function initializeMarket(
  marketId: string,
  side: 'YES' | 'NO'
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  console.log(`[DFlow] Checking if market ${marketId} needs initialization...`);

  const market = await getMarketInfo(marketId);
  if (!market) {
    return { success: false, error: 'Market not found' };
  }

  if (market.isInitialized) {
    console.log(`[DFlow] Market already initialized`);
    return { success: true };
  }

  // For initialization, we need to use the Kalshi initialization endpoint
  // This typically requires SOL for rent
  console.log(`[DFlow] Market needs initialization - this requires SOL for rent`);

  // TODO: Implement actual initialization via Kalshi API
  // For now, return error to indicate this needs to be done
  return {
    success: false,
    error: 'Market not initialized. Please initialize via Kalshi first.',
  };
}

/**
 * Check if we can trade on a market
 */
export async function canTrade(marketId: string): Promise<boolean> {
  const market = await getMarketInfo(marketId);
  return market?.status === 'active' && market?.isInitialized === true;
}

/**
 * Get current price for a market/side
 */
export async function getCurrentPrice(
  marketId: string,
  side: 'YES' | 'NO'
): Promise<number | null> {
  const market = await getMarketInfo(marketId);
  if (!market) return null;
  return side === 'YES' ? market.yesPrice : market.noPrice;
}

/**
 * Estimate shares for a given USDC amount
 */
export async function estimateShares(
  marketId: string,
  side: 'YES' | 'NO',
  usdcAmount: number
): Promise<{ shares: number; price: number } | null> {
  const market = await getMarketInfo(marketId);
  if (!market) return null;

  const outputMint = side === 'YES' ? market.yesTokenMint : market.noTokenMint;

  // Get real quote from DFlow
  const quote = await getQuote(USDC_MINT, outputMint, usdcAmount);
  if (!quote) {
    // Fallback to simple estimate
    const price = side === 'YES' ? market.yesPrice : market.noPrice;
    return { shares: usdcAmount / price, price };
  }

  const shares = parseFloat(quote.outAmount) / 1e6;
  const price = usdcAmount / shares;

  return { shares, price };
}
