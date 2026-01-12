import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getMint,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// USDC mint on Solana mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Default RPC endpoint (can be overridden via env)
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export interface WalletInfo {
  publicKey: string;
  solBalance: number;
  usdcBalance: number;
}

export interface TransferResult {
  success: boolean;
  signature?: string;
  error?: string;
}

/**
 * Relay Wallet Service
 * Manages the Solana wallet for collecting funds and distributing shares
 */
export class RelayWallet {
  private keypair: Keypair;
  private connection: Connection;

  constructor(keypair: Keypair, rpcEndpoint?: string) {
    this.keypair = keypair;
    this.connection = new Connection(rpcEndpoint || RPC_ENDPOINT, 'confirmed');
  }

  /**
   * Create a new wallet or load from environment/file
   * Priority: RELAY_WALLET_PRIVATE_KEY env var > file > generate new
   */
  static async initialize(walletPath?: string): Promise<RelayWallet> {
    const path = walletPath || join(__dirname, '../../.wallet/relay-keypair.json');

    let keypair: Keypair;

    // Priority 1: Load from environment variable (for Railway persistence)
    const envPrivateKey = process.env.RELAY_WALLET_PRIVATE_KEY;
    if (envPrivateKey) {
      console.log('Loading relay wallet from RELAY_WALLET_PRIVATE_KEY env var...');
      try {
        const secretKey = bs58.decode(envPrivateKey);
        keypair = Keypair.fromSecretKey(secretKey);
        console.log('Relay wallet public key:', keypair.publicKey.toBase58());
        return new RelayWallet(keypair);
      } catch (err) {
        console.error('Invalid RELAY_WALLET_PRIVATE_KEY, falling back to file/generate');
      }
    }

    // Priority 2: Load from file
    if (existsSync(path)) {
      console.log('Loading existing relay wallet from file...');
      const secretKey = JSON.parse(await readFile(path, 'utf-8'));
      keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
    } else {
      // Priority 3: Generate new wallet
      console.log('Generating new relay wallet...');
      keypair = Keypair.generate();

      // Ensure directory exists
      const dir = dirname(path);
      const { mkdir } = await import('fs/promises');
      await mkdir(dir, { recursive: true });

      // Save keypair (in production, use RELAY_WALLET_PRIVATE_KEY env var!)
      await writeFile(path, JSON.stringify(Array.from(keypair.secretKey)));
      console.log('New wallet saved to:', path);
      console.log('');
      console.log('=== IMPORTANT: To persist this wallet across deploys ===');
      console.log('Set RELAY_WALLET_PRIVATE_KEY environment variable to:');
      console.log(bs58.encode(keypair.secretKey));
      console.log('========================================================');
      console.log('');
    }

    console.log('Relay wallet public key:', keypair.publicKey.toBase58());
    return new RelayWallet(keypair);
  }

  /**
   * Import wallet from private key
   */
  static fromPrivateKey(privateKey: string): RelayWallet {
    const secretKey = bs58.decode(privateKey);
    const keypair = Keypair.fromSecretKey(secretKey);
    return new RelayWallet(keypair);
  }

  /**
   * Get wallet public key
   */
  getPublicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  /**
   * Get wallet public key as string
   */
  getAddress(): string {
    return this.keypair.publicKey.toBase58();
  }

  /**
   * Get wallet info including balances
   */
  async getInfo(): Promise<WalletInfo> {
    const solBalance = await this.connection.getBalance(this.keypair.publicKey);

    let usdcBalance = 0;
    try {
      const usdcAta = await getAssociatedTokenAddress(USDC_MINT, this.keypair.publicKey);
      const account = await getAccount(this.connection, usdcAta);
      usdcBalance = Number(account.amount) / 1e6; // USDC has 6 decimals
    } catch {
      // No USDC account yet
    }

    return {
      publicKey: this.keypair.publicKey.toBase58(),
      solBalance: solBalance / LAMPORTS_PER_SOL,
      usdcBalance,
    };
  }

  /**
   * Transfer USDC to a recipient
   */
  async transferUsdc(recipient: string, amount: number): Promise<TransferResult> {
    try {
      const recipientPubkey = new PublicKey(recipient);
      const amountInSmallestUnit = BigInt(Math.floor(amount * 1e6));

      // Get ATAs
      const senderAta = await getAssociatedTokenAddress(USDC_MINT, this.keypair.publicKey);
      const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipientPubkey);

      // Create transfer instruction
      const transferIx = createTransferInstruction(
        senderAta,
        recipientAta,
        this.keypair.publicKey,
        amountInSmallestUnit,
        [],
        TOKEN_PROGRAM_ID
      );

      // Build and send transaction
      const transaction = new Transaction().add(transferIx);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.keypair]
      );

      return { success: true, signature };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transfer failed',
      };
    }
  }

  /**
   * Transfer SPL token (for share distribution)
   * Supports both regular SPL tokens and Token-2022 (prediction market tokens)
   */
  async transferToken(
    tokenMint: string,
    recipient: string,
    amount: number,
    decimals: number = 6
  ): Promise<TransferResult> {
    try {
      const mintPubkey = new PublicKey(tokenMint);
      const recipientPubkey = new PublicKey(recipient);
      const amountInSmallestUnit = BigInt(Math.floor(amount * Math.pow(10, decimals)));

      // Detect if this is Token-2022 or regular SPL token
      let programId = TOKEN_PROGRAM_ID;
      try {
        // Try to get mint info - will throw if using wrong program
        await getMint(this.connection, mintPubkey, 'confirmed', TOKEN_PROGRAM_ID);
      } catch {
        // Try Token-2022
        try {
          await getMint(this.connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
          programId = TOKEN_2022_PROGRAM_ID;
          console.log(`Using Token-2022 program for mint ${tokenMint}`);
        } catch {
          throw new Error(`Could not find mint ${tokenMint} on either token program`);
        }
      }

      // Get ATAs with correct program
      const senderAta = await getAssociatedTokenAddress(
        mintPubkey,
        this.keypair.publicKey,
        false,
        programId
      );
      const recipientAta = await getAssociatedTokenAddress(
        mintPubkey,
        recipientPubkey,
        false,
        programId
      );

      const transaction = new Transaction();

      // Check if recipient ATA exists, create if needed
      try {
        await getAccount(this.connection, recipientAta, 'confirmed', programId);
      } catch {
        console.log(`Creating ATA for recipient ${recipient}`);
        const createAtaIx = createAssociatedTokenAccountInstruction(
          this.keypair.publicKey,
          recipientAta,
          recipientPubkey,
          mintPubkey,
          programId
        );
        transaction.add(createAtaIx);
      }

      // Create transfer instruction
      const transferIx = createTransferInstruction(
        senderAta,
        recipientAta,
        this.keypair.publicKey,
        amountInSmallestUnit,
        [],
        programId
      );
      transaction.add(transferIx);

      // Build and send transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.keypair]
      );

      return { success: true, signature };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transfer failed',
      };
    }
  }

  /**
   * Sign a legacy transaction (for DFlow integration)
   */
  signTransaction(transaction: Transaction): Transaction {
    transaction.sign(this.keypair);
    return transaction;
  }

  /**
   * Sign a versioned transaction
   */
  signVersionedTransaction(transaction: VersionedTransaction): VersionedTransaction {
    transaction.sign([this.keypair]);
    return transaction;
  }

  /**
   * Get keypair for direct signing (use with caution)
   */
  getKeypair(): Keypair {
    return this.keypair;
  }

  /**
   * Get connection for external use
   */
  getConnection(): Connection {
    return this.connection;
  }
}

// Singleton instance
let walletInstance: RelayWallet | null = null;

/**
 * Get or create the relay wallet instance
 */
export async function getRelayWallet(): Promise<RelayWallet> {
  if (!walletInstance) {
    walletInstance = await RelayWallet.initialize();
  }
  return walletInstance;
}

/**
 * Check if wallet is initialized
 */
export function isWalletInitialized(): boolean {
  return walletInstance !== null;
}
