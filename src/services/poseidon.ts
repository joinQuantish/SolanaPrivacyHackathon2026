import { poseidon2, poseidon5 } from 'poseidon-lite';

/**
 * Poseidon hash for 2 inputs (used in Merkle tree)
 * Compatible with Noir's poseidon::bn254::hash_2
 * Can be called with two separate args or an array of two strings
 */
export async function poseidonHash2(a: string | string[], b?: string): Promise<string> {
  let inputs: bigint[];
  if (Array.isArray(a)) {
    if (a.length !== 2) {
      throw new Error(`poseidonHash2 requires exactly 2 inputs, got ${a.length}`);
    }
    inputs = a.map(BigInt);
  } else {
    if (b === undefined) {
      throw new Error('poseidonHash2 requires two inputs');
    }
    inputs = [BigInt(a), BigInt(b)];
  }
  const result = poseidon2(inputs);
  return result.toString();
}

/**
 * Poseidon hash for 5 inputs (used in commitment)
 * Compatible with Noir's poseidon::bn254::hash_5
 */
export async function poseidonHash5(inputs: string[]): Promise<string> {
  if (inputs.length !== 5) {
    throw new Error(`poseidonHash5 requires exactly 5 inputs, got ${inputs.length}`);
  }
  const result = poseidon5(inputs.map(BigInt));
  return result.toString();
}

/**
 * Poseidon hash for N inputs (used in distribution hash)
 * Uses a Merkle-like approach for inputs > 5
 */
export async function poseidonHashN(inputs: string[]): Promise<string> {
  if (inputs.length === 0) {
    return '0';
  }

  if (inputs.length === 1) {
    return inputs[0];
  }

  if (inputs.length === 2) {
    return poseidonHash2(inputs);
  }

  if (inputs.length <= 5) {
    // Pad to 5 and hash directly
    const padded = [...inputs];
    while (padded.length < 5) {
      padded.push('0');
    }
    return poseidonHash5(padded);
  }

  // For > 5 inputs, use a two-level approach:
  // Split into chunks of 5, hash each chunk, then hash the results
  const chunkSize = 5;
  const chunks: string[][] = [];

  for (let i = 0; i < inputs.length; i += chunkSize) {
    chunks.push(inputs.slice(i, i + chunkSize));
  }

  // Hash each chunk
  const chunkHashes: string[] = [];
  for (const chunk of chunks) {
    // Pad chunk to 5 if needed
    const padded = [...chunk];
    while (padded.length < 5) {
      padded.push('0');
    }
    const hash = await poseidonHash5(padded);
    chunkHashes.push(hash);
  }

  // Recursively hash the chunk hashes
  return poseidonHashN(chunkHashes);
}
