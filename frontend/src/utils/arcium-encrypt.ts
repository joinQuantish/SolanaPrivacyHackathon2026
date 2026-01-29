/**
 * Arcium Client-Side Encryption
 *
 * This module handles encrypting orders client-side before sending to the relay.
 * The relay CANNOT decrypt these orders - only the Arcium MPC can.
 *
 * Flow:
 * 1. User creates order with amount, market, side
 * 2. Client encrypts with MXE public key using x25519 + Rescue cipher
 * 3. Client sends encrypted blob to relay
 * 4. Relay stores encrypted data (cannot read it)
 * 5. MPC decrypts inside secure enclave
 */

import { x25519 } from '@noble/curves/ed25519.js';

// Arcium MXE public key for devnet cluster 123
// Extracted from MXE account CUx5EJ6PtgWTHfiqmYbMgeDepaiqj1xu3Y2C6Q11Nqkb
// This key is public - anyone can encrypt data for the MXE
const MXE_PUBLIC_KEY_DEVNET = new Uint8Array([
  0x55, 0x91, 0x2e, 0xe0, 0x36, 0x7b, 0xbb, 0xf2,
  0x0e, 0xb4, 0x97, 0xb7, 0xb1, 0x68, 0x01, 0x36,
  0x7c, 0x18, 0xc3, 0xb1, 0x07, 0x10, 0xff, 0x37,
  0x71, 0xe5, 0x55, 0x1f, 0x8b, 0xc9, 0x5b, 0xaa,
]);

/**
 * Order data before encryption
 */
export interface OrderData {
  /** Market ID (e.g., "KXBTC-26JAN15-100000") */
  marketId: string;
  /** Side: 'YES' or 'NO' */
  side: 'YES' | 'NO';
  /** USDC amount (e.g., 10.00 for $10) */
  usdcAmount: number;
  /** User's Solana wallet address for receiving shares */
  destinationWallet: string;
}

/**
 * Encrypted order to send to relay
 */
export interface EncryptedOrder {
  /** Encrypted order data */
  ciphertext: string; // base64
  /** Ephemeral public key for decryption */
  ephemeralPubkey: string; // base64
  /** Nonce used for encryption */
  nonce: string; // base64
  /** Market ID (plaintext - relay needs this for batching) */
  marketId: string;
  /** Side (plaintext - relay needs this for batching) */
  side: 'YES' | 'NO';
}

/**
 * Simple XOR cipher for demonstration
 * In production, use Arcium's Rescue cipher from @arcium-hq/client
 */
function xorCipher(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

/**
 * Compute Poseidon hash of a string (simplified)
 * In production, use the same Poseidon implementation as the MPC circuit
 */
function hashString(str: string): bigint {
  // Simple hash for demonstration - replace with real Poseidon
  let hash = 0n;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31n + BigInt(str.charCodeAt(i))) % (2n ** 128n);
  }
  return hash;
}

/**
 * Convert a Solana address to two u128 values
 */
function addressToU128Pair(address: string): { lo: bigint; hi: bigint } {
  // Decode base58 address to bytes
  const bytes = decodeBase58(address);

  // Split into two 16-byte chunks
  const lo = bytesToBigInt(bytes.slice(0, 16));
  const hi = bytesToBigInt(bytes.slice(16, 32));

  return { lo, hi };
}

/**
 * Simple base58 decoder
 */
function decodeBase58(str: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const BASE = 58n;

  let result = 0n;
  for (const char of str) {
    result = result * BASE + BigInt(ALPHABET.indexOf(char));
  }

  const bytes = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(result & 0xffn);
    result = result >> 8n;
  }

  return bytes;
}

/**
 * Convert bytes to bigint
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/**
 * Convert bigint to bytes
 */
function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(value & 0xffn);
    value = value >> 8n;
  }
  return bytes;
}

/**
 * Generate a random salt
 */
function generateSalt(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return bytesToBigInt(bytes);
}

/**
 * Encrypt an order for submission to the relay.
 *
 * The relay receives:
 * - marketId (plaintext) - for batching
 * - side (plaintext) - for batching
 * - ciphertext (encrypted) - relay CANNOT read this
 * - ephemeralPubkey - for MPC decryption
 * - nonce - for MPC decryption
 *
 * The relay CANNOT see:
 * - usdcAmount
 * - destinationWallet
 * - salt
 */
export async function encryptOrder(
  order: OrderData,
  mxePublicKey: Uint8Array = MXE_PUBLIC_KEY_DEVNET
): Promise<EncryptedOrder> {
  // Generate ephemeral key pair
  const ephemeralPrivateKey = x25519.utils.randomSecretKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivateKey);

  // Derive shared secret via ECDH
  const sharedSecret = x25519.getSharedSecret(ephemeralPrivateKey, mxePublicKey);

  // Generate random nonce
  const nonce = crypto.getRandomValues(new Uint8Array(16));

  // Prepare plaintext fields
  const marketIdHash = hashString(order.marketId);
  const sideValue = order.side === 'YES' ? 1n : 0n;
  const usdcAmountAtomic = BigInt(Math.floor(order.usdcAmount * 1_000_000)); // 6 decimals
  const distributionHash = 0n; // Simplified - in production, hash the distribution plan
  const salt = generateSalt();
  const wallet = addressToU128Pair(order.destinationWallet);

  // Pack plaintext into bytes
  // Format: marketIdHash(16) + side(1) + usdcAmount(8) + distributionHash(16) + salt(8) + walletLo(16) + walletHi(16)
  const plaintext = new Uint8Array(16 + 1 + 8 + 16 + 8 + 16 + 16);
  let offset = 0;

  // marketIdHash (128 bits = 16 bytes)
  plaintext.set(bigIntToBytes(marketIdHash, 16), offset);
  offset += 16;

  // side (1 byte)
  plaintext[offset] = Number(sideValue);
  offset += 1;

  // usdcAmount (64 bits = 8 bytes)
  plaintext.set(bigIntToBytes(usdcAmountAtomic, 8), offset);
  offset += 8;

  // distributionHash (128 bits = 16 bytes)
  plaintext.set(bigIntToBytes(distributionHash, 16), offset);
  offset += 16;

  // salt (64 bits = 8 bytes)
  plaintext.set(bigIntToBytes(salt, 8), offset);
  offset += 8;

  // walletLo (128 bits = 16 bytes)
  plaintext.set(bigIntToBytes(wallet.lo, 16), offset);
  offset += 16;

  // walletHi (128 bits = 16 bytes)
  plaintext.set(bigIntToBytes(wallet.hi, 16), offset);

  // Encrypt using XOR cipher with shared secret + nonce
  // In production, use Arcium's Rescue cipher
  const keyMaterial = new Uint8Array([...sharedSecret, ...nonce]);
  const ciphertext = xorCipher(plaintext, keyMaterial);

  return {
    ciphertext: uint8ArrayToBase64(ciphertext),
    ephemeralPubkey: uint8ArrayToBase64(ephemeralPublicKey),
    nonce: uint8ArrayToBase64(nonce),
    marketId: order.marketId,
    side: order.side,
  };
}

/**
 * Convert Uint8Array to base64
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Convert base64 to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
}

/**
 * Verify the MXE public key is set correctly
 */
export function isMxeKeyConfigured(): boolean {
  return !MXE_PUBLIC_KEY_DEVNET.every(b => b === 0);
}

/**
 * Set the MXE public key (call this after fetching from Arcium)
 */
export function setMxePublicKey(key: Uint8Array | string): void {
  const keyBytes = typeof key === 'string' ? base64ToUint8Array(key) : key;
  if (keyBytes.length !== 32) {
    throw new Error('MXE public key must be 32 bytes');
  }
  MXE_PUBLIC_KEY_DEVNET.set(keyBytes);
}

/**
 * Get the current MXE public key
 */
export function getMxePublicKey(): Uint8Array {
  return MXE_PUBLIC_KEY_DEVNET;
}
