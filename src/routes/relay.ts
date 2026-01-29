import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  submitOrder,
  submitEncryptedOrder,
  executeEncryptedBatch,
  getOrder,
  getBatch,
  getBatchOrders,
  markBatchReady,
  executeBatch,
  getAllBatches,
  getAllOrders,
  getReadyBatches,
  activateOrder,
} from '../services/batch.js';
import {
  getUnmatchedDeposits,
  manualMatchDeposit,
  refundUnmatchedDeposit,
} from '../services/deposit-monitor.js';
import { getRelayWallet, isWalletInitialized } from '../services/wallet.js';
import { executeDFlowTrade, getMarketInfo, estimateShares, getMcpWalletAddress, distributeTokensViaMcp } from '../services/dflow.js';
import { isMpcEnabled, getArciumMpcService } from '../services/arcium-mpc.js';
import type { OrderSubmission, EncryptedOrderSubmission } from '../types/relay.js';
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
 * GET /relay/mpc/status
 * Get Arcium MPC integration status
 * Shows configuration, connection status, and any issues
 */
router.get('/mpc/status', async (_req: Request, res: Response) => {
  try {
    const enabled = isMpcEnabled();

    if (!enabled) {
      res.json({
        enabled: false,
        message: 'MPC is not enabled. Set ARCIUM_MPC_ENABLED=true to enable encrypted orders.',
      });
      return;
    }

    const mpcService = getArciumMpcService();
    const diagnostics = await mpcService.getDiagnostics();

    res.json({
      enabled: true,
      ...diagnostics,
      note: 'Arcium MPC integration for blind relay. Relay cannot see individual order amounts.',
    });
  } catch (error) {
    res.status(500).json({
      enabled: isMpcEnabled(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /relay/deposit-address
 * Get the MCP wallet address for USDC deposits
 * Users deposit here, MCP executes trades, MCP distributes tokens
 */
router.get('/deposit-address', async (_req: Request, res: Response) => {
  try {
    // Try MCP wallet first (preferred for trading)
    const mcpAddress = await getMcpWalletAddress();
    if (mcpAddress) {
      res.json({
        success: true,
        address: mcpAddress,
        type: 'mcp',
        note: 'Send USDC to this address when submitting orders. This wallet handles trading and distribution.',
      });
      return;
    }

    // Fallback to legacy relay wallet
    const wallet = await getRelayWallet();
    res.json({
      success: true,
      address: wallet.getAddress(),
      type: 'legacy',
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

    // Get deposit address (prefer MCP wallet for trading)
    let depositAddress: string;
    let walletType: string;

    const mcpAddress = await getMcpWalletAddress();
    if (mcpAddress) {
      depositAddress = mcpAddress;
      walletType = 'mcp';
    } else {
      const wallet = await getRelayWallet();
      depositAddress = wallet.getAddress();
      walletType = 'legacy';
    }

    res.json({
      success: true,
      orderId: order.id,
      batchId: order.batchId,
      commitmentHash: order.commitmentHash,
      status: order.status,
      distribution: order.distribution,

      // Deposit instructions
      deposit: {
        address: depositAddress,
        walletType,
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
 * POST /relay/order/encrypted
 * Submit an ENCRYPTED order via Arcium MPC
 *
 * The relay CANNOT see:
 * - usdcAmount (encrypted)
 * - distribution (encrypted)
 * - salt (encrypted)
 *
 * The relay CAN see:
 * - marketId (for batching)
 * - side (for batching)
 * - encrypted ciphertext (cannot decrypt)
 *
 * Example:
 * {
 *   "marketId": "BTC-100K-JAN",
 *   "side": "YES",
 *   "encryptedData": {
 *     "ciphertext": "<base64>",
 *     "publicKey": "<base64>",
 *     "nonce": "<base64>"
 *   }
 * }
 */
router.post('/order/encrypted', async (req: Request, res: Response) => {
  try {
    // Check if MPC is enabled
    if (!isMpcEnabled()) {
      res.status(503).json({
        success: false,
        error: 'MPC is not enabled. Set ARCIUM_MPC_ENABLED=true to enable encrypted orders.',
      });
      return;
    }

    const submission: EncryptedOrderSubmission = req.body;

    // Validate required fields
    if (!submission.marketId || !submission.side) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: marketId, side',
      });
      return;
    }

    // Validate encrypted data
    if (!submission.encryptedData ||
        !submission.encryptedData.ciphertext ||
        !submission.encryptedData.publicKey ||
        !submission.encryptedData.nonce) {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid encryptedData (requires ciphertext, publicKey, nonce)',
      });
      return;
    }

    // Validate side
    if (submission.side !== 'YES' && submission.side !== 'NO') {
      res.status(400).json({
        success: false,
        error: 'Side must be YES or NO',
      });
      return;
    }

    // Submit encrypted order
    const order = await submitEncryptedOrder(submission);

    // Get deposit address
    let depositAddress: string;
    let walletType: string;

    const mcpAddress = await getMcpWalletAddress();
    if (mcpAddress) {
      depositAddress = mcpAddress;
      walletType = 'mcp';
    } else {
      const wallet = await getRelayWallet();
      depositAddress = wallet.getAddress();
      walletType = 'legacy';
    }

    res.json({
      success: true,
      orderId: order.id,
      batchId: order.batchId,
      status: order.status,
      isEncrypted: true,

      // IMPORTANT: Relay cannot see these values
      hiddenFields: ['usdcAmount', 'distribution', 'salt', 'commitmentHash'],

      // Deposit instructions (amount is encrypted - user knows it)
      deposit: {
        address: depositAddress,
        walletType,
        memo: order.id,
        expiresAt: order.depositExpiresAt,
        note: 'Send the encrypted USDC amount to this address with the memo',
      },

      // Privacy info
      privacy: {
        mpcEnabled: true,
        relayCanSee: ['marketId', 'side', 'encryptedCiphertext'],
        relayCannotSee: ['usdcAmount', 'distribution', 'salt'],
        note: 'Order amount and distribution are encrypted. Only MPC nodes can decrypt.',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit encrypted order',
    });
  }
});

/**
 * GET /relay/mpc/status
 * Get MPC service status
 */
router.get('/mpc/status', (_req: Request, res: Response) => {
  const enabled = isMpcEnabled();

  res.json({
    success: true,
    mpcEnabled: enabled,
    description: enabled
      ? 'MPC is enabled. Encrypted orders are accepted and processed via Arcium MXE.'
      : 'MPC is disabled. Set ARCIUM_MPC_ENABLED=true to enable.',
    features: enabled ? [
      'Encrypted order submission',
      'Blind batch total computation',
      'MPC-based distribution',
      'Relay never sees individual amounts',
    ] : [],
  });
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
 * Automatically detects if batch is encrypted and uses MPC execution
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

  // Check if this is an encrypted batch
  if (batch.isEncrypted) {
    // Execute via MPC - relay is blind to order amounts
    console.log(`[MPC] Executing encrypted batch ${batchId} via MPC...`);

    const result = await executeEncryptedBatch(batchId, async (b, totalUsdc) => {
      // DFlow executor receives the MPC-revealed total
      return executeDFlowTrade(b);
    });

    if (!result.success) {
      res.status(500).json({
        success: false,
        error: result.error,
        batch: result.batch,
        isEncrypted: true,
      });
      return;
    }

    res.json({
      success: true,
      batch: result.batch,
      isEncrypted: true,
      mpcExecution: {
        revealedTotal: batch.mpcRevealedTotal,
        revealedCount: batch.mpcRevealedCount,
        note: 'Relay only learned batch total. Individual order amounts remain hidden.',
      },
    });
    return;
  }

  // Regular (non-encrypted) execution
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

/**
 * GET /relay/deposits/unmatched
 * Get unmatched deposits (admin endpoint)
 */
router.get('/deposits/unmatched', (_req: Request, res: Response) => {
  const deposits = getUnmatchedDeposits();
  res.json({
    success: true,
    count: deposits.length,
    deposits,
  });
});

/**
 * POST /relay/deposits/match
 * Manually match a deposit to an order
 */
router.post('/deposits/match', async (req: Request, res: Response) => {
  const { signature, orderId } = req.body;

  if (!signature || !orderId) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: signature, orderId',
    });
    return;
  }

  const result = await manualMatchDeposit(signature, orderId);

  if (!result.success) {
    res.status(400).json({
      success: false,
      error: result.error,
    });
    return;
  }

  res.json({
    success: true,
    message: `Deposit ${signature} matched to order ${orderId}`,
  });
});

/**
 * POST /relay/deposits/refund
 * Refund an unmatched deposit
 */
router.post('/deposits/refund', async (req: Request, res: Response) => {
  const { signature } = req.body;

  if (!signature) {
    res.status(400).json({
      success: false,
      error: 'Missing required field: signature',
    });
    return;
  }

  const result = await refundUnmatchedDeposit(signature);

  if (!result.success) {
    res.status(400).json({
      success: false,
      error: result.error,
    });
    return;
  }

  res.json({
    success: true,
    message: 'Deposit refunded',
    txSignature: result.txSignature,
  });
});

/**
 * POST /relay/order/:orderId/activate
 * Directly activate an order (admin endpoint, bypasses deposit detection)
 */
router.post('/order/:orderId/activate', async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { depositTxSignature, senderWallet } = req.body;

  if (!depositTxSignature) {
    res.status(400).json({
      success: false,
      error: 'Missing required field: depositTxSignature',
    });
    return;
  }

  const result = await activateOrder(
    orderId,
    depositTxSignature,
    senderWallet || 'admin-activated'
  );

  if (!result.success) {
    res.status(400).json({
      success: false,
      error: result.error,
    });
    return;
  }

  // Get updated order
  const order = getOrder(orderId);

  res.json({
    success: true,
    message: `Order ${orderId} activated`,
    order,
  });
});

/**
 * GET /relay/batch/:batchId/proof
 * Get zkNoir proof status for a batch
 * Returns proof hash, verification status, and public inputs
 */
router.get('/batch/:batchId/proof', (req: Request, res: Response) => {
  const { batchId } = req.params;
  const batch = getBatch(batchId);

  if (!batch) {
    res.status(404).json({
      success: false,
      error: 'Batch not found',
    });
    return;
  }

  // Check if batch has been executed (proof is generated after execution)
  if (batch.status === 'collecting' || batch.status === 'ready') {
    res.json({
      success: true,
      batchId,
      hasProof: false,
      status: 'pending',
      message: 'Batch not yet executed. Proof will be generated after execution.',
    });
    return;
  }

  // If executing, proof is being generated
  if (batch.status === 'executing') {
    res.json({
      success: true,
      batchId,
      hasProof: false,
      status: 'generating',
      message: 'Batch is executing. Proof generation in progress.',
    });
    return;
  }

  // Batch is completed or distributed - return proof info
  const hasProof = !!batch.proof;
  const proofHash = hasProof
    ? require('crypto').createHash('sha256').update(batch.proof!).digest('hex').slice(0, 16)
    : null;

  res.json({
    success: true,
    batchId,
    hasProof,
    status: hasProof ? 'verified' : 'none',
    verified: batch.proofVerified || false,
    proofHash,
    publicInputs: batch.publicInputs || [],
    publicInputsExplained: batch.publicInputs ? {
      merkleRoot: batch.publicInputs[0] || 'N/A',
      totalUsdc: batch.publicInputs[1] || 'N/A',
      totalShares: batch.publicInputs[2] || 'N/A',
    } : null,
    circuitInfo: {
      name: 'relay_distribution',
      type: 'Noir + UltraHonk',
      purpose: 'Proves relay distributed shares correctly to all participants',
    },
    executionInfo: {
      actualUsdcSpent: batch.actualUsdcSpent,
      actualSharesReceived: batch.actualSharesReceived,
      fillPercentage: batch.fillPercentage,
    },
  });
});

/**
 * POST /relay/wallet/withdraw
 * Withdraw USDC from relay wallet (admin endpoint)
 */
router.post('/wallet/withdraw', async (req: Request, res: Response) => {
  const { toAddress, amount } = req.body;

  if (!toAddress || !amount) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: toAddress, amount',
    });
    return;
  }

  const wallet = await getRelayWallet();
  const result = await wallet.transferUsdc(toAddress, parseFloat(amount));

  if (!result.success) {
    res.status(500).json({
      success: false,
      error: result.error,
    });
    return;
  }

  res.json({
    success: true,
    txSignature: result.signature,
    toAddress,
    amount,
  });
});

export default router;
