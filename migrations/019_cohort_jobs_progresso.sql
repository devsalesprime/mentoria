-- ============================================
-- Migration 019: cohort_jobs.progresso (marcos do pre-preenchimento pelo worker)
-- Purpose: o worker grava, junto com PATCH /api/jobs/:id { status: 'running' }, um JSON de progresso
--          { fase: 'extracao'|'bloco'|'finalizando', etapa_atual, etapas_total, rotulo, arquivos_lidos?,
--            arquivos_total?, blocos_concluidos: number[], blocos_com_erro?: number[], atualizado_em }.
--          O membro ve o painel "Pre-preenchimento em andamento" na ficha; o admin ve o rotulo na fila.
-- Pattern: ALTER TABLE ADD COLUMN; "duplicate column" e ignorado pelos routers
--          (utils/validation-materials.cjs ensureCohortJobsTable). CREATE TABLE novo ja traz a coluna.
-- ============================================

ALTER TABLE cohort_jobs ADD COLUMN progresso TEXT;
