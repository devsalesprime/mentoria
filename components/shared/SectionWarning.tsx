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
      <span className="mt-0.5 flex-shrink-0 text-lg">
        {isWarning ? '⚠️' : 'ℹ️'}
      </span>
      <p className="text-sm leading-relaxed font-sans whitespace-pre-line">{message}</p>
    </motion.div>
  );
};
