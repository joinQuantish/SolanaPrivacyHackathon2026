import { Router, Request, Response } from 'express';
import type { ProveRequest, ProveResponse } from '../types/index.js';
import { generateProof } from '../services/prover.js';

export const proveRouter = Router();

proveRouter.post('/', async (req: Request, res: Response) => {
  try {
    const request = req.body as ProveRequest;

    // Validate request
    if (!request.batchId || !request.commitments || !request.allocations) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: batchId, commitments, allocations',
      } as ProveResponse);
      return;
    }

    if (request.commitments.length !== request.allocations.length) {
      res.status(400).json({
        success: false,
        error: 'Commitments and allocations arrays must have same length',
      } as ProveResponse);
      return;
    }

    if (request.commitments.length > 32) {
      res.status(400).json({
        success: false,
        error: 'Maximum batch size is 32 orders',
      } as ProveResponse);
      return;
    }

    // Generate proof
    const result = await generateProof(request);
    res.json(result);
  } catch (error) {
    console.error('Prove error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } as ProveResponse);
  }
});
