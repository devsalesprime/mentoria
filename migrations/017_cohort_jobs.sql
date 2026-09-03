-- ============================================
-- Migration 017: cohort_jobs (fila de trabalho para o worker externo, a Naia no VPS)
-- Purpose: 1 job por clique em "Confirmar e ir para a ficha" (tipo prefill); o worker puxa por
--          POST /api/jobs/next, le materiais/ficha, grava o pre-preenchimento e fecha com PATCH.
-- Pattern: idempotent (CREATE TABLE IF NOT EXISTS). Sem FK para cohort_clubs de proposito:
--          o DDL roda pelos routers antes do schema principal (utils/validation-materials.cjs).
-- NOTE: routes/script.cjs, routes/admin-cohort.cjs e routes/jobs.cjs executam este DDL ao subir;
--       server.cjs nao precisou mudar para a tabela. Este arquivo e o registro para migrations/run-all.sh.
-- ============================================

CREATE TABLE IF NOT EXISTS cohort_jobs (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'prefill',
  club_slug TEXT NOT NULL,
  email TEXT NOT NULL,
  notify_phone TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'done', 'error', 'needs_human')),
  attempts INTEGER NOT NULL DEFAULT 0,
  payload JSON,
  result JSON,
  error TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  finished_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cohort_jobs_status_created ON cohort_jobs(status, created_at);

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('017', 'cohort_jobs: fila de pre-preenchimento para o worker externo');

SELECT 'Migration 017 complete: cohort_jobs.' AS status;
