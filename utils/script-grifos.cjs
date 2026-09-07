/**
 * Grifos do script (tabela script_grifos).
 * O mentor seleciona um trecho em qualquer tela do leitor ("Seu script") e marca com uma cor:
 *   dourado = ajustar · verde = manter assim · vermelho = tirar. Nota opcional (ate 300 caracteres).
 * Ancora: trecho literal (`texto`, 20 a 600) + `prefixo`/`sufixo` (40 caracteres) + `passo` (a tela, 0 a 9) + `documento`.
 * Telas: 0 = cartao de bolso, 1 = sumario, 2..8 = Passo 1..7, 9 = preparacao e metricas.
 * Cada grifo aceita 0..n ANEXOS (onda E3): audio (transcrito pela Groq), imagem, video, link e nota, guardados na
 * mesma tabela do contexto por pergunta da ficha (script_field_context com `grifo_id`; utils/script-context.cjs).
 * "Pedir nova versao com os grifos": cada grifo vira um comentario da versao no formato
 *   "[GRIFO ajustar] «trecho» → nota" · "[GRIFO manter] «trecho»" · "[GRIFO tirar] «trecho» → nota"
 * mais " · anexos: ..." quando o grifo tem material anexado (grifo sem anexo continua igual ao de antes).
 * com `passo` do comentario = 0 (cartao/sumario), 1..7 (o passo) ou 9 (preparacao). A tabela script_comments so aceita
 * 0..7: no banco o 9 vira 0 (geral); o payload do job `revisar` leva o 9.
 * Quando a versao nova e publicada (PUT /api/jobs/:id/script de um job `revisar`), os grifos pendentes ate a versao base
 * ficam `resolvido_em` (utils/script-versions.cjs insertVersion). Registro: migrations/021_script_grifos.sql.
 */
const { z } = require('zod');
const CTX = require('./script-context.cjs');

const CORES = ['dourado', 'verde', 'vermelho'];
const DOCUMENTOS = ['treinamento', 'campo'];
/** Cor -> o que o grifo pede na revisao. */
const COR_ACAO = { dourado: 'ajustar', verde: 'manter', vermelho: 'tirar' };
const TEXTO_MIN = 20;
const TEXTO_MAX = 600;
const NOTA_MAX = 300;
const CONTEXTO = 40;
/** Quanto de cada anexo cabe no comentario da revisao (a transcricao do audio e o que mais importa para quem escreve). */
const ANEXO_TEXTO_MAX = 800;
/** Teto do comentario inteiro, o mesmo que o front pode mandar em `comentarios` (grifoComentarioSchema). */
const COMENTARIO_MAX = 5000;

const DDL = [
  `CREATE TABLE IF NOT EXISTS script_grifos (
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
)`,
  `CREATE INDEX IF NOT EXISTS idx_script_grifos_club_versao ON script_grifos(club_slug, versao)`,
];

async function ensureScriptGrifosTable(dbRun) {
  for (const s of DDL) await dbRun(s);
}

/** POST /api/script/versoes/:versao/grifos */
const grifoCreateSchema = z.object({
  passo: z.coerce.number().int().min(0).max(9),
  documento: z.enum(DOCUMENTOS).optional().default('treinamento'),
  texto: z.string().trim()
    .min(TEXTO_MIN, `Selecione um trecho maior (pelo menos ${TEXTO_MIN} caracteres).`)
    .max(TEXTO_MAX, `Selecione um trecho menor (até ${TEXTO_MAX} caracteres).`),
  prefixo: z.string().max(400).optional().default(''),
  sufixo: z.string().max(400).optional().default(''),
  cor: z.enum(CORES, { message: 'Escolha uma cor: dourado (ajustar), verde (manter) ou vermelho (tirar).' }),
  nota: z.string().trim().max(NOTA_MAX, `A nota tem no máximo ${NOTA_MAX} caracteres.`).optional().default(''),
});

/** PATCH /api/script/grifos/:id  { nota?, cor? } */
const grifoPatchSchema = z.object({
  nota: z.string().trim().max(NOTA_MAX, `A nota tem no máximo ${NOTA_MAX} caracteres.`).optional(),
  cor: z.enum(CORES).optional(),
}).refine((b) => b.nota !== undefined || b.cor !== undefined, { message: 'Nada para alterar.' });

/** Comentarios que o front manda junto com "Pedir nova versao com os grifos" (ja no formato [GRIFO cor] «trecho» → nota). */
const grifoComentarioSchema = z.object({
  passo: z.coerce.number().int().min(0).max(9),
  texto: z.string().trim().min(1).max(5000),
});

/** Anexo do grifo -> texto do comentario. `nome` = legenda ou nome do arquivo. */
function anexoParaTexto(item) {
  if (!item) return '';
  const corta = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > ANEXO_TEXTO_MAX ? `${t.slice(0, ANEXO_TEXTO_MAX).trimEnd()}...` : t;
  };
  const nome = corta(item.legenda || item.file_name || '');
  if (item.tipo === 'audio') {
    const t = corta(item.transcricao);
    return t ? `áudio (transcrição: "${t}")` : `áudio (${corta(item.erro_transcricao) ? 'sem transcrição' : 'transcrição a caminho'})`;
  }
  if (item.tipo === 'link') return `link (${corta(item.url) || 'sem endereço'})`;
  if (item.tipo === 'nota') return `nota ("${corta(item.texto)}")`;
  if (item.tipo === 'video') return item.url ? `vídeo (${corta(item.url)})` : `vídeo (${nome || 'arquivo enviado'})`;
  return `imagem (${nome || 'arquivo enviado'})`;
}

/** " · anexos: áudio (transcrição: "..."), link (url)": string vazia quando o grifo nao tem anexo. */
function anexosParaTexto(itens) {
  const partes = (itens || []).map(anexoParaTexto).filter(Boolean);
  return partes.length ? ` · anexos: ${partes.join(', ')}` : '';
}

function rowToGrifo(r) {
  if (!r) return null;
  return {
    id: r.id,
    club_slug: r.club_slug,
    versao: r.versao,
    passo: r.passo,
    documento: r.documento,
    texto: r.texto,
    prefixo: r.prefixo || '',
    sufixo: r.sufixo || '',
    cor: r.cor,
    nota: r.nota || '',
    autor_email: r.autor_email || null,
    autor_nome: r.autor_nome || null,
    created_at: r.created_at,
    resolvido_em: r.resolvido_em || null,
  };
}

const ORDER = 'ORDER BY versao DESC, passo ASC, created_at ASC, rowid ASC';

/**
 * Grifos que a tela de uma versao mostra: os da propria versao (inclusive resolvidos) e os pendentes de versoes anteriores
 * (reancorados na versao nova; quando o trecho nao existe mais, o leitor lista "trecho nao encontrado nesta versao").
 */
async function listGrifosDaVersao({ dbAll }, club_slug, versao) {
  const rows = await dbAll(
    `SELECT * FROM script_grifos WHERE club_slug = ? AND (versao = ? OR (versao < ? AND resolvido_em IS NULL)) ${ORDER}`,
    [club_slug, Number(versao), Number(versao)]
  );
  return rows.map(rowToGrifo);
}

/** Grifos pendentes (sem resolvido_em) ate a versao dada: os que entram em "Pedir nova versao com os grifos". */
async function listGrifosPendentes({ dbAll }, club_slug, ateVersao) {
  const rows = await dbAll(
    `SELECT * FROM script_grifos WHERE club_slug = ? AND versao <= ? AND resolvido_em IS NULL ${ORDER}`,
    [club_slug, Number(ateVersao)]
  );
  return rows.map(rowToGrifo);
}

/** Todos os grifos do clube (admin, so leitura). */
async function listGrifos({ dbAll }, club_slug) {
  const rows = await dbAll(`SELECT * FROM script_grifos WHERE club_slug = ? ${ORDER}`, [club_slug]);
  return rows.map(rowToGrifo);
}

async function getGrifo({ dbGet }, club_slug, id) {
  return rowToGrifo(await dbGet('SELECT * FROM script_grifos WHERE club_slug = ? AND id = ?', [club_slug, id]));
}

function normEmail(e) { return e ? String(e).trim().toLowerCase() : null; }

async function insertGrifo({ dbGet, dbRun, uuidv4 }, g) {
  const id = `sg-${uuidv4()}`;
  await dbRun(
    `INSERT INTO script_grifos (id, club_slug, versao, passo, documento, texto, prefixo, sufixo, cor, nota, autor_email, autor_nome)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, g.club_slug, Number(g.versao), Number(g.passo) || 0, DOCUMENTOS.includes(g.documento) ? g.documento : 'treinamento',
      String(g.texto).trim(), String(g.prefixo || '').slice(-CONTEXTO), String(g.sufixo || '').slice(0, CONTEXTO),
      g.cor, String(g.nota || '').trim(), normEmail(g.autor_email), g.autor_nome || null,
    ]
  );
  return getGrifo({ dbGet }, g.club_slug, id);
}

async function updateGrifo({ dbGet, dbRun }, club_slug, id, patch) {
  const sets = [];
  const params = [];
  if (patch.nota !== undefined) { sets.push('nota = ?'); params.push(String(patch.nota).trim()); }
  if (patch.cor !== undefined && CORES.includes(patch.cor)) { sets.push('cor = ?'); params.push(patch.cor); }
  if (!sets.length) return getGrifo({ dbGet }, club_slug, id);
  await dbRun(`UPDATE script_grifos SET ${sets.join(', ')} WHERE club_slug = ? AND id = ?`, [...params, club_slug, id]);
  return getGrifo({ dbGet }, club_slug, id);
}

/** Apaga o grifo e, junto, os anexos dele (com os arquivos em disco). */
async function deleteGrifo({ dbGet, dbAll, dbRun }, club_slug, id, { fs } = {}) {
  if (dbGet && dbAll) await CTX.deleteGrifoContext({ dbGet, dbAll, dbRun }, club_slug, id, { fs });
  const r = await dbRun('DELETE FROM script_grifos WHERE club_slug = ? AND id = ?', [club_slug, id]);
  return r.changes || 0;
}

/**
 * Pendura `contexto: [...]` (os anexos) em cada grifo, numa consulta so para a lista inteira.
 * `fileUrl(fileId)` monta a URL de download (o membro nunca recebe caminho de disco).
 */
async function comContexto({ dbAll }, club_slug, grifos, { fileUrl = null } = {}) {
  if (!grifos || !grifos.length) return grifos || [];
  const itens = await CTX.listGrifoContext({ dbAll }, club_slug, { fileUrl });
  const porGrifo = CTX.groupByGrifo(itens);
  return grifos.map((g) => ({ ...g, contexto: porGrifo[g.id] || [] }));
}

/** Marca resolvidos os grifos pendentes ate a versao base (chamado quando a versao nova e publicada). */
async function resolveGrifos({ dbRun }, club_slug, ateVersao) {
  const r = await dbRun(
    'UPDATE script_grifos SET resolvido_em = CURRENT_TIMESTAMP WHERE club_slug = ? AND versao <= ? AND resolvido_em IS NULL',
    [club_slug, Number(ateVersao)]
  );
  return r.changes || 0;
}

/** Tela (0..9) -> passo do comentario: 0 (cartao e sumario), 1..7 (o passo), 9 (preparacao e metricas). */
function passoDaTela(tela) {
  const t = Number(tela);
  if (!Number.isInteger(t) || t <= 1) return 0;
  if (t >= 9) return 9;
  return t - 1;
}

/** Passo do comentario -> o que a tabela script_comments aceita (0..7): o 9 (preparacao) vira 0 (geral). */
function passoNoBanco(passo) {
  const p = Number(passo);
  if (!Number.isInteger(p) || p < 0 || p > 7) return 0;
  return p;
}

/**
 * Um grifo -> um comentario da revisao: "[GRIFO ajustar] «trecho» → nota".
 * Com anexos (`g.contexto`), ganha o sufixo " · anexos: áudio (transcrição: "..."), link (url), imagem (nome), nota ("...")".
 * Sem anexo, o texto e byte a byte o de antes da onda E3.
 */
function grifoParaComentario(g) {
  const acao = COR_ACAO[g.cor] || 'ajustar';
  const nota = String(g.nota || '').trim();
  const base = `[GRIFO ${acao}] «${String(g.texto || '').trim()}»${nota ? ` → ${nota}` : ''}`;
  const texto = `${base}${anexosParaTexto(g.contexto)}`;
  return { passo: passoDaTela(g.passo), texto: texto.length > COMENTARIO_MAX ? `${texto.slice(0, COMENTARIO_MAX - 3).trimEnd()}...` : texto };
}

/** O comentario sem o sufixo dos anexos: casa o texto que o front mandou com o grifo do banco. */
function comentarioSemAnexos(texto) {
  return String(texto || '').split(' · anexos: ')[0].trim();
}

const GRIFO_COMENTARIO_RE = /^\[GRIFO (ajustar|manter|tirar)\]\s/;
function comentarioEhGrifo(texto) { return GRIFO_COMENTARIO_RE.test(String(texto || '')); }

/** { total, ajustar, manter, tirar } de uma lista de grifos. */
function resumoGrifos(lista) {
  const r = { total: 0, ajustar: 0, manter: 0, tirar: 0 };
  for (const g of lista || []) {
    r.total += 1;
    const acao = COR_ACAO[g.cor];
    if (acao) r[acao] += 1;
  }
  return r;
}

module.exports = {
  CORES,
  DOCUMENTOS,
  COR_ACAO,
  TEXTO_MIN,
  TEXTO_MAX,
  NOTA_MAX,
  ANEXO_TEXTO_MAX,
  COMENTARIO_MAX,
  ensureScriptGrifosTable,
  grifoCreateSchema,
  grifoPatchSchema,
  grifoComentarioSchema,
  rowToGrifo,
  listGrifosDaVersao,
  listGrifosPendentes,
  listGrifos,
  getGrifo,
  insertGrifo,
  updateGrifo,
  deleteGrifo,
  resolveGrifos,
  comContexto,
  passoDaTela,
  passoNoBanco,
  anexoParaTexto,
  anexosParaTexto,
  grifoParaComentario,
  comentarioSemAnexos,
  comentarioEhGrifo,
  resumoGrifos,
};
