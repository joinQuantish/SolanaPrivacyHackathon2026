import React from 'react';

interface CardProps {
  variant?: 'default' | 'master';
  className?: string;
  children: React.ReactNode;
}

export function Card({ variant = 'default', className = '', children }: CardProps) {
  const baseClasses = variant === 'master' ? 'wallet-card-master' : 'wallet-card';

  return (
    <div className={`${baseClasses} ${className}`}>
      {children}
    </div>
  );
}
