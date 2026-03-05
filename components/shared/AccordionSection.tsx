import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

interface AccordionSectionProps {
  title: string;
  icon: string;
  badge?: 'optional' | 'recommended' | 'required';
  badgeLabel?: string;
  isComplete: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const badgeStyles: Record<string, string> = {
  optional: 'bg-white/10 text-white/50',
  recommended: 'bg-prosperus-gold-dark/20 text-prosperus-gold-light',
  required: 'bg-red-500/20 text-red-400',
};

export const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  icon,
  badge,
  badgeLabel,
  isComplete,
  isOpen,
  onToggle,
  children,
}) => {
  const prefersReduced = useReducedMotion();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prosperus-gold-dark"
      >
        <span className="text-lg flex-shrink-0">{icon}</span>
        <span className="font-serif text-base text-white flex-1">{title}</span>

        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${badgeStyles[badge]}`}>
            {badgeLabel ?? badge}
          </span>
        )}

        {/* Completion indicator */}
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          {isComplete ? (
            <motion.svg
              viewBox="0 0 20 20"
              className="w-5 h-5 text-green-400"
              initial={prefersReduced ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.path
                d="M4 10l4 4 8-8"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                initial={prefersReduced ? { pathLength: 1 } : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </motion.svg>
          ) : (
            <span className="w-4 h-4 rounded-full border border-white/20" />
          )}
        </span>

        {/* Chevron */}
        <motion.span
          className="flex-shrink-0 text-white/50 text-xs"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={prefersReduced ? { duration: 0 } : { duration: 0.2 }}
        >
          ▼
        </motion.span>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="p-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
