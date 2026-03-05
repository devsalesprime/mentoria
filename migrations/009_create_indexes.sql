-- ============================================
-- Migration 009: Create Indexes
-- Purpose: Add performance indexes on FK and query columns
-- Safe: Non-destructive, additive only
-- ============================================

PRAGMA foreign_keys = ON;

-- diagnostic_data indexes
-- (user_id already has UNIQUE index from constraint)
CREATE INDEX IF NOT EXISTS idx_diagnostic_status
  ON diagnostic_data(status);

-- pipeline indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_user_id
  ON pipeline(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_status_composite
  ON pipeline(research_status, brand_brain_status, assets_status);

-- audio_recordings indexes
CREATE INDEX IF NOT EXISTS idx_audio_user_id
  ON audio_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_audio_user_module
  ON audio_recordings(user_id, module);

-- uploaded_files indexes
CREATE INDEX IF NOT EXISTS idx_files_user_id
  ON uploaded_files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_user_category
  ON uploaded_files(user_id, category);

-- users indexes (role for admin filtering)
CREATE INDEX IF NOT EXISTS idx_users_role
  ON users(role);

-- Verify
SELECT '=== INDEXES CREATED ===' AS info;
SELECT name, tbl_name FROM sqlite_master
WHERE type = 'index' AND name LIKE 'idx_%'
ORDER BY tbl_name, name;

SELECT 'Migration 009 complete: All indexes created.' AS status;
