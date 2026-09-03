-- ============================================
-- Migration 016: cohort_config (chave/valor editavel pelo admin na aba Cohort)
-- Purpose: textos de configuracao do Script 7 Passos (hoje: prazo_materiais, mostrado na tela Materiais)
-- Pattern: idempotent (CREATE TABLE IF NOT EXISTS)
-- NOTE: routes/script.cjs e routes/admin-cohort.cjs executam este DDL ao subir (utils/validation-materials.cjs);
--       server.cjs nao precisou mudar. Este arquivo e o registro para migrations/run-all.sh.
-- ============================================

CREATE TABLE IF NOT EXISTS cohort_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('016', 'cohort_config key/value (prazo_materiais)');

SELECT 'Migration 016 complete: cohort_config.' AS status;
