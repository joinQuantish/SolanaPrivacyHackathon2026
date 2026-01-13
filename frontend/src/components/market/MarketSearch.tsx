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
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
          style={{ color: 'var(--text-tertiary)' }}
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
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--primary-stroke)',
            color: 'var(--text-primary)',
          }}
          className="w-full border rounded-xl pl-12 pr-12 py-4
                     focus:outline-none focus:border-[var(--primary-color)] focus:ring-1 focus:ring-[var(--primary-color)]
                     transition-all duration-200 placeholder:text-[var(--text-tertiary)]"
        />
        {isSearching ? (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Spinner size="sm" />
          </div>
        ) : inputValue && (
          <button
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-obsidian-500 hover:text-obsidian-300"
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
