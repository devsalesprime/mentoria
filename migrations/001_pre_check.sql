-- ============================================
-- Migration 001: Pre-Check
-- Purpose: Verify current state before migration
-- Safe: READ-ONLY — no changes made
-- ============================================

.headers on
.mode column

-- 1. Current table inventory
SELECT '=== TABLE INVENTORY ===' AS info;
SELECT name, type FROM sqlite_master
WHERE type IN ('table', 'index', 'trigger')
  AND name NOT LIKE 'sqlite_%'
ORDER BY type, name;

-- 2. Row counts per table
SELECT '=== ROW COUNTS ===' AS info;
SELECT 'users' AS tbl, COUNT(*) AS cnt FROM users
UNION ALL SELECT 'user_progress', COUNT(*) FROM user_progress
UNION ALL SELECT 'diagnostic_data', COUNT(*) FROM diagnostic_data
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'submissions', COUNT(*) FROM submissions
UNION ALL SELECT 'pipeline', COUNT(*) FROM pipeline
UNION ALL SELECT 'audio_recordings', COUNT(*) FROM audio_recordings
UNION ALL SELECT 'uploaded_files', COUNT(*) FROM uploaded_files;

-- 3. Check for orphaned user_progress data
-- (rows in user_progress with NO matching diagnostic_data entry AND with actual form data)
SELECT '=== ORPHANED USER_PROGRESS (need migration) ===' AS info;
SELECT up.user_id, up.email, up.name, up.progress_percentage
FROM user_progress up
LEFT JOIN diagnostic_data dd ON up.user_id = dd.user_id
WHERE dd.id IS NULL
  AND up.form_data IS NOT NULL
  AND up.form_data != '{}'
  AND up.form_data != '{"mentor":{},"mentee":{},"method":{},"delivery":{}}';

-- 4. Check tasks table (should be empty or unused)
SELECT '=== TASKS TABLE CONTENT ===' AS info;
SELECT id, user_id, title, status FROM tasks LIMIT 10;

-- 5. Check submissions table
SELECT '=== SUBMISSIONS TABLE CONTENT ===' AS info;
SELECT id, user_id, module FROM submissions LIMIT 10;

-- 6. Current PRAGMA status
SELECT '=== CURRENT PRAGMAS ===' AS info;
PRAGMA journal_mode;
PRAGMA foreign_keys;

-- 7. Check for data that might violate new constraints
SELECT '=== POTENTIAL CONSTRAINT VIOLATIONS ===' AS info;

-- Users with invalid roles
SELECT 'users_invalid_role' AS chk, COUNT(*) AS cnt
FROM users WHERE role NOT IN ('member', 'admin');

-- Diagnostic with invalid status
SELECT 'diag_invalid_status' AS chk, COUNT(*) AS cnt
FROM diagnostic_data WHERE status NOT IN ('in_progress', 'submitted');

-- Diagnostic with invalid module
SELECT 'diag_invalid_module' AS chk, COUNT(*) AS cnt
FROM diagnostic_data WHERE current_module NOT IN ('pre_module', 'mentor', 'mentee', 'method', 'offer');

-- Diagnostic with out-of-range progress
SELECT 'diag_invalid_progress' AS chk, COUNT(*) AS cnt
FROM diagnostic_data WHERE progress_percentage < 0 OR progress_percentage > 100;

-- Pipeline with invalid statuses
SELECT 'pipe_invalid_research' AS chk, COUNT(*) AS cnt
FROM pipeline WHERE research_status NOT IN ('pending', 'in_progress', 'complete');

SELECT 'pipe_invalid_bb' AS chk, COUNT(*) AS cnt
FROM pipeline WHERE brand_brain_status NOT IN ('pending', 'generated', 'danilo_review', 'mentor_review', 'approved');

SELECT 'pipe_invalid_assets' AS chk, COUNT(*) AS cnt
FROM pipeline WHERE assets_status NOT IN ('pending', 'ready', 'delivered');

-- Audio with invalid modules
SELECT 'audio_invalid_module' AS chk, COUNT(*) AS cnt
FROM audio_recordings WHERE module NOT IN ('pre_module', 'mentor', 'mentee', 'method', 'offer');

-- Orphaned child records (user_id not in users)
SELECT 'diag_orphaned' AS chk, COUNT(*) AS cnt
FROM diagnostic_data dd LEFT JOIN users u ON dd.user_id = u.id WHERE u.id IS NULL;

SELECT 'pipe_orphaned' AS chk, COUNT(*) AS cnt
FROM pipeline p LEFT JOIN users u ON p.user_id = u.id WHERE u.id IS NULL;

SELECT 'audio_orphaned' AS chk, COUNT(*) AS cnt
FROM audio_recordings ar LEFT JOIN users u ON ar.user_id = u.id WHERE u.id IS NULL;

SELECT 'files_orphaned' AS chk, COUNT(*) AS cnt
FROM uploaded_files uf LEFT JOIN users u ON uf.user_id = u.id WHERE u.id IS NULL;

SELECT '=== PRE-CHECK COMPLETE ===' AS info;
SELECT '  Review output above. If constraint violations > 0, fix before migrating.' AS info;
SELECT '  If orphaned user_progress > 0, migration 002 will handle them.' AS info;
