import React from 'react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface LoadingSpinnerProps {
  size?: SpinnerSize;
  label?: string;
  className?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  label,
  className,
}) => {
  return (
    <div className={`inline-flex items-center gap-2 ${className || ''}`}>
      <svg
        className={`animate-spin text-prosperus-gold-dark ${sizeStyles[size]}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label && <span className="text-sm text-white/60">{label}</span>}
    </div>
  );
};
