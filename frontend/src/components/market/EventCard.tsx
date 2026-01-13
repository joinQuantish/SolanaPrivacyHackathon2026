import React, { useState } from 'react';
import { Card } from '../common/Card';
import { BuyModal } from './BuyModal';
import type { EventResult, Market } from '../../types/market';

interface EventCardProps {
  event: EventResult;
}

// Format volume for display
function formatVolume(volume?: number): string {
  if (!volume) return '';
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M Vol.`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(0)}k Vol.`;
  return `$${volume} Vol.`;
}

// Format price as percentage
function formatPercent(price?: number): string {
  if (price === undefined || price === null) return '-';
  return `${Math.round(price * 100)}%`;
}

export function EventCard({ event }: EventCardProps) {
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [selectedSide, setSelectedSide] = useState<'YES' | 'NO'>('YES');

  const handleBuy = (market: Market, side: 'YES' | 'NO') => {
    setSelectedMarket(market);
    setSelectedSide(side);
  };

  const isBinaryEvent = event.markets.length === 1;
  const isMultiOutcome = event.markets.length > 1;

  return (
    <>
      <Card className="hover:border-obsidian-600 transition-colors">
        {/* Event Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-base font-medium text-obsidian-100 leading-snug">
              {event.title}
            </h3>
            {event.subtitle && (
              <p className="text-xs text-obsidian-500 mt-1">{event.subtitle}</p>
            )}
          </div>
          {event.volume && (
            <span className="text-xs text-obsidian-500 ml-3 whitespace-nowrap">
              {formatVolume(event.volume)}
            </span>
          )}
        </div>

        {/* Binary Market (single yes/no) */}
        {isBinaryEvent && (
          <BinaryMarket market={event.markets[0]} onBuy={handleBuy} />
        )}

        {/* Multi-outcome Market (multiple options) */}
        {isMultiOutcome && (
          <MultiOutcomeMarkets markets={event.markets} onBuy={handleBuy} />
        )}
      </Card>

      {/* Buy Modal */}
      {selectedMarket && (
        <BuyModal
          isOpen={!!selectedMarket}
          onClose={() => setSelectedMarket(null)}
          market={{
            ticker: selectedMarket.ticker,
            title: selectedMarket.title,
            eventTicker: event.ticker,
            status: selectedMarket.status,
            yesPrice: selectedMarket.yesPrice,
            noPrice: selectedMarket.noPrice,
            yesMint: selectedMarket.yesMint,
            noMint: selectedMarket.noMint,
          }}
          initialSide={selectedSide}
        />
      )}
    </>
  );
}

// Binary market display (single yes/no question)
function BinaryMarket({
  market,
  onBuy
}: {
  market: Market;
  onBuy: (m: Market, side: 'YES' | 'NO') => void;
}) {
  const yesPercent = market.yesPrice ? Math.round(market.yesPrice * 100) : 50;

  return (
    <div>
      {/* Probability bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-2 bg-obsidian-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent-green to-accent-green/70 transition-all"
            style={{ width: `${yesPercent}%` }}
          />
        </div>
        <span className="text-lg font-semibold text-obsidian-100 min-w-[60px] text-right">
          {yesPercent}%
        </span>
      </div>

      {/* Yes/No buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onBuy(market, 'YES')}
          className="flex-1 py-2.5 px-4 rounded-lg bg-accent-green/10 border border-accent-green/30
                     text-accent-green font-medium text-sm
                     hover:bg-accent-green/20 hover:border-accent-green/50 transition-all"
        >
          Yes {formatPercent(market.yesPrice)}
        </button>
        <button
          onClick={() => onBuy(market, 'NO')}
          className="flex-1 py-2.5 px-4 rounded-lg bg-accent-red/10 border border-accent-red/30
                     text-accent-red font-medium text-sm
                     hover:bg-accent-red/20 hover:border-accent-red/50 transition-all"
        >
          No {formatPercent(market.noPrice)}
        </button>
      </div>
    </div>
  );
}

// Multi-outcome markets display (Fed chair candidates, etc.)
function MultiOutcomeMarkets({
  markets,
  onBuy
}: {
  markets: Market[];
  onBuy: (m: Market, side: 'YES' | 'NO') => void;
}) {
  // Sort by YES price descending (highest probability first)
  const sorted = [...markets].sort((a, b) => (b.yesPrice || 0) - (a.yesPrice || 0));
  // Show top 6 options
  const displayed = sorted.slice(0, 6);

  return (
    <div className="space-y-2">
      {displayed.map(market => {
        const yesPercent = market.yesPrice ? Math.round(market.yesPrice * 100) : 0;
        // Extract the option name from subtitle or title
        const optionName = market.subtitle || market.yesSubTitle || market.title.split('?')[0];

        return (
          <div
            key={market.ticker}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-obsidian-800/50 transition-colors group"
          >
            {/* Option name and probability */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-obsidian-200 truncate">
                  {optionName}
                </span>
                <span className={`text-sm font-semibold ${
                  yesPercent >= 20 ? 'text-accent-green' : 'text-obsidian-400'
                }`}>
                  {yesPercent}%
                </span>
              </div>
              {/* Mini probability bar */}
              <div className="h-1 bg-obsidian-700 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-accent-purple transition-all"
                  style={{ width: `${Math.max(yesPercent, 2)}%` }}
                />
              </div>
            </div>

            {/* Buy buttons */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onBuy(market, 'YES')}
                className="px-3 py-1 text-xs rounded bg-accent-green/20 text-accent-green
                           hover:bg-accent-green/30 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => onBuy(market, 'NO')}
                className="px-3 py-1 text-xs rounded bg-accent-red/20 text-accent-red
                           hover:bg-accent-red/30 transition-colors"
              >
                No
              </button>
            </div>
          </div>
        );
      })}

      {markets.length > 6 && (
        <p className="text-xs text-obsidian-500 text-center pt-1">
          +{markets.length - 6} more options
        </p>
      )}
    </div>
  );
}
