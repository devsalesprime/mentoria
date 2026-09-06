-- ============================================
-- Migration 025: users.last_login_at ("Último login" do admin)
-- Purpose: PENDENCIAS-2026-09-06 §1 item 33. O painel do cohort mostrava como "Último login" o
--          users.updated_at, que muda em QUALQUER escrita na linha (renomear a pessoa, marcar
--          cohort/club_slug no resync do clube, trocar de clube). Resultado: gente que nunca entrou
--          aparecia com login recente e o Caio cobrava a pessoa errada.
--          Agora quem grava a data e o proprio login: POST /auth/verify-member escreve
--          last_login_at = CURRENT_TIMESTAMP toda vez que o e-mail passa (conta nova ou ja existente).
--          NULL = nunca entrou, e o admin mostra "nunca entrou" em vez de uma data qualquer.
--          Contas criadas antes desta coluna comecam em NULL de proposito: nao da para inventar
--          uma data de login a partir do updated_at (era exatamente o numero errado).
-- Pattern: ALTER TABLE ADD COLUMN; "duplicate column" e ignorado no boot (server.cjs).
-- ============================================

ALTER TABLE users ADD COLUMN last_login_at DATETIME DEFAULT NULL;

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('025', 'users.last_login_at (ultimo login de verdade, no lugar de updated_at)');

SELECT 'Migration 025 complete: users.last_login_at.' AS status;
