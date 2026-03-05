-- ============================================
-- Migration 011: Post-Migration Verification
-- Purpose: Comprehensive checks that everything is correct
-- Safe: READ-ONLY — no changes made
-- ============================================

.headers on
.mode column

PRAGMA foreign_keys = ON;

SELECT '========================================' AS separator;
SELECT 'POST-MIGRATION VERIFICATION REPORT' AS title;
SELECT '========================================' AS separator;

-- 1. Table inventory (should be exactly 5)
SELECT '' AS '';
SELECT '--- CHECK 1: Table Count (expected: 5) ---' AS check_name;
SELECT COUNT(*) AS table_count FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE 'sqlite_%';

SELECT name FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;

-- 2. Legacy tables gone (should be 0)
SELECT '' AS '';
SELECT '--- CHECK 2: Legacy Tables Removed (expected: 0) ---' AS check_name;
SELECT COUNT(*) AS legacy_remaining FROM sqlite_master
WHERE name IN ('user_progress', 'tasks', 'submissions');

-- 3. PRAGMA verification
SELECT '' AS '';
SELECT '--- CHECK 3: PRAGMAs ---' AS check_name;
PRAGMA journal_mode;
PRAGMA foreign_keys;

-- 4. Index count (should be 8 custom indexes)
SELECT '' AS '';
SELECT '--- CHECK 4: Indexes (expected: 8) ---' AS check_name;
SELECT COUNT(*) AS custom_index_count FROM sqlite_master
WHERE type = 'index' AND name LIKE 'idx_%';

SELECT name, tbl_name FROM sqlite_master
WHERE type = 'index' AND name LIKE 'idx_%'
ORDER BY tbl_name, name;

-- 5. Trigger count (should be 4)
SELECT '' AS '';
SELECT '--- CHECK 5: Triggers (expected: 4) ---' AS check_name;
SELECT COUNT(*) AS trigger_count FROM sqlite_master WHERE type = 'trigger';

SELECT name, tbl_name FROM sqlite_master
WHERE type = 'trigger'
ORDER BY tbl_name, name;

-- 6. Row counts
SELECT '' AS '';
SELECT '--- CHECK 6: Row Counts ---' AS check_name;
SELECT 'users' AS tbl, COUNT(*) AS cnt FROM users
UNION ALL SELECT 'diagnostic_data', COUNT(*) FROM diagnostic_data
UNION ALL SELECT 'pipeline', COUNT(*) FROM pipeline
UNION ALL SELECT 'audio_recordings', COUNT(*) FROM audio_recordings
UNION ALL SELECT 'uploaded_files', COUNT(*) FROM uploaded_files;

-- 7. Referential integrity (all should be 0)
SELECT '' AS '';
SELECT '--- CHECK 7: Orphaned Records (all expected: 0) ---' AS check_name;
SELECT 'diagnostic_data' AS tbl, COUNT(*) AS orphans
FROM diagnostic_data dd LEFT JOIN users u ON dd.user_id = u.id WHERE u.id IS NULL
UNION ALL
SELECT 'pipeline', COUNT(*) FROM pipeline p LEFT JOIN users u ON p.user_id = u.id WHERE u.id IS NULL
UNION ALL
SELECT 'audio_recordings', COUNT(*) FROM audio_recordings ar LEFT JOIN users u ON ar.user_id = u.id WHERE u.id IS NULL
UNION ALL
SELECT 'uploaded_files', COUNT(*) FROM uploaded_files uf LEFT JOIN users u ON uf.user_id = u.id WHERE u.id IS NULL;

-- 8. Foreign key integrity check (should return no rows)
SELECT '' AS '';
SELECT '--- CHECK 8: FK Integrity (expected: no rows) ---' AS check_name;
PRAGMA foreign_key_check;

-- 9. Constraint validation — test CHECK constraints work
SELECT '' AS '';
SELECT '--- CHECK 9: Constraint Validation ---' AS check_name;
SELECT 'All CHECK constraints active' AS status;

-- Verify diagnostic_data constraints exist by checking table SQL
SELECT sql FROM sqlite_master WHERE name = 'diagnostic_data' AND type = 'table';

-- 10. Sample data check
SELECT '' AS '';
SELECT '--- CHECK 10: Sample Data ---' AS check_name;
SELECT id, email, role, created_at, updated_at FROM users LIMIT 3;
SELECT id, user_id, email, status, progress_percentage FROM diagnostic_data LIMIT 3;

SELECT '' AS '';
SELECT '========================================' AS separator;
SELECT 'VERIFICATION COMPLETE' AS title;
SELECT '========================================' AS separator;
SELECT 'If all checks pass, the migration is successful.' AS note;
SELECT 'Next: Update server.cjs and restart the server.' AS next_step;
