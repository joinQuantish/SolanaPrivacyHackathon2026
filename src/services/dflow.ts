/**
 * DFlow/Kalshi Integration Service
 *
 * Real integration with DFlow API for Kalshi prediction markets via MCP.
 * Uses MCP JSON-RPC for quotes and trade execution.
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
const DFLOW_DEV_API = 'https://dev-prediction-markets-api.dflow.net/api/v1';

// MCP Server for trading (has working DFlow credentials)
const MCP_ENDPOINT = process.env.MCP_ENDPOINT || 'https://kalshi-mcp-production-7c2c.up.railway.app/mcp';
const MCP_API_KEY = process.env.MCP_API_KEY || '';

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
 * Call MCP tool via JSON-RPC
 */
async function callMcpTool<T>(toolName: string, args: Record<string, unknown>): Promise<T | null> {
  if (!MCP_API_KEY) {
    console.error(`[MCP] No API key configured. Set MCP_API_KEY environment variable.`);
    return null;
  }

  try {
    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': MCP_API_KEY,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      console.error(`[MCP] Request failed: ${response.status}`);
      return null;
    }

    const result = await response.json();

    if (result.error) {
      console.error(`[MCP] Tool error:`, result.error);
      return null;
    }

    // Parse the nested JSON in content[0].text
    const textContent = result.result?.content?.[0]?.text;
    if (!textContent) {
      console.error(`[MCP] No content in response`);
      return null;
    }

    return JSON.parse(textContent) as T;
  } catch (error) {
    console.error(`[MCP] Error calling ${toolName}:`, error);
    return null;
  }
}

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
 * Get market info from DFlow dev API (has token mints) with Kalshi fallback
 */
export async function getMarketInfo(marketId: string): Promise<MarketInfo | null> {
  console.log(`[DFlow] Fetching market info for ${marketId}...`);

  // Extract event ticker from market ID (e.g., KXSB-26-BUF -> KXSB-26)
  const parts = marketId.split('-');
  const eventTicker = parts.slice(0, 2).join('-');

  try {
    // Try DFlow dev API first (has token mints)
    const dflowResponse = await fetch(`${DFLOW_DEV_API}/event/${eventTicker}?withNestedMarkets=true`);

    if (dflowResponse.ok) {
      const eventData = await dflowResponse.json();
      const market = eventData.markets?.find((m: { ticker: string }) => m.ticker === marketId);

      if (market) {
        // Get USDC account token mints (EPjFWdd5... is USDC mint)
        const usdcAccount = market.accounts?.['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];

        const yesPrice = parseFloat(market.yesAsk || market.yesBid || '0.50');
        const noPrice = parseFloat(market.noAsk || market.noBid || '0.50');

        console.log(`[DFlow] Market: ${market.title || marketId}`);
        console.log(`[DFlow] YES price: $${yesPrice}, NO price: $${noPrice}`);
        console.log(`[DFlow] Status: ${market.status}`);

        if (usdcAccount) {
          console.log(`[DFlow] YES mint: ${usdcAccount.yesMint}`);
          console.log(`[DFlow] NO mint: ${usdcAccount.noMint}`);
          console.log(`[DFlow] Initialized: ${usdcAccount.isInitialized}`);
        }

        return {
          ticker: market.ticker,
          title: market.title || `Market ${marketId}`,
          yesPrice,
          noPrice,
          yesTokenMint: usdcAccount?.yesMint || KNOWN_TOKEN_MINTS[marketId]?.yesMint || '',
          noTokenMint: usdcAccount?.noMint || KNOWN_TOKEN_MINTS[marketId]?.noMint || '',
          status: market.status as 'active' | 'inactive' | 'finalized',
          isInitialized: usdcAccount?.isInitialized ?? true,
        };
      }
    }

    // Fallback to Kalshi API
    console.log(`[DFlow] Falling back to Kalshi API...`);
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

    // Get token mints from cache
    const tokenMints = KNOWN_TOKEN_MINTS[marketId];
    if (!tokenMints) {
      console.warn(`[Kalshi] No cached token mints for ${marketId}`);
    }

    const yesPrice = parseFloat(market.yes_ask_dollars || market.yes_bid_dollars || '0.50');
    const noPrice = parseFloat(market.no_ask_dollars || market.no_bid_dollars || '0.50');

    console.log(`[Kalshi] Market: ${market.subtitle || marketId}`);
    console.log(`[Kalshi] YES price: $${yesPrice}, NO price: $${noPrice}`);
    console.log(`[Kalshi] Status: ${market.status}`);

    return {
      ticker: market.ticker || marketId,
      title: market.subtitle || `Market ${marketId}`,
      yesPrice,
      noPrice,
      yesTokenMint: tokenMints?.yesMint || '',
      noTokenMint: tokenMints?.noMint || '',
      status: market.status as 'active' | 'inactive' | 'finalized',
      isInitialized: true,
    };
  } catch (error) {
    console.error(`[DFlow/Kalshi] Error fetching market:`, error);
    return null;
  }
}

/**
 * MCP Quote Response
 */
interface McpQuoteResponse {
  quote: DFlowQuote & {
    transaction?: string;
    lastValidBlockHeight?: number;
    prioritizationFeeLamports?: number;
    computeUnitLimit?: number;
  };
}

/**
 * MCP Buy Response
 */
interface McpBuyResponse {
  message: string;
  quote: DFlowQuote & { transaction?: string };
  txSignature: string;
  status: string;
}

/**
 * Get a quote from MCP (uses DFlow internally)
 */
async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 200
): Promise<(DFlowQuote & { transaction?: string }) | null> {
  console.log(`[MCP] Getting quote: ${amount} USDC -> ${outputMint.slice(0, 8)}...`);

  // Convert to smallest units (USDC has 6 decimals)
  const amountScaled = Math.floor(amount * 1e6);

  // Try MCP first (has working DFlow credentials)
  if (MCP_API_KEY) {
    const mcpResult = await callMcpTool<McpQuoteResponse>('kalshi_get_quote', {
      inputMint,
      outputMint,
      amount: amountScaled,
      slippageBps,
    });

    if (mcpResult?.quote) {
      console.log(`[MCP] Quote received: ${mcpResult.quote.outAmount} tokens for ${mcpResult.quote.inAmount} USDC`);
      console.log(`[MCP] Price impact: ${mcpResult.quote.priceImpactPct}%`);
      return mcpResult.quote;
    }
  }

  // Fallback to direct DFlow API (may not work without valid key)
  console.log(`[MCP] Falling back to direct DFlow API...`);

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
 * Execute a batch trade via MCP (uses DFlow internally)
 *
 * This is the main integration point with DFlow/Kalshi via MCP.
 * MCP handles wallet management, signing, and transaction submission.
 */
export async function executeDFlowTrade(batch: RelayBatch): Promise<DFlowExecutionResult> {
  console.log(`\n========================================`);
  console.log(`[MCP] Executing REAL trade for batch ${batch.id}`);
  console.log(`[MCP] Market: ${batch.marketId}`);
  console.log(`[MCP] Side: ${batch.side}`);
  console.log(`[MCP] Total USDC: ${batch.totalUsdcCommitted}`);
  console.log(`========================================\n`);

  // Check if MCP is configured
  if (!MCP_API_KEY) {
    return {
      success: false,
      usdcSpent: '0',
      sharesReceived: '0',
      averagePrice: '0',
      fillPercentage: 0,
      partialFill: false,
      shareTokenMint: '',
      error: 'MCP_API_KEY not configured. Set environment variable.',
    };
  }

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
  let outputMint: string;
  if (batch.side === 'YES') {
    outputMint = batch.yesTokenMint || market.yesTokenMint;
  } else {
    outputMint = batch.noTokenMint || market.noTokenMint;
  }
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
      error: `No token mint found for ${batch.marketId} ${batch.side}`,
    };
  }

  console.log(`[MCP] Output mint: ${outputMint}`);

  // Step 2: Check MCP wallet balance
  const balanceResult = await callMcpTool<{
    publicKey: string;
    balances: { sol: number; usdc: number };
  }>('kalshi_get_balances', {});

  if (!balanceResult) {
    return {
      success: false,
      usdcSpent: '0',
      sharesReceived: '0',
      averagePrice: '0',
      fillPercentage: 0,
      partialFill: false,
      shareTokenMint: '',
      error: 'Failed to get MCP wallet balance',
    };
  }

  console.log(`[MCP] Wallet: ${balanceResult.publicKey}`);
  console.log(`[MCP] USDC balance: $${balanceResult.balances.usdc}`);
  console.log(`[MCP] SOL balance: ${balanceResult.balances.sol}`);

  if (balanceResult.balances.usdc < totalUsdc) {
    return {
      success: false,
      usdcSpent: '0',
      sharesReceived: '0',
      averagePrice: '0',
      fillPercentage: 0,
      partialFill: false,
      shareTokenMint: '',
      error: `Insufficient MCP USDC balance: have $${balanceResult.balances.usdc}, need $${totalUsdc}`,
    };
  }

  // Step 3: Execute trade via MCP
  console.log(`[MCP] Executing ${batch.side} trade...`);

  const toolName = batch.side === 'YES' ? 'kalshi_buy_yes' : 'kalshi_buy_no';
  const mintParam = batch.side === 'YES' ? 'yesOutcomeMint' : 'noOutcomeMint';

  const tradeResult = await callMcpTool<McpBuyResponse>(toolName, {
    marketTicker: batch.marketId,
    [mintParam]: outputMint,
    usdcAmount: totalUsdc,
    slippageBps: 300, // 3% slippage
  });

  if (!tradeResult || !tradeResult.txSignature) {
    return {
      success: false,
      usdcSpent: '0',
      sharesReceived: '0',
      averagePrice: '0',
      fillPercentage: 0,
      partialFill: false,
      shareTokenMint: '',
      error: `MCP trade failed: ${tradeResult?.message || 'Unknown error'}`,
    };
  }

  console.log(`[MCP] Trade executed!`);
  console.log(`[MCP] TX Signature: ${tradeResult.txSignature}`);

  // Calculate results from quote
  const usdcSpent = parseFloat(tradeResult.quote?.inAmount || '0') / 1e6;
  const sharesReceived = parseFloat(tradeResult.quote?.outAmount || '0') / 1e6;
  const avgPrice = sharesReceived > 0 ? usdcSpent / sharesReceived : 0;

  console.log(`[MCP] USDC spent: $${usdcSpent}`);
  console.log(`[MCP] Shares received: ${sharesReceived}`);
  console.log(`[MCP] Average price: $${avgPrice.toFixed(4)}`);

  return {
    success: true,
    orderId: `mcp-${batch.id}-${Date.now()}`,
    txSignature: tradeResult.txSignature,
    usdcSpent: usdcSpent.toString(),
    sharesReceived: sharesReceived.toString(),
    averagePrice: avgPrice.toString(),
    fillPercentage: 100,
    partialFill: false,
    shareTokenMint: outputMint,
    mcpWallet: balanceResult.publicKey, // Include MCP wallet for distribution
  };
}

/**
 * Get MCP wallet address for deposits
 */
export async function getMcpWalletAddress(): Promise<string | null> {
  const result = await callMcpTool<{ publicKey: string }>('kalshi_get_deposit_address', {});
  return result?.publicKey || null;
}

/**
 * Distribute tokens from MCP wallet to destination wallets
 */
export async function distributeTokensViaMcp(
  tokenMint: string,
  distributions: Array<{ wallet: string; amount: number }>
): Promise<Array<{ wallet: string; success: boolean; txSignature?: string; error?: string }>> {
  const results: Array<{ wallet: string; success: boolean; txSignature?: string; error?: string }> = [];

  for (const dist of distributions) {
    console.log(`[MCP] Sending ${dist.amount} tokens to ${dist.wallet.slice(0, 8)}...`);

    const sendResult = await callMcpTool<{
      success: boolean;
      txSignature?: string;
      error?: string;
    }>('kalshi_send_token', {
      toAddress: dist.wallet,
      mintAddress: tokenMint,
      amount: dist.amount,
      decimals: 6, // Prediction tokens typically have 6 decimals
    });

    if (sendResult?.success && sendResult.txSignature) {
      console.log(`[MCP] Sent to ${dist.wallet.slice(0, 8)}: ${sendResult.txSignature}`);
      results.push({ wallet: dist.wallet, success: true, txSignature: sendResult.txSignature });
    } else {
      console.error(`[MCP] Failed to send to ${dist.wallet.slice(0, 8)}: ${sendResult?.error || 'Unknown error'}`);
      results.push({ wallet: dist.wallet, success: false, error: sendResult?.error || 'Unknown error' });
    }
  }

  return results;
}

/**
 * Refund USDC via MCP
 */
export async function refundViaUsdc(
  toAddress: string,
  amount: number
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  console.log(`[MCP] Refunding ${amount} USDC to ${toAddress.slice(0, 8)}...`);

  const sendResult = await callMcpTool<{
    success: boolean;
    txSignature?: string;
    error?: string;
  }>('kalshi_send_usdc', {
    toAddress,
    amount,
  });

  if (sendResult?.success && sendResult.txSignature) {
    console.log(`[MCP] Refund sent to ${toAddress.slice(0, 8)}: ${sendResult.txSignature}`);
    return { success: true, txSignature: sendResult.txSignature };
  } else {
    console.error(`[MCP] Refund failed to ${toAddress.slice(0, 8)}: ${sendResult?.error || 'Unknown error'}`);
    return { success: false, error: sendResult?.error || 'Unknown error' };
  }
}

// Note: Legacy direct DFlow execution removed - now using MCP for all trades

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
