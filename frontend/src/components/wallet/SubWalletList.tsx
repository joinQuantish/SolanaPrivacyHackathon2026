import React, { useState } from 'react';
import { useWalletStore } from '../../store/walletStore';
import { SubWalletCard } from './SubWalletCard';
import { CreateWalletModal } from './CreateWalletModal';
import { Button } from '../common/Button';

export function SubWalletList() {
  const { subWallets } = useWalletStore();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-qn-black uppercase tracking-wide">
          Sub-Wallets
        </h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowCreate(true)}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Wallet
        </Button>
      </div>

      {subWallets.length === 0 ? (
        <div className="text-center py-8 bg-white border-2 border-dashed border-qn-black">
          <p className="text-qn-gray-500 mb-3">No sub-wallets yet</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCreate(true)}
          >
            Create your first sub-wallet
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subWallets.map(wallet => (
            <SubWalletCard key={wallet.id} wallet={wallet} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateWalletModal
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
