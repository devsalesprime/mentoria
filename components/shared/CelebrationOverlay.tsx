import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

interface CelebrationOverlayProps {
  message: string;
  subMessage?: string;
  duration?: number;
  variant?: 'step' | 'module';
  onComplete: () => void;
}

// Deterministic confetti pieces to avoid random SSR issues
const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: ((i * 37 + 13) % 80) + 10, // 10-90% horizontal
  delay: (i * 0.06) % 0.8,
  size: (i % 3) + 6, // 6-8px
  shape: i % 2 === 0 ? 'rect' : 'circle',
  rotation: (i * 47) % 360,
}));

const ConfettiPiece: React.FC<{ x: number; delay: number; size: number; shape: string; rotation: number }> = ({
  x, delay, size, shape, rotation,
}) => (
  <motion.div
    className={shape === 'circle' ? 'rounded-full' : 'rounded-sm'}
    style={{
      position: 'absolute',
      left: `${x}%`,
      top: '50%',
      width: size,
      height: size,
      backgroundColor: '#CA9A43',
      rotate: rotation,
    }}
    initial={{ y: 0, opacity: 1, scale: 1 }}
    animate={{
      y: [0, -(60 + (x % 40)), 40],
      opacity: [1, 1, 0],
      scale: [1, 1.1, 0.5],
    }}
    transition={{
      duration: 1.2,
      delay,
      ease: 'easeOut',
    }}
  />
);

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({
  message,
  subMessage,
  duration = 1500,
  variant = 'step',
  onComplete,
}) => {
  const prefersReduced = useReducedMotion();
  const effectiveDuration = prefersReduced ? duration / 2 : duration;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onComplete();
    }, effectiveDuration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [effectiveDuration, onComplete]);

  if (variant === 'step') {
    return (
      <motion.div
        className="flex items-center justify-center py-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReduced ? 0 : 0.3 }}
      >
        <p className="text-white/70 italic font-serif text-lg text-center">{message}</p>
      </motion.div>
    );
  }

  // Module variant — full overlay with confetti
  return (
    <motion.div
      className="relative flex flex-col items-center justify-center py-12 px-6 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReduced ? 0 : 0.4 }}
    >
      {/* Confetti particles — hidden in reduced motion */}
      {!prefersReduced && (
        <div className="absolute inset-0 pointer-events-none">
          {CONFETTI.map((p) => (
            <ConfettiPiece key={p.id} {...p} />
          ))}
        </div>
      )}

      {/* Background glow */}
      <div className="absolute inset-0 bg-prosperus-gold-dark/5 rounded-lg pointer-events-none" />

      {/* Content */}
      <motion.div
        className="relative z-10 text-center"
        initial={prefersReduced ? {} : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3, type: 'spring' }}
      >
        <div className="text-4xl mb-3">🎉</div>
        <h3 className="font-serif text-2xl text-white mb-1">{message}</h3>
        {subMessage && (
          <p className="text-sm text-white/60 font-sans">{subMessage}</p>
        )}
      </motion.div>
    </motion.div>
  );
};
