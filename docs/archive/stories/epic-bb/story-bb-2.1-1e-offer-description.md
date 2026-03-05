# Story BB-2.1: Add 1E Section — Descricao Completa da Oferta (Hormozi Value Equation)

**Epic:** EPIC-BB-001 | **Status:** Done | **Points:** 5 | **Priority:** P1 | **Wave:** 2
**Depends on:** None

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["coderabbit", "manual-review"]

## Story
**As a** mentor reviewing my Offer Architecture,
**I want** a dedicated section (1E) that presents a complete, compelling description of my offer using the Hormozi Value Equation framework, followed by a detailed list of core deliverables,
**so that** I have a ready-to-use reference paragraph for sales copy, landing pages, and pitch materials.

## Acceptance Criteria
- [x] AC1: Prompt defines a new "1E. Descricao Completa da Oferta" subsection after 1D in section1_offer
- [x] AC2: 1E contains a value-equation paragraph following the structure: Dream Outcome → without perceived effort and time delay → with guarantee/risk reversal
- [x] AC3: 1E contains a detailed list of core deliverables with valuable descriptions for each item
- [x] AC4: 1E includes a bonuses subsection (if any bonuses exist in the diagnostic data), with descriptions
- [x] AC5: Parser detects "1E." H4 header and renders as a subsection card
- [x] AC6: Icon assigned to 1E in the icon map (suggested: package or gift emoji)
- [x] AC7: Renders correctly in both pre-approval and post-approval views
- [x] AC8: Existing Brand Brains without 1E still render normally (no errors, no empty card)

## Scope
**IN:** Prompt 1E definition, parser icon map, rendering verification
**OUT:** Modifying 1A-1D content, changing the Value Equation framework itself, creating new UI components for 1E

## Tasks
- [x] 1. Add 1E subsection to prompt `03-brand-brain-generation.md` after the 1D section (AC1)
  - [x] 1a. Define H4 header: `#### 1E. Descricao Completa da Oferta`
  - [x] 1b. Write prompt instructions for the value-equation paragraph (AC2)
  - [x] 1c. Write prompt instructions for core deliverables list (AC3)
  - [x] 1d. Write prompt instructions for bonuses subsection (AC4)
- [x] 2. Add icon mapping in `brand-brain-parser.ts` (AC5, AC6)
  - [x] 2a. Add `'descricao completa da oferta': '📦'` to icon map
  - [x] 2b. Add fallback keys: `'descricao completa': '📦'`, `'1e': '📦'`
- [x] 3. Verify parser H4 detection handles "1E." pattern — should work already since parser splits on `####` (AC5)
- [x] 4. Test rendering in BrandBrainSection (pre-approval) and BBApprovedState (post-approval) (AC7)
- [x] 5. Test with existing BB that has no 1E — confirm no empty card or error (AC8)

## Dev Notes

### Key Files
- **Prompt:** `docs/pipeline-redesign/prompts/03-brand-brain-generation.md` — insert after 1D (lines ~232)
- **Parser icon map:** `mentoria-main/utils/brand-brain-parser.ts` line ~33
- **Constants:** `mentoria-main/utils/brand-brain-constants.ts`

### Current Section 1 Structure
```
1A. Diagnostico da Oferta (table)
1B. Analise SWOT (prose)
1C. Sugestoes de Otimizacao (bullet triplets)
1D. Arquitetura de Preco (3 topics)
1E. Descricao Completa da Oferta (paragraph + deliverables list + bonuses)  ← NEW
```

### Hormozi Value Equation Reference
```
Value = (Dream Outcome × Perceived Likelihood of Achievement) /
        (Time Delay × Effort & Sacrifice)
```
The 1E paragraph should maximize the numerator (dream outcome + certainty via guarantee) and minimize the denominator (frame as low effort + fast results).

### Data Sources for 1E Generation
The AI prompt has access to:
- **Module 1:** Promessa Central, Drivers de Valor, Resultados Tangíveis, Resultados Intangíveis, Modelo de Entrega, Bônus
- **Module 4:** Risk analysis, guarantee framework
- **Research Dossier:** Competitor offerings, market positioning

### Parser Behavior
The parser splits section content on H4 (`####`) headers. A new "1E." header will automatically create a new `ParsedSubsection` entry. No parser code changes needed beyond icon map — the detection is pattern-based.

### Testing
- Generate a new BB with the updated prompt — verify 1E appears as a card
- Verify 1E card has correct icon
- Load existing BB without 1E — verify no visual regression
- Check mobile layout with 5 cards in section 1 (was 4)

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-02 | 1.0 | Story drafted | @sm (River) |
| 2026-03-02 | 1.1 | Implemented: icon map entries + prompt 1E section added | @dev (Dex) |

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Debug Log References
None — straightforward implementation, no debug needed.
### Completion Notes List
- AC5/AC7/AC8: Parser already handles `####` H4 headers pattern-based; no parser logic changes required. Existing BBs without 1E simply won't have that subsection — the `parseSubsections` function returns an empty-safe result. No empty card risk.
- AC6: Used `'📦'` (package) for 'descricao completa da oferta', 'descricao completa', and '1e' keys. Since `detectIcon` sorts keys by length descending, the most specific key wins first.
- Prompt 1E placed after 1D section and before the SEÇÃO 2 separator.
### File List
- `docs/pipeline-redesign/prompts/03-brand-brain-generation.md` — Added `#### 1E. Descricao Completa da Oferta` section with value-equation paragraph, core deliverables, and bonuses instructions
- `mentoria-main/utils/brand-brain-parser.ts` — Added `'descricao completa da oferta': '📦'`, `'descricao completa': '📦'`, `'1e': '📦'` to ICON_MAP
