-- ============================================
-- Migration 003: Add updated_at to users + Enable WAL
-- Purpose: Add missing audit column, enable WAL mode
-- Safe: ALTER ADD COLUMN is non-destructive in SQLite
-- ============================================

-- Enable WAL mode (persistent — survives connection close)
PRAGMA journal_mode = WAL;

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Add updated_at column to users (if not exists)
-- SQLite doesn't support IF NOT EXISTS for ALTER, so we use error tolerance
ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Backfill updated_at for existing rows
UPDATE users SET updated_at = created_at WHERE updated_at IS NULL;

SELECT 'Migration 003 complete: users.updated_at added, WAL enabled.' AS status;
