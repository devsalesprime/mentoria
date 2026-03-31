import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Button } from '../ui/Button';
import { RecommendationCard, CustomAreaCard } from './RecommendationCard';
import { PersonalizedFeedbackView } from './PersonalizedFeedbackView';
import { getRecommendationsForAreas } from '../../data/priority-recommendations';
import type { PriorityArea } from '../../types/diagnostic';

interface InsightsData {
  priorities: {
    mentorLevel: string;
    selectedAreas: PriorityArea[];
    freeformContext?: string;
  } | null;
  feedbackStatus: string;
  personalizedFeedback: string | null;
  feedbackDeliveredAt: string | null;
}

interface InsightsHubProps {
  token: string;
  onNavigate?: (moduleId: string) => void;
}

export const InsightsHub: React.FC<InsightsHubProps> = ({ token, onNavigate }) => {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const res = await axios.get('/api/insights', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success) {
          setData(res.data.data);
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar insights');
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
  }, [token]);

  // FIX-PV-003: PDF download — builds hidden HTML and converts to PDF via html2pdf.js
  // Moved BEFORE early returns to satisfy React hooks rules
  const handleDownloadPdf = useCallback(async () => {
    if (!data) return;
    const html2pdf = (await import('html2pdf.js')).default;

    const recs = data.priorities?.selectedAreas?.length
      ? getRecommendationsForAreas(
          data.priorities.selectedAreas.filter(a => !a.isCustom).map(a => a.id)
        )
      : [];
    const customs = data.priorities?.selectedAreas?.filter(a => a.isCustom) || [];

    let html = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; padding: 32px;">
        <h1 style="font-size: 22px; margin-bottom: 4px;">Seus Insights — Prosperus Mentoria</h1>
        <p style="font-size: 12px; color: #666; margin-bottom: 24px;">Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
    `;

    if (recs.length) {
      html += `<h2 style="font-size: 16px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 16px;">Recomendações</h2>`;
      for (const rec of recs) {
        html += `
          <div style="margin-bottom: 20px; padding: 12px; background: #f8f8fc; border-radius: 8px;">
            <h3 style="font-size: 14px; margin: 0 0 6px;">${rec.title}</h3>
            <p style="font-size: 12px; color: #555; margin: 0 0 8px; line-height: 1.5;">${rec.description}</p>
            <p style="font-size: 11px; color: #888; margin: 0;">Conteudo: ${rec.contentTitle}</p>
          </div>
        `;
      }
    }

    if (customs.length) {
      for (const c of customs) {
        html += `
          <div style="margin-bottom: 20px; padding: 12px; background: #f8f8fc; border-radius: 8px;">
            <h3 style="font-size: 14px; margin: 0 0 6px;">${c.label}</h3>
            <p style="font-size: 12px; color: #555; margin: 0;">Sua necessidade sera incluida na analise personalizada.</p>
          </div>
        `;
      }
    }

    if (data.personalizedFeedback && data.feedbackStatus === 'delivered') {
      html += `
        <h2 style="font-size: 16px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-top: 24px; margin-bottom: 16px;">Feedback Personalizado</h2>
        <div style="font-size: 12px; color: #333; line-height: 1.6; white-space: pre-wrap;">${data.personalizedFeedback}</div>
      `;
    }

    html += `</div>`;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    await html2pdf()
      .set({
        margin: [10, 10],
        filename: `insights-prosperus-${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(container)
      .save();

    document.body.removeChild(container);
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" label="Carregando seus insights..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-white/50 mb-4">Erro ao carregar insights: {error}</p>
        <button onClick={() => window.location.reload()} className="text-brand-primary hover:underline text-sm">
          Tentar novamente
        </button>
      </div>
    );
  }

  const hasPriorities = data?.priorities && data.priorities.selectedAreas?.length > 0;
  const feedbackDelivered = data?.feedbackStatus === 'delivered' && data?.personalizedFeedback;
  const selectedAreas = data?.priorities?.selectedAreas || [];
  const preConfiguredAreas = selectedAreas.filter(a => !a.isCustom);
  const customAreas = selectedAreas.filter(a => a.isCustom);
  const recommendations = getRecommendationsForAreas(preConfiguredAreas.map(a => a.id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto px-4 py-8 space-y-8"
    >
      {/* Hero */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Seus Insights</h2>
        <p className="text-white/50">
          {feedbackDelivered
            ? 'Seu feedback personalizado foi entregue pela equipe Prosperus.'
            : 'Recomendações imediatas baseadas nas suas prioridades.'}
        </p>
      </div>

      {/* FIX-PV-003: Download button */}
      {hasPriorities && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
            Baixar PDF
          </Button>
        </div>
      )}

      {/* Personalized feedback (when delivered) */}
      {feedbackDelivered && (
        <PersonalizedFeedbackView
          feedback={data!.personalizedFeedback!}
          deliveredAt={data!.feedbackDeliveredAt}
        />
      )}

      {/* 48h banner (when feedback not yet delivered) */}
      {!feedbackDelivered && hasPriorities && (
        <div className="bg-brand-primary/10 border border-brand-primary/20 rounded-xl p-4 text-center">
          <p className="text-sm text-white/70">
            <span className="text-brand-primary font-semibold">Feedback personalizado</span> com análise especializada será entregue em até <strong className="text-white">48h úteis</strong>.
          </p>
        </div>
      )}

      {/* No priorities fallback */}
      {!hasPriorities && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
          <p className="text-white/50 mb-4">
            Preencha suas prioridades para receber recomendações personalizadas.
          </p>
          <button
            onClick={() => onNavigate?.('diagnostic_complete')}
            className="text-brand-primary hover:underline text-sm"
          >
            Preencher prioridades
          </button>
        </div>
      )}

      {/* Recommendation cards */}
      {hasPriorities && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider">
            Recomendações para suas prioridades
          </h3>
          {recommendations.map(rec => (
            <RecommendationCard key={rec.areaId} recommendation={rec} />
          ))}
          {customAreas.map(area => (
            <CustomAreaCard key={area.id} label={area.label} />
          ))}
        </div>
      )}
    </motion.div>
  );
};
