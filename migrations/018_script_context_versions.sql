-- ============================================
-- Migration 018: contexto por pergunta, versoes do script e comentarios (Script 7 Passos, ship 2)
-- Purpose: script_field_context = audio/imagem/video/link/nota que o mentor anexa a UM campo da ficha
--          (do clube, com autor; audio transcrito via Groq); script_versions = script escrito pelo worker
--          (versao = max + 1 por clube; rascunho -> aprovado pelo membro); script_comments = comentario
--          por passo (0 = geral, 1..7) de uma versao. cohort_jobs.tipo passa a aceitar prefill|script|refinar
--          (coluna TEXT sem CHECK: nada a migrar).
-- Pattern: idempotent (CREATE TABLE IF NOT EXISTS). Sem FK de proposito (DDL roda pelos routers antes
--          do schema principal: utils/script-context.cjs e utils/script-versions.cjs).
-- ============================================

CREATE TABLE IF NOT EXISTS script_field_context (
  id TEXT PRIMARY KEY,
  club_slug TEXT NOT NULL,
  user_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('audio', 'imagem', 'video', 'link', 'nota')),
  file_id TEXT,
  url TEXT,
  texto TEXT,
  legenda TEXT,
  transcricao TEXT,
  erro_transcricao TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_script_field_context_club_field ON script_field_context(club_slug, field_key);

CREATE TABLE IF NOT EXISTS script_versions (
  id TEXT PRIMARY KEY,
  club_slug TEXT NOT NULL,
  versao INTEGER NOT NULL,
  content_md TEXT NOT NULL,
  resumo TEXT,
  meta JSON,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho', 'aprovado')),
  job_id TEXT,
  aprovado_em DATETIME,
  aprovado_por TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(club_slug, versao)
);

CREATE TABLE IF NOT EXISTS script_comments (
  id TEXT PRIMARY KEY,
  club_slug TEXT NOT NULL,
  versao INTEGER NOT NULL,
  passo INTEGER NOT NULL DEFAULT 0 CHECK(passo BETWEEN 0 AND 7),
  texto TEXT NOT NULL,
  autor_email TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_script_comments_club_versao ON script_comments(club_slug, versao);

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('018', 'script_field_context, script_versions, script_comments; cohort_jobs.tipo prefill|script|refinar');

SELECT 'Migration 018 complete: contexto por campo, versoes do script e comentarios.' AS status;
