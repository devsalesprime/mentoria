import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { CopyButton, toKebabCase } from './shared';
import { Button } from '../ui/Button';
import { useInlineEdit, markAssetOpened, BRACKET_REGEX } from './useInlineEdit';

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageType = 'mentor' | 'prospect' | 'system';

interface ParsedMessage {
  type: MessageType;
  content: string;
  tone?: string;
  alternatives?: string[];
  stageLabel?: string;
  id: string;
}

interface StageInfo {
  index: number;
  label: string;
  messageIndex: number;
}

interface ChatScriptViewerProps {
  assetId: string;
  assetName: string;
  content: string;
  generatedAt?: string;
  onBack: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// toKebabCase imported from ./shared

// ─── Markdown parser for chat script ──────────────────────────────────────────

const STAGE_REGEX = /^#{2,3}\s+.*(?:ETAPA|Etapa|\d+[A-Za-z]?\s*[.)\-:])/i;
const MENTOR_REGEX = /\*\*(?:Vendedor|Mentor|Você|Consultor|Closer)\s*:\*\*/i;
const PROSPECT_REGEX = /\*\*(?:Prospect|Cliente|Lead|Comprador|Contato)\s*:\*\*/i;
const TONE_REGEX = /^\s*\*?\(([^)]+)\)\*?\s*$/;
const BRACKET_INLINE_REGEX = /\[([A-ZÀÁÂÃÉÊÍÓÔÕÚÇ][A-ZÀÁÂÃÉÊÍÓÔÕÚÇ\s]*(?:DE|DO|DA|DOS|DAS|:)[^\]]*)\]/gi;

function isStageHeader(line: string): boolean {
  return STAGE_REGEX.test(line);
}

function extractStageLabel(line: string): string {
  return line.replace(/^#{2,3}\s+/, '').trim();
}

function isMentorLine(line: string): boolean {
  return MENTOR_REGEX.test(line);
}

function isProspectLine(line: string): boolean {
  return PROSPECT_REGEX.test(line);
}

function extractSpeakerContent(line: string): string {
  // Remove the speaker prefix like **Vendedor:** or **Prospect:**
  return line
    .replace(/\*\*(?:Vendedor|Mentor|Você|Consultor|Closer|Prospect|Cliente|Lead|Comprador|Contato)\s*:\*\*\s*/i, '')
    .trim();
}

function isToneAnnotation(line: string): boolean {
  return TONE_REGEX.test(line);
}

function extractTone(line: string): string {
  const match = line.match(TONE_REGEX);
  return match ? match[1].trim() : '';
}

function isBulletItem(line: string): boolean {
  return /^\s*[-*]\s+/.test(line);
}

function extractBulletContent(line: string): string {
  return line.replace(/^\s*[-*]\s+/, '').trim();
}

function parseMarkdownContent(content: string): ParsedMessage[] {
  const lines = content.split('\n');
  const messages: ParsedMessage[] = [];
  let messageCounter = 0;

  let pendingTone: string | undefined;
  let pendingSpeaker: { type: MessageType } | null = null;
  let lastSpeakerMessage: ParsedMessage | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Stage header
    if (isStageHeader(trimmed)) {
      lastSpeakerMessage = null;
      pendingTone = undefined;
      pendingSpeaker = null;
      messages.push({
        type: 'system',
        content: '',
        stageLabel: extractStageLabel(trimmed),
        id: `msg-${messageCounter++}`,
      });
      continue;
    }

    // Tone annotation — store for next speaker bubble
    if (isToneAnnotation(trimmed)) {
      pendingTone = extractTone(trimmed);
      continue;
    }

    // If there's a pending speaker (from a speaker line with tone-only content),
    // and this line is regular text, use it as the speaker's actual content
    if (pendingSpeaker && !isStageHeader(trimmed) && !isMentorLine(trimmed) && !isProspectLine(trimmed) && !isBulletItem(trimmed)) {
      const msg: ParsedMessage = {
        type: pendingSpeaker.type,
        content: trimmed,
        tone: pendingTone,
        id: `msg-${messageCounter++}`,
      };
      pendingTone = undefined;
      pendingSpeaker = null;
      messages.push(msg);
      lastSpeakerMessage = msg;
      continue;
    }
    pendingSpeaker = null;

    // Bullet item after a speaker message → alternative
    if (isBulletItem(trimmed) && lastSpeakerMessage) {
      if (!lastSpeakerMessage.alternatives) {
        lastSpeakerMessage.alternatives = [];
      }
      lastSpeakerMessage.alternatives.push(extractBulletContent(trimmed));
      continue;
    }

    // Mentor / "Voce" line
    if (isMentorLine(trimmed)) {
      let speakerContent = extractSpeakerContent(trimmed);

      // Check if content is purely a tone annotation: *(tone)* or (tone)
      const toneOnlyMatch = speakerContent.match(/^\*?\(([^)]+)\)\*?$/);
      if (toneOnlyMatch) {
        pendingTone = toneOnlyMatch[1].trim();
        pendingSpeaker = { type: 'mentor' };
        continue;
      }

      // Check for tone prefix: *(tone)* actual text
      const tonePrefixMatch = speakerContent.match(/^\*?\(([^)]+)\)\*?\s+(.+)/);
      if (tonePrefixMatch) {
        pendingTone = tonePrefixMatch[1].trim();
        speakerContent = tonePrefixMatch[2];
      }

      const msg: ParsedMessage = {
        type: 'mentor',
        content: speakerContent,
        tone: pendingTone,
        id: `msg-${messageCounter++}`,
      };
      pendingTone = undefined;
      messages.push(msg);
      lastSpeakerMessage = msg;
      continue;
    }

    // Prospect line
    if (isProspectLine(trimmed)) {
      let speakerContent = extractSpeakerContent(trimmed);

      // Check if content is purely a tone annotation
      const toneOnlyMatch = speakerContent.match(/^\*?\(([^)]+)\)\*?$/);
      if (toneOnlyMatch) {
        pendingTone = toneOnlyMatch[1].trim();
        pendingSpeaker = { type: 'prospect' };
        continue;
      }

      // Check for tone prefix
      const tonePrefixMatch = speakerContent.match(/^\*?\(([^)]+)\)\*?\s+(.+)/);
      if (tonePrefixMatch) {
        pendingTone = tonePrefixMatch[1].trim();
        speakerContent = tonePrefixMatch[2];
      }

      const msg: ParsedMessage = {
        type: 'prospect',
        content: speakerContent,
        tone: pendingTone,
        id: `msg-${messageCounter++}`,
      };
      pendingTone = undefined;
      messages.push(msg);
      lastSpeakerMessage = msg;
      continue;
    }

    // Inline tone annotations within a paragraph — check if a line like "(tom investigativo) Texto..." or "*(tom) texto*" exists
    const inlineToneMatch = trimmed.match(/^\*?\(([^)]+)\)\*?\s+(.+)/);
    if (inlineToneMatch) {
      // Could be a tone before content on the same line. Treat as system message with tone info.
      pendingTone = inlineToneMatch[1].trim();
      // If remaining text is a speaker turn, it will be caught on a future line.
      // Otherwise treat the rest as system text.
      const remainder = inlineToneMatch[2];
      if (isMentorLine(remainder)) {
        let speakerContent = extractSpeakerContent(remainder);
        const toneOnlyMatch = speakerContent.match(/^\*?\(([^)]+)\)\*?$/);
        if (toneOnlyMatch) {
          pendingTone = toneOnlyMatch[1].trim();
          pendingSpeaker = { type: 'mentor' };
        } else {
          const msg: ParsedMessage = {
            type: 'mentor',
            content: speakerContent,
            tone: pendingTone,
            id: `msg-${messageCounter++}`,
          };
          pendingTone = undefined;
          messages.push(msg);
          lastSpeakerMessage = msg;
        }
      } else if (isProspectLine(remainder)) {
        let speakerContent = extractSpeakerContent(remainder);
        const toneOnlyMatch = speakerContent.match(/^\*?\(([^)]+)\)\*?$/);
        if (toneOnlyMatch) {
          pendingTone = toneOnlyMatch[1].trim();
          pendingSpeaker = { type: 'prospect' };
        } else {
          const msg: ParsedMessage = {
            type: 'prospect',
            content: speakerContent,
            tone: pendingTone,
            id: `msg-${messageCounter++}`,
          };
          pendingTone = undefined;
          messages.push(msg);
          lastSpeakerMessage = msg;
        }
      }
      // If neither, the pending tone is set for the next speaker line
      continue;
    }

    // Everything else → system message
    lastSpeakerMessage = null;
    messages.push({
      type: 'system',
      content: trimmed,
      id: `msg-${messageCounter++}`,
    });
  }

  return messages;
}

function extractStages(messages: ParsedMessage[]): StageInfo[] {
  const stages: StageInfo[] = [];
  messages.forEach((msg, idx) => {
    if (msg.stageLabel) {
      stages.push({
        index: stages.length,
        label: msg.stageLabel,
        messageIndex: idx,
      });
    }
  });
  return stages;
}

// ─── Bracket-highlighted text rendering ────────────────────────────────────────

interface BracketTextProps {
  text: string;
  messageId: string;
  getValue: (id: string, original: string) => string;
  setValue: (id: string, value: string) => void;
}

const BracketText: React.FC<BracketTextProps> = ({ text, messageId, getValue, setValue }) => {
  // Split text on bracket patterns — uses controlled inputs (not contentEditable)
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(BRACKET_INLINE_REGEX.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before the bracket
    if (match.index > lastIndex) {
      parts.push(
        <span key={`t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>
      );
    }

    const bracketId = `${messageId}-bracket-${match.index}`;
    const original = match[0];
    const currentVal = getValue(bracketId, original);
    const edited = currentVal !== original;
    const placeholder = original.replace(/^\[/, '').replace(/\]$/, '');

    parts.push(
      <input
        key={bracketId}
        type="text"
        value={edited ? currentVal : ''}
        placeholder={placeholder}
        onChange={(e) => setValue(bracketId, e.target.value || original)}
        size={Math.max(10, placeholder.length)}
        className={`inline-block mx-0.5 px-1.5 py-0.5 text-sm rounded border transition-colors ${
          edited
            ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-300 font-medium'
            : 'bg-yellow-400/10 border-yellow-400/30 text-yellow-300 placeholder:text-yellow-400/50'
        }`}
        title="Clique para editar"
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  if (parts.length === 0) {
    return <>{text}</>;
  }

  return <>{parts}</>;
};

// CopyButton imported from ./shared

// ─── Stage separator ──────────────────────────────────────────────────────────

const StageSeparator: React.FC<{ label: string; stageRef: (el: HTMLDivElement | null) => void }> = ({
  label,
  stageRef,
}) => {
  // Try to extract stage number (with optional letter suffix like 5A, 5B)
  const numMatch = label.match(/(\d+[A-Za-z]?)/);
  const stageNum = numMatch ? numMatch[1] : '';
  // Remove "ETAPA X:" or "Etapa 5A -" patterns to get the name
  const stageName = label
    .replace(/^(?:ETAPA|Etapa)\s*\d*[A-Za-z]?\s*[:\-\u2013\u2014.]\s*/i, '')
    .replace(/^\d+[A-Za-z]?\s*[:\-\u2013\u2014.]\s*/, '')
    .trim() || label;

  return (
    <div ref={stageRef} className="w-full py-4 scroll-mt-32">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/10" />
        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
          {stageNum && (
            <span className="w-6 h-6 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-dark text-xs font-bold flex items-center justify-center flex-shrink-0">
              {stageNum}
            </span>
          )}
          <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">
            {stageName}
          </span>
        </div>
        <div className="flex-1 h-px bg-white/10" />
      </div>
    </div>
  );
};

// ─── Chat bubble ──────────────────────────────────────────────────────────────

interface ChatBubbleProps {
  message: ParsedMessage;
  assetId: string;
  getValue: (id: string, original: string) => string;
  setValue: (id: string, value: string) => void;
  isEdited: (id: string) => boolean;
  restoreField: (id: string) => void;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  assetId,
  getValue,
  setValue,
  isEdited,
  restoreField,
}) => {
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentContent = getValue(message.id, message.content);
  const edited = isEdited(message.id);
  const isMentor = message.type === 'mentor';

  // Auto-resize textarea
  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [editing]);

  const handleSave = () => {
    if (textareaRef.current) {
      const newVal = textareaRef.current.value;
      if (newVal !== message.content) {
        setValue(message.id, newVal);
      }
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditing(false);
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  const handleCopyBubble = () => {
    markAssetOpened(assetId);
  };

  const alignment = isMentor ? 'justify-end' : 'justify-start';
  const bubbleColors = isMentor
    ? 'bg-prosperus-gold-dark/15 border-prosperus-gold-dark/30'
    : 'bg-white/5 border-white/10';
  const textColor = isMentor ? 'text-white/90' : 'text-white/70 italic';
  const label = isMentor ? 'Voce' : 'Prospect';
  const labelColor = isMentor ? 'text-prosperus-gold-dark' : 'text-white/50';

  // Selected alternative state
  const [selectedAlt, setSelectedAlt] = useState<number | null>(null);
  const displayContent = selectedAlt !== null && message.alternatives
    ? message.alternatives[selectedAlt]
    : currentContent;

  return (
    <div className={`flex ${alignment} w-full`}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative max-w-[85%] sm:max-w-[75%] group`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Tone annotation */}
        {message.tone && (
          <p className={`text-[10px] mb-1 ${isMentor ? 'text-right' : 'text-left'} text-white/50 italic`}>
            ({message.tone})
          </p>
        )}

        {/* Speaker label */}
        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${labelColor} ${isMentor ? 'text-right' : 'text-left'}`}>
          {label}
        </p>

        {/* Bubble */}
        <div
          className={`relative px-4 py-3 rounded-2xl border ${bubbleColors} ${
            isMentor ? 'rounded-br-md' : 'rounded-bl-md'
          } cursor-pointer transition hover:border-white/20`}
          onClick={() => !editing && setEditing(true)}
        >
          {editing ? (
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                defaultValue={currentContent}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent text-sm text-white/90 leading-relaxed resize-none outline-none min-h-[40px]"
                rows={2}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={(e) => { e.stopPropagation(); setEditing(false); }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={(e) => { e.stopPropagation(); handleSave(); }}
                >
                  Salvar
                </Button>
              </div>
            </div>
          ) : (
            <div className={`text-sm leading-relaxed ${textColor}`}>
              <BracketText
                text={displayContent}
                messageId={message.id}
                getValue={getValue}
                setValue={setValue}
              />
            </div>
          )}

          {/* Hover actions — copy */}
          <AnimatePresence>
            {hovered && !editing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`absolute top-1 ${isMentor ? '-left-20' : '-right-20'} flex gap-1`}
              >
                <CopyButton
                  content={displayContent}
                  label="Copiar"
                  onCopy={handleCopyBubble}
                  size="sm"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Restore original — shown on hover when edited */}
          <AnimatePresence>
            {hovered && edited && !editing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`absolute -bottom-6 ${isMentor ? 'right-0' : 'left-0'}`}
              >
                <Button
                  variant="link"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    restoreField(message.id);
                    setSelectedAlt(null);
                  }}
                  className="text-[10px]"
                >
                  Restaurar original
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Alternative variants */}
        {message.alternatives && message.alternatives.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 mt-2 ${isMentor ? 'justify-end' : 'justify-start'}`}>
            <button
              onClick={() => setSelectedAlt(null)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition border ${
                selectedAlt === null
                  ? 'bg-prosperus-gold-dark/20 border-prosperus-gold-dark/40 text-prosperus-gold-dark'
                  : 'bg-white/5 border-white/10 text-white/50 hover:text-white/60'
              }`}
            >
              Original
            </button>
            {message.alternatives.map((_, altIdx) => (
              <button
                key={altIdx}
                onClick={() => setSelectedAlt(altIdx)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition border ${
                  selectedAlt === altIdx
                    ? 'bg-prosperus-gold-dark/20 border-prosperus-gold-dark/40 text-prosperus-gold-dark'
                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white/60'
                }`}
              >
                Variante {altIdx + 1}
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

// ─── System message ────────────────────────────────────────────────────────────

const SystemMessage: React.FC<{ content: string }> = ({ content }) => {
  // Render markdown for system messages
  const html = useMemo(() => {
    return DOMPurify.sanitize(marked.parse(content, { async: false }));
  }, [content]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex justify-center w-full py-1"
    >
      <div
        className="text-[11px] text-white/50 italic text-center max-w-[80%] leading-relaxed
          [&_strong]:text-white/50 [&_strong]:font-semibold [&_em]:text-white/30
          [&_p]:mb-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </motion.div>
  );
};

// ─── Stage navigation ──────────────────────────────────────────────────────────

const StageNav: React.FC<{
  stages: StageInfo[];
  activeStage: number;
  onStageClick: (idx: number) => void;
}> = ({ stages, activeStage, onStageClick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check scroll overflow state
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const tolerance = 2;
    setCanScrollLeft(el.scrollLeft > tolerance);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - tolerance);
  }, []);

  // Initial check + resize observer
  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver(() => updateScrollState());
    resizeObserver.observe(el);

    return () => resizeObserver.disconnect();
  }, [updateScrollState, stages]);

  // Scroll by one "page" worth of stage buttons
  const scrollBy = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.6;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  if (stages.length === 0) return null;

  // Detect sub-stages: label like "5A", "5B" has a letter suffix
  const isSubStage = (label: string): boolean => {
    const numMatch = label.match(/(\d+)([A-Za-z])/);
    return !!numMatch;
  };

  return (
    <div className="sticky top-0 z-20 bg-prosperus-navy-dark/95 backdrop-blur-sm border-b border-white/5 -mx-4 px-4">
      <div className="relative">
        {/* Left scroll arrow + fade */}
        {canScrollLeft && (
          <button
            onClick={() => scrollBy('left')}
            className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-1 pr-4 bg-gradient-to-r from-prosperus-navy-dark via-prosperus-navy-dark/80 to-transparent"
            aria-label="Scroll left"
          >
            <span className="text-white/70 text-sm font-bold hover:text-white transition">&#8249;</span>
          </button>
        )}

        {/* Stage buttons container */}
        <div
          ref={scrollRef}
          className="flex gap-1 py-2 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          onScroll={updateScrollState}
        >
          {stages.map((stage, idx) => {
            // Extract stage number (with optional letter suffix like 5A)
            const numMatch = stage.label.match(/(\d+[A-Za-z]?)/);
            const num = numMatch ? numMatch[1] : `${idx + 1}`;
            const isSub = isSubStage(stage.label);

            // Short label
            const shortLabel = stage.label
              .replace(/^(?:ETAPA|Etapa)\s*\d*[A-Za-z]?\s*[:\-\u2013\u2014.]\s*/i, '')
              .replace(/^\d+[A-Za-z]?\s*[:\-\u2013\u2014.]\s*/, '')
              .trim();
            const displayLabel = shortLabel.length > 20
              ? shortLabel.slice(0, 18) + '...'
              : shortLabel;

            const isActive = idx === activeStage;

            // Sub-stages render smaller, with reduced padding
            if (isSub) {
              return (
                <button
                  key={idx}
                  onClick={() => onStageClick(idx)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition whitespace-nowrap flex-shrink-0 border ml-[-2px] ${
                    isActive
                      ? 'bg-prosperus-gold-dark/15 border-prosperus-gold-dark/30 text-prosperus-gold-dark'
                      : 'bg-white/[0.03] border-white/5 text-white/40 hover:text-white/50 hover:bg-white/5'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                    isActive ? 'bg-prosperus-gold-dark/25 text-prosperus-gold-dark' : 'bg-white/10 text-white/40'
                  }`}>
                    {num}
                  </span>
                  {displayLabel && <span>{displayLabel}</span>}
                </button>
              );
            }

            return (
              <button
                key={idx}
                onClick={() => onStageClick(idx)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition whitespace-nowrap flex-shrink-0 border ${
                  isActive
                    ? 'bg-prosperus-gold-dark/20 border-prosperus-gold-dark/40 text-prosperus-gold-dark'
                    : 'bg-white/5 border-white/5 text-white/50 hover:text-white/60 hover:bg-white/5'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  isActive ? 'bg-prosperus-gold-dark/30 text-prosperus-gold-dark' : 'bg-white/10 text-white/50'
                }`}>
                  {num}
                </span>
                {displayLabel && <span>{displayLabel}</span>}
              </button>
            );
          })}
        </div>

        {/* Right scroll arrow + fade */}
        {canScrollRight && (
          <button
            onClick={() => scrollBy('right')}
            className="absolute right-0 top-0 bottom-0 z-10 flex items-center pr-1 pl-4 bg-gradient-to-l from-prosperus-navy-dark via-prosperus-navy-dark/80 to-transparent"
            aria-label="Scroll right"
          >
            <span className="text-white/70 text-sm font-bold hover:text-white transition">&#8250;</span>
          </button>
        )}
      </div>
    </div>
  );
};

// ─── PDF Export ────────────────────────────────────────────────────────────────

const generateChatPdf = async (
  assetName: string,
  messages: ParsedMessage[],
  getValue: (id: string, original: string) => string
) => {
  const html2pdf = (await import('html2pdf.js')).default;
  const date = new Date().toLocaleDateString('pt-BR');

  let html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="font-size:22px;color:#CA9A43;margin-bottom:4px;">${DOMPurify.sanitize(assetName)}</h1>
        <p style="font-size:11px;color:#999;">${date}</p>
      </div>
  `;

  for (const msg of messages) {
    if (msg.stageLabel) {
      html += `
        <div style="margin:24px 0 16px;padding:10px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd;text-align:center;">
          <span style="font-size:12px;font-weight:bold;color:#CA9A43;text-transform:uppercase;letter-spacing:1px;">
            ${DOMPurify.sanitize(msg.stageLabel)}
          </span>
        </div>
      `;
      continue;
    }

    if (msg.type === 'system') {
      html += `
        <p style="text-align:center;font-size:11px;color:#999;font-style:italic;margin:8px 0;">
          ${DOMPurify.sanitize(msg.content)}
        </p>
      `;
      continue;
    }

    const content = getValue(msg.id, msg.content);
    const isMentor = msg.type === 'mentor';
    const align = isMentor ? 'right' : 'left';
    const bgColor = isMentor ? '#FDF6E3' : '#F5F5F5';
    const borderColor = isMentor ? '#CA9A43' : '#DDD';
    const labelText = isMentor ? 'Voce' : 'Prospect';

    if (msg.tone) {
      html += `
        <p style="text-align:${align};font-size:10px;color:#AAA;font-style:italic;margin:4px 0 2px;">
          (${DOMPurify.sanitize(msg.tone)})
        </p>
      `;
    }

    html += `
      <div style="text-align:${align};margin-bottom:12px;">
        <span style="font-size:9px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:1px;">
          ${labelText}
        </span>
        <div style="display:inline-block;max-width:80%;text-align:left;background:${bgColor};border:1px solid ${borderColor};border-radius:12px;padding:10px 14px;margin-top:2px;">
          <p style="font-size:13px;color:#333;margin:0;line-height:1.6;">
            ${DOMPurify.sanitize(content)}
          </p>
        </div>
      </div>
    `;
  }

  html += `
      <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #eee;">
        <p style="font-size:10px;color:#BBB;">Documento gerado pela plataforma Prosperus</p>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const kebab = toKebabCase(assetName);
  await html2pdf().set({
    margin: [10, 10, 10, 10],
    filename: `${kebab}-${new Date().toISOString().split('T')[0]}.pdf`,
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }).from(container).save();

  document.body.removeChild(container);
};

// ─── Build export text ────────────────────────────────────────────────────────

function buildExportText(
  messages: ParsedMessage[],
  getValue: (id: string, original: string) => string
): string {
  const lines: string[] = [];

  for (const msg of messages) {
    if (msg.stageLabel) {
      lines.push('');
      lines.push(`--- ${msg.stageLabel} ---`);
      lines.push('');
      continue;
    }

    if (msg.type === 'system') {
      lines.push(`  ${msg.content}`);
      continue;
    }

    const content = getValue(msg.id, msg.content);
    const label = msg.type === 'mentor' ? 'Voce' : 'Prospect';
    if (msg.tone) {
      lines.push(`(${msg.tone})`);
    }
    lines.push(`${label}: ${content}`);

    if (msg.alternatives && msg.alternatives.length > 0) {
      msg.alternatives.forEach((alt, i) => {
        lines.push(`  Variante ${i + 1}: ${alt}`);
      });
    }
  }

  return lines.join('\n');
}

// ─── Fallback renderer ────────────────────────────────────────────────────────

const FallbackView: React.FC<{ content: string }> = ({ content }) => {
  const html = useMemo(() => {
    return DOMPurify.sanitize(marked.parse(content, { async: false }));
  }, [content]);

  return (
    <div
      className="px-5 py-5 text-sm text-white/70 leading-relaxed
        [&_ul]:space-y-1.5 [&_ul]:mt-2 [&_ul]:ml-0 [&_ul]:list-none [&_ul]:pl-0
        [&_ol]:space-y-1.5 [&_ol]:mt-2 [&_ol]:ml-0 [&_ol]:pl-0
        [&_li]:relative [&_li]:pl-4 [&_li]:text-white/70 [&_li]:text-[13px] [&_li]:leading-relaxed
        [&_li]:before:content-[''] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[9px] [&_li]:before:w-1.5 [&_li]:before:h-1.5 [&_li]:before:rounded-full [&_li]:before:bg-prosperus-gold-dark/50
        [&_strong]:text-prosperus-gold-dark [&_strong]:font-semibold
        [&_em]:text-white/50
        [&_p]:mb-2 [&_p]:text-[13px]
        [&_h2]:text-sm [&_h2]:text-prosperus-gold-dark [&_h2]:font-bold [&_h2]:mb-2
        [&_h3]:text-sm [&_h3]:text-white/70 [&_h3]:font-semibold [&_h3]:mb-1
        [&_blockquote]:border-l-2 [&_blockquote]:border-prosperus-gold-dark/40 [&_blockquote]:bg-prosperus-gold-dark/[0.04] [&_blockquote]:rounded-r-lg [&_blockquote]:py-3 [&_blockquote]:px-4 [&_blockquote]:my-3 [&_blockquote]:text-white/60 [&_blockquote]:italic
      "
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const ChatScriptViewer: React.FC<ChatScriptViewerProps> = ({
  assetId,
  assetName,
  content,
  generatedAt,
  onBack,
}) => {
  const { getValue, setValue, isEdited, restoreField, restoreAll, hasEdits } = useInlineEdit({
    assetId,
    generatedAt,
  });

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [activeStage, setActiveStage] = useState(0);

  // Refs for scrolling to stages
  const stageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(false);

  // Parse on mount / content change
  const messages = useMemo(() => parseMarkdownContent(content), [content]);
  const stages = useMemo(() => extractStages(messages), [messages]);
  const isFallback = messages.length === 0;

  // Mark as opened on mount
  useEffect(() => {
    markAssetOpened(assetId);
  }, [assetId]);

  // Scroll to stage
  const scrollToStage = useCallback((stageIdx: number) => {
    setActiveStage(stageIdx);
    const el = stageRefs.current.get(stageIdx);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Track active stage on scroll
  useEffect(() => {
    if (stages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-stage-idx'));
            if (!isNaN(idx)) {
              setActiveStage(idx);
            }
          }
        }
      },
      { rootMargin: '-100px 0px -60% 0px', threshold: 0 }
    );

    stageRefs.current.forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [stages]);

  // Track scroll position for scroll indicator
  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    const handleScroll = () => {
      setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
    };
    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [messages]);

  // Export functions
  const exportText = useMemo(
    () => buildExportText(messages, getValue),
    [messages, getValue]
  );

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await generateChatPdf(assetName, messages, getValue);
    } catch (e) {
      console.error('PDF download failed:', e);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Pre-compute stage index for each stage separator message (avoids mutation during render)
  const stageIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let counter = -1;
    for (const msg of messages) {
      if (msg.stageLabel) {
        counter++;
        map.set(msg.id, counter);
      }
    }
    return map;
  }, [messages]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
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
              <span className="text-lg">💬</span>
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
            {hasEdits && (
              <Button
                variant="secondary"
                size="sm"
                onClick={restoreAll}
              >
                Restaurar tudo
              </Button>
            )}
            <CopyButton content={exportText} label="Copiar Tudo" onCopy={() => markAssetOpened(assetId)} />
            <Button
              variant="primary"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              loading={downloadingPdf}
            >
              {downloadingPdf ? 'Gerando...' : 'Baixar PDF'}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Fallback ────────────────────────────────────────────────────── */}
      {isFallback && (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <FallbackView content={content} />
        </div>
      )}

      {/* ─── Chat view ───────────────────────────────────────────────────── */}
      {!isFallback && (
        <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
          {/* Stage navigation */}
          {stages.length > 0 && (
            <StageNav
              stages={stages}
              activeStage={activeStage}
              onStageClick={scrollToStage}
            />
          )}

          {/* Chat area */}
          <div className="relative">
          <div ref={chatAreaRef} className="px-4 py-4 space-y-3 max-h-[75vh] overflow-y-auto">
            {messages.map((msg, idx) => {
              // Stage separator
              if (msg.stageLabel) {
                const currentStageIdx = stageIndexMap.get(msg.id) ?? 0;
                return (
                  <StageSeparator
                    key={msg.id}
                    label={msg.stageLabel}
                    stageRef={(el) => {
                      if (el) {
                        el.setAttribute('data-stage-idx', String(currentStageIdx));
                        stageRefs.current.set(currentStageIdx, el);
                      }
                    }}
                  />
                );
              }

              // System message
              if (msg.type === 'system') {
                return <SystemMessage key={msg.id} content={msg.content} />;
              }

              // Chat bubble
              return (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  assetId={assetId}
                  getValue={getValue}
                  setValue={setValue}
                  isEdited={isEdited}
                  restoreField={restoreField}
                />
              );
            })}

            {/* End spacer */}
            <div className="h-4" />
          </div>
          {/* Scroll indicator */}
          {!isAtBottom && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center pb-2">
              <span className="text-white/50 text-sm animate-bounce">↓</span>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
};
