import { Buffer } from 'buffer';

// BN254 field prime (used by Noir/Barretenberg)
const BN254_PRIME = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
);

/**
 * Convert a hex string to a field element string
 */
export function hexToField(hex: string): string {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  const value = BigInt('0x' + cleaned);
  return (value % BN254_PRIME).toString();
}

/**
 * Convert a Solana pubkey (base58) to a field element string
 * For simplicity, we hash the pubkey bytes to fit in the field
 */
export function pubkeyToField(pubkey: string): string {
  // Base58 decode - simplified for common Solana pubkey format
  // In production, use @solana/web3.js PublicKey
  const bytes = base58Decode(pubkey);

  // Take first 31 bytes to ensure we fit in field (< 2^248)
  const truncated = bytes.slice(0, 31);
  let value = BigInt(0);
  for (const byte of truncated) {
    value = (value << 8n) | BigInt(byte);
  }

  return value.toString();
}

/**
 * Convert a decimal string to a field element
 */
export function decimalToField(decimal: string): string {
  const value = BigInt(decimal);
  if (value < 0n) {
    throw new Error('Negative values not supported');
  }
  return (value % BN254_PRIME).toString();
}

/**
 * Convert USDC amount (with 6 decimals) to integer field
 */
export function usdcToField(amount: number | string): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  const intValue = BigInt(Math.floor(value * 1e6));
  return intValue.toString();
}

/**
 * Convert side enum to field (0 = NO, 1 = YES)
 */
export function sideToField(side: 'YES' | 'NO'): string {
  return side === 'YES' ? '1' : '0';
}

/**
 * Pad array to fixed length with zero values
 */
export function padArray<T>(arr: T[], length: number, defaultValue: T): T[] {
  const result = [...arr];
  while (result.length < length) {
    result.push(defaultValue);
  }
  return result;
}

/**
 * Simple base58 decoder for Solana pubkeys
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(str: string): Uint8Array {
  const bytes: number[] = [];

  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid base58 character: ${char}`);
    }

    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Handle leading zeros
  for (const char of str) {
    if (char !== '1') break;
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

/**
 * Convert field element to hex string (for proofs)
 */
export function fieldToHex(field: string, byteLength: number = 32): string {
  const value = BigInt(field);
  const hex = value.toString(16).padStart(byteLength * 2, '0');
  return '0x' + hex;
}
