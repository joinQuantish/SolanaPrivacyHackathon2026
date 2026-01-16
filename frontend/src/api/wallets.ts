import { get, post, del } from './client';
import type { Wallet, WalletBalances, TokenHolding } from '../types/wallet';

interface WalletsListResponse {
  success: boolean;
  master: Wallet;
  subWallets: Wallet[];
}

interface CreateWalletResponse {
  success: boolean;
  wallet: Wallet;
  sessionToken?: string;
}

interface BalancesResponse {
  success: boolean;
  publicKey: string;
  balances: WalletBalances;
}

interface HoldingsResponse {
  success: boolean;
  publicKey: string;
  holdings: TokenHolding[];
}

interface TransferResponse {
  success: boolean;
  txSignature: string;
  from: string;
  to: string;
  token: string;
  amount: number;
}

interface SessionValidateResponse {
  success: boolean;
  session: {
    expiresAt: string;
  };
  master: Wallet;
  subWallets: Wallet[];
}

export async function createMasterWallet(label?: string): Promise<CreateWalletResponse> {
  return post<CreateWalletResponse>('/api/wallets/create', {
    isMaster: true,
    label: label || 'Master Wallet',
  });
}

export async function createSubWallet(
  label: string,
  color?: string
): Promise<CreateWalletResponse> {
  // For hackathon demo: create sub-wallets locally without backend
  // This generates a real Solana keypair stored in localStorage
  const { Keypair } = await import('@solana/web3.js');
  const keypair = Keypair.generate();

  const wallet: Wallet = {
    id: `local-${Date.now()}`,
    publicKey: keypair.publicKey.toBase58(),
    label: label,
    color: color || '#8b5cf6',
    isMaster: false,
    createdAt: new Date().toISOString(),
  };

  // Store keypair in localStorage (for demo only - not production safe!)
  const storedWallets = JSON.parse(localStorage.getItem('localSubWallets') || '[]');
  storedWallets.push({
    ...wallet,
    secretKey: Array.from(keypair.secretKey), // Store for potential future use
  });
  localStorage.setItem('localSubWallets', JSON.stringify(storedWallets));

  return {
    success: true,
    wallet,
  };
}

export async function getWallets(): Promise<WalletsListResponse> {
  return get<WalletsListResponse>('/api/wallets');
}

export async function getBalances(publicKey: string): Promise<BalancesResponse> {
  return get<BalancesResponse>(`/api/wallets/${publicKey}/balances`);
}

export async function getHoldings(publicKey: string): Promise<HoldingsResponse> {
  return get<HoldingsResponse>(`/api/wallets/${publicKey}/holdings`);
}

export async function transfer(
  from: string,
  to: string,
  token: string,
  amount: number
): Promise<TransferResponse> {
  return post<TransferResponse>('/api/wallets/transfer', {
    from,
    to,
    token,
    amount,
  });
}

export async function swap(
  from: 'SOL' | 'USDC',
  to: 'SOL' | 'USDC',
  amount: number
): Promise<TransferResponse> {
  return post<TransferResponse>('/api/wallets/swap', {
    from,
    to,
    amount,
  });
}

export async function deleteWallet(id: string): Promise<{ success: boolean }> {
  // Check if it's a local wallet
  if (id.startsWith('local-')) {
    const storedWallets = JSON.parse(localStorage.getItem('localSubWallets') || '[]');
    const filtered = storedWallets.filter((w: any) => w.id !== id);
    localStorage.setItem('localSubWallets', JSON.stringify(filtered));
    return { success: true };
  }
  return del<{ success: boolean }>(`/api/wallets/${id}`);
}

export async function validateSession(): Promise<SessionValidateResponse | null> {
  // Load local sub-wallets first
  const localWallets = JSON.parse(localStorage.getItem('localSubWallets') || '[]');
  const subWallets: Wallet[] = localWallets.map((w: any) => ({
    id: w.id,
    publicKey: w.publicKey,
    label: w.label,
    color: w.color,
    isMaster: false,
    createdAt: w.createdAt,
  }));

  // If we have local wallets, return them without needing a session
  if (subWallets.length > 0) {
    return {
      success: true,
      session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      master: {
        id: 'local-master',
        publicKey: 'local',
        label: 'Local Wallets',
        isMaster: true,
        createdAt: new Date().toISOString(),
      },
      subWallets,
    };
  }

  // Try backend session if available
  const sessionToken = localStorage.getItem('sessionToken');
  if (!sessionToken) return null;

  try {
    return await post<SessionValidateResponse>('/api/wallets/session/validate', {
      sessionToken,
    });
  } catch {
    localStorage.removeItem('sessionToken');
    return null;
  }
}
