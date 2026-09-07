-- ============================================
-- Migration 027: marcos por pessoa em cohort_members (onda I, SPEC-experiencia-pre-script-v1 §3)
-- Purpose: duas marcas por membro, as duas anulaveis:
--            como_funciona_visto_em  -> quando a pessoa clicou em "Começar o meu script" na tela inicial
--                                       "Como funciona" (decisao D1: a tela abre so na PRIMEIRA entrada;
--                                       depois ela vive no menu). NULL = nunca viu.
--            whatsapp_lembrete_em    -> quando a pessoa dispensou o lembrete unico do WhatsApp nas telas de
--                                       espera (leitura dos materiais e escrita do script). NULL = ainda cabe
--                                       um lembrete. Com a marca, o lembrete nao volta.
--          As duas sao gravadas por PUT /api/script/visto { marco }.
-- Pattern: ALTER TABLE ADD COLUMN; "duplicate column" e ignorado pelo router
--          (utils/script-marcos.cjs ensureMarcosColumns) e pelo server.cjs.
-- ============================================

ALTER TABLE cohort_members ADD COLUMN como_funciona_visto_em DATETIME;
ALTER TABLE cohort_members ADD COLUMN whatsapp_lembrete_em DATETIME;

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('027', 'cohort_members: como_funciona_visto_em e whatsapp_lembrete_em (marcos por pessoa)');

SELECT 'Migration 027 complete: cohort_members marcos.' AS status;
