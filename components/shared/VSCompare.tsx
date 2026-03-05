import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface VSCompareProps {
  leftLabel: string;
  rightLabel: string;
  leftContent: React.ReactNode;
  rightContent: React.ReactNode;
  vsIcon?: string;
}

export const VSCompare: React.FC<VSCompareProps> = ({
  leftLabel,
  rightLabel,
  leftContent,
  rightContent,
  vsIcon = '⚡',
}) => {
  const prefersReduced = useReducedMotion();

  return (
    <div className="w-full">
      {/* Desktop: side-by-side */}
      <div className="hidden md:flex md:items-stretch md:gap-0">
        {/* Left column — muted */}
        <div className="flex-1 bg-white/5 border border-white/10 rounded-l-lg p-4 flex flex-col gap-3">
          <span className="text-xs font-semibold text-white/50 tracking-widest uppercase font-sans">
            {leftLabel}
          </span>
          <div className="flex-1">{leftContent}</div>
        </div>

        {/* VS badge — centered vertically */}
        <div className="flex flex-col items-center justify-center px-3 flex-shrink-0">
          <div className="bg-white/10 rounded-full w-10 h-10 flex items-center justify-center text-lg border border-white/10">
            {vsIcon}
          </div>
        </div>

        {/* Right column — gold highlighted with pulse */}
        <motion.div
          className="flex-1 bg-prosperus-gold-dark/5 border border-prosperus-gold-dark/30 rounded-r-lg p-4 flex flex-col gap-3"
          animate={
            prefersReduced
              ? {}
              : {
                  boxShadow: [
                    '0 0 0px rgba(202,154,67,0)',
                    '0 0 20px rgba(202,154,67,0.12)',
                    '0 0 0px rgba(202,154,67,0)',
                  ],
                }
          }
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="text-xs font-semibold text-prosperus-gold-dark tracking-widest uppercase font-sans">
            {rightLabel}
          </span>
          <div className="flex-1">{rightContent}</div>
        </motion.div>
      </div>

      {/* Mobile: stacked */}
      <div className="flex flex-col gap-3 md:hidden">
        {/* Left */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex flex-col gap-3">
          <span className="text-xs font-semibold text-white/50 tracking-widest uppercase font-sans">
            {leftLabel}
          </span>
          {leftContent}
        </div>

        {/* VS divider */}
        <div className="flex items-center justify-center">
          <div className="bg-white/10 rounded-full w-10 h-10 flex items-center justify-center text-lg border border-white/10">
            {vsIcon}
          </div>
        </div>

        {/* Right */}
        <div className="bg-prosperus-gold-dark/5 border border-prosperus-gold-dark/30 rounded-lg p-4 flex flex-col gap-3">
          <span className="text-xs font-semibold text-prosperus-gold-dark tracking-widest uppercase font-sans">
            {rightLabel}
          </span>
          {rightContent}
        </div>
      </div>
    </div>
  );
};
