import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CopyButton, toKebabCase, renderMarkdown, generatePdf } from './shared';
import { Button } from '../ui/Button';
import {
  useInlineEdit,
  BRACKET_REGEX,
  markAssetOpened,
} from './useInlineEdit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeleprompterStageMapProps {
  assetId: string;
  assetName: string;
  content: string;
  generatedAt?: string;
  onBack: () => void;
}

interface VslStage {
  id: string;
  number: number;
  title: string;
  content: string;
  plainText: string;
}

type SubMode = 'stageMap' | 'teleprompter';
type ScrollSpeed = 'slow' | 'medium' | 'fast';

// ─── Constants ────────────────────────────────────────────────────────────────

const SPEED_MAP: Record<ScrollSpeed, number> = {
  slow: 0.5,
  medium: 1.2,
  fast: 2.5,
};

const SPEED_LABELS: Record<ScrollSpeed, string> = {
  slow: 'Lento',
  medium: 'Médio',
  fast: 'Rápido',
};

const SPEED_DOTS: Record<ScrollSpeed, string> = {
  slow: '\u25CF\u25CB\u25CB',
  medium: '\u25CF\u25CF\u25CB',
  fast: '\u25CF\u25CF\u25CF',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escape text for safe embedding in HTML (stricter than DOMPurify for plain text) */
const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/**
 * Strip unpaired or broken unicode surrogate sequences that render as raw text.
 * Handles: lone surrogates, escaped literal sequences like "\uD83D\uDDFA", etc.
 */
const cleanSurrogates = (text: string): string =>
  text
    // Strip literal escaped surrogate sequences (e.g., the text "\uD83D\uDDFA" as raw chars)
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]?|[\uDC00-\uDFFF]/g, '')
    .trim();

/**
 * Detect if a teleprompter paragraph is an observation/direction rather than script text.
 * Observations: italic markdown, tone annotations, bracketed stage directions.
 */
const isObservation = (text: string): boolean =>
  /^\s*\*[^*]/.test(text) ||      // starts with italic markdown (*text...)
  /^\s*\((?![\d])/.test(text) ||   // starts with tone annotation — exclude numbered lists like (1)
  /^\s*\[(?![A-Z]{2})/.test(text) || // starts with bracket — exclude bracket placeholders like [INSERIR ...]
  /^\s*_[^_]/.test(text) ||        // starts with underscore italic (_text...)
  /^\s*>/.test(text);              // starts with blockquote (stage direction)

/**
 * Parse VSL script markdown into stages.
 * Splits on: ## ETAPA, ### Etapa, ## Etapa, or numbered headers like ## 1., ## 2.
 */
function parseVslStages(content: string): VslStage[] {
  const stagePattern = /^(#{2,3})\s+etapa\s*(\d+)?[:\s\-–—]*(.*)$|^(#{2})\s+(\d+)\.\s*(.*)$/i;
  const lines = content.split('\n');
  const stages: VslStage[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];
  let stageCounter = 0;

  const flushStage = () => {
    if (currentLines.length === 0) return;
    const raw = currentLines.join('\n').trim();
    if (!raw) return;
    stageCounter++;
    const plain = raw
      .replace(/^#{1,6}\s+.*$/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^[-*]\s+/gm, '  ')
      .replace(/^\d+\.\s+/gm, '  ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    stages.push({
      id: `stage-${stageCounter}`,
      number: stageCounter,
      title: cleanSurrogates(currentTitle || `Etapa ${stageCounter}`),
      content: raw,
      plainText: plain,
    });
  };

  for (const line of lines) {
    const match = line.match(stagePattern);
    if (match) {
      flushStage();
      // Match groups: [1]=hashes, [2]=number?, [3]=title  OR  [4]=hashes, [5]=number, [6]=title
      if (match[1]) {
        currentTitle = match[3]?.trim() || (match[2] ? `Etapa ${match[2]}` : '');
      } else {
        currentTitle = match[6]?.trim() || `Etapa ${match[5]}`;
      }
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flushStage();

  return stages;
}

/**
 * Replace brackets in text with their edited values (if any).
 */
function applyBracketEdits(
  text: string,
  getValue: (fieldId: string, original: string) => string
): string {
  const regex = new RegExp(BRACKET_REGEX.source, 'gi');
  return text.replace(regex, (match) => {
    const fieldId = `bracket_${match.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
    const edited = getValue(fieldId, match);
    return edited !== match ? edited : match;
  });
}

// generatePdf, CopyButton, toKebabCase, renderMarkdown imported from ./shared

// ─── BracketInput ────────────────────────────────────────────────────────────

const BracketInput: React.FC<{
  fieldId: string;
  original: string;
  getValue: (fieldId: string, original: string) => string;
  setValue: (fieldId: string, value: string) => void;
  isEdited: (fieldId: string) => boolean;
}> = ({ fieldId, original, getValue, setValue, isEdited }) => {
  const value = getValue(fieldId, original);
  const edited = isEdited(fieldId);
  const placeholder = original.replace(/^\[/, '').replace(/\]$/, '');

  return (
    <input
      type="text"
      value={edited ? value : ''}
      placeholder={placeholder}
      onChange={(e) => setValue(fieldId, e.target.value || original)}
      className={`inline-block mx-1 px-2 py-0.5 text-sm rounded border transition-colors min-w-[120px] ${
        edited
          ? 'bg-prosperus-gold-dark/20 border-prosperus-gold-dark/40 text-prosperus-gold-dark font-medium'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-400 placeholder:text-amber-500/50'
      }`}
    />
  );
};

// ─── Stage content renderer with bracket inputs ──────────────────────────────

const StageContentEditable: React.FC<{
  content: string;
  stageId: string;
  editing: boolean;
  getValue: (fieldId: string, original: string) => string;
  setValue: (fieldId: string, value: string) => void;
  isEdited: (fieldId: string) => boolean;
}> = ({ content, stageId, editing, getValue, setValue, isEdited }) => {
  if (!editing) {
    // Render markdown with bracket highlights (non-editable)
    const highlighted = content.replace(
      new RegExp(BRACKET_REGEX.source, 'gi'),
      (match) => {
        const fieldId = `bracket_${match.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
        const edited = isEdited(fieldId);
        const value = getValue(fieldId, match);
        if (edited) {
          return `<span class="inline-block px-1.5 py-0.5 bg-prosperus-gold-dark/20 border border-prosperus-gold-dark/30 rounded text-prosperus-gold-dark text-sm font-medium">${escapeHtml(value)}</span>`;
        }
        return `<span class="inline-block px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-amber-400 text-sm">${escapeHtml(match)}</span>`;
      }
    );
    return (
      <div
        className="text-sm text-white/70 leading-relaxed
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
          [&_h3]:text-sm [&_h3]:text-white/70 [&_h3]:font-semibold [&_h3]:mb-1"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(highlighted) }}
      />
    );
  }

  // Editing mode: split content into text chunks and bracket inputs
  const regex = new RegExp(BRACKET_REGEX.source, 'gi');
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let m;
  let partKey = 0;

  while ((m = regex.exec(content)) !== null) {
    // Render markdown for text before this bracket
    if (m.index > lastIndex) {
      const textBefore = content.slice(lastIndex, m.index);
      parts.push(
        <span
          key={`text-${partKey++}`}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(textBefore) }}
          className="text-sm text-white/70 leading-relaxed
            [&_ul]:space-y-1 [&_ul]:mt-1 [&_ul]:list-none [&_ul]:pl-0
            [&_li]:relative [&_li]:pl-4 [&_li]:text-white/70 [&_li]:text-[13px]
            [&_li]:before:content-[''] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[9px] [&_li]:before:w-1.5 [&_li]:before:h-1.5 [&_li]:before:rounded-full [&_li]:before:bg-prosperus-gold-dark/50
            [&_strong]:text-prosperus-gold-dark [&_strong]:font-semibold
            [&_p]:mb-2 [&_p]:text-[13px]"
        />
      );
    }
    const original = m[0];
    const fieldId = `bracket_${original.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
    parts.push(
      <BracketInput
        key={`bracket-${partKey++}`}
        fieldId={fieldId}
        original={original}
        getValue={getValue}
        setValue={setValue}
        isEdited={isEdited}
      />
    );
    lastIndex = m.index + m[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    parts.push(
      <span
        key={`text-${partKey++}`}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(remaining) }}
        className="text-sm text-white/70 leading-relaxed
          [&_ul]:space-y-1 [&_ul]:mt-1 [&_ul]:list-none [&_ul]:pl-0
          [&_li]:relative [&_li]:pl-4 [&_li]:text-white/70 [&_li]:text-[13px]
          [&_li]:before:content-[''] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[9px] [&_li]:before:w-1.5 [&_li]:before:h-1.5 [&_li]:before:rounded-full [&_li]:before:bg-prosperus-gold-dark/50
          [&_strong]:text-prosperus-gold-dark [&_strong]:font-semibold
          [&_p]:mb-2 [&_p]:text-[13px]"
      />
    );
  }

  return <div className="space-y-1">{parts}</div>;
};

// ─── Stage Pipeline (horizontal) ─────────────────────────────────────────────

const StagePipeline: React.FC<{
  stages: VslStage[];
  activeIndex: number;
  onSelect: (index: number) => void;
}> = ({ stages, activeIndex, onSelect }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active stage
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const activeNode = container.children[activeIndex * 2] as HTMLElement | undefined;
    if (activeNode) {
      activeNode.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeIndex]);

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-0 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
    >
      {stages.map((stage, i) => {
        const isActive = i === activeIndex;
        return (
          <React.Fragment key={stage.id}>
            <button
              onClick={() => onSelect(i)}
              className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border transition-all flex-shrink-0 min-w-[110px] ${
                isActive
                  ? 'bg-prosperus-gold-dark/20 border-prosperus-gold-dark/40 text-prosperus-gold-dark shadow-lg shadow-prosperus-gold-dark/10'
                  : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
              }`}
            >
              <span className={`text-[10px] uppercase tracking-wider font-bold ${isActive ? 'text-prosperus-gold-dark' : 'text-white/50'}`}>
                Etapa {stage.number}
              </span>
              <span className={`text-xs font-semibold leading-tight text-center ${isActive ? 'text-prosperus-gold-dark' : 'text-white/50'}`}>
                {stage.title.length > 20 ? stage.title.slice(0, 18) + '...' : stage.title}
              </span>
            </button>
            {i < stages.length - 1 && (
              <div className="w-6 flex-shrink-0 flex items-center justify-center">
                <div className={`w-full border-t-2 ${i < activeIndex ? 'border-prosperus-gold-dark/40' : 'border-white/20'}`} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── Teleprompter Mode ───────────────────────────────────────────────────────

const TeleprompterView: React.FC<{
  stages: VslStage[];
  getValue: (fieldId: string, original: string) => string;
  onExit: () => void;
}> = ({ stages, getValue, onExit }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<ScrollSpeed>('medium');
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Trim stale refs when stages change
  useEffect(() => {
    stageRefs.current = stageRefs.current.slice(0, stages.length);
  }, [stages.length]);

  const showUnfilledWarning = useMemo(() => {
    for (const stage of stages) {
      const regex = new RegExp(BRACKET_REGEX.source, 'gi');
      let m;
      while ((m = regex.exec(stage.content)) !== null) {
        const original = m[0];
        const fieldId = `bracket_${original.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
        if (getValue(fieldId, original) === original) return true;
      }
    }
    return false;
  }, [stages, getValue]);

  // Auto-scroll animation
  const scrollLoop = useCallback(
    (timestamp: number) => {
      if (!scrollRef.current) return;
      if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (isPlaying) {
        scrollRef.current.scrollTop += SPEED_MAP[speed] * (delta / 16);
      }

      animFrameRef.current = requestAnimationFrame(scrollLoop);
    },
    [isPlaying, speed]
  );

  useEffect(() => {
    lastTimeRef.current = 0;
    animFrameRef.current = requestAnimationFrame(scrollLoop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [scrollLoop]);

  // Track which stage is in view
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      const containerMiddle = containerTop + container.clientHeight * 0.4;
      for (let i = stageRefs.current.length - 1; i >= 0; i--) {
        const el = stageRefs.current[i];
        if (el && el.getBoundingClientRect().top <= containerMiddle) {
          setActiveStageIndex(i);
          break;
        }
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Spacebar to toggle pause/play
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const jumpToStage = (index: number) => {
    const el = stageRefs.current[index];
    if (el && scrollRef.current) {
      // Pause auto-scroll when user clicks a stage button (AC6)
      setIsPlaying(false);
      // Update active stage immediately (AC4)
      setActiveStageIndex(index);
      // Smooth scroll to the stage divider (AC5)
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const cycleSpeed = () => {
    setSpeed((prev) => {
      if (prev === 'slow') return 'medium';
      if (prev === 'medium') return 'fast';
      return 'slow';
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-prosperus-navy-dark flex flex-col">
      {/* Controls bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/60 border-b border-white/10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onExit}
          >
            \u25C0 Stage Map
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPlaying(!isPlaying)}
            className="min-w-[100px]"
          >
            {isPlaying ? '\u23F8 Pausar' : '\u25B6 Continuar'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={cycleSpeed}
          >
            Velocidade: {SPEED_DOTS[speed]}
          </Button>
          <span className="text-white/50 text-[10px] hidden sm:inline">
            {SPEED_LABELS[speed]} \u00B7 Espa\u00E7o para pausar
          </span>
        </div>

        {/* Mini stage nav */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-[40%]">
          {stages.map((stage, i) => (
            <button
              key={stage.id}
              onClick={() => jumpToStage(i)}
              className={`flex-shrink-0 w-7 h-7 rounded-full text-[10px] font-bold transition ${
                i === activeStageIndex
                  ? 'bg-prosperus-gold-dark text-black'
                  : 'bg-white/10 text-white/50 hover:bg-white/20 hover:text-white/70'
              }`}
              title={`Etapa ${stage.number}: ${stage.title}`}
            >
              {stage.number}
            </button>
          ))}
        </div>
      </div>

      {/* Unfilled brackets warning */}
      {showUnfilledWarning && (
        <div className="flex-shrink-0 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2">
          <span className="text-amber-400 text-sm">\u26A0\uFE0F</span>
          <p className="text-amber-300 text-sm font-medium">
            Preencha os campos marcados antes de gravar. Volte ao Stage Map para editar.
          </p>
        </div>
      )}

      {/* Teleprompter content */}
      <div
        ref={scrollRef}
        role="button"
        aria-label={isPlaying ? 'Pausar teleprompter' : 'Retomar teleprompter'}
        className="flex-1 overflow-y-auto px-6 sm:px-12 md:px-24 lg:px-40"
        onClick={() => { if (!window.getSelection()?.toString()) setIsPlaying(!isPlaying); }}
      >
        {/* Top padding for reading comfort */}
        <div className="h-[40vh]" />

        {stages.map((stage, i) => {
          const processedText = cleanSurrogates(applyBracketEdits(stage.plainText, getValue));
          const paragraphs = processedText.split(/\n\n+/).filter((p) => p.trim());
          const isActiveStage = i === activeStageIndex;

          return (
            <div
              key={stage.id}
              id={`teleprompter-stage-${stage.number}`}
              ref={(el) => { stageRefs.current[i] = el; }}
              className="mb-16"
            >
              {/* Stage divider */}
              <div className="flex items-center gap-4 mb-8">
                <div className="h-px flex-1 bg-prosperus-gold-dark/20" />
                <span className="text-prosperus-gold-dark/60 text-xs uppercase tracking-widest font-bold flex-shrink-0">
                  Etapa {stage.number} {'\u2014'} {stage.title}
                </span>
                <div className="h-px flex-1 bg-prosperus-gold-dark/20" />
              </div>

              {/* Paragraphs — observations vs script text */}
              {paragraphs.map((paragraph, pIdx) => {
                const observation = isObservation(paragraph);
                return (
                  <p
                    key={pIdx}
                    className={`leading-loose mb-6 transition-colors duration-500 ${
                      observation
                        ? `text-lg italic ${isActiveStage ? 'text-white/40' : 'text-white/25'}`
                        : `text-2xl sm:text-3xl ${isActiveStage ? 'text-white/90' : 'text-white/50'}`
                    }`}
                  >
                    {paragraph}
                  </p>
                );
              })}
            </div>
          );
        })}

        {/* Bottom padding */}
        <div className="h-[60vh]" />
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const TeleprompterStageMap: React.FC<TeleprompterStageMapProps> = ({
  assetId,
  assetName,
  content,
  generatedAt,
  onBack,
}) => {
  const [subMode, setSubMode] = useState<SubMode>('stageMap');
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { getValue, setValue, isEdited, restoreField, restoreAll, hasEdits, edits } = useInlineEdit({ assetId, generatedAt });

  const stages = useMemo(() => parseVslStages(content), [content]);
  const hasParsedStages = stages.length > 0;
  const activeStage = stages[activeStageIndex] ?? null;

  // Mark asset as opened on mount
  useEffect(() => {
    markAssetOpened(assetId);
  }, [assetId]);

  // ─── Action handlers ────────────────────────────────────────────────────────

  const handleCopyAll = useCallback(() => {
    markAssetOpened(assetId);
  }, [assetId]);

  const handleCopyStage = useCallback(() => {
    markAssetOpened(assetId);
  }, [assetId]);

  const handleEnterTeleprompter = useCallback(() => {
    markAssetOpened(assetId);
    setSubMode('teleprompter');
  }, [assetId]);

  const handleExitTeleprompter = useCallback(() => {
    setSubMode('stageMap');
  }, []);

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await generatePdf(assetName, content);
      markAssetOpened(assetId);
    } catch (e) {
      console.error('PDF download failed:', e);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadTxt = () => {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${toKebabCase(assetName)}-${date}.md`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
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

  const goToPrevStage = () => setActiveStageIndex((prev) => Math.max(0, prev - 1));
  const goToNextStage = () => setActiveStageIndex((prev) => Math.min(stages.length - 1, prev + 1));

  // ─── Teleprompter mode ──────────────────────────────────────────────────────

  if (subMode === 'teleprompter' && hasParsedStages) {
    return (
      <TeleprompterView
        stages={stages}
        getValue={getValue}
        onExit={handleExitTeleprompter}
      />
    );
  }

  // ─── Fallback: no stages parsed ─────────────────────────────────────────────

  if (!hasParsedStages) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
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
                <span className="text-lg">{'\uD83C\uDFAC'}</span>
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
            <div className="flex gap-2 flex-shrink-0">
              <CopyButton content={content} label="Copiar Tudo" onCopy={handleCopyAll} />
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
                onClick={handleDownloadTxt}
              >
                Baixar Texto
              </Button>
            </div>
          </div>
        </div>

        {/* Full content as markdown */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 border border-white/10 rounded-xl p-6"
        >
          <div
            className="text-sm text-white/70 leading-relaxed
              [&_ul]:space-y-1.5 [&_ul]:mt-2 [&_ul]:ml-0 [&_ul]:list-none [&_ul]:pl-0
              [&_ol]:space-y-1.5 [&_ol]:mt-2 [&_ol]:ml-0 [&_ol]:pl-0
              [&_li]:relative [&_li]:pl-4 [&_li]:text-white/70 [&_li]:text-[13px] [&_li]:leading-relaxed
              [&_li]:before:content-[''] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[9px] [&_li]:before:w-1.5 [&_li]:before:h-1.5 [&_li]:before:rounded-full [&_li]:before:bg-prosperus-gold-dark/50
              [&_strong]:text-prosperus-gold-dark [&_strong]:font-semibold
              [&_em]:text-white/50
              [&_p]:mb-2 [&_p]:text-[13px]
              [&_h1]:text-base [&_h1]:text-prosperus-gold-dark [&_h1]:font-bold [&_h1]:mb-2
              [&_h2]:text-sm [&_h2]:text-prosperus-gold-dark [&_h2]:font-bold [&_h2]:mb-2
              [&_h3]:text-sm [&_h3]:text-white/70 [&_h3]:font-semibold [&_h3]:mb-1"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        </motion.div>
      </div>
    );
  }

  // ─── Stage Map mode (default) ───────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
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
              <span className="text-lg">{'\uD83C\uDFAC'}</span>
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
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            <CopyButton content={content} label="Copiar Tudo" onCopy={handleCopyAll} />
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
              onClick={handleDownloadTxt}
            >
              Baixar Texto
            </Button>
          </div>
        </div>
      </div>

      {/* Sub-mode toggle tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setSubMode('stageMap')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            subMode === 'stageMap'
              ? 'bg-prosperus-gold-dark text-black'
              : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          {'\uD83D\uDDFA\uFE0F'} Stage Map
        </button>
        <button
          onClick={handleEnterTeleprompter}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            subMode === 'teleprompter'
              ? 'bg-prosperus-gold-dark text-black'
              : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          {'\uD83C\uDFA4'} Teleprompter
        </button>
      </div>

      {/* Stage pipeline */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <StagePipeline
          stages={stages}
          activeIndex={activeStageIndex}
          onSelect={setActiveStageIndex}
        />
      </motion.div>

      {/* Active stage card */}
      {activeStage && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStage.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="bg-white/5 border border-white/10 rounded-xl overflow-hidden"
          >
            {/* Stage header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-prosperus-gold-dark/20 text-prosperus-gold-dark text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {activeStage.number}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-prosperus-gold-dark tracking-wide uppercase">
                    {activeStage.title}
                  </h3>
                  <p className="text-[10px] text-white/50">
                    Etapa {activeStage.number} de {stages.length}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(!editing)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition font-semibold border ${
                    editing
                      ? 'bg-prosperus-gold-dark/20 border-prosperus-gold-dark/40 text-prosperus-gold-dark'
                      : 'bg-white/10 border-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                  }`}
                >
                  {editing ? '\u2713 Editando' : '\u270F\uFE0F Editar'}
                </button>
                <CopyButton
                  content={activeStage.content}
                  label="Copiar Etapa"
                  onCopy={handleCopyStage}
                />
              </div>
            </div>

            {/* Stage content */}
            <div className="px-6 py-5">
              <StageContentEditable
                content={activeStage.content}
                stageId={activeStage.id}
                editing={editing}
                getValue={getValue}
                setValue={setValue}
                isEdited={isEdited}
              />
            </div>

            {/* Navigation footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-white/5">
              <Button
                variant="secondary"
                size="sm"
                onClick={goToPrevStage}
                disabled={activeStageIndex === 0}
              >
                ← Etapa anterior
              </Button>
              <span className="text-white/50 text-xs">
                {activeStageIndex + 1} / {stages.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextStage}
                disabled={activeStageIndex === stages.length - 1}
              >
                Pr\u00F3xima Etapa \u2192
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Edits indicator */}
      {hasEdits && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 flex items-center justify-between px-4 py-2.5 bg-prosperus-gold-dark/10 border border-prosperus-gold-dark/20 rounded-lg"
        >
          <div className="flex items-center gap-2 text-xs text-prosperus-gold-dark/70">
            <div className="w-2 h-2 rounded-full bg-prosperus-gold-dark/40" />
            <span>Edi\u00E7\u00F5es salvas localmente ({Object.keys(edits).length} campo{Object.keys(edits).length !== 1 ? 's' : ''})</span>
          </div>
          <Button
            variant="link"
            size="xs"
            onClick={restoreAll}
            className="text-prosperus-gold-dark/60 hover:text-prosperus-gold-dark"
          >
            Restaurar tudo
          </Button>
        </motion.div>
      )}
    </div>
  );
};
