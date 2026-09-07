-- ============================================
-- Migration 026: anexos do grifo (onda E3 do leitor "Seu script")
-- Purpose: o grifo passa a aceitar 0..n materiais anexados, exatamente como o contexto por pergunta
--          da Ficha: audio (transcrito na hora pela Groq), imagem, video, link e nota.
--          Em vez de uma tabela nova, a MESMA script_field_context (migration 018) ganha `grifo_id`:
--            grifo_id IS NULL     -> item de um campo da ficha (field_key preenchido), como sempre foi
--            grifo_id IS NOT NULL -> anexo de um grifo (field_key fica ''), da onda E3
--          Escolha pelo menor estrago: os arquivos continuam em uploaded_files com category
--          'script_contexto', entao o download do socio (GET /api/script/context/files/:fileId/download)
--          e o do worker (GET /api/jobs/:id/files/:fileId) ja funcionam para os dois donos, sem rota nova.
--          As leituras da ficha (listContext, countByField) passaram a filtrar `grifo_id IS NULL`.
--          "Pedir nova versao com os grifos" leva os anexos no proprio texto do comentario:
--            [GRIFO ajustar] «trecho» → nota · anexos: áudio (transcrição: "..."), link (url), imagem (nome), nota ("...")
--          Grifo sem anexo continua com o texto identico ao de antes (compatibilidade com o runner).
-- Pattern: ALTER TABLE ADD COLUMN; "duplicate column" e ignorado pelos routers
--          (utils/script-context.cjs ensureScriptContextTable). Indice idempotente.
-- ============================================

ALTER TABLE script_field_context ADD COLUMN grifo_id TEXT;

CREATE INDEX IF NOT EXISTS idx_script_field_context_grifo ON script_field_context(grifo_id);

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('026', 'script_field_context.grifo_id (anexos do grifo reusando o contexto da ficha)');

SELECT 'Migration 026 complete: script_field_context.grifo_id.' AS status;
