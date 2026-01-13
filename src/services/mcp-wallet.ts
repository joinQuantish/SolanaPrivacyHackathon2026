/**
 * MCP Wallet Service
 *
 * Wraps MCP JSON-RPC calls for wallet management, trading, and transfers.
 * Uses the same pattern as dflow.ts callMcpTool.
 */

// MCP Server configuration
const MCP_ENDPOINT = process.env.MCP_ENDPOINT || 'https://kalshi-mcp-production-7c2c.up.railway.app/mcp';
const MCP_API_KEY = process.env.MCP_API_KEY || '';

// Simple in-memory cache to avoid repeated slow API calls
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL_MS = 30000; // 30 seconds

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    console.log(`[MCP-Wallet] Cache HIT for ${key}`);
    return entry.data as T;
  }
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

// ============================================
// Types
// ============================================

export interface WalletCredentials {
  publicKey: string;
  apiKeyId?: string;
  externalId: string;
}

export interface WalletBalances {
  sol: number;
  usdc: number;
}

export interface TokenHolding {
  mint: string;
  amount: number;
  decimals: number;
  symbol?: string;
  name?: string;
}

export interface MarketSearchResult {
  ticker: string;
  title: string;
  eventTicker: string;
  status: string;
  yesPrice?: number;
  noPrice?: number;
  yesMint?: string;
  noMint?: string;
}

export interface Market {
  ticker: string;
  title: string;
  subtitle?: string;
  yesSubTitle?: string;
  noSubTitle?: string;
  status: string;
  yesPrice?: number;
  noPrice?: number;
  yesMint?: string;
  noMint?: string;
  volume?: number;
}

export interface EventResult {
  ticker: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  volume?: number;
  volume24h?: number;
  markets: Market[];
}

export interface MarketDetails {
  ticker: string;
  title: string;
  subtitle?: string;
  status: string;
  yesPrice: number;
  noPrice: number;
  yesMint: string;
  noMint: string;
  volume?: number;
  openInterest?: number;
}

export interface TradeResult {
  success: boolean;
  txSignature?: string;
  usdcSpent?: number;
  sharesReceived?: number;
  error?: string;
}

export interface TransferResult {
  success: boolean;
  txSignature?: string;
  error?: string;
}

// ============================================
// Core MCP Call Function
// ============================================

/**
 * Call MCP tool via JSON-RPC
 */
async function callMcpTool<T>(toolName: string, args: Record<string, unknown>): Promise<T | null> {
  if (!MCP_API_KEY) {
    console.error(`[MCP-Wallet] No API key configured. Set MCP_API_KEY environment variable.`);
    return null;
  }

  const startTime = Date.now();
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
      console.error(`[MCP-Wallet] Request failed: ${response.status}`);
      return null;
    }

    const result = await response.json();

    if (result.error) {
      console.error(`[MCP-Wallet] Tool error:`, result.error);
      return null;
    }

    // Parse the nested JSON in content[0].text
    const textContent = result.result?.content?.[0]?.text;
    if (!textContent) {
      console.error(`[MCP-Wallet] No content in response`);
      return null;
    }

    const elapsed = Date.now() - startTime;
    console.log(`[MCP-Wallet] ${toolName} completed in ${elapsed}ms`);
    return JSON.parse(textContent) as T;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[MCP-Wallet] Error calling ${toolName} after ${elapsed}ms:`, error);
    return null;
  }
}

// ============================================
// Wallet Creation
// ============================================

/**
 * Create a new wallet via MCP kalshi_signup
 */
export async function createWallet(
  externalId: string,
  keyName?: string
): Promise<WalletCredentials | null> {
  console.log(`[MCP-Wallet] Creating wallet with externalId: ${externalId}`);

  const result = await callMcpTool<{
    publicKey: string;
    apiKeyId?: string;
    message?: string;
  }>('kalshi_signup', {
    externalId,
    keyName: keyName || `obsidian-${externalId}`,
  });

  if (!result?.publicKey) {
    console.error(`[MCP-Wallet] Failed to create wallet`);
    return null;
  }

  console.log(`[MCP-Wallet] Created wallet: ${result.publicKey}`);
  return {
    publicKey: result.publicKey,
    apiKeyId: result.apiKeyId,
    externalId,
  };
}

// ============================================
// Balance Queries
// ============================================

/**
 * Get SOL and USDC balances for the current MCP wallet
 */
export async function getBalances(): Promise<WalletBalances | null> {
  const result = await callMcpTool<{
    balances: { sol: number; usdc: number };
  }>('kalshi_get_balances', {});

  if (!result?.balances) {
    return null;
  }

  return result.balances;
}

/**
 * Get wallet status including public key and balances
 */
export async function getWalletStatus(): Promise<{
  publicKey: string;
  balances: WalletBalances;
} | null> {
  const result = await callMcpTool<{
    publicKey: string;
    balances: { sol: number; usdc: number };
  }>('kalshi_get_wallet_status', {});

  if (!result) {
    return null;
  }

  return {
    publicKey: result.publicKey,
    balances: result.balances,
  };
}

/**
 * Get all token holdings (including prediction market positions)
 */
export async function getTokenHoldings(): Promise<TokenHolding[]> {
  const result = await callMcpTool<{
    holdings: TokenHolding[];
  }>('kalshi_get_token_holdings', {});

  return result?.holdings || [];
}

/**
 * Get deposit address
 */
export async function getDepositAddress(): Promise<string | null> {
  const result = await callMcpTool<{
    publicKey: string;
  }>('kalshi_get_deposit_address', {});

  return result?.publicKey || null;
}

// ============================================
// Market Search & Info
// ============================================

/**
 * Search for markets
 */
export async function searchMarkets(
  query: string,
  limit: number = 10,
  marketStatus: 'active' | 'inactive' | 'finalized' | 'all' = 'active'
): Promise<MarketSearchResult[]> {
  console.log(`[MCP-Wallet] Searching markets: ${query}`);

  const result = await callMcpTool<{
    events: Array<{
      ticker: string;
      title: string;
      markets: Array<{
        ticker: string;
        eventTicker: string;
        title: string;
        subtitle?: string;
        yesSubTitle?: string;
        status: string;
        yesBid?: string;
        yesAsk?: string;
        noBid?: string;
        noAsk?: string;
        accounts?: Record<string, {
          yesMint: string;
          noMint: string;
        }>;
      }>;
    }>;
  }>('kalshi_search_markets', {
    query,
    limit,
    marketStatus,
  });

  if (!result?.events) {
    console.log(`[MCP-Wallet] No events in result`);
    return [];
  }

  // Flatten events -> markets, filtering by status if needed
  const markets: MarketSearchResult[] = [];
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  for (const event of result.events) {
    for (const m of event.markets) {
      // Filter by status
      if (marketStatus !== 'all' && m.status !== marketStatus) {
        continue;
      }

      // Get mints from USDC account
      const usdcAccount = m.accounts?.[USDC_MINT];

      markets.push({
        ticker: m.ticker,
        title: m.title || event.title,
        eventTicker: m.eventTicker || event.ticker,
        status: m.status,
        yesPrice: m.yesAsk ? parseFloat(m.yesAsk) : undefined,
        noPrice: m.noAsk ? parseFloat(m.noAsk) : undefined,
        yesMint: usdcAccount?.yesMint,
        noMint: usdcAccount?.noMint,
      });
    }
  }

  console.log(`[MCP-Wallet] Found ${markets.length} markets`);
  return markets.slice(0, limit);
}

/**
 * Search for events (returns events with nested markets)
 */
export async function searchEvents(
  query: string,
  limit: number = 10,
  marketStatus: 'active' | 'inactive' | 'finalized' | 'all' = 'all',
  maxMarketsPerEvent: number = 5
): Promise<EventResult[]> {
  const cacheKey = `search:${query}:${limit}:${marketStatus}:${maxMarketsPerEvent}`;
  const cached = getCached<EventResult[]>(cacheKey);
  if (cached) return cached;

  console.log(`[MCP-Wallet] Searching events: ${query} (status=${marketStatus}, maxMarkets=${maxMarketsPerEvent})`);

  const result = await callMcpTool<{
    events: Array<{
      ticker: string;
      title: string;
      subtitle?: string;
      imageUrl?: string;
      volume?: number;
      volume24h?: number;
      markets: Array<{
        ticker: string;
        eventTicker: string;
        title: string;
        subtitle?: string;
        yesSubTitle?: string;
        noSubTitle?: string;
        status: string;
        volume?: number;
        yesBid?: string;
        yesAsk?: string;
        noBid?: string;
        noAsk?: string;
        accounts?: Record<string, {
          yesMint: string;
          noMint: string;
        }>;
      }>;
    }>;
  }>('kalshi_search_markets', {
    query,
    limit,
    marketStatus,
  });

  if (!result?.events) {
    console.log(`[MCP-Wallet] No events in result`);
    return [];
  }

  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const events: EventResult[] = [];

  for (const event of result.events) {
    const markets: Market[] = [];

    for (const m of event.markets) {
      // Filter by status
      if (marketStatus !== 'all' && m.status !== marketStatus) {
        continue;
      }

      const usdcAccount = m.accounts?.[USDC_MINT];

      markets.push({
        ticker: m.ticker,
        title: m.title,
        subtitle: m.subtitle || m.yesSubTitle,
        yesSubTitle: m.yesSubTitle,
        noSubTitle: m.noSubTitle,
        status: m.status,
        yesPrice: m.yesAsk ? parseFloat(m.yesAsk) : undefined,
        noPrice: m.noAsk ? parseFloat(m.noAsk) : undefined,
        yesMint: usdcAccount?.yesMint,
        noMint: usdcAccount?.noMint,
        volume: m.volume,
      });

      // Limit markets per event to avoid huge responses
      if (markets.length >= maxMarketsPerEvent) {
        break;
      }
    }

    if (markets.length > 0) {
      events.push({
        ticker: event.ticker,
        title: event.title,
        subtitle: event.subtitle,
        imageUrl: event.imageUrl,
        volume: event.volume,
        volume24h: event.volume24h,
        markets,
      });
    }
  }

  console.log(`[MCP-Wallet] Found ${events.length} events with max ${maxMarketsPerEvent} markets each`);
  const result_events = events.slice(0, limit);
  setCache(cacheKey, result_events);
  return result_events;
}

/**
 * Get all events (no search query needed)
 */
export async function getEvents(
  limit: number = 15,
  marketStatus: 'active' | 'inactive' | 'finalized' | 'all' = 'active',
  maxMarketsPerEvent: number = 5
): Promise<EventResult[]> {
  const cacheKey = `events:${limit}:${marketStatus}:${maxMarketsPerEvent}`;
  const cached = getCached<EventResult[]>(cacheKey);
  if (cached) return cached;

  console.log(`[MCP-Wallet] Getting events (limit=${limit})`);

  const result = await callMcpTool<{
    events: Array<{
      ticker: string;
      title: string;
      subtitle?: string;
      imageUrl?: string;
      volume?: number;
      volume24h?: number;
      markets: Array<{
        ticker: string;
        eventTicker: string;
        title: string;
        subtitle?: string;
        yesSubTitle?: string;
        noSubTitle?: string;
        status: string;
        volume?: number;
        yesBid?: string;
        yesAsk?: string;
        noBid?: string;
        noAsk?: string;
        accounts?: Record<string, {
          yesMint: string;
          noMint: string;
        }>;
      }>;
    }>;
  }>('kalshi_get_events', {
    limit,
    marketStatus,
  });

  if (!result?.events) {
    console.log(`[MCP-Wallet] No events in result`);
    return [];
  }

  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const events: EventResult[] = [];

  for (const event of result.events) {
    const markets: Market[] = [];

    // Only include active markets and limit per event
    for (const m of event.markets) {
      if (marketStatus !== 'all' && m.status !== marketStatus) {
        continue;
      }

      const usdcAccount = m.accounts?.[USDC_MINT];

      markets.push({
        ticker: m.ticker,
        title: m.title,
        subtitle: m.subtitle || m.yesSubTitle,
        yesSubTitle: m.yesSubTitle,
        noSubTitle: m.noSubTitle,
        status: m.status,
        yesPrice: m.yesAsk ? parseFloat(m.yesAsk) : undefined,
        noPrice: m.noAsk ? parseFloat(m.noAsk) : undefined,
        yesMint: usdcAccount?.yesMint,
        noMint: usdcAccount?.noMint,
        volume: m.volume,
      });

      // Limit markets per event
      if (markets.length >= maxMarketsPerEvent) {
        break;
      }
    }

    if (markets.length > 0) {
      events.push({
        ticker: event.ticker,
        title: event.title,
        subtitle: event.subtitle,
        imageUrl: event.imageUrl,
        volume: event.volume,
        volume24h: event.volume24h,
        markets,
      });
    }
  }

  console.log(`[MCP-Wallet] Returning ${events.length} events`);
  setCache(cacheKey, events);
  return events;
}

/**
 * Get detailed market info
 */
export async function getMarket(ticker: string): Promise<MarketDetails | null> {
  console.log(`[MCP-Wallet] Getting market: ${ticker}`);

  const result = await callMcpTool<{
    ticker: string;
    title: string;
    subtitle?: string;
    status: string;
    yesPrice?: number;
    noPrice?: number;
    yesMint: string;
    noMint: string;
    volume?: number;
    openInterest?: number;
  }>('kalshi_get_market', {
    ticker,
  });

  if (!result) {
    return null;
  }

  return {
    ticker: result.ticker,
    title: result.title,
    subtitle: result.subtitle,
    status: result.status,
    yesPrice: result.yesPrice || 0.5,
    noPrice: result.noPrice || 0.5,
    yesMint: result.yesMint,
    noMint: result.noMint,
    volume: result.volume,
    openInterest: result.openInterest,
  };
}

/**
 * Get live market data
 */
export async function getLiveMarketData(marketTicker: string): Promise<{
  yesPrice: number;
  noPrice: number;
  volume?: number;
} | null> {
  const result = await callMcpTool<{
    yesPrice?: number;
    noPrice?: number;
    volume?: number;
  }>('kalshi_get_live_data', {
    marketTicker,
  });

  if (!result) {
    return null;
  }

  return {
    yesPrice: result.yesPrice || 0.5,
    noPrice: result.noPrice || 0.5,
    volume: result.volume,
  };
}

// ============================================
// Trading
// ============================================

/**
 * Buy YES tokens
 */
export async function buyYes(
  marketTicker: string,
  yesOutcomeMint: string,
  usdcAmount: number,
  slippageBps: number = 300
): Promise<TradeResult> {
  console.log(`[MCP-Wallet] Buying YES: ${usdcAmount} USDC on ${marketTicker}`);

  const result = await callMcpTool<{
    message: string;
    txSignature: string;
    quote?: {
      inAmount: string;
      outAmount: string;
    };
  }>('kalshi_buy_yes', {
    marketTicker,
    yesOutcomeMint,
    usdcAmount,
    slippageBps,
  });

  if (!result?.txSignature) {
    return {
      success: false,
      error: result?.message || 'Trade failed',
    };
  }

  return {
    success: true,
    txSignature: result.txSignature,
    usdcSpent: result.quote ? parseFloat(result.quote.inAmount) / 1e6 : usdcAmount,
    sharesReceived: result.quote ? parseFloat(result.quote.outAmount) / 1e6 : undefined,
  };
}

/**
 * Buy NO tokens
 */
export async function buyNo(
  marketTicker: string,
  noOutcomeMint: string,
  usdcAmount: number,
  slippageBps: number = 300
): Promise<TradeResult> {
  console.log(`[MCP-Wallet] Buying NO: ${usdcAmount} USDC on ${marketTicker}`);

  const result = await callMcpTool<{
    message: string;
    txSignature: string;
    quote?: {
      inAmount: string;
      outAmount: string;
    };
  }>('kalshi_buy_no', {
    marketTicker,
    noOutcomeMint,
    usdcAmount,
    slippageBps,
  });

  if (!result?.txSignature) {
    return {
      success: false,
      error: result?.message || 'Trade failed',
    };
  }

  return {
    success: true,
    txSignature: result.txSignature,
    usdcSpent: result.quote ? parseFloat(result.quote.inAmount) / 1e6 : usdcAmount,
    sharesReceived: result.quote ? parseFloat(result.quote.outAmount) / 1e6 : undefined,
  };
}

/**
 * Sell position tokens back to USDC
 */
export async function sellPosition(
  outcomeMint: string,
  tokenAmount: number,
  slippageBps: number = 300
): Promise<TradeResult> {
  console.log(`[MCP-Wallet] Selling ${tokenAmount} tokens`);

  const result = await callMcpTool<{
    message?: string;
    txSignature: string;
    quote?: {
      inAmount: string;
      outAmount: string;
    };
  }>('kalshi_sell_position', {
    outcomeMint,
    tokenAmount,
    slippageBps,
  });

  if (!result?.txSignature) {
    return {
      success: false,
      error: result?.message || 'Sell failed',
    };
  }

  return {
    success: true,
    txSignature: result.txSignature,
    usdcSpent: result.quote ? parseFloat(result.quote.outAmount) / 1e6 : undefined,
  };
}

// ============================================
// Transfers
// ============================================

/**
 * Send SOL to another wallet
 */
export async function sendSol(
  toAddress: string,
  amount: number
): Promise<TransferResult> {
  console.log(`[MCP-Wallet] Sending ${amount} SOL to ${toAddress.slice(0, 8)}...`);

  const result = await callMcpTool<{
    success: boolean;
    txSignature?: string;
    error?: string;
  }>('kalshi_send_sol', {
    toAddress,
    amount,
  });

  if (!result?.success || !result.txSignature) {
    return {
      success: false,
      error: result?.error || 'Transfer failed',
    };
  }

  return {
    success: true,
    txSignature: result.txSignature,
  };
}

/**
 * Send USDC to another wallet
 */
export async function sendUsdc(
  toAddress: string,
  amount: number
): Promise<TransferResult> {
  console.log(`[MCP-Wallet] Sending ${amount} USDC to ${toAddress.slice(0, 8)}...`);

  const result = await callMcpTool<{
    success: boolean;
    txSignature?: string;
    error?: string;
  }>('kalshi_send_usdc', {
    toAddress,
    amount,
  });

  if (!result?.success || !result.txSignature) {
    return {
      success: false,
      error: result?.error || 'Transfer failed',
    };
  }

  return {
    success: true,
    txSignature: result.txSignature,
  };
}

/**
 * Send any SPL token to another wallet
 */
export async function sendToken(
  toAddress: string,
  mintAddress: string,
  amount: number,
  decimals: number = 6
): Promise<TransferResult> {
  console.log(`[MCP-Wallet] Sending ${amount} tokens to ${toAddress.slice(0, 8)}...`);

  const result = await callMcpTool<{
    success: boolean;
    txSignature?: string;
    error?: string;
  }>('kalshi_send_token', {
    toAddress,
    mintAddress,
    amount,
    decimals,
  });

  if (!result?.success || !result.txSignature) {
    return {
      success: false,
      error: result?.error || 'Transfer failed',
    };
  }

  return {
    success: true,
    txSignature: result.txSignature,
  };
}

// ============================================
// Swaps
// ============================================

/**
 * Swap SOL to USDC
 */
export async function swapSolToUsdc(
  solAmount: number,
  slippageBps: number = 50
): Promise<TransferResult> {
  console.log(`[MCP-Wallet] Swapping ${solAmount} SOL to USDC`);

  const result = await callMcpTool<{
    success?: boolean;
    txSignature: string;
    error?: string;
  }>('kalshi_swap_sol_to_usdc', {
    solAmount,
    slippageBps,
  });

  if (!result?.txSignature) {
    return {
      success: false,
      error: result?.error || 'Swap failed',
    };
  }

  return {
    success: true,
    txSignature: result.txSignature,
  };
}

/**
 * Swap USDC to SOL
 */
export async function swapUsdcToSol(
  usdcAmount: number,
  slippageBps: number = 50
): Promise<TransferResult> {
  console.log(`[MCP-Wallet] Swapping ${usdcAmount} USDC to SOL`);

  const result = await callMcpTool<{
    success?: boolean;
    txSignature: string;
    error?: string;
  }>('kalshi_swap_usdc_to_sol', {
    usdcAmount,
    slippageBps,
  });

  if (!result?.txSignature) {
    return {
      success: false,
      error: result?.error || 'Swap failed',
    };
  }

  return {
    success: true,
    txSignature: result.txSignature,
  };
}

// ============================================
// Positions
// ============================================

/**
 * Get all open positions
 */
export async function getPositions(): Promise<Array<{
  market: string;
  side: 'YES' | 'NO';
  amount: number;
  mint: string;
}>> {
  const result = await callMcpTool<{
    positions: Array<{
      market: string;
      side: 'YES' | 'NO';
      amount: number;
      mint: string;
    }>;
  }>('kalshi_get_positions', {});

  return result?.positions || [];
}

/**
 * Check if MCP is configured
 */
export function isMcpConfigured(): boolean {
  return !!MCP_API_KEY;
}
