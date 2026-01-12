import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  submitOrder,
  getOrder,
  getBatch,
  getBatchOrders,
  markBatchReady,
  executeBatch,
  getAllBatches,
  getAllOrders,
  getReadyBatches,
} from '../services/batch.js';
import { getRelayWallet, isWalletInitialized } from '../services/wallet.js';
import { executeDFlowTrade, getMarketInfo, estimateShares } from '../services/dflow.js';
import type { OrderSubmission } from '../types/relay.js';
import { DEFAULT_RELAY_CONFIG } from '../types/relay.js';

const router = Router();

/**
 * GET /relay/status
 * Get relay service status including wallet info
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const wallet = await getRelayWallet();
    const walletInfo = await wallet.getInfo();
    const batches = getAllBatches();
    const orders = getAllOrders();

    res.json({
      status: 'operational',
      wallet: walletInfo,
      stats: {
        totalBatches: batches.length,
        totalOrders: orders.length,
        collectingBatches: batches.filter(b => b.status === 'collecting').length,
        completedBatches: batches.filter(b => b.status === 'completed').length,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /relay/deposit-address
 * Get the relay wallet address for USDC deposits
 */
router.get('/deposit-address', async (_req: Request, res: Response) => {
  try {
    const wallet = await getRelayWallet();
    res.json({
      success: true,
      address: wallet.getAddress(),
      note: 'Send USDC to this address when submitting orders',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get deposit address',
    });
  }
});

/**
 * POST /relay/order
 * Submit a new order to the relay
 *
 * Body can include either:
 * - distribution: Array of { wallet, percentage } where percentages sum to 10000 (100%)
 * - destinationWallet: Single wallet address (legacy, equivalent to 100% to one wallet)
 *
 * Example with multi-wallet distribution:
 * {
 *   "marketId": "BTC-100K-JAN",
 *   "side": "YES",
 *   "usdcAmount": "100",
 *   "distribution": [
 *     { "wallet": "wallet1...", "percentage": 5000 },  // 50%
 *     { "wallet": "wallet2...", "percentage": 3000 },  // 30%
 *     { "wallet": "wallet3...", "percentage": 2000 }   // 20%
 *   ]
 * }
 */
router.post('/order', async (req: Request, res: Response) => {
  try {
    const submission: OrderSubmission = req.body;

    // Validate required fields
    if (!submission.marketId || !submission.side || !submission.usdcAmount) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: marketId, side, usdcAmount',
      });
      return;
    }

    // Validate that either distribution or destinationWallet is provided
    const hasDistribution = submission.distribution && Array.isArray(submission.distribution) && submission.distribution.length > 0;
    const hasDestinationWallet = !!submission.destinationWallet;

    if (!hasDistribution && !hasDestinationWallet) {
      res.status(400).json({
        success: false,
        error: 'Must provide either distribution array or destinationWallet',
      });
      return;
    }

    // Validate distribution if provided
    if (hasDistribution) {
      if (submission.distribution!.length > 10) {
        res.status(400).json({
          success: false,
          error: 'Maximum 10 distribution destinations allowed',
        });
        return;
      }

      const totalPercentage = submission.distribution!.reduce((sum, d) => sum + (d.percentage || 0), 0);
      if (totalPercentage !== 10000) {
        res.status(400).json({
          success: false,
          error: `Distribution percentages must sum to 10000 (100%), got ${totalPercentage}`,
        });
        return;
      }

      for (const dest of submission.distribution!) {
        if (!dest.wallet || dest.wallet.length < 32) {
          res.status(400).json({
            success: false,
            error: 'Invalid wallet address in distribution',
          });
          return;
        }
        if (!dest.percentage || dest.percentage <= 0) {
          res.status(400).json({
            success: false,
            error: 'Each distribution percentage must be positive',
          });
          return;
        }
      }
    }

    // Validate side
    if (submission.side !== 'YES' && submission.side !== 'NO') {
      res.status(400).json({
        success: false,
        error: 'Side must be YES or NO',
      });
      return;
    }

    // Validate amount
    const amount = parseFloat(submission.usdcAmount);
    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid usdcAmount',
      });
      return;
    }

    // Submit order
    const order = await submitOrder(submission);

    // Get wallet address for deposit
    const wallet = await getRelayWallet();

    res.json({
      success: true,
      orderId: order.id,
      batchId: order.batchId,
      commitmentHash: order.commitmentHash,
      status: order.status,
      distribution: order.distribution,

      // Deposit instructions
      deposit: {
        address: wallet.getAddress(),
        amount: submission.usdcAmount,
        memo: order.id, // IMPORTANT: Include this memo in the transaction
        expiresAt: order.depositExpiresAt,
        expiresInSeconds: 3600,
      },

      // Frontend integration note
      instructions: {
        step1: 'Send exactly ' + submission.usdcAmount + ' USDC to the deposit address',
        step2: 'Include the memo field with value: ' + order.id,
        step3: 'Transaction will be detected automatically within ~30 seconds',
        important: 'The memo field is required for automatic matching. Without it, manual review is needed.',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit order',
    });
  }
});

/**
 * GET /relay/order/:orderId
 * Get order status
 */
router.get('/order/:orderId', (req: Request, res: Response) => {
  const { orderId } = req.params;
  const order = getOrder(orderId);

  if (!order) {
    res.status(404).json({
      success: false,
      error: 'Order not found',
    });
    return;
  }

  res.json({
    success: true,
    order,
  });
});

/**
 * GET /relay/batch/:batchId
 * Get batch status with all orders
 */
router.get('/batch/:batchId', (req: Request, res: Response) => {
  const { batchId } = req.params;
  const batch = getBatch(batchId);

  if (!batch) {
    res.status(404).json({
      success: false,
      error: 'Batch not found',
    });
    return;
  }

  const orders = getBatchOrders(batchId);

  res.json({
    success: true,
    batch,
    orders,
  });
});

/**
 * POST /relay/batch/:batchId/execute
 * Manually trigger batch execution (for testing)
 */
router.post('/batch/:batchId/execute', async (req: Request, res: Response) => {
  const { batchId } = req.params;
  const batch = getBatch(batchId);

  if (!batch) {
    res.status(404).json({
      success: false,
      error: 'Batch not found',
    });
    return;
  }

  // Mark as ready if still collecting
  if (batch.status === 'collecting') {
    markBatchReady(batchId);
  }

  // Execute
  const result = await executeBatch(batchId, executeDFlowTrade);

  if (!result.success) {
    res.status(500).json({
      success: false,
      error: result.error,
      batch: result.batch,
    });
    return;
  }

  res.json({
    success: true,
    batch: result.batch,
    distribution: result.distribution,
  });
});

/**
 * GET /relay/batches
 * List all batches (admin endpoint)
 */
router.get('/batches', (_req: Request, res: Response) => {
  const batches = getAllBatches();
  res.json({
    success: true,
    count: batches.length,
    batches,
  });
});

/**
 * GET /relay/batches/ready
 * Get batches ready for execution
 */
router.get('/batches/ready', (_req: Request, res: Response) => {
  const ready = getReadyBatches();
  res.json({
    success: true,
    count: ready.length,
    batches: ready,
  });
});

/**
 * POST /relay/execute-ready
 * Execute all ready batches (can be called by cron)
 */
router.post('/execute-ready', async (_req: Request, res: Response) => {
  const ready = getReadyBatches();

  if (ready.length === 0) {
    res.json({
      success: true,
      message: 'No batches ready for execution',
      executed: 0,
    });
    return;
  }

  const results = [];
  for (const batch of ready) {
    markBatchReady(batch.id);
    const result = await executeBatch(batch.id, executeDFlowTrade);
    results.push({
      batchId: batch.id,
      success: result.success,
      error: result.error,
    });
  }

  res.json({
    success: true,
    executed: results.length,
    results,
  });
});

/**
 * GET /relay/market/:marketId
 * Get market info
 */
router.get('/market/:marketId', async (req: Request, res: Response) => {
  const { marketId } = req.params;
  const market = await getMarketInfo(marketId);

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
});

/**
 * GET /relay/estimate
 * Estimate shares for a given order
 */
router.get('/estimate', async (req: Request, res: Response) => {
  const { marketId, side, usdcAmount } = req.query;

  if (!marketId || !side || !usdcAmount) {
    res.status(400).json({
      success: false,
      error: 'Missing required query params: marketId, side, usdcAmount',
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

  const amount = parseFloat(usdcAmount as string);
  if (isNaN(amount) || amount <= 0) {
    res.status(400).json({
      success: false,
      error: 'Invalid usdcAmount',
    });
    return;
  }

  const estimate = await estimateShares(marketId as string, side as 'YES' | 'NO', amount);

  if (!estimate) {
    res.status(404).json({
      success: false,
      error: 'Could not get estimate for market',
    });
    return;
  }

  res.json({
    success: true,
    marketId,
    side,
    usdcAmount: amount,
    estimatedShares: estimate.shares,
    currentPrice: estimate.price,
    note: 'Actual fill may vary due to slippage and partial fills',
  });
});

export default router;
