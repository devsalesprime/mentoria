/**
 * Versoes do script (tabela script_versions) e comentarios por passo (script_comments).
 * 1 clube tem N versoes (versao = max + 1, gravada pelo worker em PUT /api/jobs/:id/script).
 * meta: JSON livre do worker; quando o job e `revisar`, a rota grava meta.tipo = 'revisao' e meta.base_versao (a versao comentada).
 * status: rascunho | aprovado (o membro aprova em POST /api/script/versoes/:versao/aprovar).
 * Comentario: passo 0 = geral, 1..7 = "## Passo N" do markdown.
 * Grifos (utils/script-grifos.cjs): quando a versao nova nasce de um job `revisar`, insertVersion marca resolvidos os grifos
 * pendentes ate a versao base (payload.versao do job).
 * Entregaveis (tabela script_entregaveis): arquivos que o worker publica para UMA versao (hoje `slides` = apresentacao
 * comercial: pptx, pdf, notas .md, contato .png) em PUT /api/jobs/:id/entregavel. 1 linha por (clube, versao, tipo);
 * publicar de novo sobrescreve os arquivos e a linha. Disco: DATA_DIR/entregaveis/<club_slug>/v<versao>/<tipo>/<campo><ext>.
 */
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const SG = require('./script-grifos.cjs');
const SF = require('./script-ficha.cjs');
const ST = require('./script-tarefas.cjs');
const VM = require('./validation-materials.cjs');

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
  // Registro: migrations/022_script_entregaveis.sql. Sem FK de proposito (o DDL roda pelo router, antes do schema principal).
  `CREATE TABLE IF NOT EXISTS script_entregaveis (
  id TEXT PRIMARY KEY,
  club_slug TEXT NOT NULL,
  versao INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'slides',
  arquivos JSON NOT NULL DEFAULT '[]',
  meta JSON,
  job_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(club_slug, versao, tipo)
)`,
  `CREATE INDEX IF NOT EXISTS idx_script_entregaveis_club_versao ON script_entregaveis(club_slug, versao)`,
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

/**
 * Grava a proxima versao (max + 1) do clube e herda as tarefas ja marcadas na versao base
 * (a comentada, quando o job e `revisar`; senao a ultima que existia). O script mudou, mas o treino de
 * quem ja assistiu continua marcado: ninguem recomeca do zero a cada revisao.
 */
async function insertVersion({ dbGet, dbRun, uuidv4 }, { club_slug, content_md, resumo = '', meta = null, job_id = null }) {
  const row = await dbGet(`SELECT COALESCE(MAX(versao), 0) AS m FROM script_versions WHERE club_slug = ?`, [club_slug]);
  const anterior = row ? row.m : 0;
  const versao = anterior + 1;
  const id = `sv-${uuidv4()}`;
  await dbRun(
    `INSERT INTO script_versions (id, club_slug, versao, content_md, resumo, meta, status, job_id)
     VALUES (?, ?, ?, ?, ?, ?, 'rascunho', ?)`,
    [id, club_slug, versao, content_md, resumo || null, meta == null ? null : JSON.stringify(meta), job_id]
  );
  await resolveGrifosDoJob({ dbGet, dbRun }, club_slug, job_id);
  await herdarTarefas({ dbGet, dbRun }, club_slug, versao, anterior, job_id);
  return getVersion({ dbGet }, club_slug, versao, { withContent: false });
}

/**
 * Versao base da heranca das tarefas: a versao comentada quando o job e `revisar` (`payload.versao`),
 * senao a ultima que existia antes desta ("Escrever do zero" continua de onde a pessoa parou).
 * Sem versao anterior, ou sem a tabela no banco, nao faz nada.
 */
async function herdarTarefas({ dbGet, dbRun }, club_slug, versao, anterior, job_id) {
  try {
    let base = anterior;
    if (job_id) {
      const job = await dbGet('SELECT tipo, payload FROM cohort_jobs WHERE id = ?', [job_id]).catch(() => null);
      if (job && job.tipo === 'revisar') {
        const payload = parseJson(job.payload, null);
        const n = payload && payload.versao != null ? Number(payload.versao) : NaN;
        if (Number.isInteger(n) && n >= 1) base = n;
      }
    }
    if (!Number.isInteger(base) || base < 1) return 0;
    return await ST.copiarTarefas({ dbRun }, { club_slug, de: base, para: versao });
  } catch (e) {
    console.error('herdarTarefas:', e.message);
    return 0;
  }
}

/**
 * Versao publicada por um job `revisar`: os grifos pendentes ate a versao base (payload.versao) ficam resolvidos.
 * Sem job, job de outro tipo ou banco sem a tabela cohort_jobs: nao faz nada.
 */
async function resolveGrifosDoJob({ dbGet, dbRun }, club_slug, job_id) {
  if (!job_id) return 0;
  try {
    const job = await dbGet('SELECT tipo, payload FROM cohort_jobs WHERE id = ?', [job_id]);
    if (!job || job.tipo !== 'revisar') return 0;
    const payload = parseJson(job.payload, null);
    const base = payload && payload.versao != null ? Number(payload.versao) : NaN;
    if (!Number.isInteger(base) || base < 1) return 0;
    return await SG.resolveGrifos({ dbRun }, club_slug, base);
  } catch (e) {
    console.error('resolveGrifosDoJob:', e.message);
    return 0;
  }
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

// ─── Entregaveis de uma versao (script_entregaveis) ──────────────────────────

/** Pasta no disco: DATA_DIR/entregaveis/<club_slug>/v<versao>/<tipo>/ (todos os pedacos passam por safeFileName). */
function entregavelDir(dataDir, club_slug, versao, tipo) {
  return path.join(
    dataDir,
    'entregaveis',
    VM.safeFileName(club_slug, 'clube'),
    `v${Number(versao) || 0}`,
    VM.safeFileName(tipo, 'entregavel')
  );
}

/** Linha do banco -> objeto da API. `urlFor(versao, tipo, campo)` monta a URL de download (sem devolver caminho de disco). */
function rowToEntregavel(r, urlFor = null) {
  if (!r) return null;
  const arquivos = parseJson(r.arquivos, []) || [];
  return {
    id: r.id,
    versao: r.versao,
    tipo: r.tipo,
    meta: parseJson(r.meta, null),
    job_id: r.job_id || null,
    created_at: r.created_at,
    arquivos: arquivos.map((a) => ({
      campo: a.campo,
      nome: a.nome,
      bytes: a.bytes || 0,
      ...(urlFor ? { url: urlFor(r.versao, r.tipo, a.campo) } : {}),
    })),
  };
}

async function getEntregavelRow({ dbGet }, club_slug, versao, tipo) {
  return dbGet(`SELECT * FROM script_entregaveis WHERE club_slug = ? AND versao = ? AND tipo = ?`, [club_slug, Number(versao), tipo]);
}

/** Entregaveis do clube (uma versao ou todas), mais recentes primeiro. */
async function listEntregaveis({ dbAll }, club_slug, versao = null, urlFor = null) {
  const rows = await dbAll(
    `SELECT * FROM script_entregaveis WHERE club_slug = ? ${versao != null ? 'AND versao = ?' : ''} ORDER BY versao DESC, tipo ASC`,
    versao != null ? [club_slug, Number(versao)] : [club_slug]
  );
  return rows.map((r) => rowToEntregavel(r, urlFor));
}

/** { [versao]: [entregavel] } para pendurar na lista de versoes sem uma chamada a mais no front. */
async function entregaveisPorVersao({ dbAll }, club_slug, urlFor = null) {
  const out = {};
  try {
    for (const e of await listEntregaveis({ dbAll }, club_slug, null, urlFor)) {
      (out[e.versao] = out[e.versao] || []).push(e);
    }
  } catch (e) {
    console.error('entregaveisPorVersao:', e.message);
  }
  return out;
}

/** Um arquivo do entregavel, para o stream: { path, nome, mime, disposition } ou null. */
function arquivoDoEntregavel(row, campo) {
  if (!row) return null;
  const def = (VM.ENTREGAVEL_CAMPOS[row.tipo] || {})[campo];
  const a = (parseJson(row.arquivos, []) || []).find((x) => x.campo === campo);
  if (!a || !a.path) return null;
  return {
    path: a.path,
    nome: a.nome || `${campo}${(def && def.ext) || ''}`,
    mime: a.mime || (def && def.mime) || 'application/octet-stream',
    disposition: (def && def.disposition) || 'attachment',
  };
}

/**
 * Grava (ou substitui) o entregavel de UMA versao. `arquivos` = [{ campo, nome, tmpPath, bytes, mime }] ja validados.
 * Cada campo vira <campo><ext> na pasta do entregavel; publicar de novo sobrescreve os arquivos e a linha
 * (os campos que sairam sao apagados do disco). Idempotente por (club_slug, versao, tipo).
 */
async function saveEntregavel({ dbGet, dbRun, uuidv4 }, { dataDir, club_slug, versao, tipo, job_id = null, meta = null, arquivos = [] }) {
  const dir = entregavelDir(dataDir, club_slug, versao, tipo);
  fs.mkdirSync(dir, { recursive: true });
  const anterior = await getEntregavelRow({ dbGet }, club_slug, versao, tipo);
  const antigos = anterior ? (parseJson(anterior.arquivos, []) || []) : [];

  const gravados = [];
  for (const a of arquivos) {
    const def = (VM.ENTREGAVEL_CAMPOS[tipo] || {})[a.campo];
    const destino = path.join(dir, `${a.campo}${(def && def.ext) || path.extname(a.nome || '') || ''}`);
    if (a.tmpPath && a.tmpPath !== destino) {
      try {
        fs.renameSync(a.tmpPath, destino);
      } catch {
        fs.copyFileSync(a.tmpPath, destino);
        try { fs.unlinkSync(a.tmpPath); } catch { /* o temporario some no proximo boot */ }
      }
    }
    gravados.push({ nome: a.nome, campo: a.campo, path: destino, bytes: a.bytes || 0, mime: a.mime || (def && def.mime) || 'application/octet-stream' });
  }
  // Campo que existia e nao veio de novo: some do disco (o entregavel novo substitui o anterior por inteiro)
  for (const velho of antigos) {
    if (gravados.some((g) => g.path === velho.path)) continue;
    try { if (velho.path && fs.existsSync(velho.path)) fs.unlinkSync(velho.path); } catch { /* ignora */ }
  }

  const id = anterior ? anterior.id : `se-${uuidv4()}`;
  await dbRun(
    `INSERT INTO script_entregaveis (id, club_slug, versao, tipo, arquivos, meta, job_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(club_slug, versao, tipo) DO UPDATE SET
       arquivos = excluded.arquivos, meta = excluded.meta, job_id = excluded.job_id, created_at = CURRENT_TIMESTAMP`,
    [id, club_slug, Number(versao), tipo, JSON.stringify(gravados), meta == null ? null : JSON.stringify(meta), job_id]
  );
  return getEntregavelRow({ dbGet }, club_slug, versao, tipo);
}

// ─── Job `slides` (apresentacao comercial de uma versao) ─────────────────────

/** A ficha do clube em linhas "- chave · pergunta · valor" (so os campos com resposta). Vai no payload do job `slides`. */
function fichaMd(fieldsRaw) {
  const fields = SF.normalizeFields(fieldsRaw && typeof fieldsRaw === 'object' ? fieldsRaw : {});
  const linhas = [];
  for (const def of SF.FIELDS) {
    const estado = fields[def.key];
    const bruto = SF.isDecided(estado) ? SF.effectiveValue(estado) : (estado && estado.sugerido) || '';
    const valor = String(bruto || '').replace(/\s+/g, ' ').trim();
    if (!valor) continue;
    linhas.push(`- ${def.key} · ${def.pergunta} · ${valor}`);
  }
  return linhas.join('\n');
}

/** WhatsApp do aviso: o ultimo job `prefill`/`script` da pessoa e, sem ele, o ultimo do clube (igual ao "forçar script" do admin). */
async function ultimoNotifyPhone({ dbGet }, club_slug, email) {
  const base = `SELECT notify_phone FROM cohort_jobs WHERE club_slug = ? AND tipo IN ('prefill', 'script')
                  AND notify_phone IS NOT NULL AND notify_phone <> ''`;
  try {
    const key = VM.normEmail(email);
    if (key) {
      const r = await dbGet(`${base} AND email = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`, [club_slug, key]);
      if (r && r.notify_phone) return r.notify_phone;
    }
    const c = await dbGet(`${base} ORDER BY created_at DESC, rowid DESC LIMIT 1`, [club_slug]);
    return c ? c.notify_phone : null;
  } catch (e) {
    console.error('ultimoNotifyPhone:', e.message);
    return null;
  }
}

/**
 * Enfileira o job `slides` de UMA versao (1 ativo por clube + versao: pedir de novo devolve o existente).
 * payload = { versao, content_md, club_slug, nome_clube, email, notify_phone, aprovada, ficha_md }.
 * Devolve null quando a versao nao existe.
 */
async function enqueueSlidesJob({ dbGet, dbRun, uuidv4, safeJsonParse, JOBS }, { club_slug, nome_clube = null, versao, email, aprovada = null, forcar = false }) {
  const v = await getVersion({ dbGet }, club_slug, versao, { withContent: true });
  if (!v) return null;
  const parse = safeJsonParse || ((s, f) => parseJson(s, f));
  const ficha = await dbGet(`SELECT fields FROM script_fichas WHERE club_slug = ?`, [club_slug]);
  const key = VM.normEmail(email);
  const notify_phone = await ultimoNotifyPhone({ dbGet }, club_slug, key);
  const payload = {
    versao: v.versao,
    content_md: v.content_md || '',
    club_slug,
    nome_clube: nome_clube || null,
    email: key,
    notify_phone,
    aprovada: aprovada == null ? v.status === 'aprovado' : !!aprovada,
    ficha_md: fichaMd(parse(ficha ? ficha.fields : null, {})),
    // admin "Gerar slides" em versao nao aprovada: o runner so aceita `aprovada: false` com `forcar: true`
    forcar: !!forcar,
  };
  return JOBS.enqueueJob({ dbGet, dbRun, uuidv4 }, { tipo: 'slides', club_slug, email: key, notify_phone, payload });
}

// ─── Pedido de nova versao (job `revisar`) ───────────────────────────────────
// O membro pede em POST /api/script/versoes/:versao/revisar; o admin forca em
// POST /api/admin/clubs/:slug/script-versoes/:versao/revisar. Os dois montam o payload aqui, para o
// worker receber sempre a mesma forma; o que muda e `origem`, que decide se a rodada de ajustes do
// clube foi gasta (so `membro` conta; ver contarAjustes em routes/script.cjs).
const ORIGEM_MEMBRO = 'membro';
const ORIGEM_ADMIN = 'admin';

/** URL de download de um anexo de contexto (nunca caminho de disco). */
const contextFileUrl = (fileId) => `/api/script/context/files/${encodeURIComponent(fileId)}/download`;

/**
 * Grifos -> comentarios da versao, para o payload do job `revisar`.
 * O front manda os grifos ja convertidos em `comentarios` ("[GRIFO ajustar] «trecho» → nota", passo 0..7 ou 9);
 * sem eles, o servidor converte os grifos pendentes ate a versao no mesmo formato. Cada um vira um comentario da
 * versao (autor = quem pediu; no banco o passo 9 vira 0) e entra no payload com o passo da tela (0..7 ou 9).
 * Dedupe pelo texto: pedir de novo com os mesmos grifos nao duplica.
 *
 * Onda E3: o servidor e a fonte da verdade do sufixo " · anexos: ...". O que vem do front e casado pelo texto
 * sem o sufixo e trocado pela versao com os anexos de agora. Grifo sem anexo passa intacto.
 */
async function comentariosDoPedido({ dbGet, dbAll, dbRun, uuidv4 }, club_slug, versao, vindos, autorEmail, fileUrl = contextFileUrl) {
  const n = Number(versao);
  const existentes = await listComments({ dbAll }, club_slug, n);
  const pendentes = await SG.comContexto({ dbAll }, club_slug, await SG.listGrifosPendentes({ dbAll }, club_slug, n), { fileUrl });
  const doServidor = pendentes.map(SG.grifoParaComentario);
  let lista = doServidor;
  if (Array.isArray(vindos) && vindos.length) {
    const porBase = new Map(doServidor.map((c) => [SG.comentarioSemAnexos(c.texto), c.texto]));
    lista = vindos.map((c) => ({ ...c, texto: porBase.get(SG.comentarioSemAnexos(c.texto)) || c.texto }));
  }
  const textos = new Set(existentes.map((c) => c.texto));
  const novos = [];
  for (const c of lista) {
    const texto = String(c.texto || '').trim();
    if (!texto || textos.has(texto)) continue;
    textos.add(texto);
    const saved = await insertComment({ dbGet, dbRun, uuidv4 }, {
      club_slug, versao: n, passo: SG.passoNoBanco(c.passo), texto, autor_email: autorEmail,
    });
    novos.push({ passo: Number(c.passo) || 0, texto, autor: saved.autor_nome || saved.autor_email || null, created_at: saved.created_at, origem: 'grifo' });
  }
  return {
    existentes: existentes.map((c) => ({ passo: c.passo, texto: c.texto, autor: c.autor_nome || c.autor_email || null, created_at: c.created_at })),
    novos,
  };
}

/**
 * Payload do job `revisar`: a versao base (content_md) + TODOS os comentarios dela (inclusive os grifos
 * convertidos) + o pedido livre. O worker escreve a proxima versao a partir disso.
 * @returns {{ payload: object, comentarios: object[], grifos: object[] }}
 */
async function montarPedidoRevisar(deps, {
  club_slug, versao, content_md, comentarios: vindos = null, autor_email = null,
  nome = null, pedido = '', origem = ORIGEM_MEMBRO, fileUrl = contextFileUrl, extra = null,
}) {
  const n = Number(versao);
  const { existentes, novos } = await comentariosDoPedido(deps, club_slug, n, vindos, autor_email, fileUrl);
  const comentarios = [...existentes, ...novos];
  const payload = {
    versao: n,
    content_md: content_md || '',
    comentarios,
    nome: nome || null,
    pedido_em: new Date().toISOString(),
    // Quem pediu: e o que conta na rodada de ajustes (job forcado pelo admin ou nascido no worker nao conta)
    origem,
    ...(extra || {}),
  };
  const texto = String(pedido || '').trim();
  if (texto) payload.pedido = texto;
  const grifos = comentarios.filter((c) => SG.comentarioEhGrifo(c.texto));
  if (grifos.length) {
    payload.grifos = {
      total: grifos.length,
      ajustar: grifos.filter((c) => /^\[GRIFO ajustar\]/.test(c.texto)).length,
      manter: grifos.filter((c) => /^\[GRIFO manter\]/.test(c.texto)).length,
      tirar: grifos.filter((c) => /^\[GRIFO tirar\]/.test(c.texto)).length,
    };
  }
  return { payload, comentarios, grifos };
}

module.exports = {
  VERSAO_STATUSES,
  ORIGEM_MEMBRO,
  ORIGEM_ADMIN,
  contextFileUrl,
  comentariosDoPedido,
  montarPedidoRevisar,
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
  resolveGrifosDoJob,
  herdarTarefas,
  entregavelDir,
  rowToEntregavel,
  getEntregavelRow,
  listEntregaveis,
  entregaveisPorVersao,
  arquivoDoEntregavel,
  saveEntregavel,
  fichaMd,
  ultimoNotifyPhone,
  enqueueSlidesJob,
};
