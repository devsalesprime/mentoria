import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ASSET_CATALOG, getTotalAgencyValue, formatCurrency } from './assetConfig';
import { hasSeenArrival, markArrivalSeen } from './useInlineEdit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetArrivalScreenProps {
  mentorName: string;
  programName?: string;
  userId?: string | null;
  onComplete: () => void;
}

// ─── Counter hook ─────────────────────────────────────────────────────────────

function useCountUp(
  target: number,
  duration: number,
  shouldStart: boolean
): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldStart) return;

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic for a satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration, shouldStart]);

  return value;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AssetArrivalScreen: React.FC<AssetArrivalScreenProps> = ({
  mentorName,
  programName = 'Programa',
  userId,
  onComplete,
}) => {
  const [phase, setPhase] = useState<'hero' | 'assets' | 'total' | 'cta'>('hero');
  const [visibleAssets, setVisibleAssets] = useState(0);
  const [counterDone, setCounterDone] = useState(false);

  const totalValue = getTotalAgencyValue();
  const assetCount = ASSET_CATALOG.length;

  const counterValue = useCountUp(
    totalValue,
    1500,
    phase === 'total' || phase === 'cta'
  );

  // Track when counter finishes
  useEffect(() => {
    if (counterValue === totalValue && (phase === 'total' || phase === 'cta')) {
      setCounterDone(true);
    }
  }, [counterValue, totalValue, phase]);

  // Show CTA after counter completes
  useEffect(() => {
    if (counterDone && phase === 'total') {
      const timer = setTimeout(() => setPhase('cta'), 400);
      return () => clearTimeout(timer);
    }
  }, [counterDone, phase]);

  // Phase progression: hero → assets
  useEffect(() => {
    const timer = setTimeout(() => setPhase('assets'), 1800);
    return () => clearTimeout(timer);
  }, []);

  // Staggered asset reveal
  useEffect(() => {
    if (phase !== 'assets') return;

    if (visibleAssets >= assetCount) {
      // All assets visible — move to total phase
      const timer = setTimeout(() => setPhase('total'), 600);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setVisibleAssets((prev) => prev + 1);
    }, 400);

    return () => clearTimeout(timer);
  }, [phase, visibleAssets, assetCount]);

  const handleCTA = useCallback(() => {
    markArrivalSeen(userId);
    onComplete();
  }, [onComplete, userId]);

  // If already seen, don't render
  if (hasSeenArrival(userId)) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-prosperus-navy-dark flex items-center justify-center overflow-y-auto">
      <div className="w-full max-w-2xl mx-auto px-6 py-12 flex flex-col items-center">
        {/* ── Hero heading ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="text-center mb-10"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-5xl mb-6"
          >
            &#10024;
          </motion.div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">
            Seus Ativos Est&atilde;o Prontos
          </h1>
          <p className="text-white/50 text-base sm:text-lg max-w-md mx-auto">
            Criamos{' '}
            <span className="text-prosperus-gold-dark font-semibold">{assetCount} ferramentas exclusivas</span>
            {' '}para o {programName} de{' '}
            <span className="text-white font-semibold">{mentorName}</span>
          </p>
        </motion.div>

        {/* ── Asset list card ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {(phase === 'assets' || phase === 'total' || phase === 'cta') && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-6 sm:p-8 mb-8"
            >
              {/* Asset rows */}
              <div className="space-y-0">
                {ASSET_CATALOG.map((asset, index) => (
                  <AnimatePresence key={asset.assetId}>
                    {index < visibleAssets && (
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          duration: 0.4,
                          ease: 'easeOut',
                        }}
                        className={`flex items-center justify-between py-3 ${
                          index < ASSET_CATALOG.length - 1
                            ? 'border-b border-white/5'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl w-8 text-center flex-shrink-0">
                            {asset.icon}
                          </span>
                          <span className="text-white text-sm sm:text-base font-medium">
                            {asset.name}
                          </span>
                        </div>
                        <span className="text-prosperus-gold-dark font-semibold text-sm sm:text-base tabular-nums flex-shrink-0 ml-4">
                          {formatCurrency(asset.agencyValue)}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                ))}
              </div>

              {/* ── Total separator + value ──────────────────────────────── */}
              <AnimatePresence>
                {(phase === 'total' || phase === 'cta') && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <div className="border-t border-prosperus-gold-dark/30 mt-4 pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl w-8 text-center flex-shrink-0">
                            &#128176;
                          </span>
                          <span className="text-white text-base sm:text-lg font-bold">
                            Total de Valor
                          </span>
                        </div>
                        <span className="text-prosperus-gold-dark font-bold text-lg sm:text-xl tabular-nums flex-shrink-0 ml-4">
                          {formatCurrency(counterValue)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CTA Button ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {phase === 'cta' && (
            <motion.button
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              onClick={handleCTA}
              className="px-8 py-4 bg-prosperus-gold-dark hover:bg-prosperus-gold-hover text-black font-bold text-base sm:text-lg rounded-xl transition-colors duration-200 shadow-lg shadow-prosperus-gold-dark/20"
            >
              Começar minha jornada de lançamento &rarr;
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Subtle skip for impatient users ─────────────────────────────── */}
        {phase !== 'cta' && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 3, duration: 0.5 }}
            onClick={handleCTA}
            className="mt-8 text-white/50 hover:text-white/50 text-xs transition-colors"
          >
            Pular apresenta&ccedil;&atilde;o
          </motion.button>
        )}
      </div>
    </div>
  );
};
