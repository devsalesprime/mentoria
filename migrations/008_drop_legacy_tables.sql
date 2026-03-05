-- ============================================
-- Migration 008: Drop Legacy Tables
-- Purpose: Remove user_progress, tasks, submissions
-- Safe: Data already migrated in 002, tables confirmed unused
-- ============================================

PRAGMA foreign_keys = ON;

-- Final safety check before dropping
SELECT '=== LEGACY TABLE FINAL CHECK ===' AS info;

SELECT 'user_progress' AS tbl, COUNT(*) AS remaining_rows FROM user_progress;
SELECT 'tasks' AS tbl, COUNT(*) AS remaining_rows FROM tasks;
SELECT 'submissions' AS tbl, COUNT(*) AS remaining_rows FROM submissions;

-- Drop legacy tables
DROP TABLE IF EXISTS user_progress;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS submissions;

-- Verify they're gone
SELECT '=== TABLES AFTER DROP ===' AS info;
SELECT name FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;

SELECT 'Migration 008 complete: Legacy tables dropped.' AS status;
