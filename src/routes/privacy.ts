/**
 * Privacy API Routes
 *
 * Privacy Cash - breaks wallet linkability via ZK withdrawals
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  executePrivacyDepositServerSide,
  isPrivacyCashAvailable,
  getPoolStats,
} from '../services/privacy-cash.js';
import { getMcpWalletAddress } from '../services/dflow.js';
import { getRelayWallet } from '../services/wallet.js';

const router = Router();

/**
 * GET /privacy/status
 * Check Privacy Cash availability and pool stats
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const available = await isPrivacyCashAvailable();
    const stats = await getPoolStats();

    res.json({
      success: true,
      available,
      stats,
      fees: {
        deposit: '0%',
        withdraw: '0.35% + 0.006 SOL',
      },
      description: 'Privacy Cash enables fully unlinkable deposits via ZK proofs',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /privacy/deposit
 * Execute privacy deposit flow server-side
 *
 * Body:
 * - ephemeral1SecretKey: Base64 encoded secret key of ephemeral wallet 1
 * - ephemeral2SecretKey: Base64 encoded secret key of ephemeral wallet 2
 * - amount: USDC amount
 * - orderId: Order ID for memo
 *
 * Flow:
 * 1. Ephemeral 1 deposits to Privacy Pool
 * 2. Privacy Pool withdraws to Ephemeral 2 (ZK proof breaks link)
 * 3. Ephemeral 2 sends to relay with memo
 */
router.post('/deposit', async (req: Request, res: Response) => {
  try {
    const {
      ephemeral1SecretKey,
      ephemeral2SecretKey,
      amount,
      orderId,
      action,
      marketTicker,
      outcomeMint,
      slippageBps,
      destinationWallet,
    } = req.body;

    // Validate required fields
    if (!ephemeral1SecretKey || !ephemeral2SecretKey || !amount || !orderId ||
        !action || !marketTicker || !outcomeMint || !destinationWallet) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: ephemeral1SecretKey, ephemeral2SecretKey, amount, orderId, action, marketTicker, outcomeMint, destinationWallet',
      });
      return;
    }

    // Get relay wallet address
    let relayWallet: string;
    const mcpAddress = await getMcpWalletAddress();
    if (mcpAddress) {
      relayWallet = mcpAddress;
    } else {
      const wallet = await getRelayWallet();
      relayWallet = wallet.getAddress();
    }

    console.log('[Privacy API] Starting privacy deposit...');
    console.log('[Privacy API] Order ID:', orderId);
    console.log('[Privacy API] Amount:', amount, 'USDC');
    console.log('[Privacy API] Action:', action);
    console.log('[Privacy API] Market:', marketTicker);
    console.log('[Privacy API] Outcome mint:', outcomeMint?.slice(0, 8) + '...');
    console.log('[Privacy API] Destination wallet(s):', destinationWallet);
    console.log('[Privacy API] Relay wallet:', relayWallet);

    // Execute privacy deposit flow
    const result = await executePrivacyDepositServerSide({
      ephemeral1SecretKey,
      ephemeral2SecretKey,
      amount: parseFloat(amount),
      orderId,
      action,
      marketTicker,
      outcomeMint,
      slippageBps: slippageBps || 100,
      destinationWallet,
      relayWallet,
    });

    if (!result.success) {
      res.status(500).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.json({
      success: true,
      transactions: {
        depositTx: result.depositTx,
        withdrawTx: result.withdrawTx,
        relayTx: result.relayTx,
      },
      netAmount: result.netAmount,
      privacy: {
        note: 'No on-chain link between your wallet and the relay',
        flow: [
          'User → Ephemeral 1 (funded by user)',
          'Ephemeral 1 → Privacy Pool (deposit)',
          'Privacy Pool → Ephemeral 2 (ZK withdrawal - BREAKS LINK)',
          'Ephemeral 2 → Relay (with memo)',
        ],
      },
    });
  } catch (error) {
    console.error('[Privacy API] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute privacy deposit',
    });
  }
});

/**
 * GET /privacy/relay-address
 * Get the relay wallet address for privacy deposits
 */
router.get('/relay-address', async (_req: Request, res: Response) => {
  try {
    let address: string;
    let type: string;

    const mcpAddress = await getMcpWalletAddress();
    if (mcpAddress) {
      address = mcpAddress;
      type = 'mcp';
    } else {
      const wallet = await getRelayWallet();
      address = wallet.getAddress();
      type = 'legacy';
    }

    res.json({
      success: true,
      address,
      type,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get relay address',
    });
  }
});

export default router;
