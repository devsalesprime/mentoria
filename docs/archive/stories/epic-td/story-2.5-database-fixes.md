# Story 2.5: Correcoes de Schema e Performance do Banco

**Epic:** EPIC-TD-001 | **Status:** Done | **Points:** 8 | **Priority:** P1 | **Phase:** 2

## Descricao
Pipeline.user_id carece de UNIQUE constraint, indexes/triggers nao sao criados em bancos novos, nao ha schema version tracking, endpoints admin nao paginam, e JSON.parse pode crashar.

## Acceptance Criteria
- [x] AC1: pipeline.user_id has UNIQUE constraint enforced (idx_pipeline_user_id_unique)
- [x] AC2: initializeDatabase() creates all indexes from migration 009
- [x] AC3: initializeDatabase() creates all triggers from migration 010
- [x] AC4: schema_migrations table exists and tracks applied migrations
- [x] AC5: GET /api/admin/users supports ?page=1&limit=20 pagination
- [x] AC6: GET /api/admin/pipeline supports ?page=1&limit=20 pagination
- [x] AC7: All JSON.parse calls have try-catch with fallback (safeJsonParse)
- [x] AC8: Automated daily backup script exists (scripts/backup-db.sh)
- [x] AC9: A fresh database (no migration run) has all indexes

## Scope
**IN:** UNIQUE constraint, indexes in init, schema tracking, pagination, JSON safety, backup
**OUT:** PostgreSQL migration, connection pooling, full promisification

## Tasks
- [x] 1. Add UNIQUE index on pipeline.user_id in initializeDatabase()
- [x] 2. Copy index SQL from migration 009 into initializeDatabase()
- [x] 3. Copy trigger SQL from migration 010 into initializeDatabase()
- [x] 4. Create schema_migrations table in initializeDatabase()
- [x] 5. Add pagination to admin-users.cjs (LIMIT/OFFSET + total count)
- [x] 6. Add pagination to admin-pipeline.cjs (LIMIT/OFFSET + total count)
- [x] 7. Wrap all JSON.parse calls with safeJsonParse helper (41 replacements across 6 files)
- [x] 8. Create scripts/backup-db.sh for daily SQLite backup (7-day rotation)
- [x] 9. Server starts with Schema v2.1 — verified

## Dev Notes
- safeJsonParse(str, fallback={}) added to server.cjs and passed via deps object
- Pagination returns { page, limit, total, pages } alongside data
- Backup uses sqlite3 .backup for hot/safe copies
- Schema bumped from v2.0 to v2.1
- Migration 012 record inserted into schema_migrations

## File List
- `server.cjs` — MODIFIED: safeJsonParse helper, indexes, triggers, schema_migrations, deps
- `routes/admin-users.cjs` — MODIFIED: pagination + safeJsonParse
- `routes/admin-pipeline.cjs` — MODIFIED: pagination + safeJsonParse
- `routes/brand-brain.cjs` — MODIFIED: safeJsonParse (11 replacements)
- `routes/assets.cjs` — MODIFIED: safeJsonParse
- `routes/diagnostic.cjs` — MODIFIED: safeJsonParse
- `routes/user-progress.cjs` — MODIFIED: safeJsonParse
- `scripts/backup-db.sh` — NEW: daily backup with 7-day retention

## Debts Resolved: DB-01, DB-02, DB-03, DB-04, DB-06, DB-08
## Estimated Effort: 24 hours
