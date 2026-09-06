import React from 'react';
import { motion } from 'framer-motion';

interface SectionWarningProps {
  message: string;
  variant?: 'warning' | 'info';
}

export const SectionWarning: React.FC<SectionWarningProps> = ({ message, variant = 'warning' }) => {
  const isWarning = variant === 'warning';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-start gap-3 p-4 rounded-lg border ${
        isWarning
          ? 'bg-amber-900/20 border-amber-600/30 text-amber-200'
          : 'bg-blue-900/20 border-blue-600/30 text-blue-200'
      }`}
    >
      {/* icone em SVG: nada de emoji na tela do mentor */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 flex-shrink-0 w-5 h-5"
        role="img"
        aria-label={isWarning ? 'Atenção' : 'Informação'}
      >
        {isWarning ? (
          <>
            <path d="M10.3 3.9 1.8 18.3a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 8h.01" />
          </>
        )}
      </svg>
      <p className="text-sm leading-relaxed font-sans whitespace-pre-line">{message}</p>
    </motion.div>
  );
};
