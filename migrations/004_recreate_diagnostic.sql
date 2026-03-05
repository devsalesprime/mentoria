-- ============================================
-- Migration 004: Recreate diagnostic_data with constraints
-- Purpose: Add FK, CHECK constraints (SQLite requires table recreation)
-- Pattern: Create new → Copy data → Drop old → Rename
-- ============================================

PRAGMA foreign_keys = OFF;  -- Must be OFF during table recreation

BEGIN TRANSACTION;

-- Step 1: Create new table with all constraints
CREATE TABLE diagnostic_data_new (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  pre_module JSON,
  mentor JSON,
  mentee JSON,
  method JSON,
  offer JSON,
  current_module TEXT DEFAULT 'pre_module'
    CHECK(current_module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')),
  current_step INTEGER DEFAULT 0,
  progress_percentage INTEGER DEFAULT 0
    CHECK(progress_percentage BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK(status IN ('in_progress', 'submitted')),
  submitted_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy data from old table
-- Clamp progress_percentage to valid range just in case
INSERT INTO diagnostic_data_new (
  id, user_id, email, name,
  pre_module, mentor, mentee, method, offer,
  current_module, current_step, progress_percentage,
  status, submitted_at, created_at, updated_at
)
SELECT
  id, user_id, email, name,
  pre_module, mentor, mentee, method, offer,
  CASE
    WHEN current_module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')
    THEN current_module
    ELSE 'pre_module'
  END,
  COALESCE(current_step, 0),
  CASE
    WHEN progress_percentage < 0 THEN 0
    WHEN progress_percentage > 100 THEN 100
    ELSE COALESCE(progress_percentage, 0)
  END,
  CASE
    WHEN status IN ('in_progress', 'submitted') THEN status
    ELSE 'in_progress'
  END,
  submitted_at,
  COALESCE(created_at, CURRENT_TIMESTAMP),
  COALESCE(last_updated, CURRENT_TIMESTAMP)
FROM diagnostic_data
WHERE user_id IN (SELECT id FROM users);  -- Only copy rows with valid user reference

-- Step 3: Drop old table
DROP TABLE diagnostic_data;

-- Step 4: Rename new table
ALTER TABLE diagnostic_data_new RENAME TO diagnostic_data;

COMMIT;

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;

-- Verify
SELECT 'Migration 004 complete: diagnostic_data recreated with constraints.' AS status;
SELECT COUNT(*) AS rows_migrated FROM diagnostic_data;
