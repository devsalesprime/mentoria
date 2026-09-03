/**
 * Contexto por pergunta da Ficha do Script (tabela script_field_context).
 * Cada item pertence ao CLUBE (todos os socios veem) e tem autor (so o autor apaga).
 * Tipos: audio (transcrito na hora via Groq), imagem, video, link, nota.
 *
 * Arquivos vao para uploaded_files com category 'script_contexto' e module 'script' (mesmo diskStorage de routes/files.cjs);
 * NAO aparecem entre os Materiais (utils/cohort-materials.cjs filtra a categoria).
 *
 * Gotcha da casa (Groq): a API responde 403 sem um User-Agent de navegador.
 */
const path = require('path');
const { z } = require('zod');

const CONTEXT_TIPOS = ['audio', 'imagem', 'video', 'link', 'nota'];
const CONTEXT_CATEGORY = 'script_contexto';

const MB = 1024 * 1024;
const LIMITS = {
  audio: { maxBytes: 25 * MB, mimes: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3', 'video/webm'], exts: ['.webm', '.ogg', '.oga', '.opus', '.mp4', '.m4a', '.wav', '.mp3', '.mpeg', '.mpga'] },
  imagem: { maxBytes: 10 * MB, mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], exts: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'] },
  video: { maxBytes: 50 * MB, mimes: ['video/mp4', 'video/quicktime', 'video/webm'], exts: ['.mp4', '.mov', '.webm'] },
};
const LIMIT_LABEL = { audio: '25 MB', imagem: '10 MB', video: '50 MB' };
const TIPO_LABEL = { audio: 'áudio', imagem: 'imagem', video: 'vídeo', link: 'link', nota: 'nota' };

const isHttpUrl = (v) => /^https?:\/\/\S+$/i.test(String(v || '').trim());

/** Campos de texto do multipart (o arquivo vem em req.file). */
const contextBodySchema = z.object({
  field_key: z.string().trim().min(3).max(8),
  tipo: z.enum(CONTEXT_TIPOS),
  url: z.string().trim().max(2000).optional().default(''),
  texto: z.string().max(20000).optional().default(''),
  legenda: z.string().trim().max(500).optional().default(''),
});

const DDL = [
  `CREATE TABLE IF NOT EXISTS script_field_context (
  id TEXT PRIMARY KEY,
  club_slug TEXT NOT NULL,
  user_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('audio', 'imagem', 'video', 'link', 'nota')),
  file_id TEXT,
  url TEXT,
  texto TEXT,
  legenda TEXT,
  transcricao TEXT,
  erro_transcricao TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE INDEX IF NOT EXISTS idx_script_field_context_club_field ON script_field_context(club_slug, field_key)`,
];

/** Idempotente; chamado pelos routers (script, admin-cohort, jobs). Registro: migrations/018_script_context_versions.sql */
async function ensureScriptContextTable(dbRun) {
  for (const s of DDL) await dbRun(s);
}

/**
 * Valida o arquivo enviado para o tipo (mime OU extensao aceitos; tamanho no limite).
 * @returns {string|null} mensagem de erro ou null
 */
function fileError(tipo, file) {
  const lim = LIMITS[tipo];
  if (!lim) return null;
  if (!file) return `Envie o arquivo de ${TIPO_LABEL[tipo]}.`;
  const mime = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
  const ext = path.extname(file.originalname || '').toLowerCase();
  const ok = lim.mimes.includes(mime) || lim.exts.includes(ext);
  if (!ok) {
    if (tipo === 'audio') return 'Áudio não aceito. Use webm, ogg, mp4, m4a, wav ou mp3.';
    if (tipo === 'imagem') return 'Imagem não aceita. Use jpg, png, webp ou heic.';
    return 'Vídeo não aceito. Use mp4, mov ou webm.';
  }
  if (file.size > lim.maxBytes) return `Arquivo grande demais para ${TIPO_LABEL[tipo]} (máximo ${LIMIT_LABEL[tipo]}).`;
  return null;
}

/**
 * Valida o pedido inteiro (body ja passado pelo schema + req.file). Devolve { ok, message } ou { ok: true, item }.
 * item = { tipo, url, texto, legenda } prontos para gravar.
 */
function validateContextRequest(body, file, fieldKeys) {
  if (!fieldKeys.includes(body.field_key)) return { ok: false, message: 'Campo desconhecido.' };
  const { tipo } = body;
  if (tipo === 'link') {
    if (!isHttpUrl(body.url)) return { ok: false, message: 'Link inválido: comece com http:// ou https://.' };
    return { ok: true, item: { tipo, url: body.url.trim(), texto: body.texto || '', legenda: body.legenda || '' } };
  }
  if (tipo === 'nota') {
    if (!String(body.texto || '').trim()) return { ok: false, message: 'Escreva a nota.' };
    return { ok: true, item: { tipo, url: '', texto: body.texto.trim(), legenda: body.legenda || '' } };
  }
  const err = fileError(tipo, file);
  if (err) return { ok: false, message: err };
  return { ok: true, item: { tipo, url: '', texto: body.texto || '', legenda: body.legenda || '' } };
}

/**
 * Transcreve um audio via Groq (OpenAI-compatible). Sincrono do ponto de vista do pedido (ate `timeoutMs`).
 * @returns {Promise<{ ok: true, texto: string } | { ok: false, erro: string }>}
 */
async function transcribeAudio(filePath, { mimetype, fileName, apiKey, fetchImpl, fs, timeoutMs = 60000, model = 'whisper-large-v3-turbo' } = {}) {
  const key = String(apiKey || process.env.GROQ_API_KEY || '').trim();
  if (!key) return { ok: false, erro: 'GROQ_API_KEY ausente no servidor' };
  const doFetch = fetchImpl || globalThis.fetch;
  const fsLib = fs || require('fs');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const buf = fsLib.readFileSync(filePath);
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: mimetype || 'application/octet-stream' }), fileName || path.basename(filePath));
    fd.append('model', model);
    fd.append('language', 'pt');
    fd.append('response_format', 'json');
    const res = await doFetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        // Gotcha da casa: sem User-Agent de navegador a Groq responde 403.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json',
      },
      body: fd,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, erro: `Groq ${res.status}: ${text.slice(0, 300)}` };
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    const out = data && typeof data.text === 'string' ? data.text.trim() : '';
    if (!out) return { ok: false, erro: 'Groq devolveu transcrição vazia' };
    return { ok: true, texto: out };
  } catch (e) {
    return { ok: false, erro: e && e.name === 'AbortError' ? `tempo esgotado (${Math.round(timeoutMs / 1000)} s)` : `falha na transcrição: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

const SELECT = `SELECT c.*, f.file_name, f.file_type, f.file_size, u.email AS autor_email, u.name AS autor_nome
   FROM script_field_context c
   LEFT JOIN uploaded_files f ON f.id = c.file_id
   LEFT JOIN users u ON u.id = c.user_id`;

function rowToItem(r, fileUrl) {
  return {
    id: r.id,
    field_key: r.field_key,
    tipo: r.tipo,
    file_id: r.file_id || null,
    file_name: r.file_name || null,
    file_type: r.file_type || null,
    file_size: r.file_size == null ? null : r.file_size,
    url: r.url || '',
    texto: r.texto || '',
    legenda: r.legenda || '',
    transcricao: r.transcricao == null ? null : r.transcricao,
    erro_transcricao: r.erro_transcricao || null,
    autor_email: r.autor_email ? String(r.autor_email).toLowerCase() : null,
    autor_nome: r.autor_nome || null,
    autor_user_id: r.user_id,
    created_at: r.created_at,
    download_url: r.file_id && fileUrl ? fileUrl(r.file_id) : null,
  };
}

/** Itens do clube (todos os campos, ou so `field`), mais antigos primeiro. */
async function listContext({ dbAll }, club_slug, { field = null, fileUrl = null } = {}) {
  const rows = await dbAll(
    `${SELECT} WHERE c.club_slug = ? ${field ? 'AND c.field_key = ?' : ''} ORDER BY c.created_at ASC, c.rowid ASC`,
    field ? [club_slug, field] : [club_slug]
  );
  return rows.map((r) => rowToItem(r, fileUrl));
}

/** { field_key: [items] } */
function groupByField(items) {
  const out = {};
  for (const it of items) (out[it.field_key] = out[it.field_key] || []).push(it);
  return out;
}

async function getContextItem({ dbGet }, club_slug, id, fileUrl = null) {
  const r = await dbGet(`${SELECT} WHERE c.id = ? AND c.club_slug = ?`, [id, club_slug]);
  return r ? rowToItem(r, fileUrl) : null;
}

/** { field_key: n } */
async function countByField({ dbAll }, club_slug) {
  const rows = await dbAll(`SELECT field_key, COUNT(*) AS n FROM script_field_context WHERE club_slug = ? GROUP BY field_key`, [club_slug]);
  return Object.fromEntries(rows.map((r) => [r.field_key, r.n]));
}

async function insertContext({ dbRun }, { id, club_slug, user_id, field_key, tipo, file_id = null, url = '', texto = '', legenda = '', transcricao = null, erro_transcricao = null }) {
  await dbRun(
    `INSERT INTO script_field_context (id, club_slug, user_id, field_key, tipo, file_id, url, texto, legenda, transcricao, erro_transcricao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, club_slug, user_id, field_key, tipo, file_id, url || null, texto || null, legenda || null, transcricao, erro_transcricao]
  );
}

/** Apaga o item (e o arquivo, se houver). Devolve a linha apagada ou null. */
async function deleteContext({ dbGet, dbRun }, club_slug, id, { fs } = {}) {
  const row = await dbGet(`SELECT * FROM script_field_context WHERE id = ? AND club_slug = ?`, [id, club_slug]);
  if (!row) return null;
  await dbRun(`DELETE FROM script_field_context WHERE id = ?`, [id]);
  if (row.file_id) {
    const f = await dbGet(`SELECT * FROM uploaded_files WHERE id = ?`, [row.file_id]);
    if (f) {
      await dbRun(`DELETE FROM uploaded_files WHERE id = ?`, [f.id]);
      const fsLib = fs || require('fs');
      try { if (f.file_path && fsLib.existsSync(f.file_path)) fsLib.unlinkSync(f.file_path); } catch { /* ignore */ }
    }
  }
  return row;
}

/** Arquivo de contexto do clube (download por qualquer socio / worker). */
async function getContextFile({ dbGet }, club_slug, fileId) {
  return dbGet(
    `SELECT f.* FROM uploaded_files f JOIN script_field_context c ON c.file_id = f.id
      WHERE f.id = ? AND c.club_slug = ? AND f.category = ?`,
    [fileId, club_slug, CONTEXT_CATEGORY]
  );
}

module.exports = {
  CONTEXT_TIPOS,
  CONTEXT_CATEGORY,
  LIMITS,
  contextBodySchema,
  ensureScriptContextTable,
  fileError,
  validateContextRequest,
  transcribeAudio,
  rowToItem,
  listContext,
  groupByField,
  getContextItem,
  countByField,
  insertContext,
  deleteContext,
  getContextFile,
};
