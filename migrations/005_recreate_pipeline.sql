-- ============================================
-- Migration 005: Recreate pipeline with constraints
-- Purpose: Add FK, CHECK constraints
-- Pattern: Create new → Copy data → Drop old → Rename
-- ============================================

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Step 1: Create new table with all constraints
CREATE TABLE pipeline_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  research_dossier JSON,
  research_status TEXT DEFAULT 'pending'
    CHECK(research_status IN ('pending', 'in_progress', 'complete')),
  research_completed_at DATETIME,
  brand_brain JSON,
  brand_brain_status TEXT DEFAULT 'pending'
    CHECK(brand_brain_status IN ('pending', 'generated', 'danilo_review', 'mentor_review', 'approved')),
  brand_brain_version INTEGER DEFAULT 0,
  brand_brain_completed_at DATETIME,
  section_approvals JSON,
  review_notes JSON,
  assets JSON,
  assets_status TEXT DEFAULT 'pending'
    CHECK(assets_status IN ('pending', 'ready', 'delivered')),
  assets_delivered_at DATETIME,
  toolkit_enabled INTEGER DEFAULT 0
    CHECK(toolkit_enabled IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy data, sanitizing invalid statuses
INSERT INTO pipeline_new (
  id, user_id,
  research_dossier, research_status, research_completed_at,
  brand_brain, brand_brain_status, brand_brain_version, brand_brain_completed_at,
  section_approvals, review_notes,
  assets, assets_status, assets_delivered_at,
  toolkit_enabled, created_at, updated_at
)
SELECT
  id, user_id,
  research_dossier,
  CASE
    WHEN research_status IN ('pending', 'in_progress', 'complete') THEN research_status
    ELSE 'pending'
  END,
  research_completed_at,
  brand_brain,
  CASE
    WHEN brand_brain_status IN ('pending', 'generated', 'danilo_review', 'mentor_review', 'approved') THEN brand_brain_status
    ELSE 'pending'
  END,
  COALESCE(brand_brain_version, 0),
  brand_brain_completed_at,
  section_approvals, review_notes,
  assets,
  CASE
    WHEN assets_status IN ('pending', 'ready', 'delivered') THEN assets_status
    ELSE 'pending'
  END,
  assets_delivered_at,
  COALESCE(toolkit_enabled, 0),
  COALESCE(created_at, CURRENT_TIMESTAMP),
  COALESCE(updated_at, CURRENT_TIMESTAMP)
FROM pipeline
WHERE user_id IN (SELECT id FROM users);

-- Step 3: Drop old table
DROP TABLE pipeline;

-- Step 4: Rename
ALTER TABLE pipeline_new RENAME TO pipeline;

COMMIT;

PRAGMA foreign_keys = ON;

SELECT 'Migration 005 complete: pipeline recreated with constraints.' AS status;
SELECT COUNT(*) AS rows_migrated FROM pipeline;
