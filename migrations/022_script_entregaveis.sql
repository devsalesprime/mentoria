-- ============================================
-- Migration 022: script_entregaveis (arquivos que o worker publica para uma versao do script)
-- Purpose: a apresentacao comercial (tipo `slides`) de UMA versao: pptx, pdf, notas (.md) e contato (.png).
--          O worker (a Naia) publica em PUT /api/jobs/:id/entregavel (multipart, Bearer da fila);
--          o app grava os arquivos em DATA_DIR/entregaveis/<club_slug>/v<versao>/<tipo>/<campo><ext>
--          e uma linha por (clube, versao, tipo). Publicar de novo sobrescreve os arquivos e a linha.
--          `arquivos` = [{ nome, campo, path, bytes, mime }]; `meta` = JSON livre do worker.
--          O membro le em GET /api/script/versoes/:versao/entregaveis e baixa em .../:tipo/:campo;
--          o admin, em /api/admin/clubs/:slug/script-versoes/:versao/entregaveis.
-- Pattern: idempotent (CREATE TABLE IF NOT EXISTS). Sem FK de proposito (o DDL roda pelo router,
--          antes do schema principal: utils/script-versions.cjs ensureScriptVersionsTables).
-- ============================================

CREATE TABLE IF NOT EXISTS script_entregaveis (
  id TEXT PRIMARY KEY,
  club_slug TEXT NOT NULL,
  versao INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'slides',
  arquivos JSON NOT NULL DEFAULT '[]',
  meta JSON,
  job_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(club_slug, versao, tipo)
);
CREATE INDEX IF NOT EXISTS idx_script_entregaveis_club_versao ON script_entregaveis(club_slug, versao);

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('022', 'script_entregaveis (apresentacao comercial por versao do script)');

SELECT 'Migration 022 complete: script_entregaveis.' AS status;
