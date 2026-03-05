# Schema Migration Plan — v1.x to v2.0

> **Version:** 2.0.0
> **Date:** 2026-02-25
> **Author:** Dara (Data Engineer Agent)
> **Risk Level:** LOW (< 100 rows, single file DB, simple backup/restore)
> **Downtime:** ~1 minute (stop server → backup → migrate → restart)

---

## 1. Executive Summary

### Objective
Optimize the Prosperus Mentor Diagnosis SQLite database by:
- Removing 3 unused/legacy tables
- Adding foreign key constraints with ON DELETE CASCADE
- Adding CHECK constraints on all status/enum fields
- Adding indexes on all foreign key and frequently queried columns
- Adding updated_at triggers for automatic timestamp management
- Enabling WAL mode for better concurrent performance

### Risk Assessment

| Factor | Assessment |
|--------|-----------|
| Data volume | < 100 rows total — LOW risk |
| Backup strategy | Simple file copy — instant restore |
| Rollback | Copy backup file back — instant |
| Downtime | ~1 minute (offline migration) |
| Breaking changes | YES — requires server.cjs code updates |

### Environments

| Environment | Action |
|-------------|--------|
| Development | Apply migration, test thoroughly |
| Production | Backup → Apply → Verify → Restart |

---

## 2. Change Set

### Tables DROPPED (3)

| Table | Reason | Pre-check |
|-------|--------|-----------|
| `user_progress` | Replaced by `diagnostic_data` | Verify no orphaned data |
| `tasks` | Unused in codebase | Verify zero rows |
| `submissions` | Redundant with diagnostic flow | Verify no critical data |

### Tables RECREATED with constraints (4)

SQLite doesn't support `ALTER TABLE ADD CONSTRAINT`, so tables with new FK/CHECK constraints must be recreated using the copy-rename pattern.

| Table | New Constraints Added |
|-------|-----------------------|
| `diagnostic_data` | FK → users(id) ON DELETE CASCADE, CHECK on status/module/progress |
| `pipeline` | FK → users(id) ON DELETE CASCADE, CHECK on all status fields |
| `audio_recordings` | FK → users(id) ON DELETE CASCADE, CHECK on module/duration |
| `uploaded_files` | FK → users(id) ON DELETE CASCADE, CHECK on file_size, added updated_at |

### Tables ALTERED (1)

| Table | Change |
|-------|--------|
| `users` | Add `updated_at` column, add CHECK on role |

### Indexes CREATED (8)

| Index | Table | Columns |
|-------|-------|---------|
| `idx_diagnostic_status` | `diagnostic_data` | `status` |
| `idx_pipeline_user_id` | `pipeline` | `user_id` |
| `idx_pipeline_status_composite` | `pipeline` | `research_status, brand_brain_status, assets_status` |
| `idx_audio_user_id` | `audio_recordings` | `user_id` |
| `idx_audio_user_module` | `audio_recordings` | `user_id, module` |
| `idx_files_user_id` | `uploaded_files` | `user_id` |
| `idx_files_user_category` | `uploaded_files` | `user_id, category` |
| `idx_users_role` | `users` | `role` |

### Triggers CREATED (4)

| Trigger | Table | Purpose |
|---------|-------|---------|
| `trg_users_updated_at` | `users` | Auto-set updated_at on UPDATE |
| `trg_diagnostic_updated_at` | `diagnostic_data` | Auto-set updated_at on UPDATE |
| `trg_pipeline_updated_at` | `pipeline` | Auto-set updated_at on UPDATE |
| `trg_files_updated_at` | `uploaded_files` | Auto-set updated_at on UPDATE |

---

## 3. Dependencies & Execution Order

```
001_pre_check.sql          — Verify current state, check for orphaned data
002_backup_legacy_data.sql — Export legacy table data before dropping
003_add_users_updated_at.sql — Add updated_at to users (safe ALTER ADD COLUMN)
004_recreate_diagnostic.sql — Recreate diagnostic_data with constraints
005_recreate_pipeline.sql  — Recreate pipeline with constraints
006_recreate_audio.sql     — Recreate audio_recordings with constraints
007_recreate_files.sql     — Recreate uploaded_files with constraints
008_drop_legacy_tables.sql — Drop user_progress, tasks, submissions
009_create_indexes.sql     — Create all indexes
010_create_triggers.sql    — Create updated_at triggers
011_post_verify.sql        — Final verification
```

**Critical dependency:** Tables must be recreated BEFORE legacy tables are dropped, because `user_progress` data may need to be checked against `diagnostic_data`.

---

## 4. Data Migration

### Legacy Data Assessment

At this scale (< 100 rows), we use direct operations — no batching needed.

**Pre-migration checks (001_pre_check.sql):**

```sql
-- Count rows in each table
SELECT 'users' as tbl, COUNT(*) as cnt FROM users
UNION ALL SELECT 'user_progress', COUNT(*) FROM user_progress
UNION ALL SELECT 'diagnostic_data', COUNT(*) FROM diagnostic_data
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'submissions', COUNT(*) FROM submissions
UNION ALL SELECT 'pipeline', COUNT(*) FROM pipeline
UNION ALL SELECT 'audio_recordings', COUNT(*) FROM audio_recordings
UNION ALL SELECT 'uploaded_files', COUNT(*) FROM uploaded_files;

-- Check for orphaned user_progress rows (data in user_progress but NOT in diagnostic_data)
SELECT up.user_id, up.email, up.name
FROM user_progress up
LEFT JOIN diagnostic_data dd ON up.user_id = dd.user_id
WHERE dd.id IS NULL
  AND up.form_data IS NOT NULL
  AND up.form_data != '{}';
```

**If orphaned rows exist:** Migration 002 will handle them before proceeding.

### Recreate Pattern (SQLite)

Since SQLite doesn't support ADD CONSTRAINT, each table is recreated:

```
1. CREATE TABLE table_new (... with constraints ...)
2. INSERT INTO table_new SELECT ... FROM table_old
3. DROP TABLE table_old
4. ALTER TABLE table_new RENAME TO table
```

All within a single transaction per table for atomicity.

---

## 5. Safety & Rollback

### Pre-Migration

```bash
# 1. Stop the server
# 2. Create backup
cp data/prosperus.db data/prosperus-backup-$(date +%Y%m%d-%H%M%S).db

# 3. Verify backup
ls -la data/prosperus-backup-*.db
```

### Rollback Procedure

If ANY migration step fails:

```bash
# 1. Stop the server (if running)
# 2. Restore from backup
cp data/prosperus-backup-YYYYMMDD-HHMMSS.db data/prosperus.db

# 3. Restart server with old code
```

**Rollback is instant** — just copy the backup file back. This is the advantage of SQLite for small databases.

### Point of No Return

There is no point of no return. The backup file preserves the exact state. Even after all migrations are applied, rollback is possible by restoring the backup file (and reverting server.cjs code changes).

---

## 6. Testing Strategy

### Dry Run

```bash
# Copy DB for testing
cp data/prosperus.db data/prosperus-test.db

# Run migrations against test copy
sqlite3 data/prosperus-test.db < migrations/001_pre_check.sql
# ... (run each migration)
sqlite3 data/prosperus-test.db < migrations/011_post_verify.sql

# Verify test DB
sqlite3 data/prosperus-test.db "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
# Expected: audio_recordings, diagnostic_data, pipeline, uploaded_files, users

# Clean up
rm data/prosperus-test.db
```

### Post-Migration Smoke Tests

```sql
-- 1. Tables exist (should be exactly 5)
SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;
-- Expected: audio_recordings, diagnostic_data, pipeline, uploaded_files, users

-- 2. Legacy tables removed
SELECT COUNT(*) FROM sqlite_master WHERE name IN ('user_progress', 'tasks', 'submissions');
-- Expected: 0

-- 3. Foreign keys enforced
PRAGMA foreign_keys;
-- Expected: 1

-- 4. WAL mode active
PRAGMA journal_mode;
-- Expected: wal

-- 5. All indexes exist (should be 8 custom + auto PKs)
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name;

-- 6. All triggers exist (should be 4)
SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name;

-- 7. Data integrity — no orphaned records
SELECT 'diagnostic_data' as tbl, COUNT(*) as orphans
FROM diagnostic_data dd LEFT JOIN users u ON dd.user_id = u.id WHERE u.id IS NULL
UNION ALL
SELECT 'pipeline', COUNT(*) FROM pipeline p LEFT JOIN users u ON p.user_id = u.id WHERE u.id IS NULL
UNION ALL
SELECT 'audio_recordings', COUNT(*) FROM audio_recordings ar LEFT JOIN users u ON ar.user_id = u.id WHERE u.id IS NULL
UNION ALL
SELECT 'uploaded_files', COUNT(*) FROM uploaded_files uf LEFT JOIN users u ON uf.user_id = u.id WHERE u.id IS NULL;
-- Expected: all 0

-- 8. Row counts match pre-migration
SELECT 'users' as tbl, COUNT(*) as cnt FROM users
UNION ALL SELECT 'diagnostic_data', COUNT(*) FROM diagnostic_data
UNION ALL SELECT 'pipeline', COUNT(*) FROM pipeline
UNION ALL SELECT 'audio_recordings', COUNT(*) FROM audio_recordings
UNION ALL SELECT 'uploaded_files', COUNT(*) FROM uploaded_files;

-- 9. FK CASCADE works
PRAGMA foreign_key_check;
-- Expected: no output (no violations)
```

---

## 7. Operational Runbook

### Prerequisites

- Node.js server stopped
- Access to `data/prosperus.db`
- SQLite3 CLI available (or run via Node.js)

### Step-by-Step Execution

```bash
# === PHASE 0: PREPARE ===

# Stop the server
# (Ctrl+C if running in terminal, or kill the process)

# Navigate to project root
cd mentoria-main

# Create backup
cp data/prosperus.db "data/prosperus-backup-$(date +%Y%m%d-%H%M%S).db"

# Verify backup exists and matches size
ls -la data/prosperus*.db


# === PHASE 1: PRE-CHECK ===
sqlite3 data/prosperus.db < migrations/001_pre_check.sql
# Review output — check for orphaned data


# === PHASE 2: BACKUP LEGACY DATA ===
sqlite3 data/prosperus.db < migrations/002_backup_legacy_data.sql
# Creates JSON exports of legacy tables in case needed


# === PHASE 3: ENABLE PRAGMAS + ALTER USERS ===
sqlite3 data/prosperus.db < migrations/003_add_users_updated_at.sql
# Adds updated_at to users, enables WAL


# === PHASE 4-7: RECREATE TABLES ===
sqlite3 data/prosperus.db < migrations/004_recreate_diagnostic.sql
sqlite3 data/prosperus.db < migrations/005_recreate_pipeline.sql
sqlite3 data/prosperus.db < migrations/006_recreate_audio.sql
sqlite3 data/prosperus.db < migrations/007_recreate_files.sql


# === PHASE 8: DROP LEGACY ===
sqlite3 data/prosperus.db < migrations/008_drop_legacy_tables.sql


# === PHASE 9-10: INDEXES + TRIGGERS ===
sqlite3 data/prosperus.db < migrations/009_create_indexes.sql
sqlite3 data/prosperus.db < migrations/010_create_triggers.sql


# === PHASE 11: VERIFY ===
sqlite3 data/prosperus.db < migrations/011_post_verify.sql
# Review all output — every check should pass


# === PHASE 12: RESTART ===
# Update server.cjs code (see Application Changes section)
# Start the server
node server.cjs
# Test: visit http://localhost:3005/health
```

### Success Criteria

- All 11 migration scripts run without errors
- Post-verification shows exactly 5 tables
- No orphaned records
- Foreign key check passes
- WAL mode active
- Server starts and responds to /health

---

## 8. Application Changes Required

After applying migrations, `server.cjs` needs these updates:

### 1. Add PRAGMAs on connection

```javascript
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    // Enable WAL mode and foreign keys
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA busy_timeout = 5000');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA cache_size = -8000');
    console.log('Database connected:', DB_PATH);
    initializeDatabase();
  }
});
```

### 2. Remove legacy table creation from initializeDatabase()

Remove CREATE TABLE statements for: `user_progress`, `tasks`, `submissions`

### 3. Simplify user delete endpoint

Replace the 8-level nested callback cascade with:
```javascript
// With FK ON DELETE CASCADE, just delete the user
db.run('DELETE FROM users WHERE id = ?', [userUid], function(err) {
  // All child records automatically deleted
});
```

### 4. Remove legacy migration code

Remove the PRAGMA table_info checks for `user_progress` and `uploaded_files` column additions.

### 5. Remove user_progress references

Replace all `user_progress` reads/writes with `diagnostic_data` equivalents.

---

*Generated by Dara (Data Engineer Agent) — Synkra AIOS*
