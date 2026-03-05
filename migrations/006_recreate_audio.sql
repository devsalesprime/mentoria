-- ============================================
-- Migration 006: Recreate audio_recordings with constraints
-- Purpose: Add FK, CHECK constraints
-- Pattern: Create new → Copy data → Drop old → Rename
-- ============================================

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Step 1: Create new table with constraints
CREATE TABLE audio_recordings_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL
    CHECK(module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')),
  question_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  transcript TEXT,
  duration_seconds INTEGER
    CHECK(duration_seconds >= 0),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy data, sanitizing invalid values
INSERT INTO audio_recordings_new (
  id, user_id, module, question_id, file_path,
  transcript, duration_seconds, created_at
)
SELECT
  id, user_id,
  CASE
    WHEN module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer') THEN module
    ELSE 'mentor'  -- Safe fallback
  END,
  question_id, file_path,
  transcript,
  CASE WHEN duration_seconds < 0 THEN 0 ELSE duration_seconds END,
  COALESCE(created_at, CURRENT_TIMESTAMP)
FROM audio_recordings
WHERE user_id IN (SELECT id FROM users);

-- Step 3: Drop old table
DROP TABLE audio_recordings;

-- Step 4: Rename
ALTER TABLE audio_recordings_new RENAME TO audio_recordings;

COMMIT;

PRAGMA foreign_keys = ON;

SELECT 'Migration 006 complete: audio_recordings recreated with constraints.' AS status;
SELECT COUNT(*) AS rows_migrated FROM audio_recordings;
