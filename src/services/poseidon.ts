import { poseidon2, poseidon5 } from 'poseidon-lite';

/**
 * Poseidon hash for 2 inputs (used in Merkle tree)
 * Compatible with Noir's poseidon::bn254::hash_2
 */
export async function poseidonHash2(a: string, b: string): Promise<string> {
  const result = poseidon2([BigInt(a), BigInt(b)]);
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
