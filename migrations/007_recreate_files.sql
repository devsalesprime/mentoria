-- ============================================
-- Migration 007: Recreate uploaded_files with constraints
-- Purpose: Add FK, CHECK constraints, add updated_at
-- Pattern: Create new → Copy data → Drop old → Rename
-- ============================================

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Step 1: Create new table with constraints
CREATE TABLE uploaded_files_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER
    CHECK(file_size >= 0),
  url TEXT,
  module TEXT DEFAULT 'general',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy data
INSERT INTO uploaded_files_new (
  id, user_id, category, file_name, file_path,
  file_type, file_size, url, module, created_at, updated_at
)
SELECT
  id, user_id, category, file_name, file_path,
  file_type,
  CASE WHEN file_size < 0 THEN 0 ELSE file_size END,
  url,
  COALESCE(module, 'general'),
  COALESCE(created_at, CURRENT_TIMESTAMP),
  COALESCE(created_at, CURRENT_TIMESTAMP)  -- Use created_at as initial updated_at
FROM uploaded_files
WHERE user_id IN (SELECT id FROM users);

-- Step 3: Drop old table
DROP TABLE uploaded_files;

-- Step 4: Rename
ALTER TABLE uploaded_files_new RENAME TO uploaded_files;

COMMIT;

PRAGMA foreign_keys = ON;

SELECT 'Migration 007 complete: uploaded_files recreated with constraints.' AS status;
SELECT COUNT(*) AS rows_migrated FROM uploaded_files;
