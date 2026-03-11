/**
 * Shared utilities for asset viewer components.
 *
 * Extracted from: TeleprompterStageMap, CadenceTimeline, ChatScriptViewer,
 * OutreachFlowView, LandingPagePreview, AssetViewer.
 *
 * Single source of truth for: CopyButton, toKebabCase, renderMarkdown, generatePdf.
 */

import React, { useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
export { renderMarkdown } from '../../utils/markdown';

// ─── toKebabCase ─────────────────────────────────────────────────────────────

export const toKebabCase = (str: string): string =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ─── stripMarkdown ───────────────────────────────────────────────────────────

/** Strip markdown formatting for clean plain-text paste (e.g., WhatsApp). */
export const stripMarkdown = (text: string): string =>
  text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .trim();

// ─── generatePdf ─────────────────────────────────────────────────────────────

/** Generate and download a styled PDF from markdown content. */
export const generatePdf = async (assetName: string, content: string, options?: { edited?: boolean }): Promise<void> => {
  const html2pdf = (await import('html2pdf.js')).default;
  const renderedHtml = DOMPurify.sanitize(marked.parse(content, { async: false }));
  const date = new Date().toLocaleDateString('pt-BR');
  const editedLabel = options?.edited
    ? `<p style="font-size:11px;color:#CA9A43;margin-top:4px;">Editado em ${date}</p>`
    : '';

  const fullHtml = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;color:#222;max-width:700px;margin:0 auto;padding:40px 24px;">
      <div style="text-align:center;margin-bottom:40px;">
        <h1 style="font-size:24px;color:#CA9A43;margin-bottom:4px;">${DOMPurify.sanitize(assetName)}</h1>
        <p style="font-size:12px;color:#666;">${date}</p>
        ${editedLabel}
      </div>
      <div style="font-size:14px;line-height:1.7;color:#333;">
        ${renderedHtml}
      </div>
      <div style="text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #eee;">
        <p style="font-size:11px;color:#999;">Documento gerado pela plataforma Prosperus</p>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = fullHtml;
  document.body.appendChild(container);

  const kebab = toKebabCase(assetName);
  await html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      filename: `${kebab}-${new Date().toISOString().split('T')[0]}.pdf`,
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(container)
    .save();

  document.body.removeChild(container);
};

// ─── downloadAsMarkdown ──────────────────────────────────────────────────

/** Download content as a .md file, optionally with an "Editado em" header. */
export const downloadAsMarkdown = (assetName: string, content: string, options?: { edited?: boolean }): void => {
  const date = new Date().toISOString().split('T')[0];
  const dateBr = new Date().toLocaleDateString('pt-BR');
  const header = options?.edited ? `> Editado em ${dateBr}\n\n` : '';
  const filename = `${toKebabCase(assetName)}-${date}.md`;
  const blob = new Blob([header + content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  a.parentElement?.removeChild(a);
  URL.revokeObjectURL(url);
};

// ─── CopyButton ──────────────────────────────────────────────────────────────

export interface CopyButtonProps {
  /** Text content to copy to clipboard. */
  content: string;
  /** Button label. Defaults to 'Copiar'. */
  label?: string;
  /** Called after a successful copy. */
  onCopy?: () => void;
  /** Custom className override. If omitted, default styles are used. */
  className?: string;
  /** Strip markdown formatting before copying (useful for WhatsApp). */
  strip?: boolean;
  /** Button size variant. Defaults to 'md'. */
  size?: 'sm' | 'md';
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  content,
  label = 'Copiar',
  onCopy,
  className,
  strip = false,
  size = 'md',
}) => {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const handleCopy = async () => {
    try {
      const text = strip ? stripMarkdown(content) : content;
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 2000);
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs';

  return (
    <button
      onClick={handleCopy}
      className={
        className ??
        `border rounded-lg transition font-semibold ${sizeClasses} ${
          copyError
            ? 'bg-red-600/20 border-red-600/30 text-red-400'
            : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
        }`
      }
    >
      {copyError ? '✗ Erro ao copiar' : copied ? '✓ Copiado!' : label}
    </button>
  );
};
