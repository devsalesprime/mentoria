# Story 3.5: Test Coverage Backlog

**Epic:** EPIC-TD-001 | **Status:** Done | **Points:** 5 | **Priority:** P3 | **Phase:** 3

## Descricao
Test suite existente tinha 16 de 20 test files falhando por imports incorretos, props desatualizados e mocks incompletos. Corrigir todos os testes para estabelecer baseline verde.

## Acceptance Criteria
- [x] AC1: All existing test files pass (0 failures)
- [x] AC2: All imports match actual component exports (named vs default)
- [x] AC3: All mocks include required framer-motion hooks (useReducedMotion)
- [x] AC4: All test props match actual component interfaces
- [x] AC5: npm run build succeeds alongside green tests

## Scope
**IN:** Fix all broken existing tests
**OUT:** Writing new test files, increasing coverage percentage

## Tasks
- [x] 1. Delete orphan health.test.ts (no health route exists)
- [x] 2. Fix 14 test files: change default imports to named imports
- [x] 3. Fix ErrorBoundaryApp.test.tsx: change mock default exports to named exports
- [x] 4. Fix Dashboard.test.tsx mocks: named exports + MemoryRouter wrapper
- [x] 5. Add useReducedMotion mock to all 13 framer-motion mocks
- [x] 6. Fix AccordionSection.test.tsx: add required props (icon, isComplete, isOpen, onToggle)
- [x] 7. Fix FileUpload.test.tsx: use correct props (files, onFilesChange, category)
- [x] 8. Fix TagInput.test.tsx: change tags prop to value
- [x] 9. Fix LoginModal.test.tsx: check document.body for Radix portal content
- [x] 10. Verify 19/19 test files pass, 80/80 tests pass

## File List
- `tests/routes/health.test.ts` — DELETED (orphan)
- `tests/components/Dashboard.test.tsx` — MODIFIED: named imports, Router wrapper, named mocks
- `tests/components/ErrorBoundaryApp.test.tsx` — MODIFIED: named mock exports
- `tests/components/Footer.test.tsx` — MODIFIED: named import + useReducedMotion
- `tests/components/Header.test.tsx` — MODIFIED: named import + useReducedMotion
- `tests/components/Hero.test.tsx` — MODIFIED: named import + useReducedMotion
- `tests/components/LoginModal.test.tsx` — MODIFIED: named import + portal assertion
- `tests/components/PreModule.test.tsx` — MODIFIED: named import + useReducedMotion
- `tests/components/MentorModule.test.tsx` — MODIFIED: named import + useReducedMotion
- `tests/components/MenteeModule.test.tsx` — MODIFIED: named import + useReducedMotion
- `tests/components/MethodModule.test.tsx` — MODIFIED: named import + useReducedMotion
- `tests/components/OfferModule.test.tsx` — MODIFIED: named import + useReducedMotion
- `tests/components/OverviewPanel.test.tsx` — MODIFIED: named import + useReducedMotion
- `tests/components/shared/AccordionSection.test.tsx` — MODIFIED: required props + useReducedMotion
- `tests/components/shared/FileUpload.test.tsx` — MODIFIED: correct props + useReducedMotion
- `tests/components/shared/TagInput.test.tsx` — MODIFIED: tags→value prop + useReducedMotion

## Debts Resolved: TEST-01 (partial)
## Estimated Effort: 16 hours
