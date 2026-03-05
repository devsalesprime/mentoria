# Story BB-2.2: 1A Table Row Management + Remove Redundant Rows

**Epic:** EPIC-BB-001 | **Status:** Done | **Points:** 5 | **Priority:** P2 | **Wave:** 2
**Depends on:** None

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["coderabbit", "manual-review"]

## Story
**As a** mentor editing the Offer Architecture section of my Brand Brain,
**I want** easy add/remove controls for table rows in the 1A Diagnostico da Oferta, and I want redundant rows removed from the default generation,
**so that** I can customize the diagnostic table without editing raw markdown, and the table is clean without duplicated information.

## Acceptance Criteria
- [x] AC1: When editing a table-type subsection, each row has a visible "x" button to remove it
- [x] AC2: A "+" button below the table allows adding a new empty row
- [x] AC3: Row deletion shows a brief confirmation before removing (inline, not modal)
- [x] AC4: New rows are inserted with empty editable cells matching the table column structure
- [x] AC5: Changes are saved via the existing `reconstructMarkdown()` → auto-save flow
- [x] AC6: Prompt defines 1A table with 9 elements (removed: Estrutura de Preco, Bonus, Modelo de Entrega)
- [x] AC7: Existing Brand Brains with 12-row tables still render correctly (no data loss, no forced removal)

## Scope
**IN:** Table row add/remove UI in SubsectionCard edit mode, prompt 1A table row reduction
**OUT:** Column add/remove, table drag-to-reorder, inline cell-level editing (cells already editable via contentEditable), other table subsections

## Tasks

### Part A: Remove Redundant Rows from Prompt
- [x] 1. Update `03-brand-brain-generation.md` 1A table definition (AC6)
  - [x] 1a. Remove "Estrutura de Preco" row — covered by 1D (Arquitetura de Preco → Validacao ou Recomendacao de Preco)
  - [x] 1b. Remove "Bonus" row — covered by new 1E (Descricao Completa da Oferta → Bonuses)
  - [x] 1c. Remove "Modelo de Entrega" row — covered by 1E (Core Deliverables list)
  - [x] 1d. Verify remaining 9 elements: Promessa Central, Mecanismo, Drivers de Valor, Resultados Tangiveis, Resultados Intangiveis, Tempo para Resultado, Esforco do Cliente, Perfil de Risco, Posicionamento de Mercado

### Part B: Table Row Management UI
- [x] 2. Detect when SubsectionCard is in edit mode AND content is a markdown table (AC1, AC2)
  - [x] 2a. Parse table structure: detect header row, separator row, data rows
  - [x] 2b. Render table in a structured editable format (not raw markdown textarea)
- [x] 3. Implement row delete control (AC1, AC3)
  - [x] 3a. Add "x" button on each data row (not header row)
  - [x] 3b. On click: show inline confirmation ("Remover linha?" with Sim/Nao)
  - [x] 3c. On confirm: remove row from parsed table, trigger save
- [x] 4. Implement row add control (AC2, AC4)
  - [x] 4a. Add "+" button below the last table row
  - [x] 4b. On click: append new row with empty cells matching column count
  - [x] 4c. New row cells are immediately editable (textarea fields)
- [x] 5. Integrate with save flow (AC5)
  - [x] 5a. On row add/remove: reconstruct markdown table string
  - [x] 5b. Feed into existing `reconstructMarkdown()` → debounced save pipeline
  - [x] 5c. Verify `POST /api/brand-brain/section/:id/update-content` receives valid markdown
- [x] 6. Test backward compatibility with existing 12-row tables (AC7)

## Dev Notes

### Key Files
- **Prompt:** `docs/pipeline-redesign/prompts/03-brand-brain-generation.md` lines ~162-179
- **SubsectionCard:** `mentoria-main/components/brand-brain/SubsectionCard.tsx`
- **Parser:** `mentoria-main/utils/brand-brain-parser.ts` (table detection: line ~131)
- **BB Section:** `mentoria-main/components/brand-brain/BrandBrainSection.tsx` (reconstructMarkdown)

### Current Table Rendering
Tables are detected in the parser by regex `/\|[\s-]+\|/` and marked `fullWidth: true`. In SubsectionCard, tables render via `marked.parse()` → HTML → `dangerouslySetInnerHTML`. When editing, the user now sees a structured `TableEditor` instead of a raw markdown textarea.

### Table Editing Architecture Decision
Implemented **Option A** (Recommended): Parse the markdown table into a structured data model (`{ headers: string[], rows: string[][] }`) when entering edit mode. Render as actual `<table>` with editable `<textarea>` cells + row controls. Reconstruct markdown on save.

### Markdown Table Format
```markdown
| Elemento | Conteudo |
|----------|----------|
| Promessa Central | ... |
| Mecanismo | ... |
```
Two columns: "Elemento" (label) and "Conteudo" (value). Header + separator + N data rows.

### Implementation Notes
- `isMarkdownTable()` — detects table bodies using `/\|[\s-]+\|/` (same pattern as parser's fullWidth detection)
- `parseMarkdownTable()` — splits on `\n`, strips leading/trailing `|`, separates header/separator/data rows
- `tableToMarkdown()` — reconstructs `| header | ... |\n| --- | ... |\n| cell | ... |` format
- `TableEditor` component — local state `rows: string[][]`, `confirmDeleteRow: number | null`
- Confirmation auto-cancels after 3 seconds (matches existing subsection delete pattern in BrandBrainSection)
- `handleSave` in TableEditor calls `onSave(markdown)` which feeds into `onEdit` → `onSubsectionEdit` → `reconstructMarkdown()` → debounced `POST`
- AC7 (backward compat): `parseMarkdownTable` handles any number of rows — existing 12-row BBs will simply render all 12 rows in the editor, no data removed

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-02 | 1.0 | Story drafted | @sm (River) |
| 2026-03-02 | 1.1 | Implemented: prompt 1A rows reduced to 9 + TableEditor UI in SubsectionCard | @dev (Dex) |

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Debug Log References
None — clean implementation, no debug needed.
### Completion Notes List
- AC6: Removed Estrutura de Preco, Bonus, Modelo de Entrega from prompt. 9 rows remain as specified.
- AC1-AC5: `TableEditor` component added to SubsectionCard.tsx. Table detection uses same `/\|[\s-]+\|/` regex as the parser. All edit flow goes through `onSave` → `onEdit` prop → `onSubsectionEdit` in BrandBrainSection → `reconstructMarkdown()` → debounced API save.
- AC3: Inline confirmation pattern with "Remover linha?" + "Sim"/"Não" buttons, auto-dismiss after 3s. No modal.
- AC4: `handleAddRow` appends `Array(headers.length).fill('')` row — cell count always matches header columns.
- AC7: `parseMarkdownTable` is non-destructive — renders all existing rows regardless of count.
### File List
- `docs/pipeline-redesign/prompts/03-brand-brain-generation.md` — Removed Estrutura de Preco, Bonus, Modelo de Entrega from 1A table; now 9 rows
- `mentoria-main/components/brand-brain/SubsectionCard.tsx` — Added `isMarkdownTable()`, `parseMarkdownTable()`, `tableToMarkdown()` helpers + `TableEditor` component; SubsectionCard edit mode now branches to `TableEditor` for table-type subsections
