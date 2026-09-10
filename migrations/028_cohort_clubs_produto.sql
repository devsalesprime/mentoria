-- ============================================
-- Migration 028: cohort_clubs.produto (decisao do Danilo em 10/09)
-- Purpose: separar QUEM esta no roster do Exclusive de QUEM ganhou um clube proprio ao entrar.
--            'exclusive' -> clube do roster, criado pela equipe (Caio) na aba Cohort do admin.
--                           Todos os clubes que ja existiam sao roster: por isso o DEFAULT.
--            'club'      -> clube de uma pessoa so, criado sozinho no login de quem tem negocio ganho
--                           no HubSpot e nao esta no roster (routes/auth.cjs, slug 'u-<nome>-<hash>').
--          users.cohort recebe o mesmo valor ('exclusive' ou 'club') e os dois abrem o Script 7 Passos;
--          a diferenca serve para o admin ler a lista e para nunca tratar clube proprio como roster.
-- Pattern: ALTER TABLE ADD COLUMN; "duplicate column" e ignorado pelo server.cjs (mesmo molde da 027).
--          NOT NULL com DEFAULT: o SQLite preenche as linhas antigas com 'exclusive'.
-- ============================================

ALTER TABLE cohort_clubs ADD COLUMN produto TEXT NOT NULL DEFAULT 'exclusive' CHECK(produto IN ('exclusive', 'club'));

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('028', 'cohort_clubs.produto (exclusive = roster, club = clube proprio criado no login)');

SELECT 'Migration 028 complete: cohort_clubs.produto.' AS status;
