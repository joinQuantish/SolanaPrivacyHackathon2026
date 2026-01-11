import { Router, Request, Response } from 'express';
import { poseidonHash2, poseidonHash5 } from '../services/poseidon.js';
import { buildMerkleTree, getMerkleProof } from '../services/merkle.js';

export const poseidonRouter = Router();

// POST /hash2 - Hash two field elements
poseidonRouter.post('/hash2', async (req: Request, res: Response) => {
  try {
    const { left, right } = req.body;

    if (!left || !right) {
      res.status(400).json({ error: 'Missing required fields: left, right' });
      return;
    }

    const hash = await poseidonHash2(left.toString(), right.toString());
    res.json({ hash });
  } catch (error) {
    console.error('hash2 error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Hash failed',
    });
  }
});

// POST /hashMany - Hash multiple field elements (5 for commitments)
poseidonRouter.post('/hashMany', async (req: Request, res: Response) => {
  try {
    const { inputs } = req.body;

    if (!inputs || !Array.isArray(inputs)) {
      res.status(400).json({ error: 'Missing required field: inputs (array)' });
      return;
    }

    if (inputs.length !== 5) {
      res.status(400).json({ error: 'inputs must have exactly 5 elements' });
      return;
    }

    const hash = await poseidonHash5(inputs.map((i: unknown) => String(i)));
    res.json({ hash });
  } catch (error) {
    console.error('hashMany error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Hash failed',
    });
  }
});

// POST /merkleRoot - Compute Poseidon Merkle root
poseidonRouter.post('/merkleRoot', async (req: Request, res: Response) => {
  try {
    const { leaves } = req.body;

    if (!leaves || !Array.isArray(leaves)) {
      res.status(400).json({ error: 'Missing required field: leaves (array)' });
      return;
    }

    const tree = await buildMerkleTree(
      leaves.map((l: unknown) => String(l)),
      poseidonHash2
    );

    res.json({ root: tree.root });
  } catch (error) {
    console.error('merkleRoot error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Merkle root failed',
    });
  }
});

// POST /merkleProof - Generate inclusion proof
poseidonRouter.post('/merkleProof', async (req: Request, res: Response) => {
  try {
    const { leaves, index } = req.body;

    if (!leaves || !Array.isArray(leaves)) {
      res.status(400).json({ error: 'Missing required field: leaves (array)' });
      return;
    }

    if (index === undefined || typeof index !== 'number') {
      res.status(400).json({ error: 'Missing required field: index (number)' });
      return;
    }

    if (index < 0 || index >= leaves.length) {
      res.status(400).json({ error: 'index out of bounds' });
      return;
    }

    const tree = await buildMerkleTree(
      leaves.map((l: unknown) => String(l)),
      poseidonHash2
    );

    const proof = getMerkleProof(tree, index);

    res.json({
      siblings: proof.path,
      pathIndices: proof.indices,
    });
  } catch (error) {
    console.error('merkleProof error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Merkle proof failed',
    });
  }
});
