-- ============================================
-- Migration 014: Add priorities, feedback, and asset visibility columns
-- Purpose: Support the insights-first post-diagnostic experience (EPIC-PV-001)
-- Pattern: Safe ALTER TABLE (same approach as expert_notes, educational_suggestions)
-- Story: PV-1.1
-- ============================================

-- 1. Priorities in diagnostic_data
ALTER TABLE diagnostic_data ADD COLUMN priorities JSON DEFAULT NULL;

-- 2. Personalized feedback in pipeline
ALTER TABLE pipeline ADD COLUMN personalized_feedback JSON DEFAULT NULL;
ALTER TABLE pipeline ADD COLUMN feedback_status TEXT DEFAULT 'pending';
ALTER TABLE pipeline ADD COLUMN feedback_delivered_at DATETIME;

-- 3. Asset visibility control in pipeline
ALTER TABLE pipeline ADD COLUMN show_assets_to_user INTEGER DEFAULT 0;

-- 4. Migrate existing users with assets — they keep visibility
UPDATE pipeline SET show_assets_to_user = 1 WHERE assets_status IN ('ready', 'delivered');

SELECT 'Migration 014 complete: priorities, feedback, and asset visibility columns added.' AS status;
