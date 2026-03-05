import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';
import { CopyButton, toKebabCase, renderMarkdown, generatePdf } from './shared';
import { SectionWarning } from '../shared/SectionWarning';
import { Button } from '../ui/Button';
import type { GeneratedAsset } from '../../types/pipeline';
import { markAssetOpened, resetProgressIfRegenerated } from './useInlineEdit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetViewerProps {
  assetId: string;
  assetName: string;
  asset: GeneratedAsset;
  onBack: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// renderMarkdown, toKebabCase, CopyButton, generatePdf imported from ./shared

// Detect if content contains HTML (for landing page copy)
const isHtmlContent = (content: string): boolean => {
  return /<(!DOCTYPE|html|head|body|div|section|header|footer|main|nav|article)\b/i.test(content);
};

// Icon detection for section titles
const ASSET_ICON_MAP: Record<string, string> = {
  script: '📝', cadência: '📋', prospecção: '📞', follow: '📧', sequência: '📧',
  vendas: '💰', objeção: '🛡️', abertura: '🎤', pitch: '🎤', fechamento: '🤝',
  headline: '📰', hook: '🪝', cta: '🔘', landing: '🌐', page: '🌐',
  vsl: '🎬', vídeo: '🎬', copy: '✍️', seção: '📄', bloco: '🧱',
  email: '📧', assunto: '📩', template: '📋', modelo: '📋',
  introdução: '👋', conexão: '🤝', qualificação: '🔍', apresentação: '🎯',
  proposta: '💼', garantia: '🛡️', bônus: '🎁', preço: '💲',
  depoimento: '💬', prova: '📊', história: '📖', dor: '🔥', desejo: '🎯',
};

function detectAssetIcon(title: string): string {
  const lower = title.toLowerCase();
  for (const [keyword, icon] of Object.entries(ASSET_ICON_MAP)) {
    if (lower.includes(keyword)) return icon;
  }
  return '📋';
}

// Split markdown into sections by h2/h3 headers
const splitIntoSections = (content: string): Array<{ title: string; raw: string; icon: string }> => {
  const lines = content.split('\n');
  const sections: Array<{ title: string; raw: string; icon: string }> = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ') || line.startsWith('### ')) {
      if (currentLines.length > 0) {
        sections.push({ title: currentTitle, raw: currentLines.join('\n'), icon: detectAssetIcon(currentTitle) });
      }
      currentTitle = line.replace(/^#{2,3}\s+/, '');
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({ title: currentTitle, raw: currentLines.join('\n'), icon: detectAssetIcon(currentTitle) });
  }

  if (sections.length === 0) {
    sections.push({ title: '', raw: content, icon: '📋' });
  }

  return sections;
};

// CopyButton and generatePdf imported from ./shared

// ─── Main component ───────────────────────────────────────────────────────────

export const AssetViewer: React.FC<AssetViewerProps> = ({ assetId, assetName, asset, onBack }) => {
  const isHtml = isHtmlContent(asset.content);
  const sections = isHtml ? [] : splitIntoSections(asset.content);
  const hasSections = sections.length > 1;
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(sections.map((_, i) => i))
  );
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Track open + handle regeneration reset
  useEffect(() => {
    if (asset.generatedAt) {
      resetProgressIfRegenerated(assetId, asset.generatedAt);
    }
    markAssetOpened(assetId);
  }, [assetId, asset.generatedAt]);

  const toggleSection = (idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleDownloadMd = () => {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${toKebabCase(assetName)}-${date}.md`;
    const blob = new Blob([asset.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    a.parentElement?.removeChild(a);
    URL.revokeObjectURL(url);
    markAssetOpened(assetId);
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await generatePdf(assetName, asset.content);
      markAssetOpened(assetId);
    } catch (e) {
      console.error('PDF download failed:', e);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header — brand brain style */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="flex-shrink-0"
            >
              ← Voltar
            </Button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-prosperus-gold-dark/20 to-prosperus-gold-dark/5 border border-prosperus-gold-dark/20 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">{detectAssetIcon(assetName)}</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{assetName}</h2>
              {asset.generatedAt && (
                <p className="text-white/30 text-xs mt-0.5">
                  Gerado em {new Date(asset.generatedAt).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <CopyButton content={asset.content} label="Copiar Tudo" onCopy={() => markAssetOpened(assetId)} />
            <Button
              variant="primary"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              loading={downloadingPdf}
            >
              {downloadingPdf ? 'Gerando...' : 'Baixar PDF'}
            </Button>
            <Button
              variant="secondary"
              onClick={handleDownloadMd}
            >
              Baixar Texto
            </Button>
          </div>
        </div>
      </div>

      {/* Warning banner */}
      <div className="mb-6">
        <SectionWarning
          message="Este é um ponto de partida construído com nossos frameworks. Adapte ao seu tom de voz e teste com prospects reais."
          variant="warning"
        />
      </div>

      {/* HTML content (for landing page copy) */}
      {isHtml && (
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="font-semibold text-prosperus-gold-dark text-sm">Pré-visualização</span>
              <CopyButton content={asset.content} label="Copiar HTML" />
            </div>
            <div className="bg-white rounded-b-xl">
              <iframe
                srcDoc={DOMPurify.sanitize(asset.content)}
                className="w-full min-h-[600px] border-0"
                title="Landing page preview"
                sandbox=""
              />
            </div>
          </div>
          {/* Raw source collapsible */}
          <details className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <summary className="px-5 py-3 cursor-pointer text-sm text-white/50 hover:text-white/70 transition font-semibold">
              Ver código fonte
            </summary>
            <pre className="px-5 py-4 text-xs text-white/60 font-mono overflow-auto max-h-96 border-t border-white/10">
              {asset.content}
            </pre>
          </details>
        </div>
      )}

      {/* Markdown content — brand brain card style */}
      {!isHtml && (
        <div className="space-y-3">
          {sections.map((section, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/10 transition-colors"
            >
              {hasSections && section.title && (
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
                  <button
                    onClick={() => toggleSection(idx)}
                    className="flex items-center gap-2.5 text-left w-full"
                  >
                    <span className="text-lg flex-shrink-0">{section.icon}</span>
                    <span className="font-bold text-sm text-prosperus-gold-dark tracking-wide uppercase">{section.title}</span>
                    <motion.span
                      animate={{ rotate: expandedSections.has(idx) ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-white/50 text-xs ml-auto mr-2"
                    >
                      ▼
                    </motion.span>
                  </button>
                  <CopyButton content={section.raw} onCopy={() => markAssetOpened(assetId)} />
                </div>
              )}

              <AnimatePresence initial={false}>
                {(!hasSections || !section.title || expandedSections.has(idx)) && (
                  <motion.div
                    initial={hasSections ? { height: 0, opacity: 0 } : {}}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="px-5 pb-5 pt-3 text-sm text-white/70 leading-relaxed
                        [&_ul]:space-y-1.5 [&_ul]:mt-2 [&_ul]:ml-0 [&_ul]:list-none [&_ul]:pl-0
                        [&_ol]:space-y-1.5 [&_ol]:mt-2 [&_ol]:ml-0 [&_ol]:pl-0
                        [&_li]:relative [&_li]:pl-4 [&_li]:text-white/70 [&_li]:text-[13px] [&_li]:leading-relaxed
                        [&_li]:before:content-[''] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[9px] [&_li]:before:w-1.5 [&_li]:before:h-1.5 [&_li]:before:rounded-full [&_li]:before:bg-prosperus-gold-dark/50
                        [&_strong]:text-prosperus-gold-dark [&_strong]:font-semibold
                        [&_em]:text-white/50
                        [&_p]:mb-2 [&_p]:text-[13px]
                        [&_blockquote]:border-l-2 [&_blockquote]:border-prosperus-gold-dark/40 [&_blockquote]:bg-prosperus-gold-dark/[0.04] [&_blockquote]:rounded-r-lg [&_blockquote]:py-3 [&_blockquote]:px-4 [&_blockquote]:my-3 [&_blockquote]:text-white/60 [&_blockquote]:italic
                        [&_table]:w-full [&_table]:border-collapse [&_table]:my-3
                        [&_th]:bg-prosperus-gold-dark/10 [&_th]:text-prosperus-gold-dark [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:font-bold [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:border-b [&_th]:border-prosperus-gold-dark/20
                        [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-[13px] [&_td]:text-white/70 [&_td]:border-b [&_td]:border-white/5
                        [&_tr:last-child_td]:border-b-0
                        [&_hr]:border-white/5 [&_hr]:my-4
                        [&_h1]:text-base [&_h1]:text-prosperus-gold-dark [&_h1]:font-bold [&_h1]:mb-2
                        [&_h2]:text-sm [&_h2]:text-prosperus-gold-dark [&_h2]:font-bold [&_h2]:mb-2
                        [&_h3]:text-sm [&_h3]:text-white/70 [&_h3]:font-semibold [&_h3]:mb-1
                      "
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(section.raw) }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
