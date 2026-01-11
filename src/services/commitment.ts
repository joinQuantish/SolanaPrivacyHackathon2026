import type { OrderCommitment } from '../types/index.js';
import { pubkeyToField, sideToField, decimalToField, hexToField } from '../utils/field.js';

/**
 * Compute commitment hash using Poseidon
 * Hash = Poseidon(marketId, side, usdcAmount, destinationWallet, salt)
 */
export async function computeCommitmentHash(
  commitment: OrderCommitment,
  poseidonHash5: (inputs: string[]) => Promise<string>
): Promise<string> {
  const inputs = [
    decimalToField(commitment.marketId),
    sideToField(commitment.side),
    decimalToField(commitment.usdcAmount),
    pubkeyToField(commitment.destinationWallet),
    hexToField(commitment.salt),
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
    market_id: decimalToField(commitment.marketId),
    side: sideToField(commitment.side),
    usdc_amount: decimalToField(commitment.usdcAmount),
    destination_wallet: pubkeyToField(commitment.destinationWallet),
    salt: hexToField(commitment.salt),
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
