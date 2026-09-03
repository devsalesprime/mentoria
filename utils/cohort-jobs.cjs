/**
 * Fila de jobs do cohort (tabela cohort_jobs): o app enfileira quando o mentor clica em
 * "Confirmar e ir para a ficha"; um worker externo (a Naia, no VPS) puxa pelo /api/jobs/*.
 *
 * Regras:
 *   - 1 job ativo (queued|running) por (tipo, club_slug, email): enfileirar de novo devolve o existente.
 *   - claim atomico: UPDATE ... WHERE id = (SELECT ... LIMIT 1) AND status = 'queued' RETURNING *.
 *   - terminal = done | error | needs_human (grava finished_at). Requeue volta para queued.
 */
const VM = require('./validation-materials.cjs');

const TERMINAL = ['done', 'error', 'needs_human'];

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
    created_at: row.created_at,
    started_at: row.started_at || null,
    finished_at: row.finished_at || null,
    updated_at: row.updated_at,
  };
}

async function getJob({ dbGet }, id) {
  return rowToJob(await dbGet(`SELECT * FROM cohort_jobs WHERE id = ?`, [id]));
}

/** Job ativo (queued|running) da pessoa para o tipo, se existir. */
async function findActiveJob({ dbGet }, { tipo = 'prefill', club_slug, email }) {
  return rowToJob(await dbGet(
    `SELECT * FROM cohort_jobs WHERE tipo = ? AND club_slug = ? AND email = ? AND status IN ('queued', 'running')
      ORDER BY created_at DESC LIMIT 1`,
    [tipo, club_slug, VM.normEmail(email)]
  ));
}

/** Ultimo job da pessoa (qualquer status). */
async function findLatestJob({ dbGet }, { tipo = 'prefill', club_slug, email }) {
  return rowToJob(await dbGet(
    `SELECT * FROM cohort_jobs WHERE tipo = ? AND club_slug = ? AND email = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    [tipo, club_slug, VM.normEmail(email)]
  ));
}

/**
 * Enfileira (ou devolve o job ativo existente da mesma pessoa).
 * @returns {{ job: object, existing: boolean }}
 */
async function enqueueJob({ dbGet, dbRun, uuidv4 }, { tipo = 'prefill', club_slug, email, notify_phone = null, payload = null }) {
  const key = VM.normEmail(email);
  const active = await findActiveJob({ dbGet }, { tipo, club_slug, email: key });
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
 * Reivindica o job mais antigo em `queued` do tipo, de forma atomica (1 statement, RETURNING).
 * Devolve null quando a fila esta vazia.
 */
async function claimNextJob({ dbGet }, tipo = 'prefill') {
  const row = await dbGet(
    `UPDATE cohort_jobs
        SET status = 'running', started_at = CURRENT_TIMESTAMP, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM cohort_jobs WHERE status = 'queued' AND tipo = ? ORDER BY created_at ASC, rowid ASC LIMIT 1)
        AND status = 'queued'
      RETURNING *`,
    [tipo]
  );
  return rowToJob(row);
}

/**
 * Atualiza o status pelo worker. Terminal grava finished_at; queued (devolver a fila) limpa started/finished.
 * @param {{status: string, result?: any, error?: string|null}} patch
 */
async function updateJobStatus({ dbGet, dbRun }, id, patch) {
  const status = patch.status;
  if (!VM.JOB_STATUSES.includes(status)) throw new Error('status inválido');
  const sets = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const params = [status];
  if (patch.result !== undefined) { sets.push('result = ?'); params.push(patch.result == null ? null : JSON.stringify(patch.result)); }
  if (patch.error !== undefined) { sets.push('error = ?'); params.push(patch.error == null ? null : String(patch.error).slice(0, 4000)); }
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
  rowToJob,
  getJob,
  findActiveJob,
  findLatestJob,
  enqueueJob,
  claimNextJob,
  updateJobStatus,
  requeueJob,
  listJobs,
  listPhones,
};
