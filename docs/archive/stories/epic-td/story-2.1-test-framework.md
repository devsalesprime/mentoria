# Story 2.1: Instalar Framework de Testes e Testes Iniciais

**Epic:** EPIC-TD-001 | **Status:** Done | **Points:** 8 | **Priority:** P1 | **Phase:** 2

## Descricao
A aplicacao nao possui nenhum teste automatizado. Instalar Vitest, configurar com React Testing Library, e criar testes para as funcionalidades mais criticas.

## Acceptance Criteria
- [ ] AC1: Vitest installed and configured in vite.config.ts
- [ ] AC2: React Testing Library installed
- [ ] AC3: `npm test` command works and runs test suite
- [ ] AC4: utils/progress.ts has >90% test coverage
- [ ] AC5: Auth flow has integration tests (login, token validation)
- [ ] AC6: At least 20 test files exist
- [ ] AC7: Test coverage report generated (>20% overall)

## Scope
**IN:** Vitest setup, RTL setup, progress utility tests, auth flow tests, hook tests, basic component render tests
**OUT:** E2E tests, visual regression tests, 100% coverage

## Tasks
- [ ] 1. npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
- [ ] 2. Configure Vitest in vite.config.ts (jsdom environment)
- [ ] 3. Add "test" and "test:coverage" scripts to package.json
- [ ] 4. Create test for utils/progress.ts (calculateProgress)
- [ ] 5. Create tests for auth routes (mock sqlite3)
- [ ] 6. Create render tests for key components (Dashboard, LoginModal, modules)
- [ ] 7. Create test for useDiagnosticPersistence hook
- [ ] 8. Run coverage report and verify >20%

## Debts Resolved: QAL-01 (partial)
## Estimated Effort: 32 hours
