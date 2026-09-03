-- ============================================
-- Migration 015: Cohort (clubes do Exclusive) + Ficha do Script (7 passos)
-- Purpose: 1 ficha por clube, socios revisam a mesma; login liberado por cohort_members
-- Pattern: idempotent (CREATE TABLE IF NOT EXISTS + ALTER TABLE guarded by "duplicate column")
-- NOTE: server.cjs initializeDatabase() applies the same statements on boot.
--       This file is the record for migrations/run-all.sh; running it twice is safe
--       except for the ALTER TABLE lines (sqlite has no ADD COLUMN IF NOT EXISTS).
-- ============================================

-- 1. Clubes do cohort (1 clube = 1 negocio no HubSpot, 1 ou mais socios)
CREATE TABLE IF NOT EXISTS cohort_clubs (
  slug TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Membros (e-mail minusculo = chave de login)
CREATE TABLE IF NOT EXISTS cohort_members (
  email TEXT PRIMARY KEY,
  club_slug TEXT NOT NULL REFERENCES cohort_clubs(slug) ON DELETE CASCADE,
  nome TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cohort_members_club ON cohort_members(club_slug);

-- 3. Usuario marcado com cohort + clube no login
ALTER TABLE users ADD COLUMN cohort TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN club_slug TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_users_club_slug ON users(club_slug);

-- 4. Ficha do script (1 por clube)
CREATE TABLE IF NOT EXISTS script_fichas (
  id TEXT PRIMARY KEY,
  club_slug TEXT UNIQUE NOT NULL REFERENCES cohort_clubs(slug) ON DELETE CASCADE,
  fields JSON NOT NULL DEFAULT '{}',
  materials JSON NOT NULL DEFAULT '{}',
  materials_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(materials_status IN ('pending', 'submitted')),
  materials_submitted_at DATETIME,
  ficha_status TEXT NOT NULL DEFAULT 'vazia'
    CHECK(ficha_status IN ('vazia', 'pre_preenchida', 'em_revisao', 'confirmada')),
  prefill_meta JSON,
  prefilled_at DATETIME,
  reviewed_at DATETIME,
  last_user_activity_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS trg_script_fichas_updated_at AFTER UPDATE ON script_fichas FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN UPDATE script_fichas SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id; END;

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('015', 'Cohort clubs/members, users.cohort/club_slug, script_fichas');

SELECT 'Migration 015 complete: cohort + script_fichas.' AS status;
