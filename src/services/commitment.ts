import type { OrderCommitment, DistributionEntry } from '../types/index.js';
import { pubkeyToField, sideToField, decimalToField, hexToField, marketIdToField, stringToField } from '../utils/field.js';

/**
 * Compute hash of a distribution array
 * Each entry is hashed as Poseidon(wallet, percentage), then all hashes are combined
 */
export async function computeDistributionHash(
  distribution: DistributionEntry[],
  poseidonHash2: (inputs: string[]) => Promise<string>,
  poseidonHashN: (inputs: string[]) => Promise<string>
): Promise<string> {
  if (!distribution || distribution.length === 0) {
    return '0'; // Empty distribution = zero hash
  }

  // Hash each entry: H(wallet, percentage)
  const entryHashes: string[] = [];
  for (const entry of distribution) {
    const hash = await poseidonHash2([
      pubkeyToField(entry.wallet),
      entry.percentage.toString(),
    ]);
    entryHashes.push(hash);
  }

  // Pad to 10 entries with zeros for consistent hashing
  while (entryHashes.length < 10) {
    entryHashes.push('0');
  }

  // Hash all entry hashes together
  return poseidonHashN(entryHashes);
}

/**
 * Compute commitment hash using Poseidon
 * Hash = Poseidon(marketId, side, usdcAmount, distributionHash, salt)
 *
 * The distributionHash commits to how shares will be distributed across wallets.
 * For backwards compatibility, if no distribution is provided, we use destinationWallet directly.
 */
export async function computeCommitmentHash(
  commitment: OrderCommitment,
  poseidonHash5: (inputs: string[]) => Promise<string>,
  poseidonHash2?: (inputs: string[]) => Promise<string>,
  poseidonHashN?: (inputs: string[]) => Promise<string>
): Promise<string> {
  let distributionField: string;

  // If distribution is provided and we have the hash functions, use distribution hash
  if (commitment.distribution && commitment.distribution.length > 0 && poseidonHash2 && poseidonHashN) {
    distributionField = await computeDistributionHash(commitment.distribution, poseidonHash2, poseidonHashN);
  } else {
    // Fallback to single destination wallet (backwards compatible)
    distributionField = pubkeyToField(commitment.destinationWallet);
  }

  const inputs = [
    marketIdToField(commitment.marketId),
    sideToField(commitment.side),
    decimalToField(commitment.usdcAmount),
    distributionField,
    stringToField(commitment.salt), // Salt can be any string now
  ];

  return poseidonHash5(inputs);
}

/**
 * Convert OrderCommitment to circuit format
 */
export function commitmentToCircuitFormat(commitment: OrderCommitment): {
  market_id: string;
  side: string;
  usdc_amount: string;
  destination_wallet: string;
  salt: string;
} {
  return {
    market_id: marketIdToField(commitment.marketId),
    side: sideToField(commitment.side),
    usdc_amount: decimalToField(commitment.usdcAmount),
    destination_wallet: pubkeyToField(commitment.destinationWallet),
    salt: stringToField(commitment.salt),
  };
}

/**
 * Create a zero commitment for padding
 */
export function zeroCommitment(): {
  market_id: string;
  side: string;
  usdc_amount: string;
  destination_wallet: string;
  salt: string;
} {
  return {
    market_id: '0',
    side: '0',
    usdc_amount: '0',
    destination_wallet: '0',
    salt: '0',
  };
}

/**
 * Verify that a commitment hash matches the expected value
 */
export async function verifyCommitment(
  commitment: OrderCommitment,
  expectedHash: string,
  poseidonHash5: (inputs: string[]) => Promise<string>
): Promise<boolean> {
  const computedHash = await computeCommitmentHash(commitment, poseidonHash5);
  return computedHash === expectedHash;
}
