# Story 3.5: Completar Cobertura de Testes e Backlog

**Epic:** EPIC-TD-001 | **Status:** Draft | **Points:** 8 | **Priority:** P3 | **Phase:** 3

## Descricao
Atingir 60%+ de cobertura de testes e resolver items de backlog restantes (logging, consistency, minor UX).

## Acceptance Criteria
- [ ] AC1: Test coverage >60% (vitest coverage report)
- [ ] AC2: All decomposed components have render + interaction tests
- [ ] AC3: API client consolidated (single pattern, axios only)
- [ ] AC4: Structured logging in place (pino or winston)
- [ ] AC5: All remaining LOW debts from backlog addressed or documented as accepted

## Scope
**IN:** Test coverage push, API consolidation, logging, remaining backlog items
**OUT:** E2E tests, 100% coverage, new features

## Tasks
- [ ] 1. Write tests for all Phase 2-3 components
- [ ] 2. Write integration tests for full diagnostic flow
- [ ] 3. Write tests for Brand Brain viewer/editor
- [ ] 4. Create API client utility (consolidated axios with interceptors)
- [ ] 5. Replace fetch in LoginModal with API client
- [ ] 6. Install and configure pino for structured logging
- [ ] 7. Replace console.log/error in server.cjs and routes
- [ ] 8. Address remaining backlog items from technical-debt-assessment.md
- [ ] 9. Final coverage report and documentation update

## Debts Resolved: QAL-01 (complete), ARCH-06, ARCH-08, remaining LOW items
## Estimated Effort: 32 hours
