import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CopyButton, toKebabCase, renderMarkdown, generatePdf } from './shared';
import { SectionWarning } from '../shared/SectionWarning';
import { Button } from '../ui/Button';
import {
  useInlineEdit,
  markAssetOpened,
  BRACKET_REGEX,
} from './useInlineEdit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CadenceTimelineProps {
  assetId: string;
  assetName: string;
  content: string;
  generatedAt?: string;
  onBack: () => void;
}

type ChannelType = 'whatsapp' | 'email' | 'call' | 'other';
type TimeOfDay = 'manha' | 'tarde' | 'noite';
type DayGroup = 'day1' | 'days2-3' | 'days4-7';
type CadenceTab = 'cadencia' | 'raciocinio';

interface TimelineNode {
  id: string;
  dayLabel: string;
  channel: ChannelType;
  subject?: string;
  messages: string[];
  rawContent: string;
}

interface DayAction {
  id: string;
  channel: ChannelType;
  timeOfDay: TimeOfDay;
  subject?: string;
  messages: string[];
  rawContent: string;
}

interface DayNode {
  day: number;
  group: DayGroup;
  actions: DayAction[];
}

// ─── Channel config ───────────────────────────────────────────────────────────

const CHANNEL_CONFIG: Record<ChannelType, { emoji: string; label: string; color: string; bg: string; borderColor: string }> = {
  call:     { emoji: '🔴', label: 'Ligação',  color: '#EF4444', bg: 'rgba(239,68,68,0.12)',    borderColor: 'rgba(239,68,68,0.25)' },
  whatsapp: { emoji: '🟢', label: 'WhatsApp', color: '#25D366', bg: 'rgba(37,211,102,0.12)',   borderColor: 'rgba(37,211,102,0.25)' },
  email:    { emoji: '🔵', label: 'Email',    color: '#3B82F6', bg: 'rgba(59,130,246,0.12)',   borderColor: 'rgba(59,130,246,0.25)' },
  other:    { emoji: '⚪', label: 'Geral',    color: '#888888', bg: 'rgba(136,136,136,0.12)',  borderColor: 'rgba(136,136,136,0.20)' },
};

const TIME_LABEL: Record<TimeOfDay, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
};

// ─── Reasoning split ─────────────────────────────────────────────────────────

const REASONING_SPLIT = /^#{1,3}\s+.*\b(racioc[íi]n[íi]|por\s+que\s+esta\s+cad[eê]ncia|estrat[eé]gia\s+de\s+follow)/i;

function splitCadenceContent(content: string): { cadenceRaw: string; reasoningRaw: string } {
  const lines = content.split('\n');
  let splitIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (REASONING_SPLIT.test(lines[i].trim())) {
      splitIndex = i;
      break;
    }
  }
  if (splitIndex === -1) return { cadenceRaw: content, reasoningRaw: '' };
  return {
    cadenceRaw: lines.slice(0, splitIndex).join('\n').trim(),
    reasoningRaw: lines.slice(splitIndex).join('\n').trim(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Detect channel type from text content */
const detectChannel = (text: string): ChannelType => {
  if (/whatsapp|wpp|zap|bal[aã]o|mensagem\s+de\s+texto/i.test(text)) return 'whatsapp';
  if (/e[-\s]?mail|assunto:|subject:/i.test(text)) return 'email';
  if (/liga[çc][aã]o|ligacao|call|telefonema|telefone|voz|double.?dial|aircall/i.test(text)) return 'call';
  return 'other';
};

/** Extract email subject line */
const extractSubject = (text: string): string | undefined => {
  const match = text.match(/\*{0,2}assunto:?\*{0,2}\s*(.+)/i);
  return match ? match[1].trim() : undefined;
};

/** Split node content into individual messages */
const splitMessages = (text: string): string[] => {
  const msgPattern = /(?:^|\n)\s*(?:\*{0,2})(?:Mensagem|Bal[aã]o|Message)\s*\d+[):.\s—-]/i;
  if (msgPattern.test(text)) {
    const parts = text.split(/(?=(?:^|\n)\s*(?:\*{0,2})(?:Mensagem|Bal[aã]o|Message)\s*\d+[):.\s—-])/i);
    const messages = parts.map(p => p.trim()).filter(p => p.length > 0);
    if (messages.length > 1) return messages;
  }
  return [text.trim()];
};

/** Extract numeric day from a day label string */
const extractDayNumber = (label: string): number | null => {
  const m = label.match(/(?:Dia\s+|D[-\s]?)(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
};

/** Get time-of-day slot from label keywords (header has priority over body) */
const detectTimeOfDay = (label: string, _channel: ChannelType): TimeOfDay => {
  const lower = label.toLowerCase();
  // Check label for explicit time keywords (highest priority)
  if (/fim\s+do\s+dia|final\s+do\s+dia|noite|night|1[89]h|2[012]h/i.test(lower)) return 'noite';
  if (/manh[aã]|cedo|morning|imediato|imediatamente|[89]h|10h|11h/i.test(lower)) return 'manha';
  if (/tarde|afternoon|per[ií]odo\s+oposto|1[3-7]h/i.test(lower)) return 'tarde';
  // Numbered action within a day: #1 = manha, #2 = tarde, #3+ = noite
  const numMatch = lower.match(/#(\d+)/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n <= 1) return 'manha';
    if (n === 2) return 'tarde';
    return 'noite';
  }
  return 'manha'; // default: first action of day
};

/** Map day number to its visual group */
const getGroupLabel = (day: number): DayGroup => {
  if (day === 1) return 'day1';
  if (day <= 3) return 'days2-3';
  return 'days4-7';
};

// ─── Flat parser (reused internally) ─────────────────────────────────────────

const parseTimelineNodes = (content: string): TimelineNode[] => {
  const lines = content.split('\n');
  const nodes: TimelineNode[] = [];
  const headerRegex = /^(?:#{2,4}\s+|(?:\*{2}))?(D[-\s]?\d+|Dia\s+\d+|Dia\s+seguinte|Ap[oó]s\s+\d+[hm]?\w*|\d+\s*(?:minutos?|horas?|min(?:utos?)?)\s+ap[oó]s|Semana\s+\d+|Etapa\s+\d+|Passo\s+\d+|Fase\s+\d+|Momento\s+\d+|Hora\s+\d+|Toque\s+\d+|Contato\s+\d+|Touchpoint\s+\d+|Intera[çc][aã]o\s+\d+)(.*)$/i;
  const sectionHeaderRegex = /^#{2,4}\s+(.+)$/;

  let currentLabel = '';
  let currentLines: string[] = [];
  let currentDayLabel = ''; // Track parent ## Dia N context for sub-sections

  const flush = () => {
    if (currentLabel && currentLines.length > 0) {
      const raw = currentLines.join('\n').trim();
      if (raw.length > 0) {
        // Detect channel from label first (### Ligação, ### WhatsApp, ### Email),
        // then fall back to body content detection
        const labelChannel = detectChannel(currentLabel);
        const channel = labelChannel !== 'other' ? labelChannel : detectChannel(raw);
        const subject = channel === 'email' ? extractSubject(raw) : undefined;
        const messages = splitMessages(raw);
        nodes.push({
          id: `node-${nodes.length}`,
          dayLabel: currentLabel,
          channel,
          subject,
          messages,
          rawContent: raw,
        });
      }
    }
  };

  for (const line of lines) {
    const match = line.match(headerRegex);
    if (match) {
      flush();
      const mainPart = match[1].trim();
      const suffix = (match[2] || '')
        .replace(/^\s*[—\-:]+\s*/, ' \u2014 ')
        .replace(/\*{2}$/, '')
        .trim();
      currentLabel = suffix ? `${mainPart} \u2014 ${suffix}` : mainPart;
      currentLabel = currentLabel.replace(/\s*\u2014\s*\u2014\s*/g, ' \u2014 ').trim();
      // Remember this as the current day context for sub-sections
      currentDayLabel = mainPart;
      currentLines = [];
    } else {
      const sectionMatch = line.match(sectionHeaderRegex);
      if (sectionMatch) {
        flush();
        const sectionName = sectionMatch[1].replace(/\*{2}/g, '').trim();
        // Carry forward the parent day label so sub-sections keep their day context
        currentLabel = currentDayLabel
          ? `${currentDayLabel} \u2014 ${sectionName}`
          : sectionName;
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }
  }

  flush();
  return nodes;
};

/** Convert flat timeline nodes to grouped day nodes */
const parseDayNodes = (content: string): DayNode[] => {
  const flat = parseTimelineNodes(content);
  const dayMap = new Map<number, DayNode>();

  for (const node of flat) {
    const day = extractDayNumber(node.dayLabel);
    if (day === null || day < 1) {
      // Attach unmatched headers (e.g., "Etapa 3", "Semana 1") to the nearest existing day, or day 0
      const fallbackDay = dayMap.size > 0 ? Math.max(...dayMap.keys()) : 0;
      if (!dayMap.has(fallbackDay)) {
        dayMap.set(fallbackDay, { day: fallbackDay, group: getGroupLabel(fallbackDay || 1), actions: [] });
      }
      const timeOfDay = detectTimeOfDay(node.dayLabel, node.channel);
      dayMap.get(fallbackDay)!.actions.push({
        id: node.id,
        channel: node.channel,
        timeOfDay,
        subject: node.subject,
        messages: node.messages,
        rawContent: node.rawContent,
      });
      continue;
    }

    if (!dayMap.has(day)) {
      dayMap.set(day, { day, group: getGroupLabel(day), actions: [] });
    }

    const timeOfDay = detectTimeOfDay(node.dayLabel, node.channel);
    dayMap.get(day)!.actions.push({
      id: node.id,
      channel: node.channel,
      timeOfDay,
      subject: node.subject,
      messages: node.messages,
      rawContent: node.rawContent,
    });
  }

  const timeOrder: Record<TimeOfDay, number> = { manha: 0, tarde: 1, noite: 2 };
  return Array.from(dayMap.values())
    .sort((a, b) => a.day - b.day)
    .map(n => ({ ...n, actions: [...n.actions].sort((a, b) => timeOrder[a.timeOfDay] - timeOrder[b.timeOfDay]) }));
};

// ─── Bracket highlight renderer ──────────────────────────────────────────────

interface BracketHighlightProps {
  text: string;
  fieldPrefix: string;
  editHook: ReturnType<typeof useInlineEdit>;
}

// Pre-compiled bracket regex for rendering (avoids re-creation per render)
const BRACKET_GLOBAL_REGEX = new RegExp(BRACKET_REGEX.source, 'gi');

const BracketHighlight: React.FC<BracketHighlightProps> = ({ text, fieldPrefix, editHook }) => {
  const { getValue, setValue, isEdited: fieldIsEdited } = editHook;
  // Reset lastIndex since the shared regex is stateful
  BRACKET_GLOBAL_REGEX.lastIndex = 0;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let bracketIdx = 0;

  while ((match = BRACKET_GLOBAL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    const bracketText = match[0];
    const fieldId = `${fieldPrefix}-bracket-${bracketIdx}`;
    const currentValue = getValue(fieldId, bracketText);
    const edited = fieldIsEdited(fieldId);
    bracketIdx++;
    const placeholder = bracketText.replace(/^\[/, '').replace(/\]$/, '');
    elements.push(
      <input
        key={fieldId}
        type="text"
        value={edited ? currentValue : ''}
        placeholder={placeholder}
        onChange={e => setValue(fieldId, e.target.value || bracketText)}
        onClick={e => e.stopPropagation()}
        size={Math.max(10, placeholder.length)}
        className={`inline-block mx-0.5 px-1.5 py-0.5 text-sm rounded border transition-colors ${
          edited
            ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-300 font-medium'
            : 'bg-yellow-400/10 border-yellow-400/30 text-yellow-300 placeholder:text-yellow-400/50'
        }`}
        title={edited ? 'Editado (clique para alterar)' : 'Clique para preencher'}
      />
    );
    lastIndex = BRACKET_GLOBAL_REGEX.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }
  if (elements.length === 0) return <>{text}</>;
  return <>{elements}</>;
};

// ─── MessageCard (inline editing for message content) ────────────────────────

interface MessageCardProps {
  message: string;
  nodeId: string;
  messageIndex: number;
  channel: ChannelType;
  assetId: string;
  editHook: ReturnType<typeof useInlineEdit>;
}

const MessageCard: React.FC<MessageCardProps> = ({ message, nodeId, messageIndex, channel, assetId, editHook }) => {
  const fieldId = `${nodeId}:msg-${messageIndex}`;
  const { getValue, setValue, isEdited: fieldIsEdited, restoreField } = editHook;
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentValue = getValue(fieldId, message);
  const edited = fieldIsEdited(fieldId);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  const handleMarkUsed = useCallback(() => markAssetOpened(assetId), [assetId]);

  return (
    <div className="group/msg relative">
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/msg:opacity-100 [@media(hover:none)]:opacity-60 transition-opacity z-10">
        {!editing && (
          <Button variant="icon" size="xs" onClick={() => setEditing(true)} className="p-1.5" aria-label="Editar mensagem">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </Button>
        )}
        <CopyButton
          content={currentValue}
          label=""
          strip={channel === 'whatsapp'}
          onCopy={handleMarkUsed}
          className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition"
        />
      </div>
      {edited && !editing && (
        <div className="absolute top-2 left-3 flex items-center gap-1.5">
          <span className="text-[10px] text-yellow-400/70 font-medium">editado</span>
          <Button variant="link" size="xs" onClick={() => restoreField(fieldId)} className="text-[10px]">
            Restaurar original
          </Button>
        </div>
      )}
      {editing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={currentValue}
            onChange={e => {
              setValue(fieldId, e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            className="w-full bg-white/5 border border-prosperus-gold-dark/30 rounded-lg px-3 py-2.5 text-sm text-white/70 font-mono leading-relaxed resize-none focus:outline-none focus:border-prosperus-gold-dark/60"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="xs" onClick={() => { restoreField(fieldId); setEditing(false); }}>Restaurar</Button>
            <Button variant="outline" size="xs" onClick={() => setEditing(false)}>OK</Button>
          </div>
        </div>
      ) : (
        <div className={`text-sm text-white/70 leading-relaxed whitespace-pre-wrap ${edited ? 'pt-5' : ''}`}>
          <BracketHighlight text={currentValue} fieldPrefix={fieldId} editHook={editHook} />
        </div>
      )}
    </div>
  );
};

// ─── Action summary for collapsed header ─────────────────────────────────────

const getActionSummary = (action: DayAction): string => {
  if (action.channel === 'email' && action.subject) return action.subject;
  const firstMsg = action.messages[0] || action.rawContent;
  const clean = firstMsg
    .replace(/^(?:\*{0,2})(?:Mensagem|Balão)\s*\d+[):.\s—-]*/i, '')
    .replace(/\n.*/s, '')
    .trim();
  return clean.length > 70 ? clean.substring(0, 67) + '…' : clean;
};

// ─── Unified collapsible action (all channels) ──────────────────────────────

interface ActionItemProps {
  action: DayAction;
  assetId: string;
  editHook: ReturnType<typeof useInlineEdit>;
}

const ActionItem: React.FC<ActionItemProps> = ({ action, assetId, editHook }) => {
  const [open, setOpen] = useState(false);
  const cfg = CHANNEL_CONFIG[action.channel];
  const summary = useMemo(() => getActionSummary(action), [action]);
  const msgCount = action.messages.length;

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: cfg.borderColor, backgroundColor: cfg.bg }}
    >
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 text-left gap-2 hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm flex-shrink-0">{cfg.emoji}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
          <span className="text-white/30 text-[10px] mx-0.5 flex-shrink-0">·</span>
          <span className="text-xs text-white/50 truncate">{summary}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {msgCount > 1 && (
            <span className="text-[10px] text-white/30 tabular-nums">{msgCount}x</span>
          )}
          <span className="text-white/40 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 divide-y divide-white/5">
              {action.messages.map((msg, mi) => (
                <div key={mi} className="pt-2 first:pt-0">
                  <MessageCard
                    message={msg}
                    nodeId={action.id}
                    messageIndex={mi}
                    channel={action.channel}
                    assetId={assetId}
                    editHook={editHook}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Desktop time grid ────────────────────────────────────────────────────────

interface TimeGridProps {
  dayNodes: DayNode[];
  assetId: string;
  editHook: ReturnType<typeof useInlineEdit>;
}

const GROUP_LABELS: Record<DayGroup, string> = {
  'day1': 'Dia 1 — Contato Imediato',
  'days2-3': 'Dias 2-3 — Persistência',
  'days4-7': 'Dias 4-7 — Encerramento Gradual',
};

/** Build display groups from day nodes — shared by TimeGrid and MobileTimeline */
const buildDayGroups = (dayNodes: DayNode[]): { label: string; days: DayNode[] }[] =>
  [
    { label: GROUP_LABELS['day1'],    days: dayNodes.filter(d => d.group === 'day1') },
    { label: GROUP_LABELS['days2-3'], days: dayNodes.filter(d => d.group === 'days2-3') },
    { label: GROUP_LABELS['days4-7'], days: dayNodes.filter(d => d.group === 'days4-7') },
  ].filter(g => g.days.length > 0);

const TimeGrid: React.FC<TimeGridProps> = ({ dayNodes, assetId, editHook }) => {
  const groups = buildDayGroups(dayNodes);

  const PERIODS: TimeOfDay[] = ['manha', 'tarde', 'noite'];

  // Build flat list of grid items for the CSS grid
  const gridItems: React.ReactNode[] = [];

  // Column headers
  gridItems.push(
    <div key="hdr-day" className="pb-2" />,
    ...PERIODS.map(p => (
      <div key={`hdr-${p}`} className="pb-2 text-center">
        <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
          {TIME_LABEL[p]}
        </span>
      </div>
    ))
  );

  groups.forEach((group, gIdx) => {
    // Section header row (spans all 4 cols)
    gridItems.push(
      <div
        key={`group-${gIdx}`}
        className="py-2 px-3 mt-2 first:mt-0 rounded bg-white/[0.03] border border-white/5"
        style={{ gridColumn: '1 / -1' }}
      >
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          {group.label}
        </span>
      </div>
    );

    group.days.forEach(day => {
      // Day label
      gridItems.push(
        <div key={`day-${day.day}-lbl`} className="py-2 pr-3 flex items-start justify-end">
          <span className="text-prosperus-gold-dark font-bold text-xs mt-1">
            Dia {day.day}
          </span>
        </div>
      );

      // Time-of-day cells
      PERIODS.forEach(tod => {
        const slotActions = day.actions.filter(a => a.timeOfDay === tod);
        gridItems.push(
          <div key={`day-${day.day}-${tod}`} className="py-2 space-y-1.5 min-h-[40px]">
            {slotActions.map(action => (
              <ActionItem key={action.id} action={action} assetId={assetId} editHook={editHook} />
            ))}
          </div>
        );
      });
    });
  });

  return (
    <div
      className="grid gap-x-3"
      style={{ gridTemplateColumns: '72px 1fr 1fr 1fr' }}
    >
      {gridItems}
    </div>
  );
};

// ─── Mobile timeline ──────────────────────────────────────────────────────────

const PERIOD_ORDER: TimeOfDay[] = ['manha', 'tarde', 'noite'];

const MobileTimeline: React.FC<TimeGridProps> = ({ dayNodes, assetId, editHook }) => {
  const groups = buildDayGroups(dayNodes);

  return (
    <div className="space-y-6">
      {groups.map((group, gIdx) => (
        <div key={gIdx}>
          <div className="mb-3 py-1.5 px-3 rounded bg-white/[0.03] border border-white/5">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              {group.label}
            </span>
          </div>
          <div className="space-y-4">
            {group.days.map(day => {
              // Group actions by time-of-day for single label per period
              const byPeriod = PERIOD_ORDER
                .map(tod => ({ tod, actions: day.actions.filter(a => a.timeOfDay === tod) }))
                .filter(g => g.actions.length > 0);

              return (
                <div key={day.day} className="relative pl-5">
                  {/* Vertical line */}
                  <div className="absolute left-1.5 top-0 bottom-0 w-px bg-prosperus-gold-dark/20" />
                  {/* Day dot */}
                  <div className="absolute left-0 top-1 w-3 h-3 rounded-full bg-prosperus-gold-dark/40 ring-2 ring-black/50" />
                  <div className="mb-2">
                    <span className="text-prosperus-gold-dark font-bold text-sm">Dia {day.day}</span>
                  </div>
                  <div className="space-y-3">
                    {byPeriod.map(({ tod, actions }) => (
                      <div key={tod}>
                        <span className="text-[10px] text-white/40 font-semibold uppercase tracking-wide mb-1.5 block">
                          {TIME_LABEL[tod]}
                        </span>
                        <div className="space-y-1.5">
                          {actions.map(action => (
                            <ActionItem key={action.id} action={action} assetId={assetId} editHook={editHook} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Reasoning card-per-topic view ────────────────────────────────────────────

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
      [&_blockquote]:border-l-2 [&_blockquote]:border-prosperus-gold-dark/40 [&_blockquote]:bg-prosperus-gold-dark/[0.04] [&_blockquote]:rounded-r-lg [&_blockquote]:py-3 [&_blockquote]:px-4 [&_blockquote]:my-3 [&_blockquote]:text-white/60 [&_blockquote]:italic
      [&_h2]:text-sm [&_h2]:text-prosperus-gold-dark [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-3
      [&_h3]:text-sm [&_h3]:text-white/70 [&_h3]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2
      [&_hr]:border-white/5 [&_hr]:my-4
    "
    dangerouslySetInnerHTML={{ __html: renderMarkdown(raw) }}
  />
);

interface ReasoningSection {
  title: string;
  number: string;
  body: string;
}

function parseReasoningSections(raw: string): { intro: string; sections: ReasoningSection[] } {
  const lines = raw.split('\n');
  const sections: ReasoningSection[] = [];
  const intro: string[] = [];
  let current: { title: string; number: string; lines: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const numberedMatch = trimmed.match(/^#{2,3}\s+(\d+)\.?\s*[:\-\u2013\u2014.]?\s*(.+)/);
    if (numberedMatch) {
      if (current) {
        sections.push({ title: current.title, number: current.number, body: current.lines.join('\n').trim() });
      }
      current = { number: numberedMatch[1], title: numberedMatch[2].trim(), lines: [] };
      continue;
    }

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

  if (current) {
    sections.push({ title: current.title, number: current.number, body: current.lines.join('\n').trim() });
  }

  return { intro: intro.join('\n').trim(), sections };
}

const ReasoningView: React.FC<{ raw: string }> = ({ raw }) => {
  const { intro, sections } = useMemo(() => parseReasoningSections(raw), [raw]);

  if (sections.length === 0) {
    return <MarkdownBlock raw={raw} />;
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
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 bg-white/[0.02]">
            <span className="w-7 h-7 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-dark text-xs font-bold flex items-center justify-center flex-shrink-0">
              {section.number}
            </span>
            <h3 className="text-sm font-semibold text-white/90">{section.title}</h3>
          </div>
          <div className="px-5 py-4">
            <MarkdownBlock raw={section.body} />
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────

export const CadenceTimeline: React.FC<CadenceTimelineProps> = ({
  assetId,
  assetName,
  content,
  generatedAt,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<CadenceTab>('cadencia');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const editHook = useInlineEdit({ assetId, generatedAt });

  useEffect(() => { markAssetOpened(assetId); }, [assetId]);

  // Split content into cadence + reasoning sections
  const { cadenceRaw, reasoningRaw } = useMemo(() => splitCadenceContent(content), [content]);
  const hasReasoning = reasoningRaw.length > 0;

  // Parse day nodes from cadence section
  const dayNodes = useMemo(() => parseDayNodes(cadenceRaw || content), [cadenceRaw, content]);
  const hasDayNodes = dayNodes.length > 0;

  const handleMarkUsed = useCallback(() => markAssetOpened(assetId), [assetId]);

  // Memoize parsed nodes to avoid re-parsing on each export call
  const parsedNodes = useMemo(() => parseTimelineNodes(content), [content]);

  const getExportContent = useCallback((): string => {
    if (!editHook.hasEdits) return content;
    let result = content;
    for (const [fieldId, value] of Object.entries(editHook.edits)) {
      const [nodeId, msgPart] = fieldId.split(':');
      if (!nodeId || !msgPart) continue;
      const nodeIndex = parseInt(nodeId.replace('node-', ''), 10);
      const msgIndex = parseInt(msgPart.replace('msg-', ''), 10);
      if (parsedNodes[nodeIndex]) {
        const original = parsedNodes[nodeIndex].messages[msgIndex];
        if (original && value !== original) result = result.replace(original, value);
      }
    }
    return result;
  }, [content, editHook.edits, editHook.hasEdits, parsedNodes]);

  const handleDownloadMd = () => {
    handleMarkUsed();
    const date = new Date().toISOString().split('T')[0];
    const dateBr = new Date().toLocaleDateString('pt-BR');
    const exportContent = getExportContent();
    const header = editHook.hasEdits ? `> Editado em ${dateBr}\n\n` : '';
    const filename = `${toKebabCase(assetName)}-${date}.md`;
    const blob = new Blob([header + exportContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    a.parentElement?.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    handleMarkUsed();
    setDownloadingPdf(true);
    try { await generatePdf(assetName, getExportContent(), { edited: editHook.hasEdits }); }
    catch (e) { console.error('PDF download failed:', e); }
    finally { setDownloadingPdf(false); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onBack} className="flex-shrink-0">
              &larr; Voltar
            </Button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-prosperus-gold-dark/20 to-prosperus-gold-dark/5 border border-prosperus-gold-dark/20 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">📅</span>
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
            <CopyButton content={getExportContent()} label="Copiar Tudo" onCopy={handleMarkUsed} />
            <Button variant="primary" onClick={handleDownloadPdf} disabled={downloadingPdf} loading={downloadingPdf}>
              {downloadingPdf ? 'Gerando...' : 'Baixar PDF'}
            </Button>
            <Button variant="secondary" onClick={handleDownloadMd}>Baixar Texto</Button>
          </div>
        </div>
      </div>

      {/* ─── Warning banner ──────────────────────────────────────────────── */}
      <div className="mb-6">
        <SectionWarning
          message="Este é um ponto de partida construído com nossos frameworks. Adapte ao seu tom de voz e teste com prospects reais."
          variant="warning"
        />
      </div>

      {/* ─── Edits indicator ─────────────────────────────────────────────── */}
      {editHook.hasEdits && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-4 flex items-center justify-between px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg"
        >
          <span className="text-xs text-yellow-300/80 font-medium">
            Você tem edições. Copiar e baixar inclui suas edições.
          </span>
          <Button variant="link" size="xs" onClick={editHook.restoreAll}>Restaurar tudo</Button>
        </motion.div>
      )}

      {/* ─── Tab toggle (only if reasoning section exists) ───────────────── */}
      {hasReasoning && (
        <div className="flex gap-1 mb-4 bg-white/5 border border-white/10 rounded-lg p-1" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'cadencia'}
            aria-controls="panel-cadencia"
            onClick={() => setActiveTab('cadencia')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition ${
              activeTab === 'cadencia'
                ? 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark border border-prosperus-gold-dark/30'
                : 'text-white/50 hover:text-white/70 border border-transparent'
            }`}
          >
            📅 Cadência
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'raciocinio'}
            aria-controls="panel-raciocinio"
            onClick={() => setActiveTab('raciocinio')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition ${
              activeTab === 'raciocinio'
                ? 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark border border-prosperus-gold-dark/30'
                : 'text-white/50 hover:text-white/70 border border-transparent'
            }`}
          >
            🧠 Raciocínio
          </button>
        </div>
      )}

      {/* ─── Tab content ─────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {(activeTab === 'cadencia' || !hasReasoning) && (
          <motion.div
            key="cadencia"
            id="panel-cadencia"
            role="tabpanel"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
          >
            {hasDayNodes ? (
              <MobileTimeline dayNodes={dayNodes} assetId={assetId} editHook={editHook} />
            ) : (
              /* Fallback: render full markdown when no day structure detected */
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 rounded-xl overflow-hidden"
              >
                <div
                  className="px-5 pb-5 pt-4 text-sm text-white/70 leading-relaxed
                    [&_ul]:space-y-1.5 [&_ul]:mt-2 [&_ul]:ml-0 [&_ul]:list-none [&_ul]:pl-0
                    [&_ol]:space-y-1.5 [&_ol]:mt-2 [&_ol]:ml-0 [&_ol]:pl-0
                    [&_li]:relative [&_li]:pl-4 [&_li]:text-white/70 [&_li]:text-[13px] [&_li]:leading-relaxed
                    [&_li]:before:content-[''] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[9px] [&_li]:before:w-1.5 [&_li]:before:h-1.5 [&_li]:before:rounded-full [&_li]:before:bg-prosperus-gold-dark/50
                    [&_strong]:text-prosperus-gold-dark [&_strong]:font-semibold
                    [&_em]:text-white/50
                    [&_p]:mb-2 [&_p]:text-[13px]
                    [&_h2]:text-sm [&_h2]:text-prosperus-gold-dark [&_h2]:font-bold [&_h2]:mb-2
                    [&_h3]:text-sm [&_h3]:text-white/70 [&_h3]:font-semibold [&_h3]:mb-1
                    [&_hr]:border-white/5 [&_hr]:my-4
                  "
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
              </motion.div>
            )}
          </motion.div>
        )}

        {activeTab === 'raciocinio' && hasReasoning && (
          <motion.div
            key="raciocinio"
            id="panel-raciocinio"
            role="tabpanel"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
          >
            <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs">🧠</span>
                  <span className="text-xs font-semibold text-white/50">Raciocínio Estratégico</span>
                </div>
                <CopyButton content={reasoningRaw} label="Copiar Raciocínio" onCopy={handleMarkUsed} />
              </div>
              <div className="px-5 py-5 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                <ReasoningView raw={reasoningRaw} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
