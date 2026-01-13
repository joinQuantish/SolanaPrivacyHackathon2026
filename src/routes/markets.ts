/**
 * Market Search & Trading API Routes
 *
 * Handles market search, market details, and trade execution.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  searchMarkets,
  searchEvents,
  getEvents,
  getMarket,
  getLiveMarketData,
  buyYes,
  buyNo,
  sellPosition,
  getPositions,
  isMcpConfigured,
} from '../services/mcp-wallet.js';
import { getWalletByPublicKey } from '../services/database.js';

const router = Router();

/**
 * GET /api/markets/search
 * Search for markets
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, limit, status } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required',
      });
      return;
    }

    if (!isMcpConfigured()) {
      res.status(503).json({
        success: false,
        error: 'MCP not configured',
      });
      return;
    }

    const parsedLimit = limit ? parseInt(limit as string, 10) : 10;
    const marketStatus = (status as 'active' | 'inactive' | 'finalized' | 'all') || 'active';

    const markets = await searchMarkets(q, parsedLimit, marketStatus);

    res.json({
      success: true,
      query: q,
      count: markets.length,
      markets,
    });
  } catch (error) {
    console.error('[Markets] Search error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
    });
  }
});

/**
 * GET /api/markets/events
 * Get or search for events (returns events with nested markets)
 * If q is provided, searches. Otherwise returns featured/all events.
 */
router.get('/events', async (req: Request, res: Response) => {
  try {
    const { q, limit, status, maxMarketsPerEvent } = req.query;

    if (!isMcpConfigured()) {
      res.status(503).json({
        success: false,
        error: 'MCP not configured',
      });
      return;
    }

    const parsedLimit = limit ? parseInt(limit as string, 10) : 15;
    // Use 'all' as default status for search to get more results
    const marketStatus = (status as 'active' | 'inactive' | 'finalized' | 'all') || 'all';
    const maxMarkets = maxMarketsPerEvent ? parseInt(maxMarketsPerEvent as string, 10) : 5;

    let events;
    if (q && typeof q === 'string') {
      // Search mode - use 'all' to get more events, limit markets per event
      events = await searchEvents(q, parsedLimit, marketStatus, maxMarkets);
    } else {
      // Get all events (featured) - default to active for featured
      events = await getEvents(parsedLimit, 'active', maxMarkets);
    }

    res.json({
      success: true,
      query: q || null,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error('[Markets] Events error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get events',
    });
  }
});

/**
 * GET /api/markets/:ticker
 * Get market details
 */
router.get('/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;

    if (!isMcpConfigured()) {
      res.status(503).json({
        success: false,
        error: 'MCP not configured',
      });
      return;
    }

    const market = await getMarket(ticker);

    if (!market) {
      res.status(404).json({
        success: false,
        error: 'Market not found',
      });
      return;
    }

    res.json({
      success: true,
      market,
    });
  } catch (error) {
    console.error('[Markets] Get market error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get market',
    });
  }
});

/**
 * GET /api/markets/:ticker/live
 * Get live market data (prices, volume)
 */
router.get('/:ticker/live', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;

    if (!isMcpConfigured()) {
      res.status(503).json({
        success: false,
        error: 'MCP not configured',
      });
      return;
    }

    const liveData = await getLiveMarketData(ticker);

    if (!liveData) {
      res.status(404).json({
        success: false,
        error: 'Market not found',
      });
      return;
    }

    res.json({
      success: true,
      ticker,
      ...liveData,
    });
  } catch (error) {
    console.error('[Markets] Live data error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get live data',
    });
  }
});

/**
 * POST /api/trade/buy
 * Execute a buy trade
 */
router.post('/trade/buy', async (req: Request, res: Response) => {
  try {
    const { marketTicker, side, usdcAmount, walletPublicKey, slippageBps } = req.body;

    if (!marketTicker || !side || !usdcAmount) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: marketTicker, side, usdcAmount',
      });
      return;
    }

    if (side !== 'YES' && side !== 'NO') {
      res.status(400).json({
        success: false,
        error: 'Side must be YES or NO',
      });
      return;
    }

    const parsedAmount = parseFloat(usdcAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid usdcAmount',
      });
      return;
    }

    if (!isMcpConfigured()) {
      res.status(503).json({
        success: false,
        error: 'MCP not configured',
      });
      return;
    }

    // Verify wallet if provided
    if (walletPublicKey) {
      const walletInfo = await getWalletByPublicKey(walletPublicKey);
      if (!walletInfo) {
        res.status(404).json({
          success: false,
          error: 'Wallet not found',
        });
        return;
      }
    }

    // Get market to find token mint
    const market = await getMarket(marketTicker);
    if (!market) {
      res.status(404).json({
        success: false,
        error: 'Market not found',
      });
      return;
    }

    // Execute trade
    let result;
    if (side === 'YES') {
      result = await buyYes(
        marketTicker,
        market.yesMint,
        parsedAmount,
        slippageBps || 300
      );
    } else {
      result = await buyNo(
        marketTicker,
        market.noMint,
        parsedAmount,
        slippageBps || 300
      );
    }

    if (!result.success) {
      res.status(500).json({
        success: false,
        error: result.error || 'Trade failed',
      });
      return;
    }

    res.json({
      success: true,
      marketTicker,
      side,
      usdcAmount: parsedAmount,
      txSignature: result.txSignature,
      usdcSpent: result.usdcSpent,
      sharesReceived: result.sharesReceived,
    });
  } catch (error) {
    console.error('[Markets] Buy error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Trade failed',
    });
  }
});

/**
 * POST /api/trade/sell
 * Sell position tokens back to USDC
 */
router.post('/trade/sell', async (req: Request, res: Response) => {
  try {
    const { outcomeMint, tokenAmount, slippageBps } = req.body;

    if (!outcomeMint || !tokenAmount) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: outcomeMint, tokenAmount',
      });
      return;
    }

    const parsedAmount = parseFloat(tokenAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid tokenAmount',
      });
      return;
    }

    if (!isMcpConfigured()) {
      res.status(503).json({
        success: false,
        error: 'MCP not configured',
      });
      return;
    }

    const result = await sellPosition(outcomeMint, parsedAmount, slippageBps || 300);

    if (!result.success) {
      res.status(500).json({
        success: false,
        error: result.error || 'Sell failed',
      });
      return;
    }

    res.json({
      success: true,
      outcomeMint,
      tokenAmount: parsedAmount,
      txSignature: result.txSignature,
    });
  } catch (error) {
    console.error('[Markets] Sell error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Sell failed',
    });
  }
});

/**
 * GET /api/positions
 * Get all open positions
 */
router.get('/positions', async (_req: Request, res: Response) => {
  try {
    if (!isMcpConfigured()) {
      res.status(503).json({
        success: false,
        error: 'MCP not configured',
      });
      return;
    }

    const positions = await getPositions();

    res.json({
      success: true,
      count: positions.length,
      positions,
    });
  } catch (error) {
    console.error('[Markets] Positions error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get positions',
    });
  }
});

export default router;
