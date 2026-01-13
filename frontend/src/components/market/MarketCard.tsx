import React, { useState } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import type { MarketSearchResult } from '../../types/market';
import { BuyModal } from './BuyModal';

interface MarketCardProps {
  market: MarketSearchResult;
}

export function MarketCard({ market }: MarketCardProps) {
  const [showBuy, setShowBuy] = useState(false);
  const [selectedSide, setSelectedSide] = useState<'YES' | 'NO'>('YES');

  const yesPrice = market.yesPrice ?? 0.5;
  const noPrice = market.noPrice ?? 0.5;

  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)}`;
  };

  const getPriceColor = (price: number, isYes: boolean) => {
    if (isYes) {
      return price > 0.5 ? 'text-accent-green' : 'text-obsidian-300';
    }
    return price > 0.5 ? 'text-accent-red' : 'text-obsidian-300';
  };

  const handleBuy = (side: 'YES' | 'NO') => {
    setSelectedSide(side);
    setShowBuy(true);
  };

  return (
    <>
      <Card className="hover:border-accent-purple/30">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-medium text-obsidian-100 mb-1 line-clamp-2">
              {market.title}
            </h3>
            <code className="text-xs text-obsidian-500 font-mono">
              {market.ticker}
            </code>
          </div>
          <span className={`
            badge text-xs
            ${market.status === 'active' ? 'badge-green' : 'badge-yellow'}
          `}>
            {market.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-obsidian-900/50 rounded-lg p-3">
            <div className="text-xs text-obsidian-400 mb-1">YES</div>
            <div className={`text-xl font-bold ${getPriceColor(yesPrice, true)}`}>
              {formatPrice(yesPrice)}
            </div>
          </div>
          <div className="bg-obsidian-900/50 rounded-lg p-3">
            <div className="text-xs text-obsidian-400 mb-1">NO</div>
            <div className={`text-xl font-bold ${getPriceColor(noPrice, false)}`}>
              {formatPrice(noPrice)}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleBuy('YES')}
            className="flex-1 bg-accent-green/10 border-accent-green/30 hover:bg-accent-green/20 text-accent-green"
          >
            Buy YES
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleBuy('NO')}
            className="flex-1 bg-accent-red/10 border-accent-red/30 hover:bg-accent-red/20 text-accent-red"
          >
            Buy NO
          </Button>
        </div>
      </Card>

      {showBuy && (
        <BuyModal
          isOpen={showBuy}
          onClose={() => setShowBuy(false)}
          market={market}
          initialSide={selectedSide}
        />
      )}
    </>
  );
}
