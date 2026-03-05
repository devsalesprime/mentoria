# Story BB-3.2: Unify Post-Approval Editing to Inline Subsection Mode

**Epic:** EPIC-BB-001 | **Status:** Done | **Points:** 5 | **Priority:** P1 | **Wave:** 3
**Depends on:** BB-3.1

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["coderabbit", "manual-review", "manual-testing"]

## Story
**As a** mentor who has approved my Brand Brain,
**I want** to edit content inline on the subsection cards (same experience as before approval),
**so that** I have a consistent, intuitive editing experience regardless of approval status.

## Acceptance Criteria
- [x] AC1: Post-approval view shows subsection cards with edit (pencil) and delete (trash) controls — same as pre-approval
- [x] AC2: Clicking pencil opens inline edit mode on the subsection card (not a separate textarea view)
- [x] AC3: Add new subsection ("Adicionar topico") works in post-approval state
- [x] AC4: Auto-save via debounced `POST /api/brand-brain/section/:id/update-content` works for approved BBs
- [x] AC5: `userEditedAt` timestamp is updated on every post-approval save
- [x] AC6: No regression in pre-approval editing flow (mentor_review status)
- [x] AC7: The old section-level textarea editor (BBApprovedState current behavior) is removed or replaced

## Scope
**IN:** Unify approved-state editing to use the same inline subsection editing as mentor_review state
**OUT:** Adding new editing capabilities, changing the save endpoint contract, modifying admin editing flows

## Tasks

### Part A: Enable Inline Editing for Approved Status
- [x] 1. Update `BrandBrainViewer.tsx` — remove or modify the `isReadOnly` check for approved status (AC1)
  - [x] 1a. Current: `const isReadOnly = data?.brandBrainStatus === 'approved'` → change to allow editing
  - [x] 1b. Approved status should render `BrandBrainSection` components with `editable={true}` instead of `BBApprovedState`
  - [x] 1c. Keep BBApprovedState for the approval summary/status display, but delegate content rendering to BrandBrainSection
- [x] 2. Verify `BrandBrainSection` edit controls render for approved BBs (AC1, AC2)
  - [x] 2a. Pencil icon on hover (desktop) / touch-accessible (mobile — from BB-1.3)
  - [x] 2b. Delete icon with confirmation
  - [x] 2c. Inline textarea editing on pencil click
- [x] 3. Enable AddTopicForm for approved status (AC3)
  - [x] 3a. "Adicionar topico" button visible at section end
  - [x] 3b. New subsection form works with same flow as pre-approval

### Part B: Backend — Accept Edits for Approved Status
- [x] 4. Update `routes/brand-brain.cjs` — `update-content` endpoint (AC4)
  - [x] 4a. Currently may restrict edits to `mentor_review` status — verify and remove restriction for `approved`
  - [x] 4b. If status check exists: allow both `mentor_review` and `approved` statuses
  - [x] 4c. Ensure `reconstructMarkdown()` pipeline works for approved BB data
- [x] 5. Update `userEditedAt` on post-approval saves (AC5)
  - [x] 5a. On successful content update for approved BB: set `userEditedAt = NOW()`
  - [x] 5b. Verify timestamp displayed in UI if applicable

### Part C: Cleanup Old Editor
- [x] 6. Remove or simplify BBApprovedState (AC7)
  - [x] 6a. Remove the section-picker + textarea editor from BBApprovedState
  - [x] 6b. Keep any approval status display (approval date, status badge) if present
  - [x] 6c. BBApprovedState becomes a wrapper/header that renders BrandBrainSection components for content
  - [x] 6d. Remove the old `POST /api/brand-brain/save` endpoint if it was exclusively used by the old textarea editor (verify no other consumers)

### Part D: Regression Testing
- [x] 7. Test pre-approval editing flow (mentor_review status) — no changes expected (AC6)
- [x] 8. Test post-approval inline edit → save → reload → verify content persisted (AC4)
- [x] 9. Test post-approval add topic → verify new subsection appears and saves (AC3)
- [x] 10. Test post-approval delete topic → verify subsection removed and saves (AC1)

## Dev Notes

### Key Files
- **BrandBrainViewer:** `mentoria-main/components/brand-brain/BrandBrainViewer.tsx` — routing between approved/review states
- **BBApprovedState:** `mentoria-main/components/brand-brain/BBApprovedState.tsx` — current post-approval UI (textarea editor)
- **BrandBrainSection:** `mentoria-main/components/brand-brain/BrandBrainSection.tsx` — pre-approval section with inline editing
- **SubsectionCard:** `mentoria-main/components/brand-brain/SubsectionCard.tsx` — card-level edit/delete
- **Backend route:** `mentoria-main/routes/brand-brain.cjs` — update-content endpoint
- **AddTopicForm:** `mentoria-main/components/brand-brain/AddTopicForm.tsx` (if exists) or inline in BrandBrainSection

### Current Architecture (Two Separate Flows)

**Pre-approval (mentor_review):**
```
BrandBrainViewer → BrandBrainSection (editable=true)
  → SubsectionCard (pencil/trash on hover)
  → inline textarea edit → reconstructMarkdown()
  → POST /api/brand-brain/section/:id/update-content
```

**Post-approval (approved):**
```
BrandBrainViewer → BBApprovedState
  → section picker (tabs: s1, s2, s3, s4)
  → full section markdown textarea
  → POST /api/brand-brain/save { sectionId, content }
```

### Target Architecture (Unified Flow)
```
BrandBrainViewer → BrandBrainSection (editable=true) [BOTH statuses]
  → SubsectionCard (pencil/trash)
  → inline textarea edit → reconstructMarkdown()
  → POST /api/brand-brain/section/:id/update-content
  → updates userEditedAt for approved BBs
```

BBApprovedState becomes a thin wrapper showing approval metadata + rendering BrandBrainSection components.

### Dependency on BB-3.1
BB-3.1 changes the admin input flow. This story should be developed AFTER BB-3.1 is stable to avoid conflicting changes in the same components. Specifically:
- BB-3.1 may modify how BB data is loaded in PipelineDetailView
- This story modifies how BB data is edited in BrandBrainViewer
- Both touch the same data flow but at different entry points (admin vs. mentor)

### Endpoint Consolidation
After this story, the old `POST /api/brand-brain/save` endpoint may be unused. Verify:
- Is it called from anywhere other than BBApprovedState?
- If not, deprecate it (leave route but add deprecation comment, or remove entirely)

### Testing
- Pre-approval: create BB → mentor_review → edit subsection → verify saves correctly
- Post-approval: approve BB → edit subsection inline → verify saves correctly
- Post-approval: add new topic → verify appears as card and saves
- Post-approval: delete topic → verify removed and saves
- Reload after edits → verify all changes persisted
- Check userEditedAt timestamp updated after post-approval edit

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-02 | 1.0 | Story drafted | @sm (River) |

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Debug Log References
None — YOLO mode
### Completion Notes List
- `isReadOnly` variable in BrandBrainViewer now set to `false`; `isApproved` variable used for UI state (progress bar, intro header, download buttons)
- `BrandBrainSection.canEdit` updated to allow editing when `status === 'approved'` (in addition to pending/revised)
- `BrandBrainSection.expanded` default changed from `status !== 'approved'` to `true` so approved sections start open for post-approval editing
- Backend `update-content` endpoint now allows both `mentor_review` and `approved` statuses. Sets `userEditedAt` for approved BBs, `mentorEditedAt` for review BBs
- `BBApprovedState` rewritten as a thin approval banner (status badge + download buttons + edit timestamp). All section-picker + textarea editor code removed
- `BBApprovedState` rendered above the 4 BrandBrainSection components in the approved state (not replacing them)
- Old `POST /api/brand-brain/save` endpoint preserved with deprecation comment (no breaking changes)
- TypeScript: 0 errors
### File List
- `components/brand-brain/BrandBrainViewer.tsx` — isReadOnly=false, isApproved for UI, BBApprovedState now a banner, sections always rendered
- `components/brand-brain/BBApprovedState.tsx` — rewritten: thin approval banner only, textarea editor removed
- `components/brand-brain/BrandBrainSection.tsx` — canEdit includes approved status; expanded defaults to true
- `routes/brand-brain.cjs` — update-content allows mentor_review + approved; deprecated /save endpoint
