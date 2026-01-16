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
    <div className={`mini-chart ${isUp ? '' : 'down'}`} style={{ width: '60px', height: '24px' }}>
      {bars.map((height, i) => (
        <div
          key={i}
          className="bar"
          style={{ height: `${height}%` }}
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
    <div
      style={{
        backgroundColor: 'var(--background-secondary)',
        borderRadius: '12px',
        border: '1px solid var(--primary-stroke)',
        overflow: 'hidden',
        marginBottom: '12px',
      }}
    >
      {/* Event Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>
              {event.title}
            </h3>
            <div className="flex items-center gap-4">
              <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                {event.markets.length} options
              </span>
              {event.volume && (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                  Vol: {formatVolume(event.volume)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MiniChart isUp={topYesPercent >= 50} />
            <svg
              style={{
                width: '20px',
                height: '20px',
                color: 'var(--text-tertiary)',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
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
      <div style={{ padding: expanded ? '0' : '0' }}>
        {displayMarkets.map((market, idx) => {
          const yesPercent = market.yesPrice ? Math.round(market.yesPrice * 100) : 50;
          const noPercent = 100 - yesPercent;
          const isUp = yesPercent >= 50;

          // Use yesSubTitle or market title
          const displayName = market.yesSubTitle || market.subtitle || market.title;

          return (
            <div
              key={market.ticker}
              style={{
                padding: '12px 16px',
                borderBottom: idx < displayMarkets.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                backgroundColor: 'var(--background)',
              }}
              className="hover:bg-[var(--background-row-hover)] transition-colors"
            >
              {/* Market Name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  {displayName}
                </span>
              </div>

              {/* Yes/No Prices */}
              <div className="flex items-center gap-2">
                <span
                  className="pct-badge"
                  style={{
                    backgroundColor: isUp ? 'rgba(47, 227, 172, 0.15)' : 'rgba(236, 57, 122, 0.15)',
                    color: isUp ? 'var(--increase)' : 'var(--decrease)',
                  }}
                >
                  Yes {yesPercent}%
                </span>
                <span
                  className="pct-badge"
                  style={{
                    backgroundColor: !isUp ? 'rgba(47, 227, 172, 0.15)' : 'rgba(236, 57, 122, 0.15)',
                    color: !isUp ? 'var(--increase)' : 'var(--decrease)',
                  }}
                >
                  No {noPercent}%
                </span>
              </div>

              {/* Trade Buttons */}
              <div className="flex gap-2">
                <button
                  className="btn-buy"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBuy(market, 'yes');
                  }}
                  disabled={!market.yesMint}
                  style={{ padding: '4px 12px', fontSize: '12px' }}
                >
                  Buy Yes
                </button>
                <button
                  className="btn-sell"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBuy(market, 'no');
                  }}
                  disabled={!market.noMint}
                  style={{ padding: '4px 12px', fontSize: '12px' }}
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
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'var(--background-tertiary)',
              color: 'var(--primary-color)',
              fontSize: '13px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Show {event.markets.length - 3} more options
          </button>
        )}

        {/* Collapse Button */}
        {expanded && hasMore && (
          <button
            onClick={() => setExpanded(false)}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'var(--background-tertiary)',
              color: 'var(--text-tertiary)',
              fontSize: '13px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
            }}
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
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--primary-stroke)',
          }}
        >
          <div className="animate-pulse">
            <div style={{ height: '20px', backgroundColor: 'var(--background-tertiary)', borderRadius: '4px', width: '60%', marginBottom: '8px' }} />
            <div style={{ height: '14px', backgroundColor: 'var(--background-tertiary)', borderRadius: '4px', width: '30%' }} />
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
      status: market.status || 'active',
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      yesMint: market.yesMint,
      noMint: market.noMint,
      volume: market.volume,
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
      <div
        className="text-center py-8"
        style={{
          backgroundColor: 'rgba(242, 84, 97, 0.1)',
          borderRadius: '12px',
          border: '1px solid rgba(242, 84, 97, 0.3)',
        }}
      >
        <p style={{ color: 'var(--primary-red)' }}>{error}</p>
      </div>
    );
  }

  // Show empty state for search
  if (searchQuery && eventResults.length === 0) {
    return (
      <div
        className="text-center py-12"
        style={{
          backgroundColor: 'var(--background-secondary)',
          borderRadius: '12px',
          border: '1px dashed var(--secondary-stroke)',
        }}
      >
        <p style={{ color: 'var(--text-tertiary)' }}>
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
