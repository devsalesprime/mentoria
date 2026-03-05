# Story BB-1.5: Deep Research Admin Input — JSON to Link

**Epic:** EPIC-BB-001 | **Status:** Done | **Points:** 3 | **Priority:** P2 | **Wave:** 1
**Depends on:** None

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["coderabbit", "manual-review"]

## Story
**As an** admin managing the mentoria pipeline,
**I want** to paste a link (URL) for the deep research instead of raw JSON,
**so that** I can reference a Google Doc, Notion page, or other research source without dealing with JSON formatting.

## Acceptance Criteria
- [x] AC1: Admin sees a URL input field (type="url" or text with URL validation) instead of JSON textarea for deep research
- [x] AC2: Input validates that the value is a valid URL before allowing save
- [x] AC3: URL is stored in the database (either in existing `research_dossier` column as a string or in a new `research_link` column)
- [x] AC4: Existing entries with JSON data are still readable and displayed (backward compatibility)
- [x] AC5: Admin can update/replace the link after initial save
- [x] AC6: Clear visual indication of what the field expects (label, placeholder with example URL)

## Scope
**IN:** Admin pipeline detail view — research input field change, backend save endpoint update
**OUT:** Fetching/parsing the URL content, rendering research data in the user view, changing how research is consumed by prompts

## Tasks
- [x] 1. Update `PipelineDetailView.tsx` research input section (lines ~254-277) (AC1, AC6)
  - [x] 1a. Replace `<textarea>` with `<input type="url">` or text input with URL pattern
  - [x] 1b. Update placeholder: `"https://docs.google.com/document/d/... ou link do Notion"`
  - [x] 1c. Update label from current to "Link da Pesquisa Aprofundada"
  - [x] 1d. Remove `isValidJson()` validation, replace with URL validation
- [x] 2. Update save handler in frontend (AC2, AC5)
  - [x] 2a. Validate URL format before enabling save button
  - [x] 2b. Send as string (not JSON parsed) to backend
- [x] 3. Update backend `routes/admin-pipeline.cjs` save endpoint (AC3)
  - [x] 3a. Accept string (URL) for research_dossier field
  - [x] 3b. Store directly as string in the `research_dossier` column
- [x] 4. Handle backward compatibility for existing JSON entries (AC4)
  - [x] 4a. On load: detect if `research_dossier` is JSON (starts with `{`) or URL (starts with `http`)
  - [x] 4b. If JSON: display a read-only formatted view or migration notice
  - [x] 4c. If URL: display in the URL input field
- [x] 5. Test save/load cycle with new URL format
- [x] 6. Test with existing user that has JSON research data — confirm no breakage

## Dev Notes

### Key Files
- **Admin component:** `mentoria-main/components/admin/PipelineDetailView.tsx` lines ~254-277
- **Backend route:** `mentoria-main/routes/admin-pipeline.cjs`
- **DB helpers:** `mentoria-main/utils/db-helpers.cjs`

### Current Implementation
```tsx
<textarea
  value={researchJson}
  onChange={(e) => setResearchJson(e.target.value)}
  placeholder='{ "researchDossier": { ... } }'
  className="... h-32 ..."
/>
{researchJson && !isValidJson(researchJson) && (
  <p className="text-red-400 text-sm">JSON invalido</p>
)}
```

Admin currently pastes the full JSON output from the deep research prompt. The JSON is stored as-is in `research_dossier` column and retrieved via `safeJsonParse()`.

### Migration Strategy
No database migration needed. The `research_dossier` column is TEXT type — it can store either JSON string or URL string. Detection is done at read time:
- `value.trim().startsWith('{')` → legacy JSON
- `value.trim().startsWith('http')` → URL link
- Everything else → treat as plain text

### Testing
- Test saving a valid URL
- Test saving an invalid URL — should show validation error
- Test loading existing JSON entry — should render without error
- Test replacing JSON entry with URL — should save correctly

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
- Replaced textarea + `isValidJson` with `<input type="url">` + `isValidUrl()` (URL constructor validation)
- Added `researchLink`, `researchIsLegacyJson`, `researchLinkError` state to PipelineDetailView
- fetchDetail now detects string (URL) vs object (legacy JSON) for researchDossier
- Legacy JSON users: shown yellow warning notice; URL input is empty, ready to accept new link
- Backend GET: smart parsing — JSON objects parsed, URL strings passed through as-is
- Backend POST: accepts `researchLink` (new) or `researchDossier` (legacy); stores string as-is, objects as JSON.stringify
- No schema migration needed — research_dossier column is TEXT and stores either format
### File List
- `mentoria-main/components/admin/PipelineDetailView.tsx` — replaced textarea with URL input, updated state and save handler (AC1, AC2, AC4, AC5, AC6)
- `mentoria-main/routes/admin-pipeline.cjs` — updated GET to preserve URL strings, updated POST to accept researchLink (AC3, AC4)
