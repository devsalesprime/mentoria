import React from 'react';
import type { PriorityRecommendation } from '../../data/priority-recommendations';

interface RecommendationCardProps {
  recommendation: PriorityRecommendation;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({ recommendation }) => {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <div className="p-5 space-y-2">
        <h3 className="text-lg font-semibold text-white">{recommendation.title}</h3>
        <p className="text-sm text-white/60 leading-relaxed">{recommendation.description}</p>
      </div>

      {/* Embedded video */}
      <div className="px-5 pb-5">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
          {recommendation.contentTitle}
        </p>
        <div className="relative w-full rounded-lg overflow-hidden bg-black/30" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={recommendation.contentUrl}
            title={recommendation.contentTitle}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
};

interface CustomAreaCardProps {
  label: string;
}

export const CustomAreaCard: React.FC<CustomAreaCardProps> = ({ label }) => {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <h3 className="text-lg font-semibold text-white mb-2">{label}</h3>
      <p className="text-sm text-white/60">
        Recebemos sua necessidade &ldquo;{label}&rdquo;. Ela sera incluida na analise personalizada que nossa equipe vai preparar para voce.
      </p>
    </div>
  );
};
