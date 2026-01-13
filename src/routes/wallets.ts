/**
 * Wallet Management API Routes
 *
 * Handles wallet creation, listing, balance queries, and transfers.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  isDatabaseAvailable,
  createMasterWallet,
  createSubWallet,
  getMasterWalletById,
  getSubWallets,
  getSubWalletById,
  deleteSubWallet,
  createSession,
  getSessionByToken,
  getWalletByPublicKey,
} from '../services/database.js';
import {
  createWallet as mcpCreateWallet,
  getBalances,
  getTokenHoldings,
  sendSol,
  sendUsdc,
  sendToken,
  swapSolToUsdc,
  swapUsdcToSol,
  isMcpConfigured,
} from '../services/mcp-wallet.js';

const router = Router();

/**
 * GET /api/wallets/status
 * Check if wallet API is available
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    database: isDatabaseAvailable(),
    mcp: isMcpConfigured(),
  });
});

/**
 * POST /api/wallets/create
 * Create a new wallet (master or sub)
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { label, isMaster, masterWalletId, color, sessionToken } = req.body;

    if (!isDatabaseAvailable()) {
      res.status(503).json({
        success: false,
        error: 'Database not available',
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

    // For sub-wallet creation, verify session
    if (!isMaster) {
      if (!masterWalletId && !sessionToken) {
        res.status(400).json({
          success: false,
          error: 'masterWalletId or sessionToken required for sub-wallet creation',
        });
        return;
      }

      // Validate session if provided
      if (sessionToken) {
        const session = await getSessionByToken(sessionToken);
        if (!session) {
          res.status(401).json({
            success: false,
            error: 'Invalid or expired session',
          });
          return;
        }
      }
    }

    // Generate unique external ID for MCP
    const externalId = `obsidian-${uuidv4()}`;

    // Create wallet via MCP
    const mcpWallet = await mcpCreateWallet(externalId, label || 'Obsidian Wallet');
    if (!mcpWallet) {
      res.status(500).json({
        success: false,
        error: 'Failed to create wallet via MCP',
      });
      return;
    }

    if (isMaster) {
      // Create master wallet in database
      const masterWallet = await createMasterWallet(
        externalId,
        mcpWallet.publicKey,
        mcpWallet.apiKeyId,
        label || 'Master Wallet'
      );

      if (!masterWallet) {
        res.status(500).json({
          success: false,
          error: 'Failed to save wallet to database',
        });
        return;
      }

      // Create session token
      const newSessionToken = uuidv4();
      const session = await createSession(masterWallet.id, newSessionToken);

      res.json({
        success: true,
        wallet: {
          id: masterWallet.id,
          publicKey: masterWallet.public_key,
          label: masterWallet.label,
          type: 'master',
        },
        sessionToken: session?.session_token,
      });
    } else {
      // Get master wallet ID
      let resolvedMasterWalletId = masterWalletId;
      if (sessionToken && !masterWalletId) {
        const session = await getSessionByToken(sessionToken);
        resolvedMasterWalletId = session?.master_wallet_id;
      }

      if (!resolvedMasterWalletId) {
        res.status(400).json({
          success: false,
          error: 'Could not determine master wallet',
        });
        return;
      }

      // Create sub-wallet in database
      const subWallet = await createSubWallet(
        resolvedMasterWalletId,
        externalId,
        mcpWallet.publicKey,
        label || 'Sub Wallet',
        mcpWallet.apiKeyId,
        color || '#8b5cf6'
      );

      if (!subWallet) {
        res.status(500).json({
          success: false,
          error: 'Failed to save sub-wallet to database',
        });
        return;
      }

      res.json({
        success: true,
        wallet: {
          id: subWallet.id,
          publicKey: subWallet.public_key,
          label: subWallet.label,
          color: subWallet.color,
          type: 'sub',
          masterWalletId: subWallet.master_wallet_id,
        },
      });
    }
  } catch (error) {
    console.error('[Wallets] Create error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create wallet',
    });
  }
});

/**
 * GET /api/wallets
 * List all wallets for a session
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const sessionToken = req.headers['x-session-token'] as string;

    if (!sessionToken) {
      res.status(401).json({
        success: false,
        error: 'Session token required',
      });
      return;
    }

    const session = await getSessionByToken(sessionToken);
    if (!session) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
      });
      return;
    }

    const masterWallet = await getMasterWalletById(session.master_wallet_id);
    if (!masterWallet) {
      res.status(404).json({
        success: false,
        error: 'Master wallet not found',
      });
      return;
    }

    const subWallets = await getSubWallets(session.master_wallet_id);

    res.json({
      success: true,
      master: {
        id: masterWallet.id,
        publicKey: masterWallet.public_key,
        label: masterWallet.label,
        type: 'master',
      },
      subWallets: subWallets.map(sw => ({
        id: sw.id,
        publicKey: sw.public_key,
        label: sw.label,
        color: sw.color,
        type: 'sub',
      })),
    });
  } catch (error) {
    console.error('[Wallets] List error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list wallets',
    });
  }
});

/**
 * GET /api/wallets/:pk/balances
 * Get SOL and USDC balances for a wallet
 */
router.get('/:pk/balances', async (req: Request, res: Response) => {
  try {
    const { pk } = req.params;

    // Verify wallet exists in our database
    const walletInfo = await getWalletByPublicKey(pk);
    if (!walletInfo) {
      res.status(404).json({
        success: false,
        error: 'Wallet not found',
      });
      return;
    }

    // Get balances from MCP
    // Note: This gets balances for the default MCP wallet
    // In a full implementation, we'd need per-wallet API keys
    const balances = await getBalances();

    if (!balances) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch balances',
      });
      return;
    }

    res.json({
      success: true,
      publicKey: pk,
      balances: {
        sol: balances.sol,
        usdc: balances.usdc,
      },
    });
  } catch (error) {
    console.error('[Wallets] Balances error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get balances',
    });
  }
});

/**
 * GET /api/wallets/:pk/holdings
 * Get token holdings for a wallet
 */
router.get('/:pk/holdings', async (req: Request, res: Response) => {
  try {
    const { pk } = req.params;

    // Verify wallet exists
    const walletInfo = await getWalletByPublicKey(pk);
    if (!walletInfo) {
      res.status(404).json({
        success: false,
        error: 'Wallet not found',
      });
      return;
    }

    // Get token holdings from MCP
    const holdings = await getTokenHoldings();

    res.json({
      success: true,
      publicKey: pk,
      holdings,
    });
  } catch (error) {
    console.error('[Wallets] Holdings error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get holdings',
    });
  }
});

/**
 * POST /api/wallets/transfer
 * Transfer funds between wallets
 */
router.post('/transfer', async (req: Request, res: Response) => {
  try {
    const { from, to, token, amount } = req.body;

    if (!from || !to || !token || !amount) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: from, to, token, amount',
      });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid amount',
      });
      return;
    }

    // Verify source wallet exists
    const fromWallet = await getWalletByPublicKey(from);
    if (!fromWallet) {
      res.status(404).json({
        success: false,
        error: 'Source wallet not found',
      });
      return;
    }

    // Execute transfer based on token type
    let result;
    if (token === 'SOL') {
      result = await sendSol(to, parsedAmount);
    } else if (token === 'USDC') {
      result = await sendUsdc(to, parsedAmount);
    } else {
      // Assume it's a token mint address
      result = await sendToken(to, token, parsedAmount, 6);
    }

    if (!result.success) {
      res.status(500).json({
        success: false,
        error: result.error || 'Transfer failed',
      });
      return;
    }

    res.json({
      success: true,
      txSignature: result.txSignature,
      from,
      to,
      token,
      amount: parsedAmount,
    });
  } catch (error) {
    console.error('[Wallets] Transfer error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Transfer failed',
    });
  }
});

/**
 * POST /api/wallets/swap
 * Swap SOL <-> USDC
 */
router.post('/swap', async (req: Request, res: Response) => {
  try {
    const { from, to, amount, slippageBps } = req.body;

    if (!from || !to || !amount) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: from, to, amount',
      });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid amount',
      });
      return;
    }

    let result;
    if (from === 'SOL' && to === 'USDC') {
      result = await swapSolToUsdc(parsedAmount, slippageBps || 50);
    } else if (from === 'USDC' && to === 'SOL') {
      result = await swapUsdcToSol(parsedAmount, slippageBps || 50);
    } else {
      res.status(400).json({
        success: false,
        error: 'Only SOL <-> USDC swaps supported',
      });
      return;
    }

    if (!result.success) {
      res.status(500).json({
        success: false,
        error: result.error || 'Swap failed',
      });
      return;
    }

    res.json({
      success: true,
      txSignature: result.txSignature,
      from,
      to,
      amount: parsedAmount,
    });
  } catch (error) {
    console.error('[Wallets] Swap error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Swap failed',
    });
  }
});

/**
 * DELETE /api/wallets/:id
 * Remove a sub-wallet from tracking
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sessionToken = req.headers['x-session-token'] as string;

    if (!sessionToken) {
      res.status(401).json({
        success: false,
        error: 'Session token required',
      });
      return;
    }

    const session = await getSessionByToken(sessionToken);
    if (!session) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
      });
      return;
    }

    // Verify sub-wallet belongs to this master
    const subWallet = await getSubWalletById(id);
    if (!subWallet || subWallet.master_wallet_id !== session.master_wallet_id) {
      res.status(404).json({
        success: false,
        error: 'Sub-wallet not found',
      });
      return;
    }

    const deleted = await deleteSubWallet(id);
    if (!deleted) {
      res.status(500).json({
        success: false,
        error: 'Failed to delete sub-wallet',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Sub-wallet removed',
    });
  } catch (error) {
    console.error('[Wallets] Delete error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete wallet',
    });
  }
});

/**
 * POST /api/wallets/session/validate
 * Validate a session token and return wallet info
 */
router.post('/session/validate', async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      res.status(400).json({
        success: false,
        error: 'Session token required',
      });
      return;
    }

    const session = await getSessionByToken(sessionToken);
    if (!session) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
      });
      return;
    }

    const masterWallet = await getMasterWalletById(session.master_wallet_id);
    if (!masterWallet) {
      res.status(404).json({
        success: false,
        error: 'Master wallet not found',
      });
      return;
    }

    const subWallets = await getSubWallets(session.master_wallet_id);

    res.json({
      success: true,
      session: {
        expiresAt: session.expires_at,
      },
      master: {
        id: masterWallet.id,
        publicKey: masterWallet.public_key,
        label: masterWallet.label,
        type: 'master',
      },
      subWallets: subWallets.map(sw => ({
        id: sw.id,
        publicKey: sw.public_key,
        label: sw.label,
        color: sw.color,
        type: 'sub',
      })),
    });
  } catch (error) {
    console.error('[Wallets] Session validate error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Session validation failed',
    });
  }
});

export default router;
