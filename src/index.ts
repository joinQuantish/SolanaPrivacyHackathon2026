import express from 'express';
import { proveRouter } from './routes/prove.js';
import { verifyRouter } from './routes/verify.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'obsidian-prover',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/prove', proveRouter);
app.use('/verify', verifyRouter);

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
app.listen(PORT, () => {
  console.log(`Obsidian Prover service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
