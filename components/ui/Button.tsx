import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'danger-soft'
  | 'success'
  | 'outline'
  | 'link'
  | 'icon';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, 'disabled'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-prosperus-gold-dark hover:bg-prosperus-gold-hover text-black font-bold',
  secondary:
    'bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/10',
  ghost:
    'bg-transparent hover:bg-white/5 text-white/60 hover:text-white font-semibold',
  danger:
    'bg-red-600 hover:bg-red-700 text-white font-semibold',
  'danger-soft':
    'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-semibold',
  success:
    'bg-green-600 hover:bg-green-700 text-white font-semibold',
  outline:
    'border border-white/20 bg-transparent text-white/70 hover:text-white hover:bg-white/5 font-semibold',
  link:
    'bg-transparent text-white/50 hover:text-white font-semibold',
  icon:
    'p-1.5 rounded bg-transparent hover:bg-white/10 text-white/50 hover:text-white/70',
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'px-2 py-1 text-[10px]',
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
  xl: 'px-6 py-3 text-sm',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className,
  disabled = false,
  loading = false,
  fullWidth = false,
  ...props
}) => {
  const isIcon = variant === 'icon';
  const isLink = variant === 'link';

  const base = [
    'font-sans rounded-lg transition-all duration-200 inline-flex items-center justify-center gap-2',
    !isIcon && sizeStyles[size],
    variantStyles[variant],
    fullWidth && 'w-full',
    (disabled || loading) && 'opacity-50 cursor-not-allowed pointer-events-none',
    isLink && 'hover:underline',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.button
      whileHover={disabled || loading ? undefined : { scale: 1.02 }}
      whileTap={disabled || loading ? undefined : { scale: 0.98 }}
      className={`${base} ${className || ''}`}
      type="button"
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </motion.button>
  );
};
