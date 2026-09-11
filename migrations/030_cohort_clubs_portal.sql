-- ============================================
-- Migration 030: cohort_clubs.portal_url, portal_usuario e portal_senha
-- Purpose: guardar o acesso do mentor ao portal "Minha base" (https://prosperusclub.com.br/minha-base/),
--          onde ele ve o atlas da base de conhecimento do clube e cuida dos documentos.
--            portal_url      -> endereco do portal do clube, gravado pelo worker no PATCH done (result.portal.url).
--            portal_usuario  -> login do clube no portal, do mesmo PATCH (result.portal.usuario).
--            portal_senha    -> senha em texto, gravada SO quando result.portal.senha vem preenchida.
--                               Senha nula no result nunca apaga a que ja esta guardada: o runner manda
--                               `portal_tem_senha` no payload do job `conector` e so gera outra quando falta.
--          As tres nascem NULL e sao a fonte da verdade do acesso; o meta do entregavel `conector` pode
--          repetir url e usuario, mas nunca a senha.
-- Pattern: ALTER TABLE ADD COLUMN; "duplicate column" e ignorado pelo server.cjs e pelos routers
--          (utils/validation-materials.cjs ensureConectorColumns), mesmo molde da 028 e da 029.
-- Dado: nenhum. Quem preenche e o worker, na primeira publicacao depois desta migration.
-- ============================================

ALTER TABLE cohort_clubs ADD COLUMN portal_url TEXT;
ALTER TABLE cohort_clubs ADD COLUMN portal_usuario TEXT;
ALTER TABLE cohort_clubs ADD COLUMN portal_senha TEXT;

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('030', 'cohort_clubs: portal_url, portal_usuario e portal_senha (acesso ao portal Minha base)');

SELECT 'Migration 030 complete: cohort_clubs portal.' AS status;
