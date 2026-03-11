-- ============================================
-- Migration 013: Add educational_suggestions column
-- Purpose: Store AI-generated educational suggestions (3 lenses: marketing, vendas, modelo_de_negocios)
-- Pattern: Safe ALTER TABLE (same approach as expert_notes)
-- Story: DX-1.2
-- ============================================

ALTER TABLE pipeline ADD COLUMN educational_suggestions TEXT DEFAULT NULL;

SELECT 'Migration 013 complete: educational_suggestions column added to pipeline.' AS status;
