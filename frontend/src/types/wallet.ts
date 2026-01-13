export interface Wallet {
  id: string;
  publicKey: string;
  label: string;
  type: 'master' | 'sub';
  color?: string;
}

export interface WalletBalances {
  sol: number;
  usdc: number;
}

export interface TokenHolding {
  mint: string;
  amount: number;
  decimals: number;
  symbol?: string;
  name?: string;
}

export interface WalletWithBalances extends Wallet {
  balances?: WalletBalances;
  holdings?: TokenHolding[];
}
