import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { toKebabCase, renderMarkdown } from './shared';
import { Button } from '../ui/Button';
import {
  useInlineEdit,
  markAssetOpened,
  BRACKET_REGEX,
} from './useInlineEdit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LandingPagePreviewProps {
  assetId: string;
  assetName: string;
  content: string;
  generatedAt?: string;
  onBack: () => void;
}

interface LPSection {
  id: string;
  label: string;
  title: string;
  content: string;
  sectionType: 'hero' | 'problem' | 'mechanism' | 'value' | 'cta' | 'faq' | 'generic';
}

type ViewMode = 'preview' | 'edit';

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_TYPE_KEYWORDS: Record<LPSection['sectionType'], string[]> = {
  hero: ['headline', 'principal', 'abertura', 'hero'],
  problem: ['problema', 'dor', 'frustração', 'frustracao', 'pattern interrupt'],
  mechanism: ['mecanismo', 'método', 'metodo', 'solução', 'solucao', 'como funciona'],
  value: ['valor', 'stack', 'bônus', 'bonus', 'inclui', 'entrega'],
  cta: ['cta', 'chamada', 'ação', 'acao', 'inscreva', 'quero'],
  faq: ['faq', 'perguntas', 'dúvidas', 'duvidas'],
  generic: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isHtmlContent = (content: string): boolean =>
  /<(!DOCTYPE|html|head|body|div|section|header|footer|main|nav|article)\b/i.test(content);

const detectSectionType = (title: string): LPSection['sectionType'] => {
  const lower = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  for (const [type, keywords] of Object.entries(SECTION_TYPE_KEYWORDS)) {
    if (type === 'generic') continue;
    for (const kw of keywords) {
      const normalizedKw = kw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(normalizedKw)) return type as LPSection['sectionType'];
    }
  }
  return 'generic';
};

const parseSections = (content: string): LPSection[] => {
  const lines = content.split('\n');
  const sections: LPSection[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];
  let labelIndex = 0;

  const pushSection = () => {
    if (currentLines.length === 0) return;
    const raw = currentLines.join('\n').trim();
    if (!raw) return;
    const label = String.fromCharCode(65 + labelIndex); // A, B, C...
    const detectedType = detectSectionType(currentTitle);
    // First section defaults to hero only when no specific type is detected
    const sectionType = (labelIndex === 0 && detectedType === 'generic') ? 'hero' : detectedType;
    sections.push({
      id: `section-${label.toLowerCase()}`,
      label,
      title: currentTitle,
      content: raw,
      sectionType,
    });
    labelIndex++;
  };

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      pushSection();
      currentTitle = line.replace(/^#{1,3}\s+/, '');
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  pushSection();

  // Fallback: single section wrapping everything
  if (sections.length === 0) {
    sections.push({
      id: 'section-a',
      label: 'A',
      title: 'Conteudo',
      content: content.trim(),
      sectionType: 'hero',
    });
  }

  return sections;
};

// renderMarkdown imported from ./shared

/** Highlight [INSERIR ...] / [INSERCAO DE PROVA: ...] brackets in HTML */
const highlightBrackets = (html: string): string =>
  html.replace(
    /\[([A-ZÀÁÂÃÉÊÍÓÔÕÚÇ\s]+(?:DE|DO|DA|DOS|DAS|:)[^\]]*)\]/gi,
    '<mark class="lp-bracket">[$1]</mark>'
  );

// toKebabCase imported from ./shared

// ─── Copy helper ──────────────────────────────────────────────────────────────

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
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
    return true;
  } catch {
    return false;
  }
};

// ─── Download helpers ─────────────────────────────────────────────────────────

const downloadFile = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  a.parentElement?.removeChild(a);
  URL.revokeObjectURL(url);
};

const buildStyledHtml = (content: string, title: string): string => {
  const date = new Date().toLocaleDateString('pt-BR');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${DOMPurify.sanitize(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      color: #222;
      background: #fff;
      line-height: 1.7;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 48px 24px; }
    h1, h2, h3 { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; }
    h1 { font-size: 2.25rem; margin-bottom: 16px; }
    h2 { font-size: 1.5rem; margin: 40px 0 12px; color: #CA9A43; }
    h3 { font-size: 1.125rem; margin: 24px 0 8px; }
    p { margin-bottom: 16px; font-size: 1.05rem; }
    ul, ol { margin: 16px 0 16px 24px; }
    li { margin-bottom: 8px; }
    strong { color: #CA9A43; }
    blockquote {
      border-left: 4px solid #CA9A43;
      padding: 16px 20px;
      background: #fdf8ef;
      margin: 24px 0;
      font-style: italic;
    }
    .btn-cta {
      display: inline-block;
      background: #CA9A43;
      color: #fff;
      padding: 16px 40px;
      font-size: 1.1rem;
      font-weight: 700;
      border-radius: 8px;
      text-decoration: none;
      font-family: 'Segoe UI', sans-serif;
    }
    .footer {
      text-align: center;
      margin-top: 64px;
      padding-top: 24px;
      border-top: 1px solid #eee;
      font-size: 0.8rem;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    ${DOMPurify.sanitize(marked.parse(content, { async: false }))}
    <div class="footer">
      <p>Documento gerado pela plataforma Prosperus &mdash; ${date}</p>
    </div>
  </div>
</body>
</html>`;
};

// ─── FAQ Accordion ────────────────────────────────────────────────────────────

const FaqItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 px-2 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-800 text-sm pr-4">{question}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-prosperus-gold-dark text-xl font-light flex-shrink-0"
        >
          +
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-4 text-sm text-gray-600 leading-relaxed">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** Parse FAQ content: lines starting with bold or H3 (###) are questions, rest is answer */
const parseFaqItems = (content: string): Array<{ question: string; answer: string }> => {
  const items: Array<{ question: string; answer: string }> = [];
  // Remove section header lines (H1/H2 only — H3 lines are FAQ questions)
  const lines = content.split('\n').filter((l) => !l.match(/^#{1,2}\s/));
  let currentQ = '';
  let currentA: string[] = [];

  for (const line of lines) {
    const qMatch = line.match(/^\*\*(.+?)\*\*\s*$/)
      || line.match(/^[-*]\s*\*\*(.+?)\*\*/)
      || line.match(/^###\s+(.+)$/);
    if (qMatch) {
      if (currentQ) {
        items.push({ question: currentQ, answer: currentA.join('\n').trim() });
      }
      currentQ = qMatch[1].replace(/\?*$/, '?');
      currentA = [];
    } else if (currentQ) {
      currentA.push(line);
    }
  }
  if (currentQ) {
    items.push({ question: currentQ, answer: currentA.join('\n').trim() });
  }
  return items;
};

// ─── Section Navigator ────────────────────────────────────────────────────────

/** Desktop: sticky vertical sidebar within the LP preview flex container */
const DesktopSectionNav: React.FC<{
  sections: LPSection[];
  activeSection: string;
  onNavigate: (id: string) => void;
}> = ({ sections, activeSection, onNavigate }) => (
  <nav className="hidden lg:flex sticky top-1/2 -translate-y-1/2 self-start flex-col gap-2 -ml-12 mr-2 z-10 flex-shrink-0">
    {sections.map((s) => (
      <button
        key={s.id}
        onClick={() => onNavigate(s.id)}
        title={`${s.label}: ${s.title}`}
        className={`w-8 h-8 rounded-full text-xs font-bold transition-all duration-200 border ${
          activeSection === s.id
            ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark scale-110 shadow-lg shadow-prosperus-gold-dark/30'
            : 'bg-prosperus-navy-dark/80 text-white/50 border-white/10 hover:text-white hover:border-white/30'
        }`}
      >
        {s.label}
      </button>
    ))}
  </nav>
);

/** Mobile: sticky horizontal bottom bar within content flow */
const MobileSectionNav: React.FC<{
  sections: LPSection[];
  activeSection: string;
  onNavigate: (id: string) => void;
}> = ({ sections, activeSection, onNavigate }) => (
  <nav className="lg:hidden sticky bottom-4 z-20 flex justify-center mt-4">
    <div className="flex flex-row gap-1.5 bg-black/80 backdrop-blur-sm rounded-full px-3 py-2 border border-white/10">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => onNavigate(s.id)}
          title={`${s.label}: ${s.title}`}
          className={`w-7 h-7 rounded-full text-[10px] font-bold transition-all duration-200 border ${
            activeSection === s.id
              ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark scale-110'
              : 'bg-transparent text-white/50 border-white/20 hover:text-white hover:border-white/30'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  </nav>
);

// ─── Preview Section Renderers ────────────────────────────────────────────────

const PreviewHero: React.FC<{ html: string }> = ({ html }) => (
  <section className="py-16 px-8 text-center bg-gradient-to-b from-gray-50 to-white">
    <div
      className="max-w-2xl mx-auto
        [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mb-4 [&_h1]:leading-tight
        [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mb-4 [&_h2]:leading-tight
        [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-gray-700 [&_h3]:mb-3
        [&_p]:text-gray-600 [&_p]:text-lg [&_p]:mb-4 [&_p]:leading-relaxed
        [&_strong]:text-prosperus-gold-dark
        [&_.lp-bracket]:bg-yellow-100 [&_.lp-bracket]:text-yellow-800 [&_.lp-bracket]:px-1 [&_.lp-bracket]:rounded [&_.lp-bracket]:text-sm [&_.lp-bracket]:font-mono
      "
      dangerouslySetInnerHTML={{ __html: html }}
    />
    <div className="mt-8">
      <span className="inline-block bg-prosperus-gold-dark text-white font-bold py-4 px-10 rounded-lg text-lg shadow-lg shadow-prosperus-gold-dark/30 cursor-default">
        QUERO COMECAR AGORA
      </span>
    </div>
  </section>
);

const PreviewProblem: React.FC<{ html: string }> = ({ html }) => (
  <section className="py-12 px-8 bg-gray-50">
    <div
      className="max-w-2xl mx-auto border-l-4 border-red-400 pl-6
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mb-3
        [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mb-3
        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-700 [&_h3]:mb-2
        [&_p]:text-gray-700 [&_p]:mb-3 [&_p]:leading-relaxed
        [&_ul]:space-y-2 [&_ul]:my-3
        [&_li]:text-gray-700
        [&_strong]:text-red-700
        [&_em]:text-gray-500
        [&_.lp-bracket]:bg-yellow-100 [&_.lp-bracket]:text-yellow-800 [&_.lp-bracket]:px-1 [&_.lp-bracket]:rounded [&_.lp-bracket]:text-sm [&_.lp-bracket]:font-mono
      "
      dangerouslySetInnerHTML={{ __html: html }}
    />
  </section>
);

const PreviewMechanism: React.FC<{ html: string }> = ({ html }) => (
  <section className="py-12 px-8 bg-white">
    <div
      className="max-w-2xl mx-auto
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mb-3
        [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-prosperus-gold-dark [&_h2]:mb-3
        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-700 [&_h3]:mb-2
        [&_p]:text-gray-700 [&_p]:mb-3 [&_p]:leading-relaxed
        [&_ul]:space-y-2 [&_ul]:my-3
        [&_li]:text-gray-700
        [&_strong]:text-prosperus-gold-dark
        [&_blockquote]:border-l-4 [&_blockquote]:border-prosperus-gold-dark/40 [&_blockquote]:bg-prosperus-neutral-white [&_blockquote]:p-4 [&_blockquote]:rounded-r-lg [&_blockquote]:my-4 [&_blockquote]:italic [&_blockquote]:text-gray-600
        [&_.lp-bracket]:bg-yellow-100 [&_.lp-bracket]:text-yellow-800 [&_.lp-bracket]:px-1 [&_.lp-bracket]:rounded [&_.lp-bracket]:text-sm [&_.lp-bracket]:font-mono
      "
      dangerouslySetInnerHTML={{ __html: html }}
    />
  </section>
);

const PreviewValue: React.FC<{ html: string }> = ({ html }) => {
  // Inject checkmarks: replace <li> with a custom styled version
  const withChecks = html
    .replace(/<li>/g, '<li class="lp-value-item">')
    .replace(/<ul>/g, '<ul class="lp-value-list">');

  return (
    <section className="py-12 px-8 bg-gradient-to-b from-white to-gray-50">
      <div
        className="max-w-2xl mx-auto
          [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mb-4
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mb-4
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-700 [&_h3]:mb-2
          [&_p]:text-gray-700 [&_p]:mb-3 [&_p]:leading-relaxed
          [&_.lp-value-list]:space-y-3 [&_.lp-value-list]:my-4 [&_.lp-value-list]:list-none [&_.lp-value-list]:pl-0
          [&_.lp-value-item]:flex [&_.lp-value-item]:items-start [&_.lp-value-item]:gap-3 [&_.lp-value-item]:text-gray-700
          [&_.lp-value-item]:before:content-['\\2713'] [&_.lp-value-item]:before:text-green-600 [&_.lp-value-item]:before:font-bold [&_.lp-value-item]:before:text-lg [&_.lp-value-item]:before:flex-shrink-0
          [&_strong]:text-gray-900
          [&_.lp-bracket]:bg-yellow-100 [&_.lp-bracket]:text-yellow-800 [&_.lp-bracket]:px-1 [&_.lp-bracket]:rounded [&_.lp-bracket]:text-sm [&_.lp-bracket]:font-mono
        "
        dangerouslySetInnerHTML={{ __html: withChecks }}
      />
    </section>
  );
};

const PreviewCta: React.FC<{ html: string }> = ({ html }) => (
  <section className="py-16 px-8 text-center bg-gradient-to-b from-gray-50 to-white">
    <div
      className="max-w-2xl mx-auto
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mb-3
        [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mb-3
        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-700 [&_h3]:mb-2
        [&_p]:text-gray-600 [&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-lg
        [&_strong]:text-prosperus-gold-dark
        [&_.lp-bracket]:bg-yellow-100 [&_.lp-bracket]:text-yellow-800 [&_.lp-bracket]:px-1 [&_.lp-bracket]:rounded [&_.lp-bracket]:text-sm [&_.lp-bracket]:font-mono
      "
      dangerouslySetInnerHTML={{ __html: html }}
    />
    <div className="mt-8">
      <span className="inline-block bg-prosperus-gold-dark text-white font-bold py-4 px-12 rounded-lg text-lg shadow-lg shadow-prosperus-gold-dark/30 cursor-default uppercase tracking-wide">
        INSCREVA-SE AGORA
      </span>
      <p className="text-gray-400 text-xs mt-3">Vagas limitadas</p>
    </div>
  </section>
);

const PreviewFaq: React.FC<{ content: string }> = ({ content }) => {
  const items = parseFaqItems(content);
  const title = content.match(/^#{1,3}\s+(.+)$/m)?.[1] || 'Perguntas Frequentes';

  return (
    <section className="py-12 px-8 bg-white">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">{title}</h2>
        {items.length > 0 ? (
          <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-200">
            {items.map((item, i) => (
              <FaqItem key={i} question={item.question} answer={item.answer} />
            ))}
          </div>
        ) : (
          <div
            className="text-gray-600 leading-relaxed text-sm
              [&_p]:mb-3
              [&_strong]:text-gray-900
              [&_.lp-bracket]:bg-yellow-100 [&_.lp-bracket]:text-yellow-800 [&_.lp-bracket]:px-1 [&_.lp-bracket]:rounded [&_.lp-bracket]:text-sm [&_.lp-bracket]:font-mono
            "
            dangerouslySetInnerHTML={{ __html: highlightBrackets(renderMarkdown(content)) }}
          />
        )}
      </div>
    </section>
  );
};

const PreviewGeneric: React.FC<{ html: string }> = ({ html }) => (
  <section className="py-12 px-8 bg-white">
    <div
      className="max-w-2xl mx-auto
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mb-3
        [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-800 [&_h2]:mb-3
        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-700 [&_h3]:mb-2
        [&_p]:text-gray-700 [&_p]:mb-3 [&_p]:leading-relaxed
        [&_ul]:space-y-2 [&_ul]:my-3 [&_ul]:pl-5
        [&_ol]:space-y-2 [&_ol]:my-3 [&_ol]:pl-5
        [&_li]:text-gray-700
        [&_strong]:text-gray-900
        [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:bg-gray-50 [&_blockquote]:p-4 [&_blockquote]:rounded-r-lg [&_blockquote]:my-4 [&_blockquote]:italic [&_blockquote]:text-gray-600
        [&_.lp-bracket]:bg-yellow-100 [&_.lp-bracket]:text-yellow-800 [&_.lp-bracket]:px-1 [&_.lp-bracket]:rounded [&_.lp-bracket]:text-sm [&_.lp-bracket]:font-mono
      "
      dangerouslySetInnerHTML={{ __html: html }}
    />
  </section>
);

const SECTION_RENDERERS: Record<LPSection['sectionType'], React.FC<{ html: string; content?: string }>> = {
  hero: ({ html }) => <PreviewHero html={html} />,
  problem: ({ html }) => <PreviewProblem html={html} />,
  mechanism: ({ html }) => <PreviewMechanism html={html} />,
  value: ({ html }) => <PreviewValue html={html} />,
  cta: ({ html }) => <PreviewCta html={html} />,
  faq: ({ content }) => <PreviewFaq content={content || ''} />,
  generic: ({ html }) => <PreviewGeneric html={html} />,
};

// ─── Edit Section ─────────────────────────────────────────────────────────────

const EditSection: React.FC<{
  section: LPSection;
  getValue: (fieldId: string, original: string) => string;
  setValue: (fieldId: string, value: string) => void;
  isEdited: (fieldId: string) => boolean;
  restoreField: (fieldId: string) => void;
}> = ({ section, getValue, setValue, isEdited, restoreField }) => {
  const fieldId = `lp-${section.id}`;
  const currentValue = getValue(fieldId, section.content);
  const edited = isEdited(fieldId);
  const [hovered, setHovered] = useState(false);

  // Extract bracket placeholders for inline field rendering
  const bracketMatches = useMemo(() => {
    const matches: Array<{ full: string; inner: string; fieldKey: string }> = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(BRACKET_REGEX.source, 'gi');
    while ((match = re.exec(section.content)) !== null) {
      matches.push({
        full: match[0],
        inner: match[1],
        fieldKey: `lp-bracket-${section.id}-${matches.length}`,
      });
    }
    return matches;
  }, [section.content, section.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/10 transition-colors"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Section label chip */}
      <div className="absolute top-3 right-3 z-10">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-prosperus-gold-dark/20 text-prosperus-gold-dark text-xs font-bold border border-prosperus-gold-dark/30">
          {section.label}
        </span>
      </div>

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-3">
        <span className="text-xs uppercase tracking-wider text-white/50 font-semibold">
          {section.title || `Secao ${section.label}`}
        </span>
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-white/50 uppercase">
          {section.sectionType}
        </span>
        {edited && (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-prosperus-gold-dark/15 text-prosperus-gold-dark">
            editado
          </span>
        )}
      </div>

      {/* Content textarea */}
      <div className="p-5">
        <textarea
          value={currentValue}
          onChange={(e) => setValue(fieldId, e.target.value)}
          className="w-full min-h-[200px] bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white/70 leading-relaxed resize-y focus:outline-none focus:border-prosperus-gold-dark/40 focus:ring-1 focus:ring-prosperus-gold-dark/20 transition placeholder-white/20"
          placeholder="Conteudo da secao..."
        />

        {/* Bracket placeholder fields */}
        {bracketMatches.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">
              Campos para preencher
            </p>
            {bracketMatches.map((bm) => (
              <div key={bm.fieldKey} className="flex items-center gap-2">
                <span className="text-xs text-yellow-500/70 font-mono flex-shrink-0 max-w-[200px] truncate">
                  {bm.full}
                </span>
                <input
                  type="text"
                  value={getValue(bm.fieldKey, '')}
                  onChange={(e) => setValue(bm.fieldKey, e.target.value)}
                  placeholder={bm.inner}
                  className="flex-1 bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-1.5 text-sm text-yellow-200 placeholder-yellow-500/30 focus:outline-none focus:border-yellow-500/40 transition"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restore button on hover */}
      <AnimatePresence>
        {edited && hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute bottom-3 right-3"
          >
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                restoreField(fieldId);
                bracketMatches.forEach((bm) => restoreField(bm.fieldKey));
              }}
            >
              Restaurar original
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── HTML Edit Mode ───────────────────────────────────────────────────────────

const HtmlEditMode: React.FC<{
  assetId: string;
  content: string;
  getValue: (fieldId: string, original: string) => string;
  setValue: (fieldId: string, value: string) => void;
  isEdited: (fieldId: string) => boolean;
  restoreField: (fieldId: string) => void;
}> = ({ content, getValue, setValue, isEdited, restoreField }) => {
  const fieldId = 'lp-html-source';
  const currentValue = getValue(fieldId, content);
  const edited = isEdited(fieldId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-white/50 font-semibold">
          Codigo fonte HTML
        </p>
        {edited && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => restoreField(fieldId)}
          >
            Restaurar original
          </Button>
        )}
      </div>
      <textarea
        value={currentValue}
        onChange={(e) => setValue(fieldId, e.target.value)}
        className="w-full min-h-[500px] bg-prosperus-navy-dark border border-white/10 rounded-xl px-5 py-4 text-sm text-green-300/80 font-mono leading-relaxed resize-y focus:outline-none focus:border-prosperus-gold-dark/40 focus:ring-1 focus:ring-prosperus-gold-dark/20 transition"
        spellCheck={false}
      />
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const LandingPagePreview: React.FC<LandingPagePreviewProps> = ({
  assetId,
  assetName,
  content,
  generatedAt,
  onBack,
}) => {
  const [mode, setMode] = useState<ViewMode>('preview');
  const [activeSection, setActiveSection] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  const isHtml = useMemo(() => isHtmlContent(content), [content]);
  const sections = useMemo(() => (isHtml ? [] : parseSections(content)), [content, isHtml]);

  const { getValue, setValue, isEdited, restoreField, restoreAll, hasEdits } = useInlineEdit({
    assetId,
    generatedAt,
  });

  // Mark opened on mount
  useEffect(() => {
    markAssetOpened(assetId);
  }, [assetId]);

  // Intersection observer for active section tracking
  useEffect(() => {
    if (isHtml || sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );

    for (const section of sections) {
      const el = sectionRefs.current[section.id];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections, isHtml, mode]);

  // Set initial active section
  useEffect(() => {
    if (sections.length > 0 && !activeSection) {
      setActiveSection(sections[0].id);
    }
  }, [sections, activeSection]);

  const handleNavigate = useCallback((sectionId: string) => {
    const el = sectionRefs.current[sectionId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const showCopyFeedback = (msg: string) => {
    setCopyFeedback(msg);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleCopyAll = async () => {
    const success = await copyToClipboard(content);
    showCopyFeedback(success ? 'Copiado!' : 'Erro ao copiar');
    if (success) markAssetOpened(assetId);
  };

  const handleDownloadHtml = () => {
    const html = isHtml ? content : buildStyledHtml(content, assetName);
    const date = new Date().toISOString().split('T')[0];
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    downloadFile(blob, `${toKebabCase(assetName)}-${date}.html`);
    markAssetOpened(assetId);
  };

  const handleDownloadText = () => {
    const date = new Date().toISOString().split('T')[0];
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    downloadFile(blob, `${toKebabCase(assetName)}-${date}.md`);
    markAssetOpened(assetId);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="flex-shrink-0"
            >
              &larr; Voltar
            </Button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-prosperus-gold-dark/20 to-prosperus-gold-dark/5 border border-prosperus-gold-dark/20 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">&#127760;</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{assetName}</h2>
              {generatedAt && (
                <p className="text-white/30 text-xs mt-0.5">
                  Gerado em {new Date(generatedAt).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 flex-shrink-0 bg-white/5 rounded-lg p-1 border border-white/10">
            <button
              onClick={() => setMode('preview')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                mode === 'preview'
                  ? 'bg-prosperus-gold-dark text-black'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              MODO PREVIEW
            </button>
            <button
              onClick={() => setMode('edit')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition flex items-center gap-1.5 ${
                mode === 'edit'
                  ? 'bg-prosperus-gold-dark text-black'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              &#9998; EDITAR COPY
            </button>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <Button
            variant="secondary"
            onClick={handleCopyAll}
          >
            {copyFeedback || 'Copiar Tudo'}
          </Button>
          <Button
            variant="primary"
            onClick={handleDownloadHtml}
          >
            Baixar HTML
          </Button>
          <Button
            variant="secondary"
            onClick={handleDownloadText}
          >
            Baixar Texto
          </Button>
          {isHtml && (
            <Button
              variant="secondary"
              onClick={() => setFullscreen(true)}
            >
              <span className="inline-flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                Tela Cheia
              </span>
            </Button>
          )}
          {hasEdits && mode === 'edit' && (
            <Button
              variant="danger-soft"
              onClick={restoreAll}
              className="ml-auto"
            >
              Restaurar Tudo
            </Button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div ref={contentRef}>
        {/* ─── PREVIEW MODE ──────────────────────────────────────────── */}
        {mode === 'preview' && (
          <>
            {/* HTML content */}
            {isHtml && (
              <div className="max-w-5xl mx-auto px-4 pb-8">
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                    <span className="font-semibold text-prosperus-gold-dark text-sm">Pre-visualizacao</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/20 uppercase tracking-wide">
                      HTML
                    </span>
                  </div>
                  <div className="bg-white rounded-b-xl">
                    <iframe
                      srcDoc={content}
                      className="w-full min-h-[600px] border-0"
                      title="Landing page preview"
                      sandbox="allow-scripts"
                      onLoad={(e) => {
                        try {
                          const doc = e.currentTarget.contentDocument;
                          if (doc) {
                            e.currentTarget.style.height = doc.body.scrollHeight + 'px';
                          }
                        } catch {
                          // Cross-origin: contentDocument not accessible, keep min-h fallback
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Markdown sections as styled LP blocks */}
            {!isHtml && (
              <div className="max-w-5xl mx-auto px-4 pb-8 lg:pl-16">
                {/* Flex container: desktop nav (sticky left) + content */}
                <div className="flex items-start">
                  {/* Desktop section navigator — sticky within flex, never overlays app sidebar */}
                  {sections.length > 1 && (
                    <DesktopSectionNav
                      sections={sections}
                      activeSection={activeSection}
                      onNavigate={handleNavigate}
                    />
                  )}

                  {/* LP frame — dark outer, white inner */}
                  <div className="flex-1 min-w-0">
                    <div className="bg-prosperus-navy-dark border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                      {/* Fake browser chrome */}
                      <div className="flex items-center gap-2 px-4 py-3 bg-prosperus-navy-dark border-b border-white/10">
                        <div className="flex gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-red-500/60" />
                          <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                          <span className="w-3 h-3 rounded-full bg-green-500/60" />
                        </div>
                        <div className="flex-1 mx-4">
                          <div className="bg-white/5 rounded-md px-3 py-1 text-[11px] text-white/50 font-mono text-center truncate">
                            https://sua-landing-page.com.br
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 uppercase tracking-wide">
                          Markdown
                        </span>
                      </div>

                      {/* White LP content area */}
                      <div className="bg-white text-gray-900">
                        {sections.map((section, idx) => {
                          const html = highlightBrackets(renderMarkdown(section.content));
                          const Renderer = SECTION_RENDERERS[section.sectionType];

                          return (
                            <div
                              key={section.id}
                              id={section.id}
                              ref={(el) => { sectionRefs.current[section.id] = el; }}
                            >
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: idx * 0.05 }}
                              >
                                <Renderer html={html} content={section.content} />
                              </motion.div>
                              {idx < sections.length - 1 && (
                                <div className="border-t border-gray-100" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Mobile: sticky bottom nav + section legend */}
                    {sections.length > 1 && (
                      <>
                        <MobileSectionNav
                          sections={sections}
                          activeSection={activeSection}
                          onNavigate={handleNavigate}
                        />
                        <div className="lg:hidden mt-4 flex flex-wrap gap-2">
                          {sections.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => handleNavigate(s.id)}
                              className="px-3 py-1.5 text-[11px] font-semibold bg-white/5 border border-white/10 text-white/50 rounded-lg hover:text-white transition"
                            >
                              {s.label}: {s.title}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── EDIT MODE ─────────────────────────────────────────────── */}
        {mode === 'edit' && (
          <div className="max-w-5xl mx-auto px-4 pb-8">
            {isHtml ? (
              <HtmlEditMode
                assetId={assetId}
                content={content}
                getValue={getValue}
                setValue={setValue}
                isEdited={isEdited}
                restoreField={restoreField}
              />
            ) : (
              <div className="space-y-4">
                {sections.map((section, idx) => (
                  <motion.div
                    key={section.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                  >
                    <EditSection
                      section={section}
                      getValue={getValue}
                      setValue={setValue}
                      isEdited={isEdited}
                      restoreField={restoreField}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen overlay */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black"
          >
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank');
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
                className="bg-black/60 backdrop-blur-sm border-white/20 text-white/80 hover:text-white"
              >
                <span className="inline-flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Abrir em Nova Aba
                </span>
              </Button>
              <button
                onClick={() => setFullscreen(false)}
                className="w-9 h-9 rounded-lg bg-black/60 backdrop-blur-sm border border-white/20 text-white/80 hover:text-white hover:bg-black/80 transition flex items-center justify-center"
                title="Fechar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <iframe
              srcDoc={content}
              className="w-full h-full border-0"
              title="Landing page fullscreen preview"
              sandbox="allow-scripts"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
