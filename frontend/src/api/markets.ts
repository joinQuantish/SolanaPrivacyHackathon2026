import { get, post } from './client';
import type { MarketSearchResult, MarketDetails, Position, EventResult } from '../types/market';

interface SearchResponse {
  success: boolean;
  query: string;
  count: number;
  markets: MarketSearchResult[];
}

interface EventsSearchResponse {
  success: boolean;
  query: string;
  count: number;
  events: EventResult[];
}

interface MarketResponse {
  success: boolean;
  market: MarketDetails;
}

interface TradeResponse {
  success: boolean;
  marketTicker: string;
  side: 'YES' | 'NO';
  usdcAmount: number;
  txSignature: string;
  usdcSpent?: number;
  sharesReceived?: number;
}

interface PositionsResponse {
  success: boolean;
  count: number;
  positions: Position[];
}

export async function searchMarkets(
  query: string,
  limit: number = 10,
  status: 'active' | 'inactive' | 'finalized' | 'all' = 'active'
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
    status,
  });
  return get<SearchResponse>(`/api/markets/search?${params}`);
}

export async function searchEvents(
  query: string,
  limit: number = 10,
  status: 'active' | 'inactive' | 'finalized' | 'all' = 'all',
  maxMarketsPerEvent: number = 5
): Promise<EventsSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
    status,
    maxMarketsPerEvent: maxMarketsPerEvent.toString(),
  });
  return get<EventsSearchResponse>(`/api/markets/events?${params}`);
}

export async function getEvents(
  limit: number = 15,
  status: 'active' | 'inactive' | 'finalized' | 'all' = 'active',
  maxMarketsPerEvent: number = 5
): Promise<EventsSearchResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    status,
    maxMarketsPerEvent: maxMarketsPerEvent.toString(),
  });
  return get<EventsSearchResponse>(`/api/markets/events?${params}`);
}

export async function getMarket(ticker: string): Promise<MarketResponse> {
  return get<MarketResponse>(`/api/markets/${ticker}`);
}

export async function getLiveData(ticker: string): Promise<{
  success: boolean;
  ticker: string;
  yesPrice: number;
  noPrice: number;
  volume?: number;
}> {
  return get(`/api/markets/${ticker}/live`);
}

export async function buyPosition(
  marketTicker: string,
  side: 'YES' | 'NO',
  usdcAmount: number,
  walletPublicKey?: string
): Promise<TradeResponse> {
  return post<TradeResponse>('/api/markets/trade/buy', {
    marketTicker,
    side,
    usdcAmount,
    walletPublicKey,
  });
}

export async function sellPosition(
  outcomeMint: string,
  tokenAmount: number
): Promise<TradeResponse> {
  return post<TradeResponse>('/api/markets/trade/sell', {
    outcomeMint,
    tokenAmount,
  });
}

export async function getPositions(): Promise<PositionsResponse> {
  return get<PositionsResponse>('/api/markets/positions');
}
