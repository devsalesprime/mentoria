import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SECTIONS, SECTION_DISPLAY_NUM } from '../../utils/brand-brain-constants';
import { Button } from '../ui/Button';

export const ExpertNotesPanel: React.FC<{
  notes: Record<string, string> | null;
  open: boolean;
  onClose: () => void;
  initialSection?: string;
}> = ({ notes, open, onClose, initialSection }) => {
  const hasNotes = notes && Object.values(notes).some(v => v && v.trim());
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll to section when panel opens with initialSection
  useEffect(() => {
    if (open && initialSection && sectionRefs.current[initialSection]) {
      setTimeout(() => {
        sectionRefs.current[initialSection]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 350); // Wait for slide-in animation
    }
  }, [open, initialSection]);

  const scrollToSection = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-prosperus-navy-panel border-l border-white/10 z-50 overflow-y-auto"
          >
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <h3 className="text-lg font-bold text-white">Notas do Especialista</h3>
                    <p className="text-xs text-white/50">Contexto sobre as decisões do seu Brand Brain</p>
                  </div>
                </div>
                <Button
                  variant="icon"
                  onClick={onClose}
                  className="p-2 rounded-lg"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </Button>
              </div>

              {/* Section quick-nav buttons */}
              {hasNotes && (
                <div className="flex gap-1.5">
                  {SECTIONS.map(s => {
                    const hasNote = notes?.[s.id] && notes[s.id].trim();
                    return (
                      <button
                        key={s.id}
                        onClick={() => scrollToSection(s.id)}
                        disabled={!hasNote}
                        className={`flex-1 px-2 py-2 rounded-lg text-center transition border ${
                          hasNote
                            ? 'bg-white/5 border-white/10 hover:border-prosperus-gold-dark/30 hover:bg-prosperus-gold-dark/[0.06]'
                            : 'bg-white/5 border-white/5 opacity-30 cursor-not-allowed'
                        }`}
                      >
                        <span className="text-base block">{s.icon}</span>
                        <span className="text-[9px] text-white/50 font-semibold uppercase tracking-wide">{SECTION_DISPLAY_NUM[s.id]}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {!hasNotes ? (
                <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                  <span className="text-3xl block mb-3">📝</span>
                  <p className="text-white/50 text-sm">Nenhuma nota do especialista disponível para este Brand Brain.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-white/50 leading-relaxed">
                    Abaixo estão as notas do especialista que preparou seu Brand Brain, explicando como as informações do seu diagnóstico foram transformadas em cada seção.
                  </p>
                  {SECTIONS.map(s => {
                    const note = notes?.[s.id];
                    if (!note || !note.trim()) return null;
                    return (
                      <div
                        key={s.id}
                        ref={(el) => { sectionRefs.current[s.id] = el; }}
                        className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2 scroll-mt-4"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{s.icon}</span>
                          <h4 className="text-sm font-semibold text-prosperus-gold-dark">{s.title}</h4>
                        </div>
                        <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{note}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
