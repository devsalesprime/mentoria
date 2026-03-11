import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CopyButton, toKebabCase, renderMarkdown, generatePdf, stripMarkdown } from './shared';
import { SectionWarning } from '../shared/SectionWarning';
import { Button } from '../ui/Button';
import {
  useInlineEdit,
  markAssetOpened,
  BRACKET_REGEX,
} from './useInlineEdit';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface OutreachFlowViewProps {
  assetId: string;
  assetName: string;
  content: string;
  generatedAt?: string;
  onBack: () => void;
}

// ─── Chat message types ──────────────────────────────────────────────────────

type ChatSender = 'mentor' | 'prospect' | 'system' | 'stage';

interface ChatMessage {
  id: string;
  sender: ChatSender;
  label?: string;
  tone?: string;
  text: string;
  isRep?: boolean;
  alternatives?: string[];
}

// ─── Flow node types ─────────────────────────────────────────────────────────

interface FlowNode {
  id: string;
  label: string;
  type: 'action' | 'decision' | 'outcome';
  content?: string;
  dayBadge?: string;
  children: { label: string; targetId: string }[];
}

// ─── Tab type ────────────────────────────────────────────────────────────────

type ActiveTab = 'script' | 'reasoning';

// ─── Constants ───────────────────────────────────────────────────────────────

const MENTOR_LABELS = /^\*\*(vendedor|voc[e\u00ea]|mentor|consultor|closer)\s*:\*\*/i;
const PROSPECT_LABELS = /^\*\*(prospect|lead|cliente|comprador|contato)\s*:\*\*/i;
const STAGE_HEADER = /^#{2,3}\s+(etapa|fase|passo|step)/i;
const TONE_REGEX = /^\*?\(([^)]+)\)\*?$/;
// New prompt output headers (AP-3.1); backward compat keeps old patterns
const SPLIT_HEADER_NEW = /^#{1,3}\s+.*\b(racioc[íi]n[íi]|por\s+que\s+este\s+script|estrat[eé]gia\s+de\s+abordagem)/i;
const SPLIT_HEADER = /^#{1,3}\s+.*\b(racioc[íi]n[íi]|por\s+que\s+este\s+script|estrat[eé]gia\s+de\s+abordagem|blueprint|cad[\u00ea]ncia|fluxo|estrat[\u00e9]gia)/i;
// REP method examples: should render as mentor speech bubbles
const REP_LABELS = /^\*\*(Reconhe[cç]er?|Elogiar?|Perguntar?)\s*:\*\*/i;
const REP_PLAIN = /^(?:Reconhe[cç]er?|Elogiar?|Perguntar?)\s*:/i;
// Variant headers: group content under last mentor message as alternatives
// Matches: "Variante 1", "**Variante Opt-in:**", "### Opção 2:", "Versão Networking"
const VARIANT_HEADER = /^(?:#{2,4}\s+|\*{2})?(?:variante|op[cç][aã]o|vers[aã]o)\s+(?:\d+|[A-Za-zÀ-ÖØ-öø-ÿ-]+)/i;
const DAY_REGEX = /dia\s+(\d+)/i;
const DECISION_INDICATORS = /\?|respondeu|se\s+|se\s*\(/i;
const ARROW_REGEX = /[\u2192\u25b6]/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

// toKebabCase, renderMarkdown, stripMarkdown, CopyButton, generatePdf imported from ./shared

// ─── Content splitter ────────────────────────────────────────────────────────

function splitContent(content: string): { scriptRaw: string; blueprintRaw: string; secondTabLabel: string } {
  const lines = content.split('\n');
  let splitIndex = -1;
  let secondTabLabel = 'Raciocínio'; // default for new prompt format / no split

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (SPLIT_HEADER.test(trimmed)) {
      splitIndex = i;
      // Distinguish new (reasoning) from old (blueprint/cadência)
      secondTabLabel = SPLIT_HEADER_NEW.test(trimmed) ? 'Raciocínio' : 'Cadência';
      break;
    }
  }

  if (splitIndex === -1) {
    return { scriptRaw: content, blueprintRaw: '', secondTabLabel };
  }

  return {
    scriptRaw: lines.slice(0, splitIndex).join('\n').trim(),
    blueprintRaw: lines.slice(splitIndex).join('\n').trim(),
    secondTabLabel,
  };
}

// ─── Chat parser ─────────────────────────────────────────────────────────────

function parseChatMessages(raw: string): ChatMessage[] {
  const lines = raw.split('\n');
  const messages: ChatMessage[] = [];
  let pendingTone: string | null = null;
  let pendingSpeaker: { sender: 'mentor' | 'prospect'; label: string } | null = null;
  let lastMentorMessage: ChatMessage | null = null;
  let justSawMentor = false;        // for multi-paragraph concatenation
  let collectingVariant = false;    // true when inside a variant block
  let variantLines: string[] = [];
  let msgIndex = 0;

  const flushVariant = () => {
    if (collectingVariant && variantLines.length > 0 && lastMentorMessage) {
      if (!lastMentorMessage.alternatives) lastMentorMessage.alternatives = [];
      lastMentorMessage.alternatives.push(variantLines.join('\n').trim());
    }
    collectingVariant = false;
    variantLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Blank line: end multi-paragraph accumulation
    if (!line) {
      justSawMentor = false;
      continue;
    }

    // Stage header
    if (STAGE_HEADER.test(line)) {
      flushVariant();
      const title = line.replace(/^#{2,3}\s+/, '');
      messages.push({ id: `stage-${msgIndex++}`, sender: 'stage', text: title });
      pendingTone = null;
      pendingSpeaker = null;
      lastMentorMessage = null;
      justSawMentor = false;
      continue;
    }

    // Variant header — start collecting variant content under last mentor message
    if (VARIANT_HEADER.test(line) && lastMentorMessage) {
      flushVariant();
      collectingVariant = true;
      const inlineContent = line
        .replace(/^#{2,4}\s+/, '')
        .replace(/\*\*/g, '')
        .replace(/^(?:variante|op[cç][aã]o|vers[aã]o)\s+(?:\d+|[A-Za-zÀ-ÖØ-öø-ÿ-]+)\s*:?\s*/i, '')
        .trim();
      if (inlineContent) variantLines.push(inlineContent);
      justSawMentor = false;
      continue;
    }

    // Collect variant content
    if (collectingVariant) {
      const isBreaker = MENTOR_LABELS.test(line) || PROSPECT_LABELS.test(line)
        || STAGE_HEADER.test(line) || /^#{2,3}\s+/.test(line) || VARIANT_HEADER.test(line);
      if (isBreaker) {
        flushVariant();
        // fall through to normal processing below
      } else {
        variantLines.push(line);
        continue;
      }
    }

    // Tone annotation
    const toneMatch = line.match(TONE_REGEX);
    if (toneMatch) {
      pendingTone = toneMatch[1].trim();
      justSawMentor = false;
      continue;
    }

    // REP example lines → mentor speech bubbles with REP badge
    if (REP_LABELS.test(line) || REP_PLAIN.test(line)) {
      flushVariant();
      const labelMatch = line.match(/^\*\*(Reconhe[cç]er?|Elogiar?|Perguntar?)/i)
        || line.match(/^(Reconhe[cç]er?|Elogiar?|Perguntar?)/i);
      const repLabel = labelMatch ? labelMatch[1].trim() : 'REP';
      const text = line.replace(REP_LABELS, '').replace(REP_PLAIN, '').trim() || line;
      const msg: ChatMessage = {
        id: `msg-${msgIndex++}`,
        sender: 'mentor',
        label: repLabel,
        tone: pendingTone || undefined,
        text,
        isRep: true,
      };
      messages.push(msg);
      lastMentorMessage = msg;
      pendingTone = null;
      pendingSpeaker = null;
      justSawMentor = true;
      continue;
    }

    // Pending speaker from tone-only previous line
    if (pendingSpeaker && !/^#{2,3}\s+/.test(line) && !MENTOR_LABELS.test(line) && !PROSPECT_LABELS.test(line)) {
      const msg: ChatMessage = {
        id: `msg-${msgIndex++}`,
        sender: pendingSpeaker.sender,
        label: pendingSpeaker.label,
        tone: pendingTone || undefined,
        text: line,
      };
      messages.push(msg);
      pendingSpeaker = null;
      pendingTone = null;
      if (msg.sender === 'mentor') { lastMentorMessage = msg; justSawMentor = true; }
      else { lastMentorMessage = null; justSawMentor = false; }
      continue;
    }
    pendingSpeaker = null;

    // Mentor message
    const mentorMatch = line.match(MENTOR_LABELS);
    if (mentorMatch) {
      flushVariant();
      let text = line.replace(MENTOR_LABELS, '').trim();

      const toneOnlyMatch = text.match(/^\*?\(([^)]+)\)\*?$/);
      if (toneOnlyMatch) {
        pendingTone = toneOnlyMatch[1].trim();
        pendingSpeaker = { sender: 'mentor', label: mentorMatch[1] };
        justSawMentor = false;
        continue;
      }

      const tonePrefixMatch = text.match(/^\*?\(([^)]+)\)\*?\s+(.+)/);
      if (tonePrefixMatch) {
        pendingTone = tonePrefixMatch[1].trim();
        text = tonePrefixMatch[2];
      }

      if (text) {
        const msg: ChatMessage = {
          id: `msg-${msgIndex++}`,
          sender: 'mentor',
          label: mentorMatch[1],
          tone: pendingTone || undefined,
          text,
        };
        messages.push(msg);
        lastMentorMessage = msg;
        pendingTone = null;
        justSawMentor = true;
      }
      continue;
    }

    // Prospect message
    const prospectMatch = line.match(PROSPECT_LABELS);
    if (prospectMatch) {
      flushVariant();
      let text = line.replace(PROSPECT_LABELS, '').trim();

      const toneOnlyMatch = text.match(/^\*?\(([^)]+)\)\*?$/);
      if (toneOnlyMatch) {
        pendingTone = toneOnlyMatch[1].trim();
        pendingSpeaker = { sender: 'prospect', label: prospectMatch[1] };
        justSawMentor = false;
        continue;
      }

      const tonePrefixMatch = text.match(/^\*?\(([^)]+)\)\*?\s+(.+)/);
      if (tonePrefixMatch) {
        pendingTone = tonePrefixMatch[1].trim();
        text = tonePrefixMatch[2];
      }

      if (text) {
        messages.push({
          id: `msg-${msgIndex++}`,
          sender: 'prospect',
          label: prospectMatch[1],
          tone: pendingTone || undefined,
          text,
        });
        lastMentorMessage = null;
        pendingTone = null;
        justSawMentor = false;
      }
      continue;
    }

    // H2/H3 headers not caught above → section divider
    if (/^#{2,3}\s+/.test(line)) {
      flushVariant();
      const title = line.replace(/^#{2,3}\s+/, '');
      messages.push({ id: `stage-${msgIndex++}`, sender: 'stage', text: title });
      pendingTone = null;
      lastMentorMessage = null;
      justSawMentor = false;
      continue;
    }

    // Multi-paragraph: append to last mentor message (same speaker turn, no blank line)
    if (justSawMentor && lastMentorMessage) {
      lastMentorMessage.text += '\n' + line;
      continue;
    }

    // System message (observations, instructions, etc.)
    lastMentorMessage = null;
    justSawMentor = false;
    messages.push({ id: `sys-${msgIndex++}`, sender: 'system', text: line });
    pendingTone = null;
  }

  flushVariant();
  return messages;
}

// ─── Blueprint parser ────────────────────────────────────────────────────────

function parseBlueprintNodes(raw: string): FlowNode[] {
  const lines = raw.split('\n');
  const nodes: FlowNode[] = [];
  let nodeIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip the initial header
    if (/^#{2,3}\s+/.test(line) && i === 0) continue;

    // Sub-headers become nodes
    if (/^#{2,4}\s+/.test(line)) {
      const label = line.replace(/^#{2,4}\s+/, '');
      const dayMatch = label.match(DAY_REGEX);
      const isDecision = DECISION_INDICATORS.test(label);
      const isOutcome = /resultado|sucesso|convers\u00e3o|agendamento|finaliz/i.test(label);

      nodes.push({
        id: `node-${nodeIndex++}`,
        label,
        type: isDecision ? 'decision' : isOutcome ? 'outcome' : 'action',
        dayBadge: dayMatch ? `Dia ${dayMatch[1]}` : undefined,
        children: [],
      });
      continue;
    }

    // Numbered items or bullet items
    const bulletMatch = line.match(/^(?:[-*+]|\d+[.)]\s*)\s*(.*)/);
    if (bulletMatch) {
      const text = bulletMatch[1].trim();
      if (!text) continue;

      // Check if this is a connection (arrow)
      if (ARROW_REGEX.test(text)) {
        if (nodes.length > 0) {
          const parts = text.split(/[\u2192\u25b6]/);
          const sourceLabel = parts[0].trim();
          const targetLabel = parts.length > 1 ? parts[1].trim() : '';
          nodes[nodes.length - 1].children.push({
            label: sourceLabel || 'Seguir',
            targetId: `node-${nodeIndex}`,
          });
          if (targetLabel) {
            nodes.push({
              id: `node-${nodeIndex++}`,
              label: targetLabel,
              type: /resultado|sucesso|agend/i.test(targetLabel) ? 'outcome' : 'action',
              dayBadge: targetLabel.match(DAY_REGEX)
                ? `Dia ${targetLabel.match(DAY_REGEX)![1]}`
                : undefined,
              children: [],
            });
          }
        }
        continue;
      }

      const dayMatch = text.match(DAY_REGEX);
      const isDecision = DECISION_INDICATORS.test(text);
      const isOutcome = /resultado|sucesso|convers\u00e3o|agendamento|finaliz|encerr/i.test(text);

      // Collect content lines that follow (indented or continuation)
      let contentLines: string[] = [];
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextTrimmed = nextLine.trim();
        if (
          nextTrimmed &&
          /^\s{2,}/.test(nextLine) &&
          !nextTrimmed.match(/^(?:[-*+]|\d+[.)]\s*)\s*/)
        ) {
          contentLines.push(nextTrimmed);
          i++;
        } else if (nextTrimmed && /^\s{2,}[-*+]\s/.test(nextLine)) {
          contentLines.push(nextTrimmed.replace(/^[-*+]\s*/, ''));
          i++;
        } else {
          break;
        }
      }

      nodes.push({
        id: `node-${nodeIndex++}`,
        label: text.replace(/\*\*/g, ''),
        type: isDecision ? 'decision' : isOutcome ? 'outcome' : 'action',
        content: contentLines.length > 0 ? contentLines.join('\n') : undefined,
        dayBadge: dayMatch ? `Dia ${dayMatch[1]}` : undefined,
        children: [],
      });
      continue;
    }

    // Bold lines not caught above
    if (/^\*\*[^*]+\*\*/.test(line)) {
      const label = line.replace(/\*\*/g, '').trim();
      if (label) {
        const dayMatch = label.match(DAY_REGEX);
        const isDecision = DECISION_INDICATORS.test(label);
        const isOutcome = /resultado|sucesso|convers\u00e3o|agendamento|finaliz|encerr/i.test(label);
        nodes.push({
          id: `node-${nodeIndex++}`,
          label,
          type: isDecision ? 'decision' : isOutcome ? 'outcome' : 'action',
          dayBadge: dayMatch ? `Dia ${dayMatch[1]}` : undefined,
          children: [],
        });
      }
    }
  }

  // Auto-link sequential nodes that don't have explicit children
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].children.length === 0 && i + 1 < nodes.length) {
      nodes[i].children.push({
        label: '',
        targetId: nodes[i + 1].id,
      });
    }
  }

  return nodes;
}

// ─── Bracket highlight renderer ──────────────────────────────────────────────

function renderTextWithBrackets(
  text: string,
  fieldPrefix: string,
  getValue: (id: string, original: string) => string,
  setValue: (id: string, value: string) => void,
  isEdited: (id: string) => boolean
): React.ReactNode {
  const regex = new RegExp(BRACKET_REGEX.source, 'gi');
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let bracketIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={`t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>
      );
    }

    const bracketText = match[0];
    const fieldId = `${fieldPrefix}-bracket-${bracketIdx}`;
    const currentValue = getValue(fieldId, bracketText);
    const edited = isEdited(fieldId);
    bracketIdx++;

    const placeholder = bracketText.replace(/^\[/, '').replace(/\]$/, '');

    parts.push(
      <input
        key={fieldId}
        type="text"
        value={edited ? currentValue : ''}
        placeholder={placeholder}
        onChange={(e) => setValue(fieldId, e.target.value || bracketText)}
        size={Math.max(10, placeholder.length)}
        className={`inline-block mx-0.5 px-1.5 py-0.5 text-sm rounded border transition-colors ${
          edited
            ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-300 font-medium'
            : 'bg-yellow-400/10 border-yellow-400/30 text-yellow-300 placeholder:text-yellow-400/50'
        }`}
        title={edited ? 'Editado (clique para alterar)' : 'Clique para preencher'}
      />
    );

    lastIndex = match.index + bracketText.length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

// CopyButton and generatePdf imported from ./shared

// ─── Chat bubble ─────────────────────────────────────────────────────────────

interface ChatBubbleProps {
  message: ChatMessage;
  fieldPrefix: string;
  getValue: (id: string, original: string) => string;
  setValue: (id: string, value: string) => void;
  isEdited: (id: string) => boolean;
  restoreField: (id: string) => void;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  fieldPrefix,
  getValue,
  setValue,
  isEdited,
  restoreField,
}) => {
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [selectedAlt, setSelectedAlt] = useState<number | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const fullFieldId = `${fieldPrefix}-${message.id}`;
  const currentContent = getValue(fullFieldId, message.text);
  const edited = isEdited(fullFieldId);
  const displayContent = selectedAlt !== null && message.alternatives
    ? message.alternatives[selectedAlt]
    : currentContent;

  // Auto-resize textarea
  React.useEffect(() => {
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
      if (newVal !== message.text) {
        setValue(fullFieldId, newVal);
      } else {
        restoreField(fullFieldId);
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

  if (message.sender === 'stage') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3 my-6"
      >
        <div className="flex-1 h-px bg-prosperus-gold-dark/30" />
        <span className="text-prosperus-gold-dark text-xs font-bold uppercase tracking-wider px-3">
          {message.text}
        </span>
        <div className="flex-1 h-px bg-prosperus-gold-dark/30" />
      </motion.div>
    );
  }

  if (message.sender === 'system') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center my-2"
      >
        <div className="bg-white/5 border border-white/5 rounded-lg px-4 py-2 max-w-md text-center">
          <p className="text-white/50 text-sm leading-relaxed italic">
            {renderTextWithBrackets(
              message.text,
              fullFieldId,
              getValue,
              setValue,
              isEdited
            )}
          </p>
        </div>
      </motion.div>
    );
  }

  const isMentor = message.sender === 'mentor';

  return (
    <motion.div
      initial={{ opacity: 0, x: isMentor ? 12 : -12 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex flex-col ${isMentor ? 'items-end' : 'items-start'} my-1.5`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {message.tone && (
        <span className="text-[10px] text-white/50 italic mb-0.5 px-1">
          ({message.tone})
        </span>
      )}
      <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%]">
        {!isMentor && (
          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-[10px]">
            {'\uD83D\uDC64'}
          </div>
        )}
        <div
          className={`relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed cursor-pointer transition hover:border-white/20 ${
            isMentor
              ? 'bg-prosperus-gold-dark/15 border border-prosperus-gold-dark/25 text-white/90 rounded-br-md'
              : 'bg-white/5 border border-white/10 text-white/70 rounded-bl-md'
          }`}
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
            renderTextWithBrackets(
              displayContent,
              fullFieldId,
              getValue,
              setValue,
              isEdited
            )
          )}

          {/* Restore original on hover when edited */}
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
                    restoreField(fullFieldId);
                  }}
                  className="text-[10px]"
                >
                  Restaurar original
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {isMentor && (
          <div className="w-6 h-6 rounded-full bg-prosperus-gold-dark/20 flex items-center justify-center flex-shrink-0 text-[10px]">
            {'\uD83D\uDDE3\uFE0F'}
          </div>
        )}
      </div>
      {/* Labels, REP badge, edited indicator */}
      <div className={`flex items-center gap-2 mt-0.5 px-1 ${isMentor ? 'flex-row-reverse' : ''}`}>
        {message.label && (
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider ${
              isMentor ? 'text-prosperus-gold-dark/60' : 'text-white/50'
            }`}
          >
            {message.label}
          </span>
        )}
        {message.isRep && (
          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-prosperus-gold-dark/10 text-prosperus-gold-dark/50">
            REP
          </span>
        )}
        {edited && (
          <span className="text-[10px] text-yellow-400/70 font-medium">editado</span>
        )}
      </div>

      {/* Variant toggle buttons */}
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
  );
};

// ─── Flow card ───────────────────────────────────────────────────────────────

interface FlowCardProps {
  node: FlowNode;
  index: number;
  isLast: boolean;
  fieldPrefix: string;
  getValue: (id: string, original: string) => string;
  setValue: (id: string, value: string) => void;
  isEdited: (id: string) => boolean;
  onMarkUsed: () => void;
}

const FlowCard: React.FC<FlowCardProps> = ({
  node,
  index,
  isLast,
  fieldPrefix,
  getValue,
  setValue,
  isEdited,
  onMarkUsed,
}) => {
  const [expanded, setExpanded] = useState(false);

  const borderClass =
    node.type === 'decision'
      ? 'border-amber-500/20 bg-amber-500/[0.06]'
      : node.type === 'outcome'
        ? 'border-green-500/20 bg-green-500/[0.06]'
        : 'border-white/10 bg-white/5';

  const iconIndicator =
    node.type === 'decision'
      ? '\u25C7'
      : node.type === 'outcome'
        ? '\u2713'
        : '\u25CB';

  const typeLabel =
    node.type === 'decision'
      ? 'DECIS\u00C3O'
      : node.type === 'outcome'
        ? 'RESULTADO'
        : '';

  return (
    <div className="relative">
      {/* Connecting line above */}
      {index > 0 && (
        <div className="flex justify-center">
          <div className="w-px h-6 bg-white/10" />
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className={`border rounded-xl p-4 relative transition-colors hover:border-white/20 ${borderClass}`}
      >
        {/* Top row: step number + day badge + type label */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-white/50 text-[10px] font-bold">
            {iconIndicator} {index + 1}
          </span>
          {node.dayBadge && (
            <span className="bg-prosperus-gold-dark/10 text-prosperus-gold-dark text-xs font-bold px-2 py-0.5 rounded-full">
              {node.dayBadge}
            </span>
          )}
          {typeLabel && (
            <span
              className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                node.type === 'decision'
                  ? 'text-amber-400/70 bg-amber-500/10'
                  : 'text-green-400/70 bg-green-500/10'
              }`}
            >
              {typeLabel}
            </span>
          )}
        </div>

        {/* Label */}
        <h4 className="text-sm font-semibold text-white/90 leading-snug mb-1">
          {node.label}
        </h4>

        {/* Decision branch indicators */}
        {node.type === 'decision' && node.children.length > 0 && (
          <div className="flex gap-3 mt-2">
            {node.children.map((child, ci) => (
              <span
                key={ci}
                className="text-[10px] font-bold text-amber-400/70 bg-amber-500/10 px-2 py-0.5 rounded"
              >
                {child.label || 'Seguir'} {'\u2192'}
              </span>
            ))}
          </div>
        )}

        {/* Expandable content */}
        {node.content && (
          <>
            <Button
              variant="link"
              size="xs"
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-[10px]"
            >
              {expanded ? '\u25B2 Recolher modelo' : '\u25BC Ver modelo de mensagem'}
            </Button>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 p-3 bg-black/20 rounded-lg border border-white/5">
                    <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
                      {renderTextWithBrackets(
                        node.content,
                        `${fieldPrefix}-${node.id}`,
                        getValue,
                        setValue,
                        isEdited
                      )}
                    </p>
                    <div className="flex justify-end mt-2">
                      <CopyButton
                        content={stripMarkdown(node.content)}
                        label="Copiar"
                        onCopy={onMarkUsed}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>

      {/* Connecting line below (except last) */}
      {!isLast && (
        <div className="flex justify-center">
          <div className="w-px h-6 bg-white/10" />
        </div>
      )}
    </div>
  );
};

// ─── Mobile flow list (simplified) ──────────────────────────────────────────

const MobileFlowList: React.FC<{
  nodes: FlowNode[];
  fieldPrefix: string;
  getValue: (id: string, original: string) => string;
  setValue: (id: string, value: string) => void;
  isEdited: (id: string) => boolean;
  onMarkUsed: () => void;
}> = ({ nodes, fieldPrefix, getValue, setValue, isEdited, onMarkUsed }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-2.5 top-0 bottom-0 w-px bg-white/10" />

      {nodes.map((node, idx) => {
        const dotColor =
          node.type === 'decision'
            ? 'bg-amber-500'
            : node.type === 'outcome'
              ? 'bg-green-500'
              : 'bg-prosperus-gold-dark';

        return (
          <div key={node.id} className="relative mb-4 last:mb-0">
            {/* Dot on the line */}
            <div
              className={`absolute -left-[14px] top-1.5 w-2.5 h-2.5 rounded-full ${dotColor} ring-2 ring-black/50`}
            />

            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-white/50 text-[10px] font-bold mt-0.5 flex-shrink-0">
                {idx + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-white/90 font-medium">{node.label}</span>
                  {node.dayBadge && (
                    <span className="bg-prosperus-gold-dark/10 text-prosperus-gold-dark text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {node.dayBadge}
                    </span>
                  )}
                </div>
                {node.content && (
                  <>
                    <Button
                      variant="link"
                      size="xs"
                      onClick={() =>
                        setExpandedId(expandedId === node.id ? null : node.id)
                      }
                      className="mt-1 text-[10px]"
                    >
                      {expandedId === node.id
                        ? '\u25B2 Recolher'
                        : '\u25BC Ver mensagem'}
                    </Button>
                    <AnimatePresence>
                      {expandedId === node.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-1 p-2.5 bg-black/20 rounded-lg border border-white/5">
                            <p className="text-sm text-white/50 leading-relaxed whitespace-pre-wrap">
                              {renderTextWithBrackets(
                                node.content,
                                `${fieldPrefix}-${node.id}`,
                                getValue,
                                setValue,
                                isEdited
                              )}
                            </p>
                            <div className="flex justify-end mt-1.5">
                              <CopyButton
                                content={stripMarkdown(node.content)}
                                label="Copiar"
                                onCopy={onMarkUsed}
                              />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Blueprint fallback (styled markdown with vertical accent) ───────────────

const BlueprintFallback: React.FC<{ raw: string }> = ({ raw }) => (
  <div className="border-l-2 border-prosperus-gold-dark/30 pl-5 py-2">
    <MarkdownBlock raw={raw} />
  </div>
);

// ─── Shared markdown block styling ──────────────────────────────────────────

const MarkdownBlock: React.FC<{ raw: string }> = ({ raw }) => (
  <div
    className="text-sm text-white/70 leading-relaxed
      [&_ul]:space-y-1.5 [&_ul]:mt-2 [&_ul]:ml-0 [&_ul]:list-none [&_ul]:pl-0
      [&_ol]:space-y-1.5 [&_ol]:mt-2 [&_ol]:ml-0 [&_ol]:pl-0
      [&_li]:relative [&_li]:pl-4 [&_li]:text-white/70 [&_li]:text-[13px] [&_li]:leading-relaxed
      [&_li]:before:content-[''] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[9px] [&_li]:before:w-1.5 [&_li]:before:h-1.5 [&_li]:before:rounded-full [&_li]:before:bg-prosperus-gold-dark/50
      [&_strong]:text-prosperus-gold-dark [&_strong]:font-semibold
      [&_em]:text-white/50
      [&_p]:mb-2 [&_p]:text-[13px]
      [&_h2]:text-sm [&_h2]:text-prosperus-gold-dark [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-4
      [&_h3]:text-sm [&_h3]:text-white/70 [&_h3]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3
      [&_h4]:text-xs [&_h4]:text-white/70 [&_h4]:font-semibold [&_h4]:mb-1 [&_h4]:mt-2
    "
    dangerouslySetInnerHTML={{ __html: renderMarkdown(raw) }}
  />
);

// ─── Reasoning sections (card-per-topic layout) ─────────────────────────────

interface ReasoningSection {
  title: string;
  number: string;
  body: string;
}

function parseReasoningSections(raw: string): { intro: string; sections: ReasoningSection[] } {
  const lines = raw.split('\n');
  const sections: ReasoningSection[] = [];
  let intro: string[] = [];
  let current: { title: string; number: string; lines: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    // Numbered section header: ### 1. Title, ### 2: Title, etc.
    const numberedMatch = trimmed.match(/^#{2,3}\s+(\d+)\.?\s*[:\-\u2013\u2014.]?\s*(.+)/);
    if (numberedMatch) {
      if (current) {
        sections.push({ title: current.title, number: current.number, body: current.lines.join('\n').trim() });
      }
      current = {
        number: numberedMatch[1],
        title: numberedMatch[2].trim(),
        lines: [],
      };
      continue;
    }

    // Non-numbered header (e.g. "## Raciocínio Estratégico") → treat as intro
    if (/^#{2,3}\s+/.test(trimmed) && !current) {
      intro.push(line);
      continue;
    }

    if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  }

  // Flush last section
  if (current) {
    sections.push({ title: current.title, number: current.number, body: current.lines.join('\n').trim() });
  }

  return { intro: intro.join('\n').trim(), sections };
}

const ReasoningView: React.FC<{ raw: string }> = ({ raw }) => {
  const { intro, sections } = useMemo(() => parseReasoningSections(raw), [raw]);

  if (sections.length === 0) {
    return <BlueprintFallback raw={raw} />;
  }

  return (
    <div className="space-y-4">
      {intro && (
        <div className="px-1 pb-2">
          <MarkdownBlock raw={intro} />
        </div>
      )}
      {sections.map((section, idx) => (
        <div
          key={idx}
          className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden"
        >
          {/* Section header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 bg-white/[0.02]">
            <span className="w-7 h-7 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-dark text-xs font-bold flex items-center justify-center flex-shrink-0">
              {section.number}
            </span>
            <h3 className="text-sm font-semibold text-white/90">{section.title}</h3>
          </div>
          {/* Section body */}
          <div className="px-5 py-4">
            <MarkdownBlock raw={section.body} />
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Script fallback (styled markdown) ───────────────────────────────────────

const ScriptFallback: React.FC<{ raw: string }> = ({ raw }) => (
  <div
    className="text-sm text-white/70 leading-relaxed px-4 py-3
      [&_ul]:space-y-1.5 [&_ul]:mt-2 [&_ul]:ml-0 [&_ul]:list-none [&_ul]:pl-0
      [&_ol]:space-y-1.5 [&_ol]:mt-2 [&_ol]:ml-0 [&_ol]:pl-0
      [&_li]:relative [&_li]:pl-4 [&_li]:text-white/70 [&_li]:text-[13px] [&_li]:leading-relaxed
      [&_li]:before:content-[''] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[9px] [&_li]:before:w-1.5 [&_li]:before:h-1.5 [&_li]:before:rounded-full [&_li]:before:bg-prosperus-gold-dark/50
      [&_strong]:text-prosperus-gold-dark [&_strong]:font-semibold
      [&_em]:text-white/50
      [&_p]:mb-2 [&_p]:text-[13px]
      [&_h2]:text-sm [&_h2]:text-prosperus-gold-dark [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-4
      [&_h3]:text-sm [&_h3]:text-white/70 [&_h3]:font-semibold [&_h3]:mb-1
    "
    dangerouslySetInnerHTML={{ __html: renderMarkdown(raw) }}
  />
);

// ─── Stage navigation with scroll arrows (matches sales script StageNav) ─────

const OutreachStageNav: React.FC<{
  stages: { index: number; label: string; messageId: string }[];
  activeStageIdx: number;
  onStageClick: (idx: number) => void;
}> = ({ stages, activeStageIdx, onStageClick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const tolerance = 2;
    setCanScrollLeft(el.scrollLeft > tolerance);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - tolerance);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const resizeObserver = new ResizeObserver(() => updateScrollState());
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [updateScrollState, stages]);

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

  return (
    <div className="sticky top-0 z-20 bg-prosperus-navy-dark/95 backdrop-blur-sm border-b border-white/5 -mx-0 px-4">
      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scrollBy('left')}
            className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-1 pr-4 bg-gradient-to-r from-prosperus-navy-dark via-prosperus-navy-dark/80 to-transparent"
            aria-label="Scroll left"
          >
            <span className="text-white/70 text-sm font-bold hover:text-white transition">&#8249;</span>
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-1 py-2 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          onScroll={updateScrollState}
        >
          {stages.map((stage, idx) => {
            const numMatch = stage.label.match(/(\d+)/);
            const num = numMatch ? numMatch[1] : `${idx + 1}`;
            const shortLabel = stage.label
              .replace(/^(?:ETAPA|Etapa|Fase|Passo)\s*\d*\s*[:\u2013\u2014.\-]\s*/i, '')
              .replace(/^\d+\s*[:\u2013\u2014.\-]\s*/, '')
              .trim();
            const displayLabel = shortLabel.length > 20 ? shortLabel.slice(0, 18) + '...' : shortLabel;
            const isActive = idx === activeStageIdx;

            return (
              <button
                key={stage.messageId}
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

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const OutreachFlowView: React.FC<OutreachFlowViewProps> = ({
  assetId,
  assetName,
  content,
  generatedAt,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('script');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { getValue, setValue, isEdited, restoreField, hasEdits, restoreAll } = useInlineEdit({
    assetId,
    generatedAt,
  });

  // Mark as opened on mount
  useEffect(() => {
    markAssetOpened(assetId);
  }, [assetId]);

  const handleMarkUsed = useCallback(() => {
    markAssetOpened(assetId);
  }, [assetId]);

  // ─── Parse content ───────────────────────────────────────────────────────

  const { scriptRaw, blueprintRaw, secondTabLabel } = useMemo(() => splitContent(content), [content]);

  const chatMessages = useMemo(() => parseChatMessages(scriptRaw), [scriptRaw]);
  const hasChatMessages =
    chatMessages.filter((m) => m.sender !== 'system' && m.sender !== 'stage').length > 0;

  // Extract stages for navigation
  const stages = useMemo(() => {
    const result: { index: number; label: string; messageId: string }[] = [];
    chatMessages.forEach((msg) => {
      if (msg.sender === 'stage') {
        result.push({ index: result.length, label: msg.text, messageId: msg.id });
      }
    });
    return result;
  }, [chatMessages]);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const stageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const scrollToStage = useCallback((idx: number) => {
    setActiveStageIdx(idx);
    const stage = stages[idx];
    if (!stage) return;
    const el = stageRefs.current.get(stage.messageId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [stages]);

  const isReasoning = secondTabLabel === 'Raciocínio';
  const flowNodes = useMemo(
    () => (blueprintRaw && !isReasoning ? parseBlueprintNodes(blueprintRaw) : []),
    [blueprintRaw, isReasoning]
  );
  const hasBlueprint = blueprintRaw.length > 0;
  const hasFlowNodes = flowNodes.length > 0;
  // Determine second tab icon based on content type
  const secondTabIcon = secondTabLabel === 'Raciocínio' ? '\uD83E\uDDE0' : '\uD83D\uDD00';

  // ─── Action handlers ─────────────────────────────────────────────────────

  const handleDownloadText = useCallback(() => {
    const date = new Date().toISOString().split('T')[0];
    const dateBr = new Date().toLocaleDateString('pt-BR');
    const header = hasEdits ? `> Editado em ${dateBr}\n\n` : '';
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
    handleMarkUsed();
  }, [content, assetName, handleMarkUsed, hasEdits]);

  const handleDownloadPdf = useCallback(async () => {
    setDownloadingPdf(true);
    try {
      await generatePdf(assetName, content, { edited: hasEdits });
      handleMarkUsed();
    } catch (e) {
      console.error('PDF download failed:', e);
    } finally {
      setDownloadingPdf(false);
    }
  }, [assetName, content, handleMarkUsed, hasEdits]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="flex-shrink-0"
            >
              {'\u2190'} Voltar
            </Button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-prosperus-gold-dark/20 to-prosperus-gold-dark/5 border border-prosperus-gold-dark/20 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">{'\uD83D\uDCDE'}</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {assetName}
              </h2>
              {generatedAt && (
                <p className="text-white/30 text-xs mt-0.5">
                  Gerado em{' '}
                  {new Date(generatedAt).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          </div>

          {/* Action bar */}
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            <CopyButton
              content={stripMarkdown(content)}
              label="Copiar Tudo"
              onCopy={handleMarkUsed}
            />
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
              onClick={handleDownloadText}
            >
              Baixar Texto
            </Button>
          </div>
        </div>
      </div>

      {/* ── Warning banner ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <SectionWarning
          message={
            'Este script e cad\u00eancia s\u00e3o um ponto de partida. Adapte ao seu tom de voz, produto e contexto de mercado antes de usar com prospects reais.'
          }
          variant="warning"
        />
      </div>

      {/* ── Inline edit indicator ──────────────────────────────────────────── */}
      {hasEdits && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2"
        >
          <span className="text-green-400 text-sm font-semibold">
            {'\u270F\uFE0F'} Voc\u00ea tem edi\u00e7\u00f5es salvas neste ativo
          </span>
          <Button
            variant="link"
            size="xs"
            onClick={restoreAll}
            className="text-green-400/70 hover:text-green-400"
          >
            Restaurar originais
          </Button>
        </motion.div>
      )}

      {/* ── Tab toggle (only when second section exists) ──────────────────── */}
      {hasBlueprint && (
        <div className="flex gap-1 mb-4 bg-white/5 border border-white/10 rounded-lg p-1" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'script'}
            aria-controls="panel-script"
            onClick={() => setActiveTab('script')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition ${
              activeTab === 'script'
                ? 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark border border-prosperus-gold-dark/30'
                : 'text-white/50 hover:text-white/70 border border-transparent'
            }`}
          >
            {'\uD83D\uDCAC'} Script
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'reasoning'}
            aria-controls="panel-reasoning"
            onClick={() => setActiveTab('reasoning')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition ${
              activeTab === 'reasoning'
                ? 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark border border-prosperus-gold-dark/30'
                : 'text-white/50 hover:text-white/70 border border-transparent'
            }`}
          >
            {secondTabIcon} {secondTabLabel}
          </button>
        </div>
      )}

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'script' && (
          <motion.div
            key="script"
            id="panel-script"
            role="tabpanel"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
          >
            <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
              {/* Chat header */}
              <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-semibold text-white/50">
                    Script de Abordagem
                  </span>
                </div>
                <CopyButton
                  content={stripMarkdown(scriptRaw)}
                  label="Copiar Script"
                  onCopy={handleMarkUsed}
                />
              </div>

              {/* Stage navigation — with scroll arrows like sales script */}
              {stages.length > 0 && (
                <OutreachStageNav
                  stages={stages}
                  activeStageIdx={activeStageIdx}
                  onStageClick={scrollToStage}
                />
              )}

              {/* Chat messages */}
              <div ref={chatScrollRef} className="px-4 py-4 space-y-1 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                {hasChatMessages ? (
                  chatMessages.map((msg) => {
                    const isStage = msg.sender === 'stage';
                    return (
                      <div
                        key={msg.id}
                        ref={isStage ? (el) => { if (el) stageRefs.current.set(msg.id, el); } : undefined}
                        className={isStage ? 'scroll-mt-16' : undefined}
                      >
                        <ChatBubble
                          message={msg}
                          fieldPrefix="script"
                          getValue={getValue}
                          setValue={setValue}
                          isEdited={isEdited}
                          restoreField={restoreField}
                        />
                      </div>
                    );
                  })
                ) : (
                  <ScriptFallback raw={scriptRaw} />
                )}
              </div>

              {/* Chat footer hint */}
              <div className="px-5 py-2.5 border-t border-white/5 bg-white/5">
                <p className="text-[10px] text-white/20 text-center">
                  {
                    'Campos em amarelo são editáveis — clique para personalizar com seus dados'
                  }
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'reasoning' && (
          <motion.div
            key="reasoning"
            id="panel-reasoning"
            role="tabpanel"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
          >
            <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
              {/* Second-tab header */}
              <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs">{secondTabIcon}</span>
                  <span className="text-xs font-semibold text-white/50">
                    {secondTabLabel}
                  </span>
                </div>
                {hasBlueprint && (
                  <CopyButton
                    content={stripMarkdown(blueprintRaw)}
                    label={`Copiar ${secondTabLabel}`}
                    onCopy={handleMarkUsed}
                  />
                )}
              </div>

              {/* Blueprint content */}
              <div className="px-4 py-5 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                {!hasBlueprint ? (
                  <div className="text-center py-12">
                    <span className="text-3xl block mb-3">{secondTabIcon}</span>
                    <p className="text-white/50 text-sm">
                      {`Conteúdo de ${secondTabLabel} não encontrado nesta versão.`}
                    </p>
                    <p className="text-white/20 text-sm mt-1">
                      {'Regenere o script para obter o conteúdo atualizado.'}
                    </p>
                  </div>
                ) : hasFlowNodes ? (
                  <>
                    {/* Desktop flow */}
                    <div className="hidden sm:block space-y-0">
                      {flowNodes.map((node, idx) => (
                        <FlowCard
                          key={node.id}
                          node={node}
                          index={idx}
                          isLast={idx === flowNodes.length - 1}
                          fieldPrefix="blueprint"
                          getValue={getValue}
                          setValue={setValue}
                          isEdited={isEdited}
                          onMarkUsed={handleMarkUsed}
                        />
                      ))}
                    </div>
                    {/* Mobile list */}
                    <div className="sm:hidden">
                      <MobileFlowList
                        nodes={flowNodes}
                        fieldPrefix="blueprint"
                        getValue={getValue}
                        setValue={setValue}
                        isEdited={isEdited}
                        onMarkUsed={handleMarkUsed}
                      />
                    </div>
                  </>
                ) : isReasoning ? (
                  <ReasoningView raw={blueprintRaw} />
                ) : (
                  <BlueprintFallback raw={blueprintRaw} />
                )}
              </div>

              {/* Blueprint footer legend */}
              {hasFlowNodes && (
                <div className="px-5 py-2.5 border-t border-white/5 bg-white/5">
                  <div className="flex items-center justify-center gap-4 flex-wrap">
                    <span className="flex items-center gap-1.5 text-[10px] text-white/50">
                      <span className="w-2.5 h-2.5 rounded-sm bg-white/5 border border-white/10" />
                      {'Ação'}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-white/50">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/[0.12] border border-amber-500/20" />
                      {'Decisão'}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-white/50">
                      <span className="w-2.5 h-2.5 rounded-sm bg-green-500/[0.12] border border-green-500/20" />
                      Resultado
                    </span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
