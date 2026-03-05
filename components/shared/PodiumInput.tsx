import React, { useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface PodiumInputProps {
  gold: string;
  silver: string;
  bronze: string;
  onGoldChange: (value: string) => void;
  onSilverChange: (value: string) => void;
  onBronzeChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  goldError?: boolean;
  silverError?: boolean;
  bronzeError?: boolean;
}

interface SlotConfig {
  key: 'gold' | 'silver' | 'bronze';
  rank: string;
  label: string;
  medal: string;
  borderColor: string;
  shadowColor: string;
  medalColor: string;
  value: string;
  onChange: (v: string) => void;
  elevated: boolean;
  hasError: boolean;
}

const MedalIcon: React.FC<{ medal: string; filled: boolean }> = ({ medal, filled }) => {
  const prefersReduced = useReducedMotion();
  const prevFilled = useRef(filled);

  const shouldBounce = filled && !prevFilled.current;
  useEffect(() => {
    prevFilled.current = filled;
  });

  return (
    <motion.span
      className="text-3xl block text-center"
      animate={
        shouldBounce && !prefersReduced
          ? { scale: [1, 1.35, 0.9, 1.1, 1] }
          : { scale: 1 }
      }
      transition={
        shouldBounce && !prefersReduced
          ? { type: 'tween', duration: 0.4, ease: 'easeOut' }
          : { type: 'spring', stiffness: 300, damping: 10 }
      }
    >
      {medal}
    </motion.span>
  );
};

export const PodiumInput: React.FC<PodiumInputProps> = ({
  gold,
  silver,
  bronze,
  onGoldChange,
  onSilverChange,
  onBronzeChange,
  placeholder = 'Describe this achievement...',
  multiline = false,
  goldError = false,
  silverError = false,
  bronzeError = false,
}) => {
  const slots: SlotConfig[] = [
    {
      key: 'silver',
      rank: '2nd',
      label: 'Silver',
      medal: '🥈',
      borderColor: 'border-medal-silver/50',
      shadowColor: 'shadow-[0_0_12px_rgba(192,192,192,0.08)]',
      medalColor: 'text-medal-silver',
      value: silver,
      onChange: onSilverChange,
      elevated: false,
      hasError: silverError,
    },
    {
      key: 'gold',
      rank: '1st',
      label: 'Gold',
      medal: '🥇',
      borderColor: 'border-medal-gold/50',
      shadowColor: 'shadow-[0_0_16px_rgba(255,215,0,0.10)]',
      medalColor: 'text-medal-gold',
      value: gold,
      onChange: onGoldChange,
      elevated: true,
      hasError: goldError,
    },
    {
      key: 'bronze',
      rank: '3rd',
      label: 'Bronze',
      medal: '🥉',
      borderColor: 'border-medal-bronze/50',
      shadowColor: 'shadow-[0_0_12px_rgba(205,127,50,0.08)]',
      medalColor: 'text-medal-bronze',
      value: bronze,
      onChange: onBronzeChange,
      elevated: false,
      hasError: bronzeError,
    },
  ];

  // Mobile order: Gold, Silver, Bronze
  const mobileSlots: SlotConfig[] = [
    slots[1], // gold
    slots[0], // silver
    slots[2], // bronze
  ];

  const inputClass = (slot: SlotConfig) =>
    `w-full p-2.5 bg-prosperus-navy border ${slot.hasError ? 'border-red-500' : slot.borderColor} rounded-lg text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-prosperus-gold-dark/50 resize-none transition-colors`;

  const renderInput = (slot: SlotConfig) => (
    <>
      {multiline ? (
        <textarea
          value={slot.value}
          onChange={(e) => slot.onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          aria-label={`${slot.label} — ${slot.rank} place achievement`}
          aria-required="true"
          className={inputClass(slot)}
        />
      ) : (
        <input
          type="text"
          value={slot.value}
          onChange={(e) => slot.onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={`${slot.label} — ${slot.rank} place achievement`}
          aria-required="true"
          className={inputClass(slot)}
        />
      )}
      <p className="text-xs text-red-400/70 font-sans mt-1">
        <span aria-hidden="true">*</span> Obrigatório
      </p>
    </>
  );

  return (
    <div>
      {/* Desktop: 3-column podium */}
      <div className="hidden md:grid md:grid-cols-3 md:gap-4 md:items-end">
        {slots.map((slot) => (
          <div
            key={slot.key}
            className={`bg-prosperus-navy-mid border ${slot.borderColor} ${slot.shadowColor} rounded-lg p-4 flex flex-col gap-3 ${
              slot.elevated ? 'pb-6 pt-8' : 'pb-4 pt-6'
            }`}
          >
            <MedalIcon medal={slot.medal} filled={slot.value.length > 0} />
            <div className={`text-center text-xs font-semibold ${slot.medalColor} font-sans`}>
              {slot.rank} — {slot.label}
            </div>
            {renderInput(slot)}
          </div>
        ))}
      </div>

      {/* Mobile: vertical stack — Gold, Silver, Bronze */}
      <div className="flex flex-col gap-3 md:hidden">
        {mobileSlots.map((slot) => (
          <div
            key={slot.key}
            className={`bg-prosperus-navy-mid border ${slot.borderColor} rounded-lg p-4 flex items-start gap-3`}
          >
            <MedalIcon medal={slot.medal} filled={slot.value.length > 0} />
            <div className="flex-1">
              <div className={`text-xs font-semibold ${slot.medalColor} font-sans mb-2`}>
                {slot.rank} — {slot.label}
              </div>
              {renderInput(slot)}
            </div>
          </div>
        ))}
      </div>

      {/* Helper tip */}
      <p className="text-sm text-white/50 italic font-sans mt-3 text-center">
        Pense em resultados, não credenciais. "Ajudei 200 mentores a escalar" &gt; "MBA da universidade X"
      </p>
    </div>
  );
};
