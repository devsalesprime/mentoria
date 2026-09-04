-- ============================================
-- Migration 021: script_grifos (grifos do leitor "Seu script")
-- Purpose: o mentor seleciona um trecho de uma tela do script e marca com uma cor
--          (dourado = ajustar, verde = manter, vermelho = tirar) e uma nota opcional (<= 300).
--          Ancora = trecho literal (texto, 20 a 600) + prefixo/sufixo (40) + passo (a tela: 0 cartao,
--          1 sumario, 2..8 Passo 1..7, 9 preparacao e metricas) + documento (treinamento | campo).
--          "Pedir nova versao com os grifos" converte cada grifo em comentario da versao
--          ("[GRIFO ajustar] «trecho» → nota"); quando a versao nova e publicada (job `revisar`),
--          os grifos pendentes ate a versao base recebem resolvido_em.
-- Pattern: idempotent (CREATE TABLE IF NOT EXISTS). Sem FK de proposito (DDL roda pelo router
--          antes do schema principal: utils/script-grifos.cjs ensureScriptGrifosTable).
-- ============================================

CREATE TABLE IF NOT EXISTS script_grifos (
  id TEXT PRIMARY KEY,
  club_slug TEXT NOT NULL,
  versao INTEGER NOT NULL,
  passo INTEGER NOT NULL DEFAULT 0 CHECK(passo BETWEEN 0 AND 9),
  documento TEXT NOT NULL DEFAULT 'treinamento' CHECK(documento IN ('treinamento', 'campo')),
  texto TEXT NOT NULL,
  prefixo TEXT NOT NULL DEFAULT '',
  sufixo TEXT NOT NULL DEFAULT '',
  cor TEXT NOT NULL CHECK(cor IN ('dourado', 'verde', 'vermelho')),
  nota TEXT NOT NULL DEFAULT '',
  autor_email TEXT,
  autor_nome TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolvido_em DATETIME
);
CREATE INDEX IF NOT EXISTS idx_script_grifos_club_versao ON script_grifos(club_slug, versao);

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('021', 'script_grifos (grifos do leitor do script; viram comentarios da revisao)');

SELECT 'Migration 021 complete: script_grifos.' AS status;
