-- ============================================
-- Migration 029: cohort_clubs.conector, conector_porta e conector_url
-- Purpose: marcar QUEM do Exclusive tem o conector de IA publicado e guardar onde ele mora.
--            conector       -> 0/1. 1 = ao aprovar uma versao do script o app pede a publicacao
--                              (job `conector`, utils/script-versions.cjs enqueueConectorJob).
--                              So vale para produto = 'exclusive'; clube proprio ('club') fica sempre 0.
--            conector_porta -> porta do servico publicado, gravada pelo worker no PATCH done (result.porta).
--            conector_url   -> endereco publico do conector, gravado no mesmo PATCH (result.tenant_url).
--          Os dois ultimos sao NULL ate a primeira publicacao e servem so para leitura no admin.
-- Pattern: ALTER TABLE ADD COLUMN; "duplicate column" e ignorado pelo server.cjs e pelos routers
--          (utils/validation-materials.cjs ensureConectorColumns), mesmo molde da 027 e da 028.
-- Dado: liga o conector para todo clube do roster do Exclusive, menos os tres de teste ou pausados
--       (teste-danilo, dani-martins, juliana-medeiros). O passo de dado roda UMA vez: ele so acontece
--       quando a versao '029' ainda nao esta em schema_migrations, e o INSERT logo abaixo fecha a porta.
--       Rodar o arquivo de novo nao mexe em quem o admin ligou ou desligou depois.
-- ============================================

ALTER TABLE cohort_clubs ADD COLUMN conector INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cohort_clubs ADD COLUMN conector_porta INTEGER;
ALTER TABLE cohort_clubs ADD COLUMN conector_url TEXT;

UPDATE cohort_clubs
   SET conector = 1
 WHERE COALESCE(produto, 'exclusive') = 'exclusive'
   AND slug NOT IN ('teste-danilo', 'dani-martins', 'juliana-medeiros')
   AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '029');

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('029', 'cohort_clubs: conector, conector_porta e conector_url (publicacao do conector do Exclusive)');

SELECT 'Migration 029 complete: cohort_clubs conector.' AS status;
