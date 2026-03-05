# Story 3.1: Decompor AdminPanel em Sub-Componentes

**Epic:** EPIC-TD-001 | **Status:** Done | **Points:** 8 | **Priority:** P2 | **Phase:** 3
**Depends on:** Story 2.1 (tests), Story 2.3 (router)

## Descricao
AdminPanel.tsx tem 1800+ linhas com todas as funcionalidades admin inline. Decompor em sub-componentes por feature.

## Acceptance Criteria
- [x] AC1: AdminPanel.tsx is 108 lines (layout/routing shell only) — well under 200 target
- [x] AC2: AdminUserList component exists and renders user table (desktop + mobile)
- [x] AC3: AdminUserDetail component exists and renders user detail modal
- [x] AC4: PipelineOverview + PipelineDetailView exist for pipeline management
- [x] AC5: Brand Brain editing is in PipelineDetailView (research, BB, expert notes, assets)
- [x] AC6: All admin functionality works identically (build passes, same component tree)
- [x] AC7: Types extracted to types/admin.ts, hook extracted to hooks/useAdminUsers.ts

## Scope
**IN:** AdminPanel decomposition into admin/folder, type deduplication
**OUT:** New admin features, redesign

## Tasks
- [x] 1. Create components/admin/ directory
- [x] 2. Extract AdminUserList.tsx (table + search, 221 lines)
- [x] 3. Extract AdminUserDetail.tsx (user view + actions, 151 lines)
- [x] 4. Extract PipelineOverview.tsx (pipeline list, 149 lines)
- [x] 5. Extract PipelineDetailView.tsx (BB, research, assets, expert notes, 541 lines)
- [x] 6. Create hooks/useAdminUsers.ts (user CRUD logic, 124 lines)
- [x] 7. Create types/admin.ts (all admin types, 88 lines)
- [x] 8. Extract StatusBadge.tsx (34 lines) + Toast.tsx (22 lines) + helpers.ts (164 lines)
- [x] 9. AdminPanel.tsx becomes thin shell (108 lines)
- [x] 10. Build passes successfully

## File List
- `components/AdminPanel.tsx` — Thin shell (108 lines, from 1519)
- `components/admin/StatusBadge.tsx` — NEW (34 lines)
- `components/admin/Toast.tsx` — NEW (22 lines)
- `components/admin/helpers.ts` — NEW (164 lines)
- `components/admin/PipelineDetailView.tsx` — NEW (541 lines)
- `components/admin/PipelineOverview.tsx` — NEW (149 lines)
- `components/admin/AdminUserList.tsx` — NEW (221 lines)
- `components/admin/AdminUserDetail.tsx` — NEW (151 lines)
- `hooks/useAdminUsers.ts` — NEW (124 lines)
- `types/admin.ts` — NEW (88 lines)

## Debts Resolved: ARCH-01 (partial), UX-12
## Estimated Effort: 16 hours
