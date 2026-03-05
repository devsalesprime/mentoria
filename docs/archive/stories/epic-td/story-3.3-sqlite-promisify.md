# Story 3.3: Promisificar API SQLite e Adicionar Validacao de Input

**Epic:** EPIC-TD-001 | **Status:** Done | **Points:** 8 | **Priority:** P3 | **Phase:** 3

## Descricao
Todas as operacoes de banco usam callback API do sqlite3 (callback hell). Input validation e manual sem biblioteca. Promisificar DB e adicionar zod para validacao.

## Acceptance Criteria
- [x] AC1: Database operations use async/await (no callbacks)
- [x] AC2: db.get/run/all wrapped in promisified helpers
- [x] AC3: zod installed for request validation
- [x] AC4: At least POST /api/diagnostic validates request body with zod schema
- [x] AC5: At least POST /auth/verify-member validates email format
- [x] AC6: All existing routes work with promisified DB
- [x] AC7: No more than 2 levels of nesting in any route handler

## Scope
**IN:** SQLite promisification, zod validation on critical endpoints
**OUT:** Migration to better-sqlite3, full validation of all endpoints

## Tasks
- [x] 1. Create utils/db-helpers.cjs with promisified wrappers (dbGet, dbRun, dbAll)
- [x] 2. npm install zod
- [x] 3. Refactor auth.cjs to use async/await + db helpers
- [x] 4. Refactor diagnostic.cjs to use async/await
- [x] 5. Refactor admin-users.cjs to use async/await
- [x] 6. Refactor admin-pipeline.cjs to use async/await
- [x] 7. Refactor brand-brain.cjs to use async/await
- [x] 8. Add zod schemas for critical POST endpoints
- [x] 9. Add validation middleware for zod schemas
- [x] 10. Test all routes

## File List
- `utils/db-helpers.cjs` — NEW: Promisified dbGet, dbRun, dbAll wrappers
- `utils/validation.cjs` — NEW: Zod schemas + validateBody middleware
- `server.cjs` — MODIFIED: Added dbGet/dbRun/dbAll to deps object
- `routes/auth.cjs` — MODIFIED: async/await + zod validation on verify-member & admin-login
- `routes/diagnostic.cjs` — MODIFIED: async/await + zod imports
- `routes/admin-users.cjs` — MODIFIED: async/await
- `routes/admin-pipeline.cjs` — MODIFIED: async/await
- `routes/brand-brain.cjs` — MODIFIED: async/await
- `routes/audio.cjs` — MODIFIED: async/await
- `routes/assets.cjs` — MODIFIED: async/await
- `routes/files.cjs` — MODIFIED: async/await
- `routes/user-progress.cjs` — MODIFIED: async/await

## Debts Resolved: ARCH-04, ARCH-05 (partial)
## Estimated Effort: 24 hours
