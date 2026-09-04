/**
 * Fila de jobs do cohort (tabela cohort_jobs). Um worker externo (a Naia, no VPS) puxa pelo /api/jobs/*.
 *
 * Tipos (VM.JOB_TIPOS):
 *   prefill : "Confirmar e ir para a ficha" (materiais). 1 ativo por (club_slug, email).
 *   script  : ficha confirmada (complete / gerar-script = "Gerar do zero"). 1 ativo por club_slug.
 *   revisar : nova versao a partir de uma versao + comentarios (payload.versao). Divide o escopo com `script`:
 *             1 ativo por club_slug entre script|revisar (os dois escrevem a proxima versao do mesmo clube).
 *   refinar : nova sugestao para 1 campo (payload.field_key). 1 ativo por (club_slug, field_key).
 *
 * Regras:
 *   - job ativo = queued|running; enfileirar de novo dentro do escopo devolve o existente.
 *   - claim atomico: UPDATE ... WHERE id = (SELECT ... LIMIT 1) AND status = 'queued' RETURNING *.
 *   - terminal = done | error | needs_human (grava finished_at). Requeue volta para queued.
 */
const VM = require('./validation-materials.cjs');

const TERMINAL = ['done', 'error', 'needs_human'];
const ACTIVE = ['queued', 'running'];
/** Tamanho maximo do JSON de `progresso` gravado pelo worker (PATCH /api/jobs/:id). */
const PROGRESSO_MAX_BYTES = 4096;
/** Tipos que escrevem a proxima versao do script do clube: dividem o mesmo escopo de deduplicacao. */
const SCRIPT_FAMILY = ['script', 'revisar'];

/** Escopo de deduplicacao por tipo: onde 1 job ativo basta. */
function dedupeScope(tipo) {
  if (SCRIPT_FAMILY.includes(tipo)) return 'club';
  if (tipo === 'refinar') return 'club_field';
  return 'pessoa';
}

/** Tipos que contam no escopo: script|revisar juntos; os demais so o proprio. */
function scopeTipos(tipo) {
  return SCRIPT_FAMILY.includes(tipo) ? SCRIPT_FAMILY : [tipo];
}

function parseJson(s, fallback = null) {
  if (s == null || s === '') return fallback;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return fallback; }
}

/** Linha do banco -> objeto da API (payload/result como JSON). */
function rowToJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    tipo: row.tipo,
    club_slug: row.club_slug,
    email: row.email,
    notify_phone: row.notify_phone || null,
    status: row.status,
    attempts: row.attempts || 0,
    payload: parseJson(row.payload, null),
    result: parseJson(row.result, null),
    error: row.error || null,
    // Marcos do worker (prefill em blocos): null ate o primeiro PATCH running { progresso }
    progresso: parseJson(row.progresso, null),
    created_at: row.created_at,
    started_at: row.started_at || null,
    finished_at: row.finished_at || null,
    updated_at: row.updated_at,
  };
}

async function getJob({ dbGet }, id) {
  return rowToJob(await dbGet(`SELECT * FROM cohort_jobs WHERE id = ?`, [id]));
}

/**
 * Job ativo (queued|running) no escopo do tipo, se existir:
 * prefill = (club, email) · script|revisar = (club, qualquer um dos dois) · refinar = (club, payload.field_key).
 */
async function findActiveJob({ dbGet }, { tipo = 'prefill', club_slug, email, field_key = null }) {
  const scope = dedupeScope(tipo);
  const tipos = scopeTipos(tipo);
  const where = [`tipo IN (${tipos.map(() => '?').join(', ')})`, `club_slug = ?`, `status IN ('queued', 'running')`];
  const params = [...tipos, club_slug];
  if (scope === 'pessoa') { where.push('email = ?'); params.push(VM.normEmail(email)); }
  if (scope === 'club_field') { where.push(`json_extract(payload, '$.field_key') = ?`); params.push(String(field_key || '')); }
  return rowToJob(await dbGet(
    `SELECT * FROM cohort_jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    params
  ));
}

/** Ultimo job (qualquer status) no escopo do tipo (prefill = da pessoa; script|revisar = do clube, o mais recente dos dois; refinar = do campo). */
async function findLatestJob({ dbGet }, { tipo = 'prefill', club_slug, email, field_key = null }) {
  const scope = dedupeScope(tipo);
  const tipos = scopeTipos(tipo);
  const where = [`tipo IN (${tipos.map(() => '?').join(', ')})`, `club_slug = ?`];
  const params = [...tipos, club_slug];
  if (scope === 'pessoa') { where.push('email = ?'); params.push(VM.normEmail(email)); }
  if (scope === 'club_field') { where.push(`json_extract(payload, '$.field_key') = ?`); params.push(String(field_key || '')); }
  return rowToJob(await dbGet(
    `SELECT * FROM cohort_jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    params
  ));
}

/** Chaves de campo com job `refinar` ativo (queued|running) no clube: a ficha marca `refinando: true`. */
async function listRefiningKeys({ dbAll }, club_slug) {
  const rows = await dbAll(
    `SELECT DISTINCT json_extract(payload, '$.field_key') AS k FROM cohort_jobs
      WHERE tipo = 'refinar' AND club_slug = ? AND status IN ('queued', 'running')`,
    [club_slug]
  );
  return rows.map((r) => r.k).filter(Boolean);
}

/**
 * Enfileira (ou devolve o job ativo existente no escopo do tipo).
 * Para `refinar`, `payload.field_key` e obrigatorio (escopo da deduplicacao).
 * @returns {{ job: object, existing: boolean }}
 */
async function enqueueJob({ dbGet, dbRun, uuidv4 }, { tipo = 'prefill', club_slug, email, notify_phone = null, payload = null }) {
  if (!VM.JOB_TIPOS.includes(tipo)) throw new Error(`tipo de job inválido: ${tipo}`);
  const key = VM.normEmail(email);
  const field_key = payload && payload.field_key ? String(payload.field_key) : null;
  if (tipo === 'refinar' && !field_key) throw new Error('job refinar exige payload.field_key');
  const active = await findActiveJob({ dbGet }, { tipo, club_slug, email: key, field_key });
  if (active) {
    // Atualiza o telefone se a pessoa informou um novo (o job ainda nao rodou)
    if (notify_phone && notify_phone !== active.notify_phone) {
      await dbRun(`UPDATE cohort_jobs SET notify_phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [notify_phone, active.id]);
      active.notify_phone = notify_phone;
    }
    return { job: active, existing: true };
  }
  const id = `job-${uuidv4()}`;
  await dbRun(
    `INSERT INTO cohort_jobs (id, tipo, club_slug, email, notify_phone, status, attempts, payload)
     VALUES (?, ?, ?, ?, ?, 'queued', 0, ?)`,
    [id, tipo, club_slug, key, notify_phone || null, payload ? JSON.stringify(payload) : null]
  );
  return { job: await getJob({ dbGet }, id), existing: false };
}

/**
 * Reivindica o job mais antigo em `queued`, de forma atomica (1 statement, RETURNING).
 * tipo = 'prefill' | 'script' | 'refinar' filtra; null, '' ou 'any' pega o mais antigo de qualquer tipo.
 * Devolve null quando a fila esta vazia.
 */
async function claimNextJob({ dbGet }, tipo = null) {
  const any = !tipo || tipo === 'any';
  const row = await dbGet(
    `UPDATE cohort_jobs
        SET status = 'running', started_at = CURRENT_TIMESTAMP, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM cohort_jobs WHERE status = 'queued' ${any ? '' : 'AND tipo = ?'} ORDER BY created_at ASC, rowid ASC LIMIT 1)
        AND status = 'queued'
      RETURNING *`,
    any ? [] : [tipo]
  );
  return rowToJob(row);
}

/**
 * Atualiza o status pelo worker. Terminal grava finished_at; queued (devolver a fila) limpa started/finished.
 * `progresso` (objeto, ate PROGRESSO_MAX_BYTES) e gravado como JSON com qualquer status; null limpa.
 * @param {{status: string, result?: any, error?: string|null, progresso?: object|null}} patch
 */
async function updateJobStatus({ dbGet, dbRun }, id, patch) {
  const status = patch.status;
  if (!VM.JOB_STATUSES.includes(status)) throw new Error('status inválido');
  const sets = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const params = [status];
  if (patch.result !== undefined) { sets.push('result = ?'); params.push(patch.result == null ? null : JSON.stringify(patch.result)); }
  if (patch.error !== undefined) { sets.push('error = ?'); params.push(patch.error == null ? null : String(patch.error).slice(0, 4000)); }
  if (patch.progresso !== undefined) {
    const json = patch.progresso == null ? null : JSON.stringify(patch.progresso);
    if (json && Buffer.byteLength(json, 'utf8') > PROGRESSO_MAX_BYTES) throw new Error('progresso acima de 4 KB');
    sets.push('progresso = ?'); params.push(json);
  }
  if (TERMINAL.includes(status)) sets.push('finished_at = CURRENT_TIMESTAMP');
  else if (status === 'queued') { sets.push('started_at = NULL'); sets.push('finished_at = NULL'); }
  else if (status === 'running') { sets.push('finished_at = NULL'); sets.push('started_at = COALESCE(started_at, CURRENT_TIMESTAMP)'); }
  const r = await dbRun(`UPDATE cohort_jobs SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  if (!r.changes) return null;
  return getJob({ dbGet }, id);
}

/** Admin: volta o job para a fila (mantem attempts e o erro anterior fica no historico do result). */
async function requeueJob({ dbGet, dbRun }, id) {
  const r = await dbRun(
    `UPDATE cohort_jobs SET status = 'queued', started_at = NULL, finished_at = NULL, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id]
  );
  if (!r.changes) return null;
  return getJob({ dbGet }, id);
}

async function listJobs({ dbAll }, { status = null, tipo = null, limit = 200 } = {}) {
  const where = [];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (tipo) { where.push('tipo = ?'); params.push(tipo); }
  const rows = await dbAll(
    `SELECT * FROM cohort_jobs ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 WHEN 'needs_human' THEN 2 WHEN 'error' THEN 3 ELSE 4 END,
               created_at DESC
      LIMIT ?`,
    [...params, Math.max(1, Math.min(1000, Number(limit) || 200))]
  );
  return rows.map(rowToJob);
}

async function listPhones({ dbAll }) {
  const rows = await dbAll(`SELECT DISTINCT notify_phone FROM cohort_jobs WHERE notify_phone IS NOT NULL AND notify_phone <> '' ORDER BY notify_phone`);
  return rows.map((r) => r.notify_phone);
}

module.exports = {
  TERMINAL,
  ACTIVE,
  PROGRESSO_MAX_BYTES,
  SCRIPT_FAMILY,
  dedupeScope,
  scopeTipos,
  rowToJob,
  getJob,
  findActiveJob,
  findLatestJob,
  listRefiningKeys,
  enqueueJob,
  claimNextJob,
  updateJobStatus,
  requeueJob,
  listJobs,
  listPhones,
};
