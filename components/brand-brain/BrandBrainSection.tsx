import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SectionDef } from '../../utils/brand-brain-constants';
import { extractContentText } from '../../utils/brand-brain-constants';
import { parseSubsections, renderJsonAsHtml } from '../../utils/brand-brain-parser';
import { SubsectionCard } from './SubsectionCard';

export interface SectionProps {
  sectionDef: SectionDef;
  content: any;
}

export const BrandBrainSection: React.FC<SectionProps> = ({
  sectionDef,
  content,
}) => {
  const expanded = true; // Always expanded — read-only reference mode

  const contentText = extractContentText(content);
  const subsections = useMemo(
    () => (contentText ? parseSubsections(contentText) : []),
    [contentText]
  );
  const isStructuredJson = !contentText && typeof content === 'object' && content !== null;
  const jsonHtml = useMemo(
    () => (isStructuredJson ? renderJsonAsHtml(content) : ''),
    [isStructuredJson, content]
  );

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="w-full flex items-center justify-between px-6 py-5 text-left">
        <div className="flex items-center gap-3.5">
          <span className="text-2xl flex-shrink-0">{sectionDef.icon}</span>
          <div>
            <h3 className="font-bold text-white text-base leading-tight">{sectionDef.title}</h3>
            <p className="text-[11px] text-white/30 mt-0.5">{sectionDef.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Content — always visible */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-4">
              {/* Subsection cards */}
              {subsections.length > 0 ? (
                <div className="columns-1 lg:columns-2 gap-3">
                  {subsections.map((sub, idx) => (
                    <div
                      key={`${sub.title}-${idx}`}
                      className="pb-3 break-inside-avoid"
                      style={sub.fullWidth ? { columnSpan: 'all' } : undefined}
                    >
                      <SubsectionCard sub={sub} />
                    </div>
                  ))}
                </div>
              ) : isStructuredJson ? (
                <div dangerouslySetInnerHTML={{ __html: jsonHtml }} />
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <p className="text-sm text-white/50 italic">Conteúdo desta seção ainda não disponível.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
