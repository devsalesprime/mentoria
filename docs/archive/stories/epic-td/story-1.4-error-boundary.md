# Story 1.4: Adicionar React Error Boundary

**Epic:** EPIC-TD-001
**Status:** Done
**Points:** 3
**Priority:** P1
**Phase:** 1 — Seguranca & Quick Wins

---

## Descricao

A aplicacao nao possui Error Boundary. Qualquer erro JavaScript causa tela branca (crash completo). Necessario adicionar boundaries em dois niveis: app-level e module-level.

## Acceptance Criteria

- [x] AC1: Given a JS error in any module, When error occurs, Then app shows "Something went wrong" with retry button (not white screen)
- [x] AC2: Given a JS error in MentorModule, When error occurs, Then other sidebar items remain navigable
- [x] AC3: Given App.tsx, When wrapped in ErrorBoundary, Then uncaught errors are caught
- [x] AC4: Given each module component, When wrapped in ModuleErrorBoundary, Then errors are isolated per module
- [x] AC5: Given error boundary, When retry clicked, Then component re-mounts cleanly
- [x] AC6: Given error boundary, When error caught, Then error details are logged to console (not shown to user)

## Scope

**IN:** App-level ErrorBoundary, module-level ErrorBoundary, retry mechanism
**OUT:** Error reporting service (Sentry etc), offline detection

## Tasks

- [x] 1. Create components/shared/ErrorBoundary.tsx (class component with componentDidCatch)
- [x] 2. Create components/shared/ModuleErrorBoundary.tsx (module-level variant with friendly message)
- [x] 3. Wrap App root in ErrorBoundary (via index.tsx)
- [x] 4. Wrap 8 components in Dashboard.tsx with ModuleErrorBoundary
- [x] 5. Add retry button that resets error state (both components)
- [x] 6. Style error views to match app design (dark navy + gold)
- [x] 7. Build verified: vite build succeeds

## Debts Resolved

UX-03

## Estimated Effort: 4 hours

## File List

- [x] components/shared/ErrorBoundary.tsx (NEW — app-level, retry + reload)
- [x] components/shared/ModuleErrorBoundary.tsx (NEW — module-level, isolated)
- [x] index.tsx (wrapped App in ErrorBoundary)
- [x] components/Dashboard.tsx (8 modules wrapped in ModuleErrorBoundary)
