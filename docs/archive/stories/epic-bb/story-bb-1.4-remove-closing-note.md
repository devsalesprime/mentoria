# Story BB-1.4: Remove AI Closing Note from Brand Brain Generation

**Epic:** EPIC-BB-001 | **Status:** Done | **Points:** 2 | **Priority:** P2 | **Wave:** 1
**Depends on:** None

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["coderabbit", "manual-review"]

## Story
**As a** mentor viewing my Brand Brain,
**I want** the generated content to not include an operational closing message,
**so that** the document feels polished and professional without AI-facing instructions leaking into my view.

## Acceptance Criteria
- [x] AC1: Prompt `03-brand-brain-generation.md` no longer instructs the AI to append a closing note to `section4_copy`
- [x] AC2: Existing Brand Brains that already contain the closing note have it stripped during rendering (regex cleanup in frontend)
- [x] AC3: The closing note text ("Fim do Brand Brain. Este documento e utilizado como contexto completo...") does not appear in the user-facing BrandBrainViewer
- [x] AC4: No data loss — only the specific closing note paragraph is stripped, all other section4_copy content preserved

## Scope
**IN:** Prompt cleanup, frontend rendering filter for legacy data
**OUT:** Adding a replacement footer in the UI, modifying section4_copy structure, changing asset generation references

## Tasks
- [x] 1. Remove the CLOSING NOTE section from `docs/pipeline-redesign/prompts/03-brand-brain-generation.md` lines ~385-390 (AC1)
  - [x] 1a. Remove the `### CLOSING NOTE` header and all text below it that instructs the AI to append the closing text
  - [x] 1b. Keep the `**Remember: your entire response must be a single valid JSON object. Nothing else.**` instruction if it exists outside the closing note context
- [x] 2. Add a rendering filter in the frontend to strip the closing note from existing BBs (AC2, AC3)
  - [x] 2a. In `brand-brain-parser.ts` or `SubsectionCard.tsx`, add a cleanup regex that removes the "Fim do Brand Brain..." paragraph
  - [x] 2b. Pattern to match: `*Fim do Brand Brain. Este documento é utilizado como contexto completo para toda geração de ativos*` (with possible variations in formatting — italic markers, line breaks)
- [x] 3. Test with existing BB data that contains the closing note — confirm stripped (AC2, AC4)
- [x] 4. Test with BB data that does NOT contain the closing note — confirm no side effects (AC4)

## Dev Notes

### Key Files
- **Prompt:** `docs/pipeline-redesign/prompts/03-brand-brain-generation.md` lines ~385-390
- **Parser:** `mentoria-main/utils/brand-brain-parser.ts`
- **Viewer:** `mentoria-main/components/brand-brain/BrandBrainViewer.tsx`

### Current Closing Note in Prompt
```markdown
### CLOSING NOTE

The last line of the `section4_copy` value should end with:

*Fim do Brand Brain. Este documento e utilizado como contexto completo
para toda geracao de ativos (Scripts de Prospeccao, Sequencias de Follow-up,
Scripts de Venda, Copy de Landing Page, Scripts de VSL).*
```

### Cleanup Regex Pattern
```typescript
// Strip the closing note from section4_copy content
const CLOSING_NOTE_REGEX = /\*?Fim do Brand Brain\.?\s*Este documento.*?(?:VSL\)?\.\*?)\s*$/s;
content = content.replace(CLOSING_NOTE_REGEX, '').trim();
```

Place this in the parser's section processing or as a utility function called before rendering.

### Testing
- Test with BB containing the closing note — verify stripped
- Test with BB without closing note — verify no content loss
- Test that section4_copy content before the closing note is fully preserved

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
- CLOSING NOTE block removed from prompt; "Remember" JSON instruction preserved
- CLOSING_NOTE_REGEX added to parseSubsections() in brand-brain-parser.ts — applied as part of the initial cleaned preprocessing
- Regex uses `s` flag for dotAll multiline matching; anchored to end-of-string ($) to prevent false positives in middle of content
### File List
- `docs/pipeline-redesign/prompts/03-brand-brain-generation.md` — removed CLOSING NOTE block (AC1)
- `mentoria-main/utils/brand-brain-parser.ts` — added CLOSING_NOTE_REGEX cleanup in parseSubsections() (AC2, AC3, AC4)
