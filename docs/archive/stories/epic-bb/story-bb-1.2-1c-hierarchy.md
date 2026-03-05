# Story BB-1.2: Add Visual Hierarchy to 1C Sugestoes de Otimizacao

**Epic:** EPIC-BB-001 | **Status:** Done | **Points:** 3 | **Priority:** P2 | **Wave:** 1
**Depends on:** None

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["coderabbit", "manual-review"]

## Story
**As a** mentor reviewing the Offer Architecture section of my Brand Brain,
**I want** the optimization suggestions (1C) to have clear visual hierarchy separating each suggestion and its sub-topics,
**so that** I can quickly scan and evaluate each suggestion independently instead of reading a flat list.

## Acceptance Criteria
- [x] AC1: Each optimization suggestion in 1C is visually grouped as a distinct block (card, bordered section, or divider-separated group)
- [x] AC2: The three labels within each suggestion ("O que mudar", "Por que acreditamos que isso ajudaria", "Impacto esperado") are visually distinct from each other (bold label + body text pattern minimum)
- [x] AC3: Visual grouping works in both pre-approval (mentor_review) and post-approval (approved) views
- [x] AC4: Layout is responsive — stacks cleanly on mobile without overlap
- [x] AC5: Existing Brand Brains with current 1C format render with the new hierarchy (no data migration needed)

## Scope
**IN:** CSS/component styling for 1C suggestion groups, SubsectionCard body rendering
**OUT:** Changing the prompt output structure, modifying other subsection card types, parser structural changes

## Tasks
- [x] 1. Analyze current 1C output format — each suggestion is a bullet group with `**O que mudar**`, `**Por que...**`, `**Impacto esperado**` labels (AC1, AC2)
- [x] 2. Add CSS styling in SubsectionCard or via PROSE_CLASSES to detect and style the triplet pattern — options: (a) CSS `:has()` selector on bold labels, (b) parser post-processing to wrap each triplet in a div, (c) custom markdown renderer for this pattern (AC1, AC2)
- [x] 3. Chosen approach: add CSS styling via PROSE_CLASSES to style consecutive bullet groups with bold labels as visually grouped blocks with subtle background/border differentiation (AC1, AC2)
- [x] 4. Verify rendering in BrandBrainSection (pre-approval) and BBApprovedState (post-approval) (AC3)
- [x] 5. Test mobile responsiveness — ensure groups stack without overlap (AC4)
- [x] 6. Test with existing BB data — confirm backward compatible rendering (AC5)

## Dev Notes

### Key Files
- **SubsectionCard:** `mentoria-main/components/brand-brain/SubsectionCard.tsx`
- **Parser:** `mentoria-main/utils/brand-brain-parser.ts`
- **Prose classes:** defined in SubsectionCard.tsx as `PROSE_CLASSES` constant

### Current 1C Output Structure
The prompt (`03-brand-brain-generation.md` lines 202-217) generates suggestions in this format:
```markdown
#### 1C. Sugestoes de Otimizacao

- **O que mudar** — [specific element]
- **Por que acreditamos que isso ajudaria** — [reasoning]
- **Impacto esperado** — [expected improvement]

- **O que mudar** — [another element]
- **Por que acreditamos que isso ajudaria** — [reasoning]
- **Impacto esperado** — [expected improvement]
```

The parser extracts this as a single subsection body. The markdown is rendered via `marked.parse()` + DOMPurify in SubsectionCard. Suggestions are separated by blank lines between bullet groups.

### Recommended Approach
Use CSS-only solution via PROSE_CLASSES additions:
- Target `<li>` elements containing `<strong>` with the known label text
- Add subtle left-border or background grouping every 3 consecutive labeled bullets
- Alternatively: add a `parseSuggestionGroups()` post-processor in the parser that wraps each 3-bullet group in a `<div class="suggestion-group">` before rendering

### Testing
- Visual check on existing BB with 1C suggestions
- Mobile viewport test (375px, 768px)
- No automated tests needed — visual/CSS change

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-02 | 1.0 | Story drafted | @sm (River) |

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Debug Log References
None
### Completion Notes List
- Added `wrapSuggestionGroups()` function to brand-brain-parser.ts; groups 3-item bullet sets into suggestion-group divs
- Added `.suggestion-group` styles to PROSE_CLASSES (rounded border, subtle bg, padding, margin-bottom)
- SubsectionCard applies the wrapper only for sections matching /sugest|otimiza/i — no effect on other sections
- DOMPurify preserves custom class attributes by default, no configuration needed
### File List
- `mentoria-main/utils/brand-brain-parser.ts` — added `wrapSuggestionGroups()` and PROSE_CLASSES suggestion-group styles (AC1, AC2)
- `mentoria-main/components/brand-brain/SubsectionCard.tsx` — import and apply `wrapSuggestionGroups` for suggestion sections (AC1, AC3, AC4, AC5)
