-- ============================================
-- Migration 012: Simplify pipeline state machine
-- Purpose: Reduce brand_brain_status to 3 states (pending, generating, ready)
--          Remove validation/approval columns no longer needed
-- Pattern: Create new → Copy data → Drop old → Rename
-- Story: DX-1.1
-- ============================================

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Step 1: Create new table with simplified states
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
    CHECK(brand_brain_status IN ('pending', 'generating', 'ready')),
  brand_brain_version INTEGER DEFAULT 0,
  brand_brain_completed_at DATETIME,
  expert_notes JSON,
  assets JSON,
  assets_status TEXT DEFAULT 'pending'
    CHECK(assets_status IN ('pending', 'ready', 'delivered')),
  assets_delivered_at DATETIME,
  toolkit_enabled INTEGER DEFAULT 0
    CHECK(toolkit_enabled IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy data, mapping old statuses to new simplified ones
-- Removed columns: section_approvals, review_notes, validation_summary,
--                   validation_status, validation_observations, validation_expert_notes
INSERT INTO pipeline_new (
  id, user_id,
  research_dossier, research_status, research_completed_at,
  brand_brain, brand_brain_status, brand_brain_version, brand_brain_completed_at,
  expert_notes,
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
    WHEN brand_brain_status = 'approved' THEN 'ready'
    WHEN brand_brain_status IN ('mentor_review', 'danilo_review', 'generated') THEN 'generating'
    WHEN brand_brain_status = 'pending' THEN 'pending'
    ELSE 'pending'
  END,
  COALESCE(brand_brain_version, 0),
  brand_brain_completed_at,
  expert_notes,
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

SELECT 'Migration 012 complete: pipeline states simplified (pending/generating/ready), validation columns removed.' AS status;
SELECT COUNT(*) AS rows_migrated FROM pipeline;
