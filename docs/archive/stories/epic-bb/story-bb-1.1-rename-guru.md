# Story BB-1.1: Rename "Historia do Guru" to "Narrativa de Origem"

**Epic:** EPIC-BB-001 | **Status:** Done | **Points:** 2 | **Priority:** P2 | **Wave:** 1
**Depends on:** None

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["coderabbit", "manual-review"]

## Story
**As a** mentor reviewing my Brand Brain,
**I want** the positioning section to use "Narrativa de Origem" instead of "Historia do Guru",
**so that** the terminology feels professional and avoids negative connotations associated with "Guru".

## Acceptance Criteria
- [x] AC1: Prompt `03-brand-brain-generation.md` uses "Narrativa de Origem (Narrativa de Descoberta)" as the H4 header instead of "Historia do Guru (Narrativa de Descoberta)"
- [x] AC2: Frontend icon map in `brand-brain-parser.ts` resolves "narrativa de origem" to the book emoji
- [x] AC3: Legacy keys ("historia do guru", "guru") kept in icon map for backward compatibility with existing generated Brand Brains
- [x] AC4: No visible "Guru" text in any user-facing UI element
- [x] AC5: Existing Brand Brains with old "Guru" header still render correctly with the book icon

## Scope
**IN:** Prompt H4 header rename, icon map update, backward compatibility
**OUT:** Changing the actual content generated inside the section, modifying other section names

## Tasks
- [x] 1. Update `docs/pipeline-redesign/prompts/03-brand-brain-generation.md` — change "Historia do Guru (Narrativa de Descoberta)" H4 header to "Narrativa de Origem (Narrativa de Descoberta)" (AC1)
- [x] 2. Update `utils/brand-brain-parser.ts` icon map — add `'narrativa de origem': book_emoji` entry (AC2)
- [x] 3. Keep legacy fallback keys in icon map: `'historia do guru'`, `'guru'`, `'story'` (AC3)
- [x] 4. Search codebase for any other "Guru" references in user-facing strings and remove/replace (AC4)
- [x] 5. Test with an existing BB that has old "Historia do Guru" header — confirm icon still resolves (AC5)

## Dev Notes

### Key Files
- **Prompt:** `docs/pipeline-redesign/prompts/03-brand-brain-generation.md` line ~321
- **Icon map:** `mentoria-main/utils/brand-brain-parser.ts` line ~33
- **Constants:** `mentoria-main/utils/brand-brain-constants.ts` (check for any section name references)

### Implementation Details
The icon map in `brand-brain-parser.ts` uses lowercase title matching. Current entries:
```
'historia do guru': book, 'guru': book, 'narrativa de descoberta': book, 'story': book
```
Add `'narrativa de origem': book` as primary, keep all others as fallback.

The prompt defines H4 headers that the parser splits on. Changing the H4 text in the prompt means new generations will use the new name. Old BBs already stored in the database will still have the old header, so the fallback keys are critical.

### Testing
- Verify icon resolution for both old ("Historia do Guru") and new ("Narrativa de Origem") headers
- Verify no "Guru" text visible in BrandBrainViewer UI
- No automated test framework changes needed — this is a string/config change

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
- Added 'narrativa de origem' as primary key in ICON_MAP; all legacy keys preserved
- No user-facing "Guru" strings found in components
### File List
- `docs/pipeline-redesign/prompts/03-brand-brain-generation.md` — renamed H4 header (AC1)
- `mentoria-main/utils/brand-brain-parser.ts` — added 'narrativa de origem' to ICON_MAP (AC2, AC3)
