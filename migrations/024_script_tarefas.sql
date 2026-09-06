-- ============================================
-- Migration 024: script_tarefas (tarefas dos movimentos do leitor "Seu script")
-- Purpose: SPEC-workflow-v2-decisoes-06-09 §1 (decisao 4) e §3, onda C. Cada Passo do leitor virou um
--          movimento no modelo das trilhas personalizadas: treinamentos recomendados
--          (data/treinamentos-por-passo.ts), o script, o guia pratico quando houver e, no fim, tarefas
--          com checkbox.
--          O estado e POR PESSOA e POR VERSAO: a ficha e o script sao do clube, mas a execucao e de cada
--          socio. Chave = (club_slug, versao, email, passo, tarefa_id).
--          Os ids nascem no front (components/script/script/tarefas.ts): `assistir-<id do treinamento no
--          catalogo>` (um por treinamento recomendado do passo), `treinar-falas`, `aplicar-reuniao` e
--          `marcar-ajustes` (este ultimo abre a dica dos grifos). O servidor nao guarda o catalogo: valida
--          o formato do id e guarda o par, entao trocar um treinamento recomendado nao pede migration.
--          `concluida_em` guarda a primeira marcacao e sobrevive a repetir o mesmo PUT; desmarcar limpa.
--          Nada disso mora no navegador de proposito: as trilhas guardaram os checkboxes no localStorage
--          e quem limpava o navegador perdia o parcial.
--          Rotas: GET /api/script/versoes/:versao/tarefas (os 7 passos da pessoa),
--          PUT /api/script/versoes/:versao/tarefas/:passo/:tarefa_id { concluida } e, so leitura,
--          GET /api/admin/clubs/:slug/script-versoes/:versao/tarefas.
-- Pattern: idempotent (CREATE TABLE IF NOT EXISTS). Sem FK de proposito (o DDL roda pelo router antes do
--          schema principal: utils/script-tarefas.cjs ensureScriptTarefasTable).
-- ============================================

CREATE TABLE IF NOT EXISTS script_tarefas (
  id TEXT PRIMARY KEY,
  club_slug TEXT NOT NULL,
  versao INTEGER NOT NULL,
  email TEXT NOT NULL,
  passo INTEGER NOT NULL CHECK(passo BETWEEN 1 AND 7),
  tarefa_id TEXT NOT NULL,
  concluida INTEGER NOT NULL DEFAULT 0 CHECK(concluida IN (0, 1)),
  concluida_em DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(club_slug, versao, email, passo, tarefa_id)
);
CREATE INDEX IF NOT EXISTS idx_script_tarefas_pessoa ON script_tarefas(club_slug, versao, email);
CREATE INDEX IF NOT EXISTS idx_script_tarefas_club_versao ON script_tarefas(club_slug, versao);

INSERT OR IGNORE INTO schema_migrations (version, description)
  VALUES ('024', 'script_tarefas (tarefas com checkbox dos movimentos do script, por pessoa e versao)');

SELECT 'Migration 024 complete: script_tarefas.' AS status;
