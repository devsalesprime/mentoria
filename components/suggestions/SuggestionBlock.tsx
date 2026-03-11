import React from 'react';

export interface SuggestionBlockData {
  voceRespondeu: string;
  nosSugerimos: string;
  porque: string;
}

interface SuggestionBlockProps {
  data: SuggestionBlockData;
  index: number;
}

export const SuggestionBlock: React.FC<SuggestionBlockProps> = ({ data, index }) => {
  return (
    <div className="space-y-3">
      {/* Header */}
      <p className="text-xs text-white/40 font-semibold uppercase tracking-wider">
        Sugestão {index + 1}
      </p>

      {/* Você respondeu */}
      <div className="bg-white/10 border-l-4 border-white/30 rounded-r-lg p-4">
        <div className="flex items-start gap-2">
          <span className="text-white/40 text-lg leading-none flex-shrink-0 mt-0.5">"</span>
          <div>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">
              Você respondeu
            </p>
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
              {data.voceRespondeu}
            </p>
          </div>
        </div>
      </div>

      {/* Nós sugerimos */}
      <div className="bg-brand-primary/5 border-l-4 border-brand-primary rounded-r-lg p-4">
        <div className="flex items-start gap-2">
          <svg
            className="w-4 h-4 text-brand-primary flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM4 11a1 1 0 100-2H3a1 1 0 000 2h1zM10 18a1 1 0 001-1v-1a1 1 0 10-2 0v1a1 1 0 001 1zM7 10a3 3 0 116 0 3 3 0 01-6 0z" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-brand-primary uppercase tracking-wider mb-1">
              Nós sugerimos
            </p>
            <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">
              {data.nosSugerimos}
            </p>
          </div>
        </div>
      </div>

      {/* Por quê */}
      <div className="pl-4">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">
          Por quê
        </p>
        <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
          {data.porque.split(/(\b(?:framework|método|modelo|princípio|estratégia|conceito)\s+(?:de\s+)?[\w\sÀ-ú]+)/gi).map((part, i) => {
            // Highlight framework references
            if (/^(framework|método|modelo|princípio|estratégia|conceito)\s/i.test(part)) {
              return (
                <span key={i} className="font-semibold text-brand-primary">
                  {part}
                </span>
              );
            }
            return part;
          })}
        </p>
      </div>
    </div>
  );
};
