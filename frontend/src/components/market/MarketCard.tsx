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
      return price > 0.5 ? 'text-accent-green' : 'text-qn-gray-500';
    }
    return price > 0.5 ? 'text-accent-red' : 'text-qn-gray-500';
  };

  const handleBuy = (side: 'YES' | 'NO') => {
    setSelectedSide(side);
    setShowBuy(true);
  };

  return (
    <>
      <div className="bg-white border-2 border-qn-black p-4 hover:shadow-brutal hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all duration-100">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-bold text-qn-black mb-1 line-clamp-2 uppercase text-sm tracking-tight">
              {market.title}
            </h3>
            <code className="text-xs text-qn-gray-400 font-mono">
              {market.ticker}
            </code>
          </div>
          <span className={`
            text-xs font-bold uppercase tracking-wider font-mono px-2 py-0.5 border
            ${market.status === 'active' ? 'border-accent-green text-accent-green' : 'border-accent-orange text-accent-orange'}
          `}>
            {market.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-qn-gray-100 p-3 border border-qn-gray-200">
            <div className="text-xs text-qn-gray-400 mb-1 font-mono uppercase">YES</div>
            <div className={`text-xl font-bold font-mono ${getPriceColor(yesPrice, true)}`}>
              {formatPrice(yesPrice)}
            </div>
          </div>
          <div className="bg-qn-gray-100 p-3 border border-qn-gray-200">
            <div className="text-xs text-qn-gray-400 mb-1 font-mono uppercase">NO</div>
            <div className={`text-xl font-bold font-mono ${getPriceColor(noPrice, false)}`}>
              {formatPrice(noPrice)}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleBuy('YES')}
            className="flex-1 py-2 px-4 bg-white border-2 border-accent-green text-accent-green font-bold text-xs uppercase tracking-wider font-mono
                       hover:bg-accent-green hover:text-white transition-all duration-100"
          >
            Buy YES
          </button>
          <button
            onClick={() => handleBuy('NO')}
            className="flex-1 py-2 px-4 bg-white border-2 border-accent-red text-accent-red font-bold text-xs uppercase tracking-wider font-mono
                       hover:bg-accent-red hover:text-white transition-all duration-100"
          >
            Buy NO
          </button>
        </div>
      </div>

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
