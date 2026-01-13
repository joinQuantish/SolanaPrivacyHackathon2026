import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  };

  return (
    <div
      className={`
        ${sizeClasses[size]}
        border-obsidian-600 border-t-accent-purple
        rounded-full animate-spin
        ${className}
      `}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="fixed inset-0 bg-obsidian-900 flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
