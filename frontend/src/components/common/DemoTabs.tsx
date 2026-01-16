import React from 'react';

export type DemoTab = 'mainnet' | 'devnet';

interface DemoTabsProps {
  activeTab: DemoTab;
  onTabChange: (tab: DemoTab) => void;
}

export function DemoTabs({ activeTab, onTabChange }: DemoTabsProps) {
  return (
    <div className="flex items-center justify-center gap-1 p-1 bg-obsidian-800/50 rounded-xl border border-obsidian-700 mb-6">
      <button
        onClick={() => onTabChange('mainnet')}
        className={`
          px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
          ${activeTab === 'mainnet'
            ? 'bg-accent-purple text-white'
            : 'text-obsidian-400 hover:text-obsidian-200 hover:bg-obsidian-700/50'
          }
        `}
      >
        <span className="flex items-center gap-2">
          <span className="text-accent-green">●</span>
          Live Demo (Mainnet)
        </span>
      </button>
      <button
        onClick={() => onTabChange('devnet')}
        className={`
          px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
          ${activeTab === 'devnet'
            ? 'bg-accent-purple text-white'
            : 'text-obsidian-400 hover:text-obsidian-200 hover:bg-obsidian-700/50'
          }
        `}
      >
        <span className="flex items-center gap-2">
          <span className="text-[rgb(56,190,231)]">●</span>
          Arcium MPC (Devnet)
        </span>
      </button>
    </div>
  );
}
