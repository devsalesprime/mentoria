import React from 'react';

interface LogoProps {
  className?: string;
  color?: string; // Prop kept for compatibility but not used for image
  variant?: 'primary' | 'footer';
}

export const Logo: React.FC<LogoProps> = ({ className = "w-40 h-40", variant = 'primary' }) => {
  const logoSrc = variant === 'footer' 
    ? "https://salesprime.com.br/wp-content/uploads/2025/11/logo-prosperus.svg" 
    : "https://salesprime.com.br/wp-content/uploads/2025/11/logo-prosperus.svg";

  return (
    <img 
      src={logoSrc}
      alt="Prosperus Club Logo"
      className={`${className} object-contain`}
    />
  );
};