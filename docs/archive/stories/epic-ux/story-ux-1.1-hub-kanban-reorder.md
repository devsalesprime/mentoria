# Story UX-1.1: Asset Hub Layout — Kanban by Funnel Stage + Reorder

**Epic:** EPIC-UX-001 | **Status:** Done | **Points:** 5 | **Priority:** P1 | **Wave:** 1
**Depends on:** None

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["manual-review"]

## Story
**As a** mentor viewing my deliverable assets,
**I want** the assets organized by funnel stage in a kanban-style layout with the correct order within each stage,
**so that** I can see my assets in the logical flow of my sales funnel.

## Acceptance Criteria
- [x] AC1: Desktop — funnel stages ("Atrair", "Conectar", "Converter") rendered as horizontal columns, assets as vertical cards within each column
- [x] AC2: Mobile — funnel stages as vertical sections, assets as horizontal scrollable cards within each section
- [x] AC3: "Atrair" order: Landing Page first, then VSL
- [x] AC4: "Conectar" order: Script de Abordagem first, then Follow-up Cadence
- [x] AC5: Landing Page label changed from "Copy de Landing Page" to "Landing Page"
- [x] AC6: Phase filter tabs still work correctly
- [x] AC7: Progress badges, "Ver agora" button, and viewer routing preserved
- [x] AC8: Responsive transition between desktop kanban and mobile layout is smooth

## Scope
**IN:** AssetDeliveryHub layout restructure, assetConfig ordering, label update
**OUT:** Adding new assets, changing viewer components, modifying progress tracking logic

## Tasks
- [x] 1. Update `assetConfig.ts` — reorder ASSET_CATALOG entries (AC3, AC4, AC5)
  - [x] 1a. Move Landing Page before VSL in the "attract" phase
  - [x] 1b. Move Script de Abordagem before Follow-up in the "connect" phase
  - [x] 1c. Change Landing Page label from "Copy de Landing Page" to "Landing Page"
- [x] 2. Restructure AssetDeliveryHub layout for desktop kanban (AC1)
  - [x] 2a. Group assets by phase ID (`attract`, `connect`, `convert`)
  - [x] 2b. Render phases as flex columns: `flex flex-row gap-6`
  - [x] 2c. Each column: phase header (icon + label) on top, asset cards stacked below
  - [x] 2d. Equal column widths: `flex-1` or `w-1/3`
- [x] 3. Implement mobile layout (AC2)
  - [x] 3a. Breakpoint: `md:` for kanban, below = vertical sections
  - [x] 3b. Mobile: each phase as a vertical section with horizontal scrollable asset row
  - [x] 3c. Use `overflow-x-auto flex flex-row gap-3` for horizontal scroll on mobile
  - [x] 3d. Snap scrolling: `scroll-snap-type: x mandatory` on mobile cards
- [x] 4. Verify phase tab filtering still works (AC6)
- [x] 5. Verify all functional props pass through: progress, viewer routing, back navigation (AC7)
- [x] 6. Test responsive transition at md breakpoint (AC8)

## Dev Notes

### Key Files
- **Hub:** `mentoria-main/components/assets/AssetDeliveryHub.tsx`
- **Config:** `mentoria-main/components/assets/assetConfig.ts`

### Current Layout
```tsx
// Current: flat grid, all assets mixed
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {filteredAssets.map(asset => <AssetCard />)}
</div>
```

### Target Layout (Desktop)
```tsx
// Kanban: columns per phase
<div className="hidden md:flex flex-row gap-6">
  {PHASES.map(phase => (
    <div className="flex-1 flex flex-col gap-3" key={phase.id}>
      <PhaseHeader phase={phase} />
      {assetsForPhase(phase.id).map(asset => <AssetCard />)}
    </div>
  ))}
</div>
```

### Current Asset Order in ASSET_CATALOG
```
attract: VSL Script → Landing Copy  (WRONG — should be LP → VSL)
connect: Follow-up → Outreach       (WRONG — should be Outreach → Follow-up)
```

### Testing
- Desktop: 3 columns visible, correct order within each
- Mobile: vertical sections with horizontal scroll
- Tab filter: selecting "Atrair" shows only that column/section
- All "Ver agora" buttons open correct viewer

## Risks
- Kanban layout may not fit 3 equal columns on medium screens (768-1024px) — use `min-w` constraints or allow horizontal scroll
- Phase tab filtering logic needs reworking for column-based layout (currently filters flat grid items)

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-02 | 1.0 | Story drafted | @sm (River) |
| 2026-03-02 | 1.1 | PO validation: quality_gate @qa→@architect, removed coderabbit from tools, added risks section. Status Draft→Ready | @po (Pax) |
| 2026-03-02 | 1.2 | Implementation complete: kanban layout, asset reorder, label rename. Status Ready→InProgress | @dev (Dex) |

## Dev Agent Record
### Agent Model Used
Claude Opus 4.6
### Debug Log References
None — clean implementation, no errors encountered.
### Completion Notes List
- Reordered ASSET_CATALOG: Landing Page before VSL (attract), Outreach before Follow-up (connect)
- Renamed "Copy de Landing Page" to "Landing Page" in assetConfig.ts
- Replaced flat grid layout with desktop kanban (3 columns via `hidden md:flex flex-row gap-6`, `flex-1` per column)
- Each column has a phase header with bottom border separator, then stacked asset cards
- Mobile layout (`md:hidden`) renders vertical sections with horizontal scrollable cards (`overflow-x-auto`, `scroll-snap-type: x mandatory`)
- Mobile cards sized at `min-w-[75vw] max-w-[85vw]` for peek-through scroll UX
- Phase tab filtering preserved: `showPhase()` logic filters `visiblePhases` array, applied to both desktop and mobile layouts
- Single-phase filter constrains desktop column width with `max-w-md` to avoid stretching
- All functional props untouched: ProgressBadge, handleView, resolveAssetContent, renderParadigmViewer
- Loading skeleton updated to match kanban layout (3-column desktop, stacked mobile)
- Toolkit section preserved with `mt-10` spacing
- Note: GoalSection.tsx still has old "Copy de Landing Page" label — out of scope per story definition
### File List
- `mentoria-main/components/assets/assetConfig.ts` — reordered entries + label rename
- `mentoria-main/components/assets/AssetDeliveryHub.tsx` — kanban layout + mobile horizontal scroll + loading skeleton
- `mentoria-main/docs/stories/story-ux-1.1-hub-kanban-reorder.md` — story checkboxes + dev record
