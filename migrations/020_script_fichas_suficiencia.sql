-- ============================================
-- Migration 020: script_fichas.suficiencia + script_fichas.confirmada_por (gates de suficiencia da ficha)
-- Purpose: quando o job `prefill` termina (done / needs_human), o app avalia a ficha
--          (utils/suficiencia.cjs avaliarSuficiencia) e grava um JSON
--          { resultado: 'suficiente'|'parcial'|'insuficiente', faltam: [keys], motivos: [pt-BR],
--            criticos_ok, fontes_distintas, avaliado_em, job_id, forcado_por?, script_job_id? }.
--          suficiente -> ficha_status 'confirmada' com confirmada_por = 'automatica' e job `script` na fila;
--          parcial / insuficiente -> a ficha fica como esta e o membro ve so o que falta.
--          confirmada_por: 'automatica' | 'mentor' | 'admin:<quem>' | NULL (reaberta).
-- Pattern: ALTER TABLE ADD COLUMN; "duplicate column" e ignorado pelos routers
--          (utils/suficiencia.cjs ensureSuficienciaColumns).
-- ============================================

ALTER TABLE script_fichas ADD COLUMN suficiencia TEXT;
ALTER TABLE script_fichas ADD COLUMN confirmada_por TEXT;

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('020', 'script_fichas.suficiencia + confirmada_por (gates de suficiencia)');

SELECT 'Migration 020 complete: script_fichas.suficiencia + confirmada_por.' AS status;
