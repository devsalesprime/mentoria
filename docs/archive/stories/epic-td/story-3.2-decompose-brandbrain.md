# Story 3.2: Decompor BrandBrainViewer e Eliminar Duplicacoes

**Epic:** EPIC-TD-001 | **Status:** Done | **Points:** 8 | **Priority:** P2 | **Phase:** 3
**Depends on:** Story 2.1 (tests)

## Descricao
BrandBrainViewer.tsx tem 2037 linhas. SECTION_KEY_MAP e duplicado em 4 arquivos. Decompor o viewer e extrair constantes compartilhadas.

## Acceptance Criteria
- [x] AC1: BrandBrainViewer.tsx is 398 lines (<400 target)
- [x] AC2: SECTION_KEY_MAP exists in 1 location: routes/shared/brand-brain-constants.cjs (backend) + utils/brand-brain-constants.ts (frontend)
- [x] AC3: VALID_SECTIONS exists in 1 location per layer (shared/brand-brain-constants.cjs)
- [x] AC4: BB section parsing logic extracted to utils/brand-brain-parser.ts
- [x] AC5: BB inline editing extracted to SubsectionCard.tsx + RichEditor
- [x] AC6: Expert notes panel extracted to ExpertNotesPanel.tsx
- [x] AC7: All Brand Brain functionality works identically (build passes, server starts)
- [x] AC8: Backend routes import shared constants from routes/shared/brand-brain-constants.cjs

## Scope
**IN:** BrandBrainViewer decomposition, shared constant extraction, key map deduplication
**OUT:** New BB features, redesign

## Tasks
- [x] 1. Create utils/brand-brain-constants.ts (SECTIONS, types, helpers)
- [x] 2. Create utils/brand-brain-parser.ts (markdown parsing, icons, subsections)
- [x] 3. Extract SubsectionCard.tsx + RichEditor (251 lines)
- [x] 4. Extract BBStatusBadge.tsx (31 lines)
- [x] 5. Extract BBExportUtils.ts (84 lines)
- [x] 6. Extract ExpertNotesPanel.tsx (123 lines)
- [x] 7. Extract AddTopicForm.tsx (83 lines)
- [x] 8. Extract FeedbackForm.tsx (156 lines)
- [x] 9. Extract BrandBrainSection.tsx (363 lines)
- [x] 10. Extract BBPillarIntro.tsx (72 lines) + BBApprovedState.tsx (138 lines)
- [x] 11. Create routes/shared/brand-brain-constants.cjs for backend
- [x] 12. Update brand-brain.cjs — removed 4 VALID_SECTIONS + 2 SECTION_KEY_MAP duplications
- [x] 13. Update admin-pipeline.cjs — removed 1 VALID_SECTIONS + 1 SECTION_KEY_MAP duplication
- [x] 14. Build passes, server starts cleanly

## File List
- `BrandBrainViewer.tsx` — Thin shell (398 lines, from 2037)
- `utils/brand-brain-constants.ts` — NEW (47 lines)
- `utils/brand-brain-parser.ts` — NEW (318 lines)
- `components/brand-brain/SubsectionCard.tsx` — NEW (251 lines)
- `components/brand-brain/BBStatusBadge.tsx` — NEW (31 lines)
- `components/brand-brain/BBExportUtils.ts` — NEW (84 lines)
- `components/brand-brain/ExpertNotesPanel.tsx` — NEW (123 lines)
- `components/brand-brain/AddTopicForm.tsx` — NEW (83 lines)
- `components/brand-brain/FeedbackForm.tsx` — NEW (156 lines)
- `components/brand-brain/BrandBrainSection.tsx` — NEW (363 lines)
- `components/brand-brain/BBPillarIntro.tsx` — NEW (72 lines)
- `components/brand-brain/BBApprovedState.tsx` — NEW (138 lines)
- `routes/shared/brand-brain-constants.cjs` — NEW (26 lines)
- `routes/brand-brain.cjs` — MODIFIED (removed duplicated constants)
- `routes/admin-pipeline.cjs` — MODIFIED (removed duplicated constants)

## Debts Resolved: ARCH-01 (partial), ARCH-02
## Estimated Effort: 20 hours
