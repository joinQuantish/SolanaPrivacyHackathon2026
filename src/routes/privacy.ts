/**
 * Privacy API Routes
 *
 * Two privacy systems:
 * 1. Privacy Cash - breaks wallet linkability via ZK withdrawals
 * 2. ZK Balance Proofs - hides balance from relay via Noir circuits
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
import * as nullifierTracker from '../services/nullifier-tracker.js';

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

// ============================================
// ZK BALANCE PROOF ENDPOINTS
// ============================================

/**
 * GET /privacy/balance-proof/status
 * Get ZK balance proof system status
 */
router.get('/balance-proof/status', async (_req: Request, res: Response) => {
  try {
    const treeStats = nullifierTracker.getTreeStats();
    const nullifierCount = await nullifierTracker.getNullifierCount();

    res.json({
      success: true,
      merkleTree: treeStats,
      nullifiers: {
        count: nullifierCount,
      },
      programId: process.env.PRIVACY_POOL_PROGRAM_ID || 'AfTSjfnT7M88XipRjPGLgDCcqcVfnrePrtuvNBF74hhP',
    });
  } catch (error) {
    console.error('[Privacy] Balance proof status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /privacy/balance-proof/merkle-root
 * Get current Merkle root for balance proofs
 */
router.get('/balance-proof/merkle-root', (_req: Request, res: Response) => {
  try {
    const root = nullifierTracker.getMerkleRoot();
    res.json({ success: true, root });
  } catch (error) {
    console.error('[Privacy] Merkle root error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /privacy/balance-proof/merkle-path/:index
 * Get Merkle path for a commitment at given index
 */
router.get('/balance-proof/merkle-path/:index', (req: Request, res: Response) => {
  try {
    const index = parseInt(req.params.index, 10);

    if (isNaN(index) || index < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid index',
      });
    }

    const path = nullifierTracker.getMerklePath(index);
    const root = nullifierTracker.getMerkleRoot();

    res.json({
      success: true,
      index,
      path,
      root,
    });
  } catch (error) {
    console.error('[Privacy] Merkle path error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /privacy/balance-proof/commitment
 * Record a new deposit commitment (called after user deposits)
 */
router.post('/balance-proof/commitment', async (req: Request, res: Response) => {
  try {
    const { commitment } = req.body;

    if (!commitment || !/^0x[0-9a-fA-F]{64}$/.test(commitment)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid commitment format',
      });
    }

    const leafIndex = nullifierTracker.addCommitment(commitment);
    const newRoot = nullifierTracker.getMerkleRoot();

    console.log(`[Privacy] Commitment recorded: index=${leafIndex}`);

    res.json({
      success: true,
      leafIndex,
      merkleRoot: newRoot,
    });
  } catch (error) {
    console.error('[Privacy] Commitment error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /privacy/balance-proof/verify
 * Verify a balance proof and record the nullifier
 */
router.post('/balance-proof/verify', async (req: Request, res: Response) => {
  try {
    const { proof, publicInputs } = req.body;

    // Validate request
    if (!proof || !publicInputs) {
      return res.status(400).json({
        success: false,
        error: 'Missing proof or publicInputs',
      });
    }

    // Convert proof from base64 or array
    let proofBytes: Uint8Array;
    if (typeof proof === 'string') {
      proofBytes = new Uint8Array(Buffer.from(proof, 'base64'));
    } else if (Array.isArray(proof)) {
      proofBytes = new Uint8Array(proof);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid proof format',
      });
    }

    // Validate public inputs
    const { merkleRoot, nullifier, newCommitment, orderCommitment } = publicInputs;
    const hexPattern = /^0x[0-9a-fA-F]{64}$/;

    if (!hexPattern.test(merkleRoot) ||
        !hexPattern.test(nullifier) ||
        !hexPattern.test(newCommitment) ||
        !hexPattern.test(orderCommitment)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid public input format',
      });
    }

    // Process the balance proof
    const result = await nullifierTracker.processBalanceProof({
      proof: proofBytes,
      publicInputs: {
        merkleRoot,
        nullifier,
        newCommitment,
        orderCommitment,
      },
    });

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      valid: true,
      newLeafIndex: result.newLeafIndex,
      newMerkleRoot: nullifierTracker.getMerkleRoot(),
    });
  } catch (error) {
    console.error('[Privacy] Verify balance error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /privacy/balance-proof/nullifier/:nullifier
 * Check if a nullifier has been used
 */
router.get('/balance-proof/nullifier/:nullifier', async (req: Request, res: Response) => {
  try {
    const { nullifier } = req.params;

    if (!/^0x[0-9a-fA-F]{64}$/.test(nullifier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid nullifier format',
      });
    }

    const used = await nullifierTracker.isNullifierUsed(nullifier);

    res.json({
      success: true,
      nullifier,
      used,
    });
  } catch (error) {
    console.error('[Privacy] Nullifier status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
