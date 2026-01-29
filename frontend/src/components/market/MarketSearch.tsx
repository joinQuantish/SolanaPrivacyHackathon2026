import React, { useState, useEffect, useCallback } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { Spinner } from '../common/Spinner';

export function MarketSearch() {
  const { search, searchQuery, isSearching, clearSearch } = useMarketStore();
  const [inputValue, setInputValue] = useState(searchQuery);

  // Debounce search - increased to 500ms to reduce API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue.trim()) {
        search(inputValue);
      } else {
        clearSearch();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [inputValue, search, clearSearch]);

  const handleClear = useCallback(() => {
    setInputValue('');
    clearSearch();
  }, [clearSearch]);

  return (
    <div className="relative">
      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-qn-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search markets... (e.g., bitcoin, election, weather)"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          className="w-full bg-white border-2 border-qn-black pl-12 pr-12 py-4
                     text-qn-black font-mono
                     focus:outline-none focus:shadow-brutal
                     transition-all duration-100 placeholder:text-qn-gray-400"
        />
        {isSearching ? (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Spinner size="sm" />
          </div>
        ) : inputValue && (
          <button
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-qn-gray-400 hover:text-qn-black"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
