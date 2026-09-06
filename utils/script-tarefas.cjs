/**
 * Tarefas dos movimentos do script (tabela script_tarefas).
 * Cada Passo do leitor "Seu script" virou um movimento (SPEC-workflow-v2-decisoes-06-09 §1 decisão 4 e §3):
 * treinamentos recomendados, o script, o guia prático quando houver e, no fim, tarefas com checkbox.
 *
 * O estado é POR PESSOA e POR VERSÃO (a ficha e o script são do clube; a execução é de cada sócio):
 * chave = (club_slug, versao, email, passo, tarefa_id). Nada disso mora no navegador de propósito: as
 * trilhas personalizadas guardaram os checkboxes no localStorage e quem limpava o navegador perdia o
 * parcial. Aqui a marcação sobrevive a trocar de aparelho.
 *
 * Os ids das tarefas nascem no front (components/script/script/tarefas.ts, em cima de
 * data/treinamentos-por-passo.ts): `assistir-<id do treinamento no catálogo>`, `treinar-falas`,
 * `aplicar-reuniao`, `marcar-ajustes`. O servidor não guarda o catálogo: valida o formato do id e guarda
 * o par. Assim trocar um treinamento recomendado não pede migration; a linha antiga simplesmente para de
 * aparecer na tela (e o `GET` continua devolvendo, para não apagar histórico de ninguém).
 *
 * Registro: migrations/024_script_tarefas.sql.
 */
const { z } = require('zod');

const PASSO_MIN = 1;
const PASSO_MAX = 7;
const TAREFA_ID_MAX = 80;
/** Minúsculas, dígitos, ponto, hífen e sublinhado; começa por letra ou dígito (o ponto vem do id do catálogo). */
const TAREFA_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

const DDL = [
  `CREATE TABLE IF NOT EXISTS script_tarefas (
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
)`,
  `CREATE INDEX IF NOT EXISTS idx_script_tarefas_pessoa ON script_tarefas(club_slug, versao, email)`,
  `CREATE INDEX IF NOT EXISTS idx_script_tarefas_club_versao ON script_tarefas(club_slug, versao)`,
];

async function ensureScriptTarefasTable(dbRun) {
  for (const s of DDL) await dbRun(s);
}

/** PUT /api/script/versoes/:versao/tarefas/:passo/:tarefa_id */
const tarefaPutSchema = z.object({
  concluida: z.boolean({ message: 'Diga se a tarefa está concluída (true ou false).' }),
});

function normEmail(e) {
  return e ? String(e).trim().toLowerCase() : '';
}

/** `:passo` da rota -> 1..7, ou null. */
function parsePasso(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= PASSO_MIN && n <= PASSO_MAX ? n : null;
}

/** `:tarefa_id` da rota -> id válido, ou null. */
function parseTarefaId(valor) {
  const id = String(valor || '').trim().toLowerCase();
  if (!id || id.length > TAREFA_ID_MAX || !TAREFA_ID_RE.test(id)) return null;
  return id;
}

function rowToTarefa(r, { comEmail = false } = {}) {
  if (!r) return null;
  const t = {
    passo: r.passo,
    tarefa_id: r.tarefa_id,
    concluida: r.concluida === 1,
    concluida_em: r.concluida_em || null,
    updated_at: r.updated_at,
  };
  if (comEmail) t.email = r.email;
  return t;
}

const ORDER = 'ORDER BY passo ASC, tarefa_id ASC';

/** Todas as tarefas marcadas por UMA pessoa numa versão (os 7 passos de uma vez). */
async function listTarefas({ dbAll }, club_slug, versao, email) {
  const rows = await dbAll(
    `SELECT * FROM script_tarefas WHERE club_slug = ? AND versao = ? AND email = ? ${ORDER}`,
    [club_slug, Number(versao), normEmail(email)]
  );
  return rows.map((r) => rowToTarefa(r));
}

/** Tarefas de todo mundo do clube numa versão (admin, só leitura). */
async function listTarefasDoClube({ dbAll }, club_slug, versao = null) {
  const filtro = versao == null ? '' : ' AND versao = ?';
  const params = versao == null ? [club_slug] : [club_slug, Number(versao)];
  const rows = await dbAll(
    `SELECT * FROM script_tarefas WHERE club_slug = ?${filtro} ORDER BY versao DESC, email ASC, passo ASC, tarefa_id ASC`,
    params
  );
  return rows.map((r) => rowToTarefa(r, { comEmail: true }));
}

async function getTarefa({ dbGet }, club_slug, versao, email, passo, tarefa_id) {
  return rowToTarefa(await dbGet(
    `SELECT * FROM script_tarefas WHERE club_slug = ? AND versao = ? AND email = ? AND passo = ? AND tarefa_id = ?`,
    [club_slug, Number(versao), normEmail(email), Number(passo), tarefa_id]
  ));
}

/**
 * Marca ou desmarca uma tarefa. Idempotente: repetir o mesmo PUT devolve a mesma linha e preserva
 * `concluida_em` (a data em que ela foi marcada pela primeira vez); desmarcar limpa a data.
 */
async function setTarefa({ dbGet, dbRun, uuidv4 }, { club_slug, versao, email, passo, tarefa_id, concluida }) {
  const key = normEmail(email);
  const v = Number(versao);
  const p = Number(passo);
  const feita = concluida ? 1 : 0;
  await dbRun(
    `INSERT INTO script_tarefas (id, club_slug, versao, email, passo, tarefa_id, concluida, concluida_em, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
     ON CONFLICT(club_slug, versao, email, passo, tarefa_id) DO UPDATE SET
       concluida = excluded.concluida,
       concluida_em = CASE
         WHEN excluded.concluida = 0 THEN NULL
         ELSE COALESCE(script_tarefas.concluida_em, CURRENT_TIMESTAMP)
       END,
       updated_at = CURRENT_TIMESTAMP`,
    [`st-${uuidv4()}`, club_slug, v, key, p, tarefa_id, feita, feita]
  );
  return getTarefa({ dbGet }, club_slug, v, key, p, tarefa_id);
}

module.exports = {
  PASSO_MIN,
  PASSO_MAX,
  TAREFA_ID_MAX,
  TAREFA_ID_RE,
  ensureScriptTarefasTable,
  tarefaPutSchema,
  parsePasso,
  parseTarefaId,
  rowToTarefa,
  listTarefas,
  listTarefasDoClube,
  getTarefa,
  setTarefa,
};
