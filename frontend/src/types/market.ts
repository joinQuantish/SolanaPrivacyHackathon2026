// Individual market within an event
export interface Market {
  ticker: string;
  title: string;
  subtitle?: string;       // e.g., "Michelle Bowman", "Before January 2026"
  yesSubTitle?: string;    // What YES means
  noSubTitle?: string;     // What NO means
  status: string;
  yesPrice?: number;       // Probability (0-1), shown as % chance
  noPrice?: number;
  yesMint?: string;
  noMint?: string;
  volume?: number;
}

// Event containing multiple markets (options)
export interface EventResult {
  ticker: string;
  title: string;           // e.g., "Who will Trump nominate as Fed Chair?"
  subtitle?: string;
  imageUrl?: string;
  volume?: number;
  volume24h?: number;
  markets: Market[];       // Individual options/choices
}

// Legacy flat market result (for backwards compatibility)
export interface MarketSearchResult {
  ticker: string;
  title: string;
  eventTicker: string;
  status: string;
  yesPrice?: number;
  noPrice?: number;
  yesMint?: string;
  noMint?: string;
}

export interface MarketDetails {
  ticker: string;
  title: string;
  subtitle?: string;
  status: string;
  yesPrice: number;
  noPrice: number;
  yesMint: string;
  noMint: string;
  volume?: number;
  openInterest?: number;
}

export interface Position {
  market: string;
  side: 'YES' | 'NO';
  amount: number;
  mint: string;
}
