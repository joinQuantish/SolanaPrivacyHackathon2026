import React, { useEffect, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { Market, EventResult, MarketSearchResult } from '../../types/market';
import { BuyModal } from './BuyModal';

// Format volume nicely
function formatVolume(volume?: number): string {
  if (!volume) return '-';
  if (volume >= 1_000_000) {
    return `$${(volume / 1_000_000).toFixed(1)}M`;
  }
  if (volume >= 1_000) {
    return `$${(volume / 1_000).toFixed(0)}K`;
  }
  return `$${volume.toFixed(0)}`;
}

// Mini sparkline chart component
function MiniChart({ isUp = true }: { isUp?: boolean }) {
  const bars = Array.from({ length: 8 }, () => 20 + Math.random() * 80);

  return (
    <div className="flex items-end gap-px" style={{ width: '60px', height: '24px' }}>
      {bars.map((height, i) => (
        <div
          key={i}
          className={isUp ? 'bg-accent-green' : 'bg-accent-red'}
          style={{ height: `${height}%`, width: '6px' }}
        />
      ))}
    </div>
  );
}

// Event card with expandable markets
function EventCard({
  event,
  onBuy,
}: {
  event: EventResult;
  onBuy: (market: Market, side: 'yes' | 'no') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayMarkets = expanded ? event.markets : event.markets.slice(0, 3);
  const hasMore = event.markets.length > 3;

  // Get the top market's price for the event summary
  const topMarket = event.markets[0];
  const topYesPercent = topMarket?.yesPrice ? Math.round(topMarket.yesPrice * 100) : 50;

  return (
    <div className="bg-white border-2 border-qn-black mb-3" style={{ boxShadow: '2px 2px 0px 0px rgb(13, 13, 13)' }}>
      {/* Event Header */}
      <div
        className="p-4 border-b border-qn-gray-200 cursor-pointer hover:bg-qn-gray-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-qn-black uppercase tracking-tight mb-1">
              {event.title}
            </h3>
            <div className="flex items-center gap-4">
              <span className="text-xs text-qn-gray-400 font-mono uppercase">
                {event.markets.length} options
              </span>
              {event.volume && (
                <span className="text-xs text-qn-gray-400 font-mono">
                  Vol: {formatVolume(event.volume)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MiniChart isUp={topYesPercent >= 50} />
            <svg
              className={`w-4 h-4 text-qn-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Markets List */}
      <div>
        {displayMarkets.map((market, idx) => {
          const yesPercent = market.yesPrice ? Math.round(market.yesPrice * 100) : 50;
          const noPercent = 100 - yesPercent;
          const isUp = yesPercent >= 50;

          // Use yesSubTitle or market title
          const displayName = market.yesSubTitle || market.subtitle || market.title;

          return (
            <div
              key={market.ticker}
              className={`px-4 py-3 flex items-center gap-4 bg-white hover:bg-qn-gray-100 transition-colors ${
                idx < displayMarkets.length - 1 ? 'border-b border-qn-gray-200' : ''
              }`}
            >
              {/* Market Name */}
              <div className="flex-1 min-w-0">
                <span className="text-sm text-qn-gray-600 font-mono">
                  {displayName}
                </span>
              </div>

              {/* Yes/No Prices */}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold font-mono px-2 py-0.5 border ${
                  isUp ? 'border-accent-green text-accent-green' : 'border-accent-red text-accent-red'
                }`}>
                  Yes {yesPercent}%
                </span>
                <span className={`text-xs font-bold font-mono px-2 py-0.5 border ${
                  !isUp ? 'border-accent-green text-accent-green' : 'border-accent-red text-accent-red'
                }`}>
                  No {noPercent}%
                </span>
              </div>

              {/* Trade Buttons */}
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 text-xs font-bold uppercase tracking-wider font-mono border-2 border-accent-green text-accent-green bg-white hover:bg-accent-green hover:text-white transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBuy(market, 'yes');
                  }}
                  disabled={!market.yesMint}
                >
                  Buy Yes
                </button>
                <button
                  className="px-3 py-1 text-xs font-bold uppercase tracking-wider font-mono border-2 border-accent-red text-accent-red bg-white hover:bg-accent-red hover:text-white transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBuy(market, 'no');
                  }}
                  disabled={!market.noMint}
                >
                  Buy No
                </button>
              </div>
            </div>
          );
        })}

        {/* Show More Button */}
        {hasMore && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full py-2.5 bg-qn-gray-100 text-accent-green text-xs font-bold uppercase tracking-wider border-t border-qn-gray-200 hover:bg-qn-gray-200 transition-colors"
          >
            Show {event.markets.length - 3} more options
          </button>
        )}

        {/* Collapse Button */}
        {expanded && hasMore && (
          <button
            onClick={() => setExpanded(false)}
            className="w-full py-2.5 bg-qn-gray-100 text-qn-gray-400 text-xs font-bold uppercase tracking-wider border-t border-qn-gray-200 hover:bg-qn-gray-200 transition-colors"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

// Loading skeleton
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="bg-white border-2 border-qn-gray-300 p-4"
        >
          <div className="animate-pulse">
            <div className="h-5 bg-qn-gray-200 w-3/5 mb-2" />
            <div className="h-3.5 bg-qn-gray-200 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarketTable() {
  const {
    eventResults,
    searchQuery,
    isSearching,
    isLoadingEvents,
    error,
    loadFeaturedEvents,
  } = useMarketStore();

  // Modal state
  const [selectedMarket, setSelectedMarket] = useState<MarketSearchResult | null>(null);
  const [selectedSide, setSelectedSide] = useState<'YES' | 'NO'>('YES');
  const [showBuyModal, setShowBuyModal] = useState(false);

  // Load featured events on mount
  useEffect(() => {
    loadFeaturedEvents();
  }, [loadFeaturedEvents]);

  const handleBuy = (market: Market, side: 'yes' | 'no') => {
    // Convert Market to MarketSearchResult format for BuyModal
    const marketForModal: MarketSearchResult = {
      ticker: market.ticker,
      title: market.title,
      eventTicker: '',
      status: market.status || 'active',
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      yesMint: market.yesMint,
      noMint: market.noMint,
    };
    setSelectedMarket(marketForModal);
    setSelectedSide(side === 'yes' ? 'YES' : 'NO');
    setShowBuyModal(true);
  };

  // Show loading state
  if (isLoadingEvents || isSearching) {
    return <LoadingSkeleton />;
  }

  // Show error
  if (error) {
    return (
      <div className="text-center py-8 bg-accent-red/10 border-2 border-accent-red">
        <p className="text-accent-red font-bold font-mono">{error}</p>
      </div>
    );
  }

  // Show empty state for search
  if (searchQuery && eventResults.length === 0) {
    return (
      <div className="text-center py-12 bg-white border-2 border-dashed border-qn-black">
        <p className="text-qn-gray-400 font-mono">
          No markets found for "{searchQuery}"
        </p>
      </div>
    );
  }

  // Show events
  return (
    <>
      <div>
        {eventResults.map(event => (
          <EventCard key={event.ticker} event={event} onBuy={handleBuy} />
        ))}
      </div>

      {/* Buy Modal */}
      {selectedMarket && (
        <BuyModal
          isOpen={showBuyModal}
          onClose={() => {
            setShowBuyModal(false);
            setSelectedMarket(null);
          }}
          market={selectedMarket}
          initialSide={selectedSide}
        />
      )}
    </>
  );
}
