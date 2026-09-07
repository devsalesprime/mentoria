-- ============================================
-- Migration 023: script_fichas.modo (escolha na entrada: essencial ou completo)
-- Purpose: SPEC-workflow-v2-decisoes-06-09 §1 (decisoes 1 a 3) e §2. Antes de Materiais, quem e do
--          cohort escolhe como quer construir o script:
--            'essencial' -> as 16 perguntas que fecham o cartao de bolso (subconjunto da ficha completa)
--            'completo'  -> a ficha inteira (34 campos), como sempre foi
--          NULL = ainda nao escolheu; o app manda a pessoa para a tela de escolha (rota `script_escolha`).
--          O modo tambem escolhe o perfil dos gates de suficiencia (utils/suficiencia.cjs avaliarSuficiencia
--          com { modo }): no essencial so as 16 contam como obrigatorias.
--          Trocar de essencial para completo e permitido (nada se perde: mesmas chaves, mesmo estado);
--          o caminho contrario nao e oferecido.
-- Pattern: ALTER TABLE ADD COLUMN; "duplicate column" e ignorado pelos routers
--          (utils/script-ficha.cjs ensureModoColumn).
-- ============================================

ALTER TABLE script_fichas ADD COLUMN modo TEXT;

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('023', 'script_fichas.modo (escolha na entrada: essencial ou completo)');

SELECT 'Migration 023 complete: script_fichas.modo.' AS status;
