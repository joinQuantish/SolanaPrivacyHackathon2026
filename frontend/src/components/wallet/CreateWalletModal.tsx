import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useWalletStore } from '../../store/walletStore';

interface CreateWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLORS = [
  '#8b5cf6', // Purple
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
];

export function CreateWalletModal({ isOpen, onClose }: CreateWalletModalProps) {
  const { createSubWallet, isLoading, error, clearError } = useWalletStore();
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!label.trim()) return;

    const success = await createSubWallet(label.trim(), color);

    if (success) {
      setLabel('');
      setColor(COLORS[0]);
      onClose();
    }
  };

  const handleClose = () => {
    clearError();
    setLabel('');
    setColor(COLORS[0]);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Sub-Wallet">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Wallet Name"
          placeholder="e.g., Trading, Savings, DCA..."
          value={label}
          onChange={e => setLabel(e.target.value)}
          autoFocus
        />

        <div>
          <label className="block text-xs font-bold text-qn-gray-600 uppercase tracking-wider font-mono mb-2">
            Color
          </label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`
                  w-8 h-8 transition-all border-2
                  ${color === c ? 'border-qn-black scale-110 shadow-brutal-sm' : 'border-transparent hover:scale-105'}
                `}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-accent-red">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isLoading}
            disabled={!label.trim()}
            className="flex-1"
          >
            Create Wallet
          </Button>
        </div>
      </form>
    </Modal>
  );
}
