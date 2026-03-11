import React from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { ParsedSubsection, PROSE_CLASSES, wrapSuggestionGroups } from '../../utils/brand-brain-parser';

export interface SubsectionCardProps {
  sub: ParsedSubsection;
}

export const SubsectionCard: React.FC<SubsectionCardProps> = ({ sub }) => {
  // Cluster mode
  if (sub.clusterItems && sub.clusterItems.length > 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
          <span className="text-lg flex-shrink-0">{sub.icon}</span>
          <h4 className="text-sm font-bold text-prosperus-gold-dark tracking-wide uppercase">{sub.title}</h4>
        </div>
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {sub.clusterItems.map((item, i) => {
            const itemHtml = DOMPurify.sanitize(marked.parse(item) as string);
            return (
              <div
                key={i}
                className={`bg-white/5 border border-white/5 rounded-lg px-4 py-3 ${PROSE_CLASSES}`}
                dangerouslySetInnerHTML={{ __html: itemHtml }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  const rawHtml = DOMPurify.sanitize(marked.parse(sub.body) as string);
  // Apply suggestion-group wrapping for 1C Sugestoes de Otimizacao and similar patterns
  const isSuggestionSection = /sugest|otimiza/i.test(sub.title);
  const html = isSuggestionSection ? wrapSuggestionGroups(rawHtml) : rawHtml;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-5 pt-4 pb-1 flex items-center gap-2.5">
        <span className="text-lg flex-shrink-0">{sub.icon}</span>
        <h4 className="text-sm font-bold text-prosperus-gold-dark tracking-wide uppercase">{sub.title}</h4>
      </div>
      <div
        className={`px-5 pb-5 pt-2 overflow-x-auto ${PROSE_CLASSES}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
