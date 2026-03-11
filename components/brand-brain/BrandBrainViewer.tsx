import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

import type { BrandBrainApiData, BrandBrainViewerProps } from '../../utils/brand-brain-constants';
import { SECTIONS, getSectionContent } from '../../utils/brand-brain-constants';
import { BrandBrainSection } from './BrandBrainSection';
import { BBPillarIntro } from './BBPillarIntro';
import { generatePdfFromBrandBrain, downloadAsMarkdown } from './BBExportUtils';
import { useAnalyticsTracker } from '../../hooks/useAnalyticsTracker';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-6">
        <div className="h-5 bg-white/10 rounded w-1/3 mb-4" />
        <div className="space-y-2">
          <div className="h-3 bg-white/10 rounded w-full" />
          <div className="h-3 bg-white/10 rounded w-5/6" />
          <div className="h-3 bg-white/10 rounded w-4/6" />
        </div>
      </div>
    ))}
  </div>
);

export const BrandBrainViewer: React.FC<BrandBrainViewerProps> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BrandBrainApiData | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showPillarIntro, setShowPillarIntro] = useState(() => {
    try { return localStorage.getItem('bb_intro_dismissed') !== 'true'; } catch { return true; }
  });

  const { trackEvent } = useAnalyticsTracker(token);

  const fetchBrandBrain = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/brand-brain', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        if (res.data.data) {
          setData(res.data.data);
        } else {
          setData(null);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar Brand Brain');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchBrandBrain();
  }, [fetchBrandBrain]);

  const mentorName = () => data?.brandBrain?.mentorName || 'Mentor';

  const handleDownloadPdf = async () => {
    if (!data?.brandBrain) return;
    setDownloadingPdf(true);
    try {
      await generatePdfFromBrandBrain(data.brandBrain, mentorName());
      trackEvent('bb_full_download', { format: 'pdf' });
    } catch (e) { console.error('PDF download failed:', e); }
    finally { setDownloadingPdf(false); }
  };

  const handleDownloadMd = () => {
    if (!data?.brandBrain) return;
    downloadAsMarkdown(data.brandBrain, mentorName());
    trackEvent('bb_full_download', { format: 'md' });
  };

  const handleDismissPillarIntro = () => {
    setShowPillarIntro(false);
    try { localStorage.setItem('bb_intro_dismissed', 'true'); } catch { /* noop */ }
  };

  // --- Render states ---

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6"><div className="h-8 bg-white/10 rounded w-56 animate-pulse" /></div>
      <LoadingSkeleton />
    </div>
  );

  if (error) return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <Button variant="secondary" onClick={fetchBrandBrain}>Tentar novamente</Button>
      </div>
    </div>
  );

  if (!data) return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="bg-white/5 border border-white/10 rounded-xl p-10 text-center">
        <span className="text-5xl block mb-4">🧠</span>
        <h3 className="text-xl font-semibold text-white mb-2">Brand Brain em preparação</h3>
        <p className="text-white/50 text-sm max-w-sm mx-auto">Seu Brand Brain está sendo preparado. Você será notificado quando estiver pronto.</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-prosperus-gold-dark/20 to-prosperus-gold-dark/5 border border-prosperus-gold-dark/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🧠</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Brand Brain</h2>
              <p className="text-white/30 text-sm mt-0.5">
                {data.brandBrain?.mentorName && <span className="text-prosperus-gold-dark/70">{data.brandBrain.mentorName}</span>}
                {data.brandBrain?.mentorName && data.brandBrain?.generatedAt && <span className="mx-1.5 text-white/50">·</span>}
                {data.brandBrain?.generatedAt && (
                  <span>Gerado em {new Date(data.brandBrain.generatedAt).toLocaleDateString('pt-BR')}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="primary" size="sm" onClick={handleDownloadPdf} loading={downloadingPdf}>
              {downloadingPdf ? 'Gerando...' : 'Baixar PDF'}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDownloadMd} className="text-white/70">
              Baixar Markdown
            </Button>
          </div>
        </div>
      </div>

      {/* Educational header — Matéria-Prima Estratégica */}
      <Card variant="default" padding="generous" className="mb-6">
        <h3 className="text-base font-bold text-prosperus-gold-dark mb-1">Matéria-Prima Estratégica</h3>
        <p className="text-sm text-white/50 leading-relaxed">
          Esta é a base de conhecimento que usamos para gerar seus ativos. Consulte para entender a estratégia por trás de cada entregável.
        </p>
      </Card>

      {/* Pillar intro (dismissible) */}
      {showPillarIntro && (
        <BBPillarIntro hasExpertNotes={false} onDismiss={handleDismissPillarIntro} />
      )}

      {/* Sections */}
      <div className="space-y-4 mb-8">
        {SECTIONS.map((section) => (
          <BrandBrainSection
            key={section.id}
            sectionDef={section}
            content={getSectionContent(data.brandBrain, section)}
          />
        ))}
      </div>
    </div>
  );
};
