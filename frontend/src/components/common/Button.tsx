import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseClasses = 'font-bold transition-all duration-100 flex items-center justify-center gap-2 uppercase tracking-wider border-2';

  const variantClasses = {
    primary: 'bg-qn-black text-white border-qn-black hover:shadow-brutal hover:translate-x-[-1px] hover:translate-y-[-1px]',
    secondary: 'bg-white text-qn-black border-qn-black hover:shadow-brutal-sm hover:translate-x-[-1px] hover:translate-y-[-1px]',
    ghost: 'text-qn-gray-500 hover:text-qn-black border-transparent hover:border-qn-black',
    danger: 'bg-accent-red text-white border-accent-red hover:shadow-brutal-red hover:translate-x-[-1px] hover:translate-y-[-1px]',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const isDisabled = disabled || loading;

  return (
    <button
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
      disabled={isDisabled}
      {...props}
    >
      {loading && <span className="spinner" />}
      {children}
    </button>
  );
}
