import { Router, Request, Response } from 'express';
import type { VerifyRequest, VerifyResponse } from '../types/index.js';
import { verifyProof } from '../services/prover.js';

export const verifyRouter = Router();

verifyRouter.post('/', async (req: Request, res: Response) => {
  try {
    const request = req.body as VerifyRequest;

    // Validate request
    if (!request.proof || !request.publicInputs) {
      res.status(400).json({
        valid: false,
        error: 'Missing required fields: proof, publicInputs',
      } as VerifyResponse);
      return;
    }

    // Verify proof
    const result = await verifyProof(request.proof, request.publicInputs);
    res.json(result);
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } as VerifyResponse);
  }
});
