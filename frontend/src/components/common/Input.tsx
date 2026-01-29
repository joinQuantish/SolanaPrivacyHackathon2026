import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({
  label,
  error,
  className = '',
  ...props
}: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-bold text-qn-gray-600 mb-1.5 uppercase tracking-wider font-mono">
          {label}
        </label>
      )}
      <input
        className={`
          input-field
          ${error ? 'border-accent-red focus:border-accent-red' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-accent-red font-mono">{error}</p>
      )}
    </div>
  );
}
