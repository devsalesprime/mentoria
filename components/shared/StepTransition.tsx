import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface StepTransitionProps {
  message: string;
  duration?: number;
  onComplete: () => void;
}

export const StepTransition: React.FC<StepTransitionProps> = ({
  message,
  duration = 800,
  onComplete,
}) => {
  const prefersReduced = useReducedMotion();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // In reduced motion, show briefly and dismiss quickly
    const delay = prefersReduced ? 400 : duration;
    timerRef.current = setTimeout(() => {
      onComplete();
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, onComplete, prefersReduced]);

  if (prefersReduced) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-white/50 italic font-serif text-base text-center">{message}</p>
      </div>
    );
  }

  return (
    <motion.div
      className="flex items-center justify-center py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        opacity: {
          times: [0, 0.25, 0.75, 1],
          duration: duration / 1000,
          ease: 'easeInOut',
        },
      }}
    >
      <p className="text-white/50 italic font-serif text-base text-center">{message}</p>
    </motion.div>
  );
};
