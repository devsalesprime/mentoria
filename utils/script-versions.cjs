/**
 * Versoes do script (tabela script_versions) e comentarios por passo (script_comments).
 * 1 clube tem N versoes (versao = max + 1, gravada pelo worker em PUT /api/jobs/:id/script).
 * meta: JSON livre do worker; quando o job e `revisar`, a rota grava meta.tipo = 'revisao' e meta.base_versao (a versao comentada).
 * status: rascunho | aprovado (o membro aprova em POST /api/script/versoes/:versao/aprovar).
 * Comentario: passo 0 = geral, 1..7 = "## Passo N" do markdown.
 */
const { z } = require('zod');

const VERSAO_STATUSES = ['rascunho', 'aprovado'];

const DDL = [
  `CREATE TABLE IF NOT EXISTS script_versions (
  id TEXT PRIMARY KEY,
  club_slug TEXT NOT NULL,
  versao INTEGER NOT NULL,
  content_md TEXT NOT NULL,
  resumo TEXT,
  meta JSON,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho', 'aprovado')),
  job_id TEXT,
  aprovado_em DATETIME,
  aprovado_por TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(club_slug, versao)
)`,
  `CREATE TABLE IF NOT EXISTS script_comments (
  id TEXT PRIMARY KEY,
  club_slug TEXT NOT NULL,
  versao INTEGER NOT NULL,
  passo INTEGER NOT NULL DEFAULT 0 CHECK(passo BETWEEN 0 AND 7),
  texto TEXT NOT NULL,
  autor_email TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE INDEX IF NOT EXISTS idx_script_comments_club_versao ON script_comments(club_slug, versao)`,
];

async function ensureScriptVersionsTables(dbRun) {
  for (const s of DDL) await dbRun(s);
}

/** PUT /api/jobs/:id/script */
const scriptVersionBodySchema = z.object({
  content_md: z.string().min(1).max(2000000),
  resumo: z.string().max(5000).optional().default(''),
  meta: z.any().optional(),
});

/** POST /api/script/versoes/:versao/comentarios */
const scriptCommentSchema = z.object({
  passo: z.coerce.number().int().min(0).max(7).optional().default(0),
  texto: z.string().trim().min(1, 'Escreva o comentário.').max(5000),
});

function parseJson(s, fallback = null) {
  if (s == null || s === '') return fallback;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return fallback; }
}

function rowToVersion(r, { withContent = false } = {}) {
  if (!r) return null;
  const out = {
    id: r.id,
    club_slug: r.club_slug,
    versao: r.versao,
    status: r.status,
    resumo: r.resumo || '',
    meta: parseJson(r.meta, null),
    job_id: r.job_id || null,
    aprovado_em: r.aprovado_em || null,
    aprovado_por: r.aprovado_por || null,
    created_at: r.created_at,
    comentarios_count: r.comentarios_count == null ? undefined : r.comentarios_count,
  };
  if (out.comentarios_count === undefined) delete out.comentarios_count;
  if (withContent) out.content_md = r.content_md;
  return out;
}

/** Grava a proxima versao (max + 1) do clube. */
async function insertVersion({ dbGet, dbRun, uuidv4 }, { club_slug, content_md, resumo = '', meta = null, job_id = null }) {
  const row = await dbGet(`SELECT COALESCE(MAX(versao), 0) AS m FROM script_versions WHERE club_slug = ?`, [club_slug]);
  const versao = (row ? row.m : 0) + 1;
  const id = `sv-${uuidv4()}`;
  await dbRun(
    `INSERT INTO script_versions (id, club_slug, versao, content_md, resumo, meta, status, job_id)
     VALUES (?, ?, ?, ?, ?, ?, 'rascunho', ?)`,
    [id, club_slug, versao, content_md, resumo || null, meta == null ? null : JSON.stringify(meta), job_id]
  );
  return getVersion({ dbGet }, club_slug, versao, { withContent: false });
}

/** Lista (sem conteudo), mais recente primeiro, com contagem de comentarios. */
async function listVersions({ dbAll }, club_slug) {
  const rows = await dbAll(
    `SELECT v.id, v.club_slug, v.versao, v.status, v.resumo, v.meta, v.job_id, v.aprovado_em, v.aprovado_por, v.created_at,
            (SELECT COUNT(*) FROM script_comments c WHERE c.club_slug = v.club_slug AND c.versao = v.versao) AS comentarios_count
       FROM script_versions v WHERE v.club_slug = ? ORDER BY v.versao DESC`,
    [club_slug]
  );
  return rows.map((r) => rowToVersion(r));
}

async function getVersion({ dbGet }, club_slug, versao, { withContent = true } = {}) {
  const r = await dbGet(
    `SELECT v.*, (SELECT COUNT(*) FROM script_comments c WHERE c.club_slug = v.club_slug AND c.versao = v.versao) AS comentarios_count
       FROM script_versions v WHERE v.club_slug = ? AND v.versao = ?`,
    [club_slug, Number(versao)]
  );
  return rowToVersion(r, { withContent });
}

/** Ultima versao (maior numero) do clube, ou null. */
async function getLatestVersion({ dbGet }, club_slug, { withContent = true } = {}) {
  const r = await dbGet(`SELECT MAX(versao) AS m FROM script_versions WHERE club_slug = ?`, [club_slug]);
  if (!r || !r.m) return null;
  return getVersion({ dbGet }, club_slug, r.m, { withContent });
}

async function approveVersion({ dbGet, dbRun }, club_slug, versao, email) {
  const r = await dbRun(
    `UPDATE script_versions SET status = 'aprovado', aprovado_em = CURRENT_TIMESTAMP, aprovado_por = ? WHERE club_slug = ? AND versao = ?`,
    [email || null, club_slug, Number(versao)]
  );
  if (!r.changes) return null;
  return getVersion({ dbGet }, club_slug, versao, { withContent: false });
}

function rowToComment(r) {
  return { id: r.id, versao: r.versao, passo: r.passo, texto: r.texto, autor_email: r.autor_email || null, autor_nome: r.autor_nome || null, created_at: r.created_at };
}

const COMMENT_SELECT = `SELECT c.*, u.name AS autor_nome FROM script_comments c
   LEFT JOIN users u ON u.id = (SELECT u2.id FROM users u2 WHERE lower(u2.email) = c.autor_email ORDER BY u2.updated_at DESC LIMIT 1)`;

async function listComments({ dbAll }, club_slug, versao = null) {
  const rows = await dbAll(
    `${COMMENT_SELECT} WHERE c.club_slug = ? ${versao != null ? 'AND c.versao = ?' : ''} ORDER BY c.versao DESC, c.passo ASC, c.created_at ASC, c.rowid ASC`,
    versao != null ? [club_slug, Number(versao)] : [club_slug]
  );
  return rows.map(rowToComment);
}

async function insertComment({ dbGet, dbRun, uuidv4 }, { club_slug, versao, passo = 0, texto, autor_email = null }) {
  const id = `sc-${uuidv4()}`;
  await dbRun(
    `INSERT INTO script_comments (id, club_slug, versao, passo, texto, autor_email) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, club_slug, Number(versao), Number(passo) || 0, texto, autor_email ? String(autor_email).toLowerCase() : null]
  );
  const r = await dbGet(`${COMMENT_SELECT} WHERE c.id = ?`, [id]);
  return rowToComment(r);
}

/** Resumo para GET /api/script/ficha (menu e tela da ficha). */
async function scriptSummary({ dbGet }, club_slug) {
  const r = await dbGet(
    `SELECT COUNT(*) AS n, MAX(versao) AS ultima, MAX(CASE WHEN status = 'aprovado' THEN versao END) AS aprovada FROM script_versions WHERE club_slug = ?`,
    [club_slug]
  );
  const ultima = r && r.ultima ? await getVersion({ dbGet }, club_slug, r.ultima, { withContent: false }) : null;
  return {
    versoes: r ? r.n : 0,
    ultima: ultima ? { versao: ultima.versao, status: ultima.status, created_at: ultima.created_at } : null,
    aprovada: r && r.aprovada ? r.aprovada : null,
  };
}

module.exports = {
  VERSAO_STATUSES,
  ensureScriptVersionsTables,
  scriptVersionBodySchema,
  scriptCommentSchema,
  rowToVersion,
  insertVersion,
  listVersions,
  getVersion,
  getLatestVersion,
  approveVersion,
  listComments,
  insertComment,
  scriptSummary,
};
