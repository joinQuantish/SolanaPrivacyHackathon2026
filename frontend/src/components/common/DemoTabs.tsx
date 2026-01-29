import React from 'react';

export type DemoTab = 'mainnet' | 'devnet';

interface DemoTabsProps {
  activeTab: DemoTab;
  onTabChange: (tab: DemoTab) => void;
}

export function DemoTabs({ activeTab, onTabChange }: DemoTabsProps) {
  return (
    <div className="flex items-center gap-0 mb-6 border-2 border-qn-black bg-white inline-flex">
      <button
        onClick={() => onTabChange('mainnet')}
        className={`
          px-5 py-2.5 text-sm font-bold uppercase tracking-wider transition-all duration-100 font-mono
          ${activeTab === 'mainnet'
            ? 'bg-qn-black text-white'
            : 'bg-white text-qn-gray-500 hover:text-qn-black hover:bg-qn-gray-100'
          }
        `}
      >
        <span className="flex items-center gap-2">
          <span className={activeTab === 'mainnet' ? 'text-accent-green' : 'text-accent-green'}>●</span>
          Live Demo
        </span>
      </button>
      <button
        onClick={() => onTabChange('devnet')}
        className={`
          px-5 py-2.5 text-sm font-bold uppercase tracking-wider transition-all duration-100 font-mono
          border-l-2 border-qn-black
          ${activeTab === 'devnet'
            ? 'bg-qn-black text-white'
            : 'bg-white text-qn-gray-500 hover:text-qn-black hover:bg-qn-gray-100'
          }
        `}
      >
        <span className="flex items-center gap-2">
          <span className={activeTab === 'devnet' ? 'text-accent-cyan' : 'text-accent-cyan'}>●</span>
          Arcium MPC
        </span>
      </button>
    </div>
  );
}
