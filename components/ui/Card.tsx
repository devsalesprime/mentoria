import React from 'react';

export type CardVariant = 'default' | 'elevated' | 'outlined';
export type CardPadding = 'compact' | 'standard' | 'generous' | 'none';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: CardVariant;
  padding?: CardPadding;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-white/5 border border-white/10 rounded-xl',
  elevated: 'bg-white/5 border border-white/10 rounded-xl shadow-lg',
  outlined: 'bg-transparent border border-white/10 rounded-xl',
};

const paddingStyles: Record<CardPadding, string> = {
  compact: 'p-3',
  standard: 'p-4',
  generous: 'p-6',
  none: '',
};

export const Card: React.FC<CardProps> = ({
  children,
  className,
  variant = 'default',
  padding = 'standard',
  onClick,
}) => {
  const base = `${variantStyles[variant]} ${paddingStyles[padding]}`;
  const interactive = onClick ? 'cursor-pointer hover:bg-white/10 transition-colors' : '';

  return (
    <div
      className={`${base} ${interactive} ${className || ''}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};
