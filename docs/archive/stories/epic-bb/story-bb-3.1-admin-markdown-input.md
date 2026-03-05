# Story BB-3.1: Admin Brand Brain Input — JSON to 4 Markdown Textareas

**Epic:** EPIC-BB-001 | **Status:** Done | **Points:** 8 | **Priority:** P1 | **Wave:** 3
**Depends on:** None
**Blocks:** BB-3.2

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["coderabbit", "manual-review", "manual-testing"]

## Story
**As an** admin managing the mentoria pipeline,
**I want** to input Brand Brain content as markdown in 4 separate textareas (one per section) instead of pasting a single JSON blob,
**so that** I can work with the content in a readable, editable format without dealing with JSON escaping and formatting.

## Acceptance Criteria
- [x] AC1: Admin sees 4 labeled textareas, one per section: "Arquitetura da Oferta", "ICP & Persona", "Posicionamento & Mensagem", "Copy Fundamentals"
- [x] AC2: Each textarea accepts raw markdown (no JSON wrapping required from admin)
- [x] AC3: Each section has an independent preview toggle (Edit / Preview) showing rendered markdown
- [x] AC4: Save constructs the standard 4-section JSON object at the route level before storage (storage format unchanged)
- [x] AC5: Dual-key support preserved — backend stores as `section1_offer`, `section2_icp`, `section3_positioning`, `section4_copy` (v2 format)
- [x] AC6: Loading existing JSON-format Brand Brains correctly populates the 4 textareas (backward compatibility)
- [x] AC7: All downstream consumers (BrandBrainViewer, parser, editing flows, asset generation) continue working unchanged
- [x] AC8: Metadata fields (mentorName, programName, generatedAt, version) handled separately — either auto-populated or in a collapsible metadata section
- [x] AC9: Validation: save is disabled if any section is empty

## Scope
**IN:** Admin PipelineDetailView Brand Brain input UI, admin-pipeline route save handler
**OUT:** Changing the database storage schema, modifying BrandBrainViewer, modifying the parser, changing how prompts consume BB data, end-user editing flows

## Tasks

### Part A: Frontend — Admin Input UI
- [x] 1. Refactor the Brand Brain input section in `PipelineDetailView.tsx` (lines ~279-458) (AC1, AC2)
  - [x] 1a. Replace single JSON textarea with 4 section textareas
  - [x] 1b. Each textarea labeled with section name and section key for reference
  - [x] 1c. Use accordion or tab layout to avoid excessive vertical scrolling
  - [x] 1d. Each textarea has adequate height (h-48 minimum) for markdown content
- [x] 2. Add per-section preview toggle (AC3)
  - [x] 2a. Each section gets an "Editar" / "Visualizar" toggle button
  - [x] 2b. Preview mode renders markdown via `marked.parse()` + DOMPurify (same as BrandBrainViewer)
  - [x] 2c. Preview uses same PROSE_CLASSES for visual consistency
- [x] 3. Handle metadata fields (AC8)
  - [x] 3a. Add a collapsible "Metadados" section below the 4 textareas
  - [x] 3b. Fields: mentorName (text input), programName (text input)
  - [x] 3c. generatedAt and version auto-populated on save
- [x] 4. Add validation (AC9)
  - [x] 4a. Save button disabled if any of the 4 section textareas is empty
  - [x] 4b. Visual indicator on empty sections (red border or warning text)

### Part B: Frontend — Loading Existing Data
- [x] 5. Parse existing JSON BB data into 4 separate strings on load (AC6)
  - [x] 5a. On component mount: if `brandBrain` data exists, extract each section value
  - [x] 5b. Handle dual-key format: try `section1_offer` first, fallback to `section1_icp` (v1 format)
  - [x] 5c. Populate each textarea with its extracted markdown string
  - [x] 5d. Populate metadata fields from existing JSON

### Part C: Backend — Save Handler
- [x] 6. Update save endpoint in `routes/admin-pipeline.cjs` (AC4, AC5)
  - [x] 6a. Accept request body with 4 section fields + metadata: `{ section1_offer, section2_icp, section3_positioning, section4_copy, mentorName, programName }`
  - [x] 6b. Construct the standard JSON object: `{ section1_offer: "...", section2_icp: "...", ..., version: "2.0", generatedAt: ISO_NOW }`
  - [x] 6c. Store as JSON string in `brand_brain` column (same as current)
  - [x] 6d. Return success with the stored object

### Part D: Verification
- [x] 7. End-to-end test: admin saves via new UI → BrandBrainViewer displays correctly (AC7)
- [x] 8. Test loading existing JSON BB → 4 textareas populated correctly (AC6)
- [x] 9. Test that editing in BrandBrainViewer (pre-approval inline editing) still works after admin save (AC7)
- [x] 10. Test that asset generation prompts can still read section data (AC7)

## Dev Notes

### Key Files
- **Admin component:** `mentoria-main/components/admin/PipelineDetailView.tsx` lines ~279-458
- **Backend route:** `mentoria-main/routes/admin-pipeline.cjs`
- **DB helpers:** `mentoria-main/utils/db-helpers.cjs`
- **BB constants (backend):** `mentoria-main/routes/shared/brand-brain-constants.cjs` — VALID_SECTIONS, SECTION_KEY_MAP

### Current Admin Input Flow
```
Admin pastes JSON string → textarea → isValidJson() + hasBbSections() validation
→ POST /api/pipeline/:userId/brand-brain { brandBrain: JSON.parse(rawJson) }
→ Backend: JSON.stringify(brandBrain) → stored in brand_brain TEXT column
```

### New Admin Input Flow
```
Admin types/pastes markdown per section → 4 textareas → empty-check validation
→ POST /api/pipeline/:userId/brand-brain { section1_offer, section2_icp, section3_positioning, section4_copy, mentorName, programName }
→ Backend: constructs { section1_offer: "...", ..., version: "2.0", generatedAt: NOW } → JSON.stringify → stored in brand_brain TEXT column
```

### Critical: Storage Format Unchanged
The database column `brand_brain` continues to store a JSON string with the standard schema:
```json
{
  "section1_offer": "markdown string...",
  "section2_icp": "markdown string...",
  "section3_positioning": "markdown string...",
  "section4_copy": "markdown string...",
  "mentorName": "...",
  "programName": "...",
  "version": "2.0",
  "generatedAt": "ISO timestamp"
}
```
This ensures ALL downstream consumers are unaffected. The change is purely at the admin input layer.

### Dual-Key Backward Compatibility
`brand-brain-constants.cjs` defines `SECTION_KEY_MAP` which handles v1 (`section1_icp`) vs v2 (`section1_offer`) key mapping. The loading logic in task 5b should use this map, or replicate its logic.

### Risk Mitigation
- **Storage unchanged** → no migration, no downstream impact
- **Dual-key preserved** → old and new BBs both load correctly
- **Preview toggle** → admin can verify content before saving
- **Validation** → prevents accidental empty section saves

### Testing
- Save 4 sections via new UI → verify JSON stored correctly in DB
- Load existing v1-format BB (section1_icp keys) → verify textareas populated
- Load existing v2-format BB (section1_offer keys) → verify textareas populated
- After admin save → open BrandBrainViewer as mentor → verify all 4 sections render
- After admin save → edit as mentor (pre-approval) → verify inline editing works
- Run asset generation with BB saved via new UI → verify prompts receive correct data

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-02 | 1.0 | Story drafted | @sm (River) |

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Debug Log References
None — YOLO mode, no decision log generated
### Completion Notes List
- Replaced single JSON textarea with 4 per-section markdown textareas + per-section Edit/Preview toggle
- Per-section preview renders markdown via marked.parse() + DOMPurify using PROSE_CLASSES constant
- Empty sections get red border + "obrigatório" label; save button disabled until all 4 filled
- Collapsible "Metadados" accordion added below 4 sections (mentorName, programName fields)
- Backend route updated to accept new format `{ section1_offer, section2_icp, section3_positioning, section4_copy, mentorName, programName }` and constructs standard JSON object (version: "2.0", generatedAt: ISO_NOW)
- Loading logic extracts per-section markdown strings from existing BB data (dual-key support: section1_offer / section2_offer fallback etc.)
- Storage format unchanged — all downstream consumers unaffected
- Removed unused imports: `isValidJson`, `hasBbSections` from helpers
### File List
- `components/admin/PipelineDetailView.tsx` — replaced JSON textarea with 4 markdown textareas + preview toggle + metadata accordion; updated save logic
- `routes/admin-pipeline.cjs` — updated POST /api/pipeline/:userId/brand-brain to accept per-section fields and construct standard JSON object
