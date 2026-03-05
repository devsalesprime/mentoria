# Story UX-2.3: Sales Script — Hero Outline Scroll + Objection Letter Labels

**Epic:** EPIC-UX-001 | **Status:** Done | **Points:** 3 | **Priority:** P2 | **Wave:** 2
**Depends on:** None

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["manual-review"]

## Story
**As a** mentor using the sales script viewer,
**I want** the stage navigation to be scrollable when stages overflow, and I want objection sub-stages labeled with letters (5A, 5B) instead of numbers,
**so that** I can access all stages on any screen size and clearly distinguish sub-stages from main steps.

## Acceptance Criteria
- [x] AC1: Stage navigation bar shows scroll indicators (arrow buttons or fade gradient) when stages overflow horizontally
- [x] AC2: User can scroll/swipe to see all stages on mobile and narrow desktop
- [x] AC3: Parser recognizes letter-labeled sub-stages: `## Etapa 5A`, `### 5B. Objecao de Preco`, etc.
- [x] AC4: Sub-stage buttons in nav show letter labels correctly (5A, 5B, 5C)
- [x] AC5: Sub-stages are visually nested under parent stage 5 in navigation (smaller buttons, indented, or grouped)

## Scope
**IN:** ChatScriptViewer stage nav overflow handling, stage regex update for letter labels
**OUT:** Changing chat bubble rendering, modifying speaker parsing, adding new view modes

## Tasks

### Part A: Stage Nav Scroll Indicators
- [x] 1. Add scroll affordance to StageNav in ChatScriptViewer (AC1, AC2)
  - [x] 1a. Check current: `overflow-x-auto` is set but no visual scroll indicator
  - [x] 1b. Add left/right arrow buttons at edges when content overflows
  - [x] 1c. Arrow buttons: `onClick` scrolls by one stage width, `opacity-0` when at edge limit
  - [x] 1d. Alternative: fade gradient on edges (left: transparent→bg, right: bg→transparent)
  - [x] 1e. Ensure touch swipe still works on mobile alongside arrow buttons

### Part B: Objection Letter Labels
- [x] 2. Update STAGE_REGEX in ChatScriptViewer to detect letter sub-stages (AC3)
  - [x] 2a. Current regex: `/^#{2,3}\s+.*(?:ETAPA|Etapa|\d+\s*[.)\-:])/i`
  - [x] 2b. Updated regex: `/^#{2,3}\s+.*(?:ETAPA|Etapa|\d+[A-Za-z]?\s*[.)\-:])/i` — allows optional letter after digit
  - [x] 2c. Extract stage number+letter: e.g., "5A" from `## Etapa 5A: Objecao de Preco`
- [x] 3. Update stage button rendering for sub-stages (AC4, AC5)
  - [x] 3a. Detect sub-stages: stage label contains letter suffix (e.g., "5A", "5B")
  - [x] 3b. Render sub-stage buttons smaller or with visual grouping under parent stage
  - [x] 3c. Option: indent sub-stages, use smaller circle, connect with a bracket or line to parent "5"
  - [x] 3d. Keep full label in button: "5A" not just "A"

## Dev Notes

### Key Files
- **ChatScriptViewer:** `mentoria-main/components/assets/ChatScriptViewer.tsx`

### Current Stage Regex
```typescript
STAGE_REGEX = /^#{2,3}\s+.*(?:ETAPA|Etapa|\d+\s*[.)\-:])/i;
```
This only matches numeric stage identifiers. Won't match `5A`, `5B`.

### Updated Stage Regex
```typescript
STAGE_REGEX = /^#{2,3}\s+.*(?:ETAPA|Etapa|\d+[A-Za-z]?\s*[.)\-:])/i;
```
Now matches: `## ETAPA 5A:`, `### 5B. Objecao`, `## Etapa 5C — Timing`

### Stage Number Extraction
Current extraction likely uses `parseInt()` or `/(\d+)/` — needs update:
```typescript
const stageMatch = title.match(/(\d+[A-Za-z]?)/);
const stageLabel = stageMatch?.[1]; // "5A", "5B", or "5"
```

### Scroll Indicator Pattern
```tsx
<div className="relative">
  {canScrollLeft && (
    <button className="absolute left-0 z-10 bg-gradient-to-r from-navy to-transparent px-2"
      onClick={() => scrollRef.current.scrollBy({ left: -150, behavior: 'smooth' })}>
      ‹
    </button>
  )}
  <div ref={scrollRef} className="overflow-x-auto flex gap-2" onScroll={updateScrollState}>
    {stages.map(s => <StageButton />)}
  </div>
  {canScrollRight && (
    <button className="absolute right-0 z-10 bg-gradient-to-l from-navy to-transparent px-2"
      onClick={() => scrollRef.current.scrollBy({ left: 150, behavior: 'smooth' })}>
      ›
    </button>
  )}
</div>
```

### Testing
- Narrow viewport: verify arrows appear when stages overflow
- Click arrow: verify smooth scroll by one stage
- At scroll end: verify corresponding arrow disappears
- **Letter labels (AC3-AC5):** Current prompts do NOT output letter-labeled sub-stages yet (depends on EPIC-AP-001 AP-4.1). Test with mock markdown containing `## Etapa 5A: Objecao de Preco`, `## Etapa 5B: Objecao de Tempo`, etc. The regex change is forward-compatible and will activate automatically when AP-4.1 delivers letter-labeled content.
- Verify sub-stages visually grouped under parent stage 5
- Verify existing numbered stages (1-7) still parse correctly after regex update (backward compat)

## Risks
- Letter-labeled sub-stages (5A, 5B, 5C) are not yet in production prompt output (depends on EPIC-AP-001 AP-4.1) — regex update is forward-compatible but must be tested with mock data
- Scroll indicator arrows must not interfere with touch swipe on mobile

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-02 | 1.0 | Story drafted | @sm (River) |
| 2026-03-02 | 1.1 | PO validation: quality_gate @qa→@architect, removed coderabbit from tools, added risks, added mock data testing note for letter labels. Status Draft→Ready | @po (Pax) |
| 2026-03-02 | 2.0 | Implementation complete: scroll indicators (Part A) + letter label regex + sub-stage rendering (Part B). Status Ready→InProgress | @dev (Dex) |

## Dev Agent Record
### Agent Model Used
Claude Opus 4.6
### Debug Log References
- TypeScript check: 0 new errors (2 pre-existing in LandingPagePreview.tsx, unrelated)
### Completion Notes List
- Part A: Added scroll overflow detection with `ResizeObserver` + `onScroll` handler. Left/right arrow buttons appear at edges with gradient fade backgrounds (`from-prosperus-navy-dark via-prosperus-navy-dark/80 to-transparent`). Scroll amount = 60% of container width. Touch swipe preserved since `overflow-x-auto` remains on the scroll container. Arrows hidden when at scroll limits (2px tolerance).
- Part B: Updated `STAGE_REGEX` to allow optional letter suffix after digit: `\d+[A-Za-z]?`. Updated `extractStageLabel` number extraction in both `StageSeparator` and `StageNav` to capture letter labels (e.g., "5A"). Updated label-cleaning regexes to strip letter suffixes. Sub-stage buttons render visually smaller: `w-4 h-4` circle (vs `w-5 h-5`), `text-[10px]`/`text-[9px]` (vs `text-[11px]`/`text-[10px]`), `px-2 py-1` (vs `px-3 py-1.5`), `rounded-md` (vs `rounded-lg`), subtle opacity (`bg-white/[0.03]`, `text-white/40`), negative left margin (`ml-[-2px]`) for visual grouping with parent.
- Forward-compatible: letter-labeled sub-stages will activate automatically when AP-4.1 delivers letter-labeled prompt content. Backward-compatible with all existing numbered stages.
### File List
- `mentoria-main/components/assets/ChatScriptViewer.tsx` — STAGE_REGEX update, StageSeparator letter extraction, StageNav scroll indicators + sub-stage rendering
