# Story UX-3.2: Follow-up Viewer — Call Channel, Consolidated Days, Email Dropdown, Time Layout

**Epic:** EPIC-UX-001 | **Status:** Done | **Points:** 8 | **Priority:** P1 | **Wave:** 3
**Depends on:** EPIC-AP-001 Story AP-3.2 (follow-up prompt rewrite)

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["manual-review"]

## Story
**As a** mentor viewing the follow-up cadence timeline,
**I want** calls shown in red, all actions for each day consolidated into one node, email bodies collapsed behind a clickable subject header, and the timeline laid out as a days × time-of-day grid,
**so that** I can scan the 7-day cadence at a glance and understand exactly what action to take, on which day, and at what time of day.

## Acceptance Criteria
- [x] AC1: Call channel rendered in red (#EF4444), with red circle emoji (🔴)
- [x] AC2: WhatsApp channel remains green (#25D366), with green circle emoji (🟢)
- [x] AC3: Email channel updated to blue (#3B82F6), with blue circle emoji (🔵)
- [x] AC4: One node per day (not one per channel per day) — all channel actions listed inside that single day node, differentiated by colored circle
- [x] AC5: Email items: subject line as clickable header; body content collapsed by default, expanded on click (accordion/dropdown)
- [x] AC6: Grid layout: vertical axis = days 1-7, horizontal axis = Manhã / Tarde / Noite (3 columns per day row)
- [x] AC7: Channel actions placed in correct time column per day (morning, afternoon, night)
- [x] AC8: Day grouping visual: Day 1 as standalone section, Days 2-3 as grouped section, Days 4-7 as grouped section
- [x] AC9: Dual-section: Cadência tab + Raciocínio tab (same pattern as outreach)
- [x] AC10: Reasoning tab renders as formatted prose (markdown)
- [x] AC11: Mobile: grid collapses to single-column list, time-of-day labels shown inline per action
- [x] AC12: Inline editing of message content preserved (useInlineEdit hook continues to work)

## Scope
**IN:** CadenceTimeline.tsx — CHANNEL_CONFIG, day consolidation, email dropdown, time-of-day grid, day grouping, dual-section tabs, mobile collapse
**OUT:** Backend/API changes, changing prompt content, modifying other viewer components, call tracking or CRM features

## Tasks

### Part A: Channel Config & Colors
- [x] 1. Update `CHANNEL_CONFIG` in CadenceTimeline.tsx (AC1, AC2, AC3)
  - [x] 1a. Call: `{ emoji: '🔴', label: 'Ligação', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' }`
  - [x] 1b. WhatsApp: `{ emoji: '🟢', label: 'WhatsApp', color: '#25D366', bg: 'rgba(37,211,102,0.12)' }` (keep)
  - [x] 1c. Email: `{ emoji: '🔵', label: 'Email', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' }`
- [x] 2. Add call channel detection keywords (AC1)
  - [x] 2a. Current channel detection is keyword-based — add: `ligação|ligacao|telefone|call|double.?dial|aircall`
  - [x] 2b. Update channel detection regex/function to resolve `call` channel correctly

### Part B: Day Consolidation
- [x] 3. Consolidate timeline nodes to one per day (AC4)
  - [x] 3a. Current: one `TimelineNode` per `{day, channel}` combination
  - [x] 3b. New: group all channel actions for the same day number → single `DayNode` with `actions[]` array
  - [x] 3c. Grouping key: day number extracted from existing `headerRegex` (`/^(?:#{2,4}\s+|(?:\*{2}))?(?:D[-\s]?\d+|Dia\s+\d+)/i`)
  - [x] 3d. Each action inside DayNode: `{ channel, timeOfDay, content, subject? }`
  - [x] 3e. Verify `headerRegex` starts from Day 1 (not Day 0) — adjust if needed
- [x] 4. Assign time-of-day slot per action (AC6, AC7)
  - [x] 4a. Detect time-of-day from action context:
        Manhã keywords: `manhã|manha|cedo|morning|8h|9h|10h|11h`
        Tarde keywords: `tarde|afternoon|13h|14h|15h|16h|17h`
        Noite keywords: `noite|night|18h|19h|20h|21h|22h`
  - [x] 4b. If no explicit time keyword: default placement = Manhã for calls, Tarde for messages, Noite for emails
  - [x] 4c. Each action is placed in its time slot within the day grid row

### Part C: Email Dropdown
- [x] 5. Implement email subject accordion (AC5)
  - [x] 5a. Email channel actions: detect "Assunto:" prefix line as the subject
  - [x] 5b. Render subject as clickable header with chevron icon (▼ / ▲)
  - [x] 5c. Email body (content below subject) hidden by default; shown on click (CSS `max-h-0 overflow-hidden` → `max-h-full` transition)
  - [x] 5d. State: per-email toggle using local `useState` or index-based map
  - [x] 5e. Editing still works on body content (useInlineEdit hook applies to revealed content)

### Part D: Time-of-Day Grid Layout
- [x] 6. Build grid layout component (AC6, AC7, AC8)
  - [x] 6a. New component `DayGrid` (or `TimeGrid`) — renders one day row:
        `{ day: number, groupLabel?: string, actions: DayAction[] }`
  - [x] 6b. Row structure: `grid grid-cols-[auto_1fr_1fr_1fr]` — day label + 3 time columns
  - [x] 6c. Column headers: "Manhã" / "Tarde" / "Noite" (shown once at top, sticky on scroll)
  - [x] 6d. Each cell contains the channel actions for that day × time slot (colored circle + content)
  - [x] 6e. Empty cells render as a muted dash or blank (no clutter)
- [x] 7. Day grouping sections (AC8)
  - [x] 7a. Section 1: Day 1 — "Dia 1 (Aplicação)" section header
  - [x] 7b. Section 2: Days 2-3 — "Dias 2-3" section header with slight visual grouping (border-l or background)
  - [x] 7c. Section 3: Days 4-7 — "Dias 4-7" section header
  - [x] 7d. Section headers styled as `text-sm font-semibold text-white/60` separators

### Part E: Dual-Section Tabs
- [x] 8. Add Cadência + Raciocínio tab structure (AC9, AC10)
  - [x] 8a. Detect reasoning section split (same pattern as OutreachFlowView story UX-3.1):
        Regex: `/raciocín|raciocin|por que esta cadência|estratégia de follow.?up/i`
  - [x] 8b. Tab 1 "Cadência": renders the grid layout (Parts B-D)
  - [x] 8c. Tab 2 "Raciocínio": renders reasoning content as formatted prose (markdown)
  - [x] 8d. Default active tab: "Cadência"

### Part F: Mobile Responsiveness
- [x] 9. Collapse grid to single column on mobile (AC11)
  - [x] 9a. Grid: `grid-cols-[auto_1fr_1fr_1fr]` on md+, `grid-cols-1` on mobile
  - [x] 9b. On mobile: each action shows inline time-of-day label: `🔴 Manhã — [content]`
  - [x] 9c. Day row on mobile: vertical list of actions under day header
  - [x] 9d. Email dropdown works same on mobile (tap to expand)

## Dev Notes

### Key Files
- **Primary:** `mentoria-main/components/assets/CadenceTimeline.tsx`
- **Reference (split/tabs):** `mentoria-main/components/assets/OutreachFlowView.tsx` — dual-section pattern
- **Reference (editing):** `mentoria-main/hooks/useInlineEdit.ts` — ensure hook still wired correctly after grid restructure

### Current CHANNEL_CONFIG (to be updated)
```typescript
// CURRENT
whatsapp: { emoji: '💬', label: 'WhatsApp', color: '#25D366', bg: 'rgba(37,211,102,0.12)' },
email:    { emoji: '📧', label: 'Email',    color: '#4A9BD9', bg: 'rgba(74,155,217,0.12)' },
call:     { emoji: '📞', label: 'Ligação',  color: '#CA9A43', bg: 'rgba(202,154,67,0.12)' },

// TARGET
whatsapp: { emoji: '🟢', label: 'WhatsApp', color: '#25D366', bg: 'rgba(37,211,102,0.12)' },
email:    { emoji: '🔵', label: 'Email',    color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
call:     { emoji: '🔴', label: 'Ligação',  color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
```

### Day Consolidation Data Shape
```typescript
// BEFORE: flat list of nodes (one per day×channel)
type TimelineNode = { day: number; channel: Channel; content: string; }

// AFTER: grouped by day
type DayAction = {
  channel: Channel;
  timeOfDay: 'manha' | 'tarde' | 'noite';
  content: string;
  subject?: string;   // email only
};
type DayNode = {
  day: number;
  groupLabel: 'day1' | 'days2-3' | 'days4-7';
  actions: DayAction[];
};
```

### Grid Layout Skeleton
```tsx
// TimeGrid component (simplified)
<div className="grid grid-cols-[80px_1fr_1fr_1fr] md:gap-2">
  {/* Header row */}
  <div /> <ColHeader>Manhã</ColHeader> <ColHeader>Tarde</ColHeader> <ColHeader>Noite</ColHeader>
  {/* Day rows */}
  {days.map(day => (
    <DayRow key={day.day} day={day} />
  ))}
</div>
```

### Email Dropdown
```tsx
const [openEmails, setOpenEmails] = useState<Set<string>>(new Set());
// Toggle: setOpenEmails(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
// Render: isOpen ? full content visible : only subject header visible
```

### Day Grouping Logic
```typescript
const getGroupLabel = (day: number): 'day1' | 'days2-3' | 'days4-7' => {
  if (day === 1) return 'day1';
  if (day <= 3) return 'days2-3';
  return 'days4-7';
};
```

### Dev Note — DualSectionViewer Opportunity
Three assets (Outreach, Follow-up, Sales Script) now share the Script/Cadence + Reasoning dual-section tab structure. Consider extracting a shared `DualSectionViewer` component in a future story. Do NOT create it here.

### Editing Compatibility
`useInlineEdit` hook stores edits keyed by `assetId + contentPath`. After grid restructure, ensure the `contentPath` keys passed to the hook still match the old format — otherwise edits saved before this story ships will be lost. Consider a migration or keep the same key convention.

### Testing
- Verify red/green/blue channel colors display correctly in day nodes
- Day 2 with 3 actions (morning call, afternoon WA, night email) → all 3 in one day node, in correct columns
- Click email subject → body expands; click again → collapses
- Day grouping: Day 1 standalone section, Days 2-3 grouped, Days 4-7 grouped
- "Raciocínio" tab renders prose, not timeline grid
- Mobile (375px viewport): grid collapses to vertical list with inline time labels
- Existing edited message content preserved after restructure

## Risks
- Grid layout is the most complex visual change in this epic — mobile collapse needs thorough testing across viewports
- Time-of-day keyword detection may fail for edge cases (e.g., no time keywords in prompt output) — default slot assignment prevents empty cells but may misplace some actions
- `useInlineEdit` key format must be preserved to avoid losing user edits on existing content
- AP-3.2 output format must be available to test against before implementation — story is blocked until AP-3.2 ships

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-02 | 1.0 | Story drafted | @sm (River) |
| 2026-03-02 | 1.1 | Implementation complete — all 12 AC met, TypeScript clean, 80/80 tests pass | @dev (Dex) |

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Debug Log References
N/A — clean implementation via full component rewrite (data model change too pervasive for targeted edits)
### Completion Notes List
- Full rewrite of CadenceTimeline.tsx due to fundamental data model change: flat `TimelineNode[]` → grouped `DayNode[]`; old `parseTimelineNodes()` preserved as internal helper, new `parseDayNodes()` post-processes its output
- CHANNEL_CONFIG updated: call=🔴#EF4444, whatsapp=🟢#25D366, email=🔵#3B82F6; borderColor added per channel for ActionItem box styling
- Call channel detection keywords expanded: `ligação|ligacao|telefone|call|double.?dial|aircall|voz`
- Time-of-day detection via keyword matching on day label + action content, with channel defaults (call→manhã, email→noite, whatsapp/other→tarde) when no keyword found
- CSS Grid layout uses inline `style={{ gridTemplateColumns: '72px 1fr 1fr 1fr' }}` to avoid Tailwind JIT issues; group headers span full width via `gridColumn: '1 / -1'`
- Mobile rendering uses separate `MobileTimeline` component (`md:hidden`) to avoid grid complexity on small screens — inline time labels per action
- `EmailAccordion` component: per-email open state with `useState<boolean>`, AnimatePresence body expand/collapse with smooth height animation
- Day group sections: Day 1 standalone ("Dia 1 — Aplicação"), Days 2-3 grouped, Days 4-7 grouped — section headers at group boundaries only
- Reasoning tab (`REASONING_SPLIT` regex) only shown when content has reasoning section; defaults to cadência-only view for old assets
- `useInlineEdit` key format preserved: same `assetId + fieldId` convention ensures previously saved edits remain valid
### File List
- `components/assets/CadenceTimeline.tsx` — rewritten (CHANNEL_CONFIG, types, parsers, TimeGrid, MobileTimeline, EmailAccordion, ActionItem, ProseView, dual-tab main component)
