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
  const sessionToken = localStorage.getItem('sessionToken');
  return post<CreateWalletResponse>('/api/wallets/create', {
    isMaster: false,
    label,
    color,
    sessionToken,
  });
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
  return del<{ success: boolean }>(`/api/wallets/${id}`);
}

export async function validateSession(): Promise<SessionValidateResponse | null> {
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
