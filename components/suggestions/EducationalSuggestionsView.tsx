import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { SuggestionBlock } from './SuggestionBlock';
import type { SuggestionBlockData } from './SuggestionBlock';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SuggestionsData {
  marketing: SuggestionBlockData[];
  vendas: SuggestionBlockData[];
  modelo_de_negocios: SuggestionBlockData[];
}

type LensKey = 'marketing' | 'vendas' | 'modelo_de_negocios';

interface LensTab {
  key: LensKey;
  label: string;
  icon: React.ReactNode;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'suggestions_active_tab';

const LENS_TABS: LensTab[] = [
  {
    key: 'marketing',
    label: 'Marketing',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'vendas',
    label: 'Vendas',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    key: 'modelo_de_negocios',
    label: 'Modelo de Negócios',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
];

// ─── PDF Generation ─────────────────────────────────────────────────────────────

const generateSuggestionsPdf = async (data: SuggestionsData): Promise<void> => {
  const html2pdf = (await import('html2pdf.js')).default;
  const DOMPurify = (await import('dompurify')).default;
  const date = new Date().toLocaleDateString('pt-BR');

  const renderLens = (label: string, blocks: SuggestionBlockData[]): string => {
    if (!blocks.length) return '';
    const blocksHtml = blocks
      .map(
        (b, i) => `
        <div style="margin-bottom:24px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;">
          <p style="font-size:11px;color:#999;font-weight:600;text-transform:uppercase;margin-bottom:12px;">Sugestão ${i + 1}</p>

          <div style="background:#f3f4f6;border-left:4px solid #9ca3af;padding:12px;border-radius:0 6px 6px 0;margin-bottom:10px;">
            <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Você respondeu</p>
            <p style="font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;">${DOMPurify.sanitize(b.voceRespondeu)}</p>
          </div>

          <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:12px;border-radius:0 6px 6px 0;margin-bottom:10px;">
            <p style="font-size:10px;font-weight:600;color:#3b82f6;text-transform:uppercase;margin-bottom:4px;">Nós sugerimos</p>
            <p style="font-size:13px;color:#1e40af;line-height:1.6;white-space:pre-wrap;">${DOMPurify.sanitize(b.nosSugerimos)}</p>
          </div>

          <div style="padding:0 12px;">
            <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Por quê</p>
            <p style="font-size:12px;color:#4b5563;line-height:1.6;white-space:pre-wrap;">${DOMPurify.sanitize(b.porque)}</p>
          </div>
        </div>
      `,
      )
      .join('');

    return `
      <div style="margin-bottom:32px;page-break-inside:avoid;">
        <h2 style="font-size:18px;color:#CA9A43;border-bottom:2px solid #CA9A43;padding-bottom:8px;margin-bottom:16px;">${DOMPurify.sanitize(label)}</h2>
        ${blocksHtml}
      </div>
    `;
  };

  const fullHtml = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;color:#222;max-width:700px;margin:0 auto;padding:40px 24px;">
      <div style="text-align:center;margin-bottom:40px;">
        <h1 style="font-size:24px;color:#CA9A43;margin-bottom:4px;">Sugestões Educacionais</h1>
        <p style="font-size:12px;color:#666;">${date}</p>
      </div>
      ${renderLens('Marketing', data.marketing)}
      ${renderLens('Vendas', data.vendas)}
      ${renderLens('Modelo de Negócios', data.modelo_de_negocios)}
      <div style="text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #eee;">
        <p style="font-size:11px;color:#999;">Documento gerado pela plataforma Prosperus</p>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = fullHtml;
  document.body.appendChild(container);

  await html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      filename: `sugestoes-educacionais-${new Date().toISOString().split('T')[0]}.pdf`,
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(container)
    .save();

  document.body.removeChild(container);
};

// ─── Component ──────────────────────────────────────────────────────────────────

interface EducationalSuggestionsViewProps {
  token: string;
}

export const EducationalSuggestionsView: React.FC<EducationalSuggestionsViewProps> = ({ token }) => {
  const [data, setData] = useState<SuggestionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Persist active tab in localStorage
  const [activeTab, setActiveTab] = useState<LensKey>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && LENS_TABS.some((t) => t.key === stored)) return stored as LensKey;
    } catch { /* ignore */ }
    return 'marketing';
  });

  const handleTabChange = (key: LensKey) => {
    setActiveTab(key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch { /* ignore */ }
  };

  // Fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/suggestions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          // No suggestions yet
          setData(null);
          setLoading(false);
          return;
        }
        throw new Error(`Erro ${res.status}`);
      }
      const json = await res.json();
      const suggestions = json.data || json;
      // Validate structure
      if (suggestions && (suggestions.marketing || suggestions.vendas || suggestions.modelo_de_negocios)) {
        setData({
          marketing: suggestions.marketing || [],
          vendas: suggestions.vendas || [],
          modelo_de_negocios: suggestions.modelo_de_negocios || [],
        });
      } else {
        setData(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? 'Não foi possível carregar as sugestões. Tente novamente em alguns instantes.'
          : 'Erro inesperado ao carregar sugestões.',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  // PDF download
  const handleDownloadPdf = async () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      await generateSuggestionsPdf(data);
    } catch {
      // Silent fail — user sees the button stop loading
    } finally {
      setPdfLoading(false);
    }
  };

  // Check if there is any data at all
  const isEmpty =
    !data ||
    (data.marketing.length === 0 && data.vendas.length === 0 && data.modelo_de_negocios.length === 0);

  const activeLensData = data ? data[activeTab] : [];

  // ─── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-6 sm:p-8 md:p-12 min-h-[500px] shadow-2xl flex flex-col items-center justify-center">
        <LoadingSpinner size="lg" label="Carregando sugestões..." />
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-6 sm:p-8 md:p-12 min-h-[500px] shadow-2xl flex flex-col items-center justify-center text-center">
        <svg className="w-12 h-12 text-red-400/60 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <h2 className="font-serif text-xl sm:text-2xl text-white mb-2">Ops, algo deu errado</h2>
        <p className="text-sm text-white/50 max-w-md mb-6">{error}</p>
        <Button variant="secondary" size="md" onClick={fetchSuggestions}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-6 sm:p-8 md:p-12 min-h-[500px] shadow-2xl flex flex-col items-center justify-center text-center">
        <svg className="w-12 h-12 text-prosperus-gold-dark/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
        <h2 className="font-serif text-xl sm:text-2xl text-white mb-2">Suas sugestões estão sendo preparadas</h2>
        <p className="text-sm text-white/50 max-w-md leading-relaxed">
          Estamos analisando suas respostas e gerando sugestões personalizadas. Isso pode levar alguns instantes.
        </p>
      </div>
    );
  }

  // ─── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-white/5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl sm:text-2xl text-white">Sugestões Educacionais</h2>
            <p className="text-sm text-white/50 mt-1">
              Compare suas respostas com os insights gerados e entenda o porquê de cada sugestão.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            loading={pdfLoading}
            disabled={pdfLoading}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Baixar PDF
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/5 overflow-x-auto">
        <div className="flex min-w-max sm:min-w-0">
          {LENS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = data ? data[tab.key].length : 0;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-2 px-4 sm:px-6 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
                  isActive
                    ? 'text-brand-primary border-brand-primary'
                    : 'text-white/50 border-transparent hover:text-white/70 hover:border-white/20'
                }`}
              >
                {tab.icon}
                {tab.label}
                {count > 0 && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-brand-primary/20 text-brand-primary' : 'bg-white/10 text-white/40'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        {activeLensData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-white/40">
              Nenhuma sugestão disponível para esta lente no momento.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {activeLensData.map((block, index) => (
              <Card key={index} variant="outlined" padding="generous">
                <SuggestionBlock data={block} index={index} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
