import { create } from 'zustand';
import type { MarketSearchResult, MarketDetails, Position, EventResult } from '../types/market';
import * as marketsApi from '../api/markets';

interface MarketState {
  // State
  searchQuery: string;
  searchResults: MarketSearchResult[];
  eventResults: EventResult[];
  selectedMarket: MarketDetails | null;
  positions: Position[];
  isSearching: boolean;
  isLoading: boolean;
  isLoadingEvents: boolean;
  hasLoadedEvents: boolean;
  error: string | null;

  // Actions
  loadFeaturedEvents: (force?: boolean) => Promise<void>;
  search: (query: string) => Promise<void>;
  getMarket: (ticker: string) => Promise<void>;
  buyPosition: (
    marketTicker: string,
    side: 'YES' | 'NO',
    usdcAmount: number,
    walletPublicKey?: string
  ) => Promise<string | null>;
  sellPosition: (outcomeMint: string, tokenAmount: number) => Promise<string | null>;
  refreshPositions: () => Promise<void>;
  clearSearch: () => void;
  clearError: () => void;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  // Initial state
  searchQuery: '',
  searchResults: [],
  eventResults: [],
  selectedMarket: null,
  positions: [],
  isSearching: false,
  isLoading: false,
  isLoadingEvents: false,
  hasLoadedEvents: false,
  error: null,

  // Load featured events (no search query)
  loadFeaturedEvents: async (force = false) => {
    const { hasLoadedEvents, isLoadingEvents } = get();
    if (!force && (hasLoadedEvents || isLoadingEvents)) return;

    set({ isLoadingEvents: true, error: null });

    try {
      const result = await marketsApi.getEvents(15, 'active', 5);

      set({
        eventResults: result.events,
        isLoadingEvents: false,
        hasLoadedEvents: true,
        searchQuery: '',
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load events',
        isLoadingEvents: false,
      });
    }
  },

  // Search events (returns events with nested markets)
  search: async (query: string) => {
    if (!query.trim()) {
      // When search is cleared, reload featured events
      set({ searchQuery: '', hasLoadedEvents: false });
      get().loadFeaturedEvents(true);
      return;
    }

    set({ isSearching: true, searchQuery: query, error: null });

    try {
      console.log('[Store] Searching for:', query);
      const result = await marketsApi.searchEvents(query, 50, 'all', 5);

      // Only update if query hasn't changed while we were waiting
      const currentQuery = get().searchQuery;
      if (currentQuery !== query) {
        console.log('[Store] Query changed, ignoring stale results for:', query);
        return;
      }

      console.log('[Store] Search results:', result.events.length, 'events');

      set({
        eventResults: result.events,
        searchResults: [],
        isSearching: false,
      });
    } catch (error) {
      console.error('[Store] Search error:', error);
      set({
        error: error instanceof Error ? error.message : 'Search failed',
        isSearching: false,
      });
    }
  },

  // Get market details
  getMarket: async (ticker: string) => {
    set({ isLoading: true, error: null });

    try {
      const result = await marketsApi.getMarket(ticker);

      set({
        selectedMarket: result.market,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to get market',
        isLoading: false,
      });
    }
  },

  // Buy position
  buyPosition: async (
    marketTicker: string,
    side: 'YES' | 'NO',
    usdcAmount: number,
    walletPublicKey?: string
  ) => {
    set({ isLoading: true, error: null });

    try {
      const result = await marketsApi.buyPosition(
        marketTicker,
        side,
        usdcAmount,
        walletPublicKey
      );

      set({ isLoading: false });

      // Refresh positions
      get().refreshPositions();

      return result.txSignature;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Trade failed',
        isLoading: false,
      });
      return null;
    }
  },

  // Sell position
  sellPosition: async (outcomeMint: string, tokenAmount: number) => {
    set({ isLoading: true, error: null });

    try {
      const result = await marketsApi.sellPosition(outcomeMint, tokenAmount);

      set({ isLoading: false });

      // Refresh positions
      get().refreshPositions();

      return result.txSignature;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Sell failed',
        isLoading: false,
      });
      return null;
    }
  },

  // Refresh positions
  refreshPositions: async () => {
    try {
      const result = await marketsApi.getPositions();
      set({ positions: result.positions });
    } catch (error) {
      console.error('Failed to refresh positions:', error);
    }
  },

  // Clear search and reload featured events
  clearSearch: () => {
    set({ searchQuery: '', searchResults: [], selectedMarket: null, hasLoadedEvents: false });
    get().loadFeaturedEvents(true);
  },

  // Clear error
  clearError: () => set({ error: null }),
}));
