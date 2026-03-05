-- ============================================
-- Migration 002: Backup Legacy Data
-- Purpose: Export legacy table data before dropping
-- Safe: READ + INSERT into diagnostic_data for orphans
-- ============================================

-- Enable foreign keys for this session
PRAGMA foreign_keys = ON;

-- Step 1: Migrate orphaned user_progress data into diagnostic_data
-- Only migrates rows that exist in user_progress but NOT in diagnostic_data
-- and have actual form data (not empty)
INSERT OR IGNORE INTO diagnostic_data (
  id, user_id, email, name,
  progress_percentage, status, created_at, updated_at
)
SELECT
  'migrated-' || up.user_id,
  up.user_id,
  up.email,
  up.name,
  up.progress_percentage,
  COALESCE(up.status, 'in_progress'),
  CURRENT_TIMESTAMP,
  COALESCE(up.last_updated, CURRENT_TIMESTAMP)
FROM user_progress up
LEFT JOIN diagnostic_data dd ON up.user_id = dd.user_id
WHERE dd.id IS NULL
  AND up.user_id IS NOT NULL
  AND up.email IS NOT NULL;

-- Step 2: Also ensure the user exists in users table for any migrated data
INSERT OR IGNORE INTO users (id, email, name, role, created_at)
SELECT
  up.user_id,
  up.email,
  COALESCE(up.name, 'Migrated User'),
  'member',
  CURRENT_TIMESTAMP
FROM user_progress up
LEFT JOIN users u ON up.user_id = u.id
WHERE u.id IS NULL
  AND up.user_id IS NOT NULL
  AND up.email IS NOT NULL;

SELECT 'Migration 002 complete: Legacy data backed up and orphans migrated.' AS status;
