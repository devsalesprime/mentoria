-- ============================================
-- Migration 010: Create Triggers
-- Purpose: Auto-update updated_at on row modifications
-- Safe: Non-destructive, additive only
-- ============================================

PRAGMA foreign_keys = ON;

-- users: auto-update updated_at
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
  AFTER UPDATE ON users
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at  -- Prevent infinite recursion
  BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
  END;

-- diagnostic_data: auto-update updated_at
CREATE TRIGGER IF NOT EXISTS trg_diagnostic_updated_at
  AFTER UPDATE ON diagnostic_data
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE diagnostic_data SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
  END;

-- pipeline: auto-update updated_at
CREATE TRIGGER IF NOT EXISTS trg_pipeline_updated_at
  AFTER UPDATE ON pipeline
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE pipeline SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
  END;

-- uploaded_files: auto-update updated_at
CREATE TRIGGER IF NOT EXISTS trg_files_updated_at
  AFTER UPDATE ON uploaded_files
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE uploaded_files SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
  END;

-- Verify
SELECT '=== TRIGGERS CREATED ===' AS info;
SELECT name, tbl_name FROM sqlite_master
WHERE type = 'trigger'
ORDER BY tbl_name, name;

SELECT 'Migration 010 complete: All triggers created.' AS status;
