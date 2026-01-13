import { create } from 'zustand';
import type { Wallet, WalletBalances, TokenHolding } from '../types/wallet';
import * as walletsApi from '../api/wallets';

interface WalletState {
  // State
  master: Wallet | null;
  subWallets: Wallet[];
  balances: Record<string, WalletBalances>;
  holdings: Record<string, TokenHolding[]>;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<boolean>;
  createMasterWallet: (label?: string) => Promise<boolean>;
  createSubWallet: (label: string, color?: string) => Promise<boolean>;
  refreshBalances: (publicKey: string) => Promise<void>;
  refreshAllBalances: () => Promise<void>;
  refreshHoldings: (publicKey: string) => Promise<void>;
  transfer: (from: string, to: string, token: string, amount: number) => Promise<string | null>;
  swap: (from: 'SOL' | 'USDC', to: 'SOL' | 'USDC', amount: number) => Promise<string | null>;
  deleteSubWallet: (id: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  // Initial state
  master: null,
  subWallets: [],
  balances: {},
  holdings: {},
  isLoading: false,
  isInitialized: false,
  error: null,

  // Initialize from session
  initialize: async () => {
    set({ isLoading: true, error: null });

    try {
      const result = await walletsApi.validateSession();

      if (result) {
        set({
          master: result.master,
          subWallets: result.subWallets,
          isInitialized: true,
          isLoading: false,
        });

        // Refresh balances in background
        get().refreshAllBalances();

        return true;
      }

      set({ isInitialized: true, isLoading: false });
      return false;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Initialization failed',
        isInitialized: true,
        isLoading: false,
      });
      return false;
    }
  },

  // Create master wallet
  createMasterWallet: async (label?: string) => {
    set({ isLoading: true, error: null });

    try {
      const result = await walletsApi.createMasterWallet(label);

      if (result.sessionToken) {
        localStorage.setItem('sessionToken', result.sessionToken);
      }

      set({
        master: result.wallet,
        subWallets: [],
        isLoading: false,
      });

      // Refresh balances
      get().refreshBalances(result.wallet.publicKey);

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create wallet',
        isLoading: false,
      });
      return false;
    }
  },

  // Create sub-wallet
  createSubWallet: async (label: string, color?: string) => {
    set({ isLoading: true, error: null });

    try {
      const result = await walletsApi.createSubWallet(label, color);

      set(state => ({
        subWallets: [...state.subWallets, result.wallet],
        isLoading: false,
      }));

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create sub-wallet',
        isLoading: false,
      });
      return false;
    }
  },

  // Refresh balances for a wallet
  refreshBalances: async (publicKey: string) => {
    try {
      const result = await walletsApi.getBalances(publicKey);
      set(state => ({
        balances: {
          ...state.balances,
          [publicKey]: result.balances,
        },
      }));
    } catch (error) {
      console.error('Failed to refresh balances:', error);
    }
  },

  // Refresh all wallet balances
  refreshAllBalances: async () => {
    const { master, subWallets, refreshBalances } = get();

    if (master) {
      await refreshBalances(master.publicKey);
    }

    for (const wallet of subWallets) {
      await refreshBalances(wallet.publicKey);
    }
  },

  // Refresh holdings for a wallet
  refreshHoldings: async (publicKey: string) => {
    try {
      const result = await walletsApi.getHoldings(publicKey);
      set(state => ({
        holdings: {
          ...state.holdings,
          [publicKey]: result.holdings,
        },
      }));
    } catch (error) {
      console.error('Failed to refresh holdings:', error);
    }
  },

  // Transfer funds
  transfer: async (from: string, to: string, token: string, amount: number) => {
    set({ isLoading: true, error: null });

    try {
      const result = await walletsApi.transfer(from, to, token, amount);

      set({ isLoading: false });

      // Refresh balances
      get().refreshBalances(from);
      get().refreshBalances(to);

      return result.txSignature;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Transfer failed',
        isLoading: false,
      });
      return null;
    }
  },

  // Swap SOL/USDC
  swap: async (from: 'SOL' | 'USDC', to: 'SOL' | 'USDC', amount: number) => {
    set({ isLoading: true, error: null });

    try {
      const result = await walletsApi.swap(from, to, amount);

      set({ isLoading: false });

      // Refresh master wallet balances
      const { master } = get();
      if (master) {
        get().refreshBalances(master.publicKey);
      }

      return result.txSignature;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Swap failed',
        isLoading: false,
      });
      return null;
    }
  },

  // Delete sub-wallet
  deleteSubWallet: async (id: string) => {
    set({ isLoading: true, error: null });

    try {
      await walletsApi.deleteWallet(id);

      set(state => ({
        subWallets: state.subWallets.filter(w => w.id !== id),
        isLoading: false,
      }));

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete wallet',
        isLoading: false,
      });
      return false;
    }
  },

  // Logout
  logout: () => {
    localStorage.removeItem('sessionToken');
    set({
      master: null,
      subWallets: [],
      balances: {},
      holdings: {},
      isInitialized: true,
      error: null,
    });
  },

  // Clear error
  clearError: () => set({ error: null }),
}));
