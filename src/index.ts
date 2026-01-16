import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { proveRouter } from './routes/prove.js';
import { verifyRouter } from './routes/verify.js';
import { poseidonRouter } from './routes/poseidon.js';
import relayRouter from './routes/relay.js';
import walletsRouter from './routes/wallets.js';
import marketsRouter from './routes/markets.js';
import privacyRouter from './routes/privacy.js';
import { getRelayWallet } from './services/wallet.js';
import { startDepositMonitor } from './services/deposit-monitor.js';
import { initDatabase } from './services/database.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Root health check (for relay compatibility)
app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'obsidian-prover',
    timestamp: new Date().toISOString(),
  });
});

// Poseidon hashing API (for relay)
app.use(poseidonRouter);

// ZK Proof API
app.use('/prove', proveRouter);
app.use('/verify', verifyRouter);

// Full Relay API (order collection, execution, distribution)
app.use('/relay', relayRouter);

// Wallet Management API (for frontend)
app.use('/api/wallets', walletsRouter);

// Markets & Trading API (for frontend)
app.use('/api/markets', marketsRouter);

// Privacy Cash API (for unlinkable deposits)
app.use('/api/privacy', privacyRouter);

// Error handling
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
);

// Start server
app.listen(PORT, async () => {
  console.log(`Obsidian Prover service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  // Initialize database
  await initDatabase();

  // Start deposit monitor if RPC URL is configured
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (rpcUrl) {
    console.log('Starting deposit monitor...');
    startDepositMonitor(rpcUrl).catch(err => {
      console.error('Failed to start deposit monitor:', err);
    });
  } else {
    console.log('SOLANA_RPC_URL not set - deposit monitoring disabled');
  }
});
