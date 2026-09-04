// @ts-nocheck
/** @vitest-environment node */
/**
 * Gates de suficiencia nas rotas (routes/jobs.cjs, routes/script.cjs, routes/admin-cohort.cjs) em sqlite :memory:,
 * com os routers reais:
 * - prefill suficiente + PATCH done: ficha `confirmada` (confirmada_por 'automatica'), campos com origem automatica,
 *   job `script` na fila (1 por clube), result.mensagem_mentor + result.suficiencia no job
 * - prefill parcial + PATCH done: ficha fica `pre_preenchida`, `faltam` gravado, mensagem com o link da ficha;
 *   complete -> 400 ate o mentor decidir os `faltam`; depois confirma o resto em nome dele e enfileira o script
 * - needs_human rebaixa; insuficiente aponta para Materiais; ultimo bloco parcial ja grava a avaliacao
 * - GET /api/script/ficha e GET /api/jobs/:id/ficha devolvem `suficiencia`; admin: coluna e detalhe; forcar revisao / script
 * - 6.2 vazio nunca gera script (auto ou forcado)
 * - pendencia: POST /api/jobs cria 1 por clube; next devolve payload e result; PATCH queued funde o result; admin mostra "Aguardando resposta do mentor"
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import createScriptRoutes from '../../routes/script.cjs';
import createAdminCohortRoutes from '../../routes/admin-cohort.cjs';
import createJobsRoutes from '../../routes/jobs.cjs';

const TOKEN = 'token-suficiencia';
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'suficiencia-campos.json'), 'utf8'));
let server; let base; let dbRun; let dbGet;

function safeJsonParse(str, fallback = {}) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

const authMiddleware = (req, res, next) => {
  const id = req.headers['x-user'];
  if (!id) return res.status(401).json({ success: false });
  req.user = { userId: id, role: id === 'admin' ? 'admin' : 'member', email: id === 'admin' ? 'caio@prosperus.com' : undefined };
  next();
};
const adminMiddleware = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ success: false }));

async function api(method, url, user, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { 'x-user': user } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

async function worker(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

/** Submit da pessoa + claim do worker: devolve o job `prefill` em running. */
async function abrirPrefill(user) {
  const sub = await api('POST', '/api/script/ficha/materials/submit', user, { notify_phone: '11987654321' });
  expect(sub.status).toBe(200);
  let next;
  // pega o job desta pessoa (a fila pode ter outros)
  for (let k = 0; k < 5; k++) {
    next = await worker('POST', '/api/jobs/next', { tipo: 'prefill' });
    if (next.status === 200 && next.data.job.id === sub.data.job.id) return next.data.job;
    if (next.status === 200) await worker('PATCH', `/api/jobs/${next.data.job.id}`, { status: 'error', error: 'fora do teste' });
  }
  throw new Error('job de prefill nao encontrado');
}

const campoDe = (ficha, k) => ficha.blocos.flatMap((b) => b.campos).find((c) => c.key === k);
const JARGAO = /\b(job|cohort|gate|VZ|DER|classe|prefill|worker|runner|needs_human)\b/i;

beforeAll(async () => {
  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbRun = helpers.dbRun;
  dbGet = helpers.dbGet;
  const ddl = [
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'member', cohort TEXT, club_slug TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL,
       file_type TEXT, file_size INTEGER, url TEXT, module TEXT DEFAULT 'general', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_clubs (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_members (email TEXT PRIMARY KEY, club_slug TEXT NOT NULL, nome TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    // script_fichas SEM as colunas novas: o router faz o ALTER idempotente (migrations/020)
    `CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', materials JSON NOT NULL DEFAULT '{}',
       materials_status TEXT NOT NULL DEFAULT 'pending', materials_submitted_at DATETIME, ficha_status TEXT NOT NULL DEFAULT 'vazia', prefill_meta JSON,
       prefilled_at DATETIME, reviewed_at DATETIME, last_user_activity_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const s of ddl) await dbRun(s);
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-s', 'Clube Suficiente', 1), ('clube-p', 'Clube Parcial', 1), ('clube-i', 'Clube Insuficiente', 1), ('clube-h', 'Clube Humano', 1), ('clube-f', 'Clube Forcado', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('s@x.com', 'clube-s', 'Sofia'), ('p@x.com', 'clube-p', 'Paulo'), ('i@x.com', 'clube-i', 'Ivo'), ('h@x.com', 'clube-h', 'Helena'), ('f@x.com', 'clube-f', 'Fábio')`);
  await dbRun(`INSERT INTO users (id, email, name, cohort, club_slug) VALUES
    ('userS', 's@x.com', 'Sofia', 'exclusive', 'clube-s'),
    ('userP', 'p@x.com', 'Paulo', 'exclusive', 'clube-p'),
    ('userI', 'i@x.com', 'Ivo', 'exclusive', 'clube-i'),
    ('userH', 'h@x.com', 'Helena', 'exclusive', 'clube-h'),
    ('userF', 'f@x.com', 'Fábio', 'exclusive', 'clube-f')`);

  const deps = { db, ...helpers, authMiddleware, adminMiddleware, uuidv4: () => `id-${Math.random().toString(36).slice(2)}`, fs, path, safeJsonParse };
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(createScriptRoutes(deps));
  app.use(createAdminCohortRoutes(deps));
  app.use(createJobsRoutes({ ...deps, COHORT_JOBS_TOKEN: TOKEN, APP_URL: 'https://app.teste.local/' }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('suficiente: a ficha fecha sozinha e o script entra na fila', () => {
  let job;
  it('PUT prefill + PATCH done -> confirmada (automatica), script na fila, mensagem ao mentor', async () => {
    job = await abrirPrefill('userS');
    const put = await worker('PUT', `/api/jobs/${job.id}/prefill`, { club_slug: 'clube-s', campos: FIX.suficiente });
    expect(put.status).toBe(200);
    expect(put.data.suficiencia).toBeUndefined(); // import completo: a avaliacao e no PATCH done
    const done = await worker('PATCH', `/api/jobs/${job.id}`, { status: 'done', result: { imported: 34 } });
    expect(done.status).toBe(200);
    expect(done.data.suficiencia).toMatchObject({ resultado: 'suficiente', ficha_status: 'confirmada', criticos_ok: true });
    expect(done.data.suficiencia.script_job_id).toBeTruthy();
    expect(done.data.job.result).toMatchObject({ imported: 34, suficiencia: { resultado: 'suficiente', faltam_n: 3 } });
    expect(done.data.job.result.mensagem_mentor).toBe('Sofia, lemos os seus materiais e já temos o que precisamos. Seu script está sendo gerado, chega em alguns minutos.');
    expect(done.data.job.result.mensagem_mentor.length).toBeLessThanOrEqual(500);
    expect(done.data.job.result.mensagem_mentor).not.toMatch(JARGAO);

    const ficha = await api('GET', '/api/script/ficha', 'userS');
    expect(ficha.data.data.ficha_status).toBe('confirmada');
    expect(ficha.data.data.confirmada_por).toBe('automatica');
    expect(ficha.data.data.suficiencia).toMatchObject({ resultado: 'suficiente', job_id: job.id, script_job_id: done.data.suficiencia.script_job_id });
    expect(ficha.data.data.suficiencia.motivos).toEqual(expect.any(Array));
    expect(ficha.data.data.reviewed_at).toBeTruthy();
    // Campos decididos em nome do mentor: origem automatica, editaveis; criticos com valor; 6.2 nunca vazio
    expect(campoDe(ficha.data.data, '2.1')).toMatchObject({ status: 'confirmado', decidido: true, atualizado_por: 'automatica' });
    expect(campoDe(ficha.data.data, '6.2').valor_efetivo).toMatch(/mentor conduz/);
    expect(campoDe(ficha.data.data, '6.5')).toMatchObject({ status: 'aceito_vazio', atualizado_por: 'automatica' });
    expect(ficha.data.data.progresso.obrigatorios_decididos).toBe(ficha.data.data.progresso.obrigatorios);
    // Job `script` do clube: 1 ativo (repetir devolve o mesmo)
    expect(ficha.data.data.script.job).toMatchObject({ tipo: 'script', status: 'queued' });
    const fila = await worker('GET', '/api/jobs?status=queued&tipo=script');
    const scripts = fila.data.data.filter((j) => j.club_slug === 'clube-s');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({ email: 's@x.com', notify_phone: '5511987654321', payload: { motivo: 'automatico', origem: 'suficiencia', prefill_job_id: job.id } });
    const again = await api('POST', '/api/script/ficha/gerar-script', 'userS', {});
    expect(again.data.job).toMatchObject({ id: scripts[0].id, existing: true });
    // Worker le a suficiencia na ficha do job
    expect((await worker('GET', `/api/jobs/${job.id}/ficha`)).data.suficiencia.resultado).toBe('suficiente');
  });

  it('editar um campo depois reabre a ficha (em_revisao) e limpa quem confirmou', async () => {
    const r = await api('PUT', '/api/script/ficha/fields', 'userS', { updates: { '2.1': { status: 'editado', valor: 'Sou a Sofia, versão minha.' } } });
    expect(r.data.ficha_status).toBe('em_revisao');
    const ficha = await api('GET', '/api/script/ficha', 'userS');
    expect(ficha.data.data.confirmada_por).toBeNull();
    expect(campoDe(ficha.data.data, '2.1')).toMatchObject({ status: 'editado', atualizado_por: 's@x.com' });
    // O que continua automatico segue marcado
    expect(campoDe(ficha.data.data, '3.1').atualizado_por).toBe('automatica');
  });

  it('admin: coluna Suficiência e detalhe com motivos', async () => {
    const rows = await api('GET', '/api/admin/cohort', 'admin');
    const s = rows.data.data.find((r) => r.club_slug === 'clube-s');
    expect(s.suficiencia).toMatchObject({ resultado: 'suficiente', faltam_n: 3, forcado_por: null });
    expect(s.pendencia).toBeNull();
    const det = await api('GET', '/api/admin/clubs/clube-s/script-ficha', 'admin');
    expect(det.data.data.suficiencia.resultado).toBe('suficiente');
    expect(det.data.data.suficiencia.motivos).toEqual(expect.any(Array));
  });
});

describe('parcial: a ficha fica e o mentor responde so o que falta', () => {
  let job;
  it('PATCH done -> pre_preenchida, faltam gravado, mensagem com o link da ficha; sem job script', async () => {
    job = await abrirPrefill('userP');
    expect((await worker('PUT', `/api/jobs/${job.id}/prefill`, { club_slug: 'clube-p', campos: FIX.parcial })).status).toBe(200);
    const done = await worker('PATCH', `/api/jobs/${job.id}`, { status: 'done', result: { imported: 34 } });
    expect(done.data.suficiencia).toMatchObject({ resultado: 'parcial', ficha_status: 'pre_preenchida', script_job_id: null });
    expect(done.data.suficiencia.faltam).toEqual(expect.arrayContaining(['3.3', '5.3', '6.2']));
    expect(done.data.job.result.mensagem_mentor).toMatch(/^Paulo, lemos os seus materiais\. Faltam \d+ respostas suas para o seu script: https:\/\/app\.teste\.local\/prosperus-mentor-diagnosis\/dashboard\/ficha$/);
    const ficha = await api('GET', '/api/script/ficha', 'userP');
    expect(ficha.data.data.ficha_status).toBe('pre_preenchida');
    expect(ficha.data.data.confirmada_por).toBeNull();
    expect(ficha.data.data.suficiencia.resultado).toBe('parcial');
    expect(ficha.data.data.suficiencia.faltam).toEqual(done.data.suficiencia.faltam);
    expect(ficha.data.data.script.job).toBeNull();
    expect(campoDe(ficha.data.data, '2.1').status).toBe('sugerido'); // nada confirmado em nome dele
    const rows = await api('GET', '/api/admin/cohort', 'admin');
    expect(rows.data.data.find((r) => r.club_slug === 'clube-p').suficiencia).toMatchObject({ resultado: 'parcial', faltam_n: done.data.suficiencia.faltam.length });
  });

  it('complete: 400 com os faltam pendentes; decididos os faltam, confirma o resto em nome do mentor e enfileira o script', async () => {
    const antes = await api('POST', '/api/script/ficha/complete', 'userP', {});
    expect(antes.status).toBe(400);
    expect(antes.data.faltam).toEqual(expect.arrayContaining(['3.3', '5.3', '6.2']));
    expect(antes.data.message).toMatch(/respostas suas/);
    // Decide so os que faltam (3.5, 3.6 e 6.5 deixa em branco; os criticos com valor)
    const ficha = await api('GET', '/api/script/ficha', 'userP');
    const updates = {};
    for (const k of ficha.data.data.suficiencia.faltam) {
      updates[k] = ['3.5', '3.6', '6.5'].includes(k) ? { status: 'aceito_vazio' } : { status: 'editado', valor: `Resposta do Paulo para ${k}` };
    }
    updates['6.2'] = { status: 'editado', valor: 'Eu mesmo conduzo; lead por indicação.' };
    await api('PUT', '/api/script/ficha/fields', 'userP', { updates });
    const done = await api('POST', '/api/script/ficha/complete', 'userP', {});
    expect(done.status).toBe(200);
    expect(done.data).toMatchObject({ ficha_status: 'confirmada', confirmada_por: 'mentor' });
    expect(done.data.automaticos).toContain('2.1');
    expect(done.data.job).toMatchObject({ tipo: 'script', status: 'queued', existing: false });
    const depois = await api('GET', '/api/script/ficha', 'userP');
    expect(depois.data.data.ficha_status).toBe('confirmada');
    expect(campoDe(depois.data.data, '2.1')).toMatchObject({ status: 'confirmado', atualizado_por: 'automatica' });
    expect(campoDe(depois.data.data, '5.3')).toMatchObject({ status: 'editado', valor: 'Resposta do Paulo para 5.3' });
    expect(depois.data.data.progresso.obrigatorios_decididos).toBe(depois.data.data.progresso.obrigatorios);
  });
});

describe('insuficiente e needs_human', () => {
  it('insuficiente: mensagem aponta para Materiais; ficha fica pre_preenchida', async () => {
    const job = await abrirPrefill('userI');
    await worker('PUT', `/api/jobs/${job.id}/prefill`, { club_slug: 'clube-i', campos: FIX.insuficiente });
    const done = await worker('PATCH', `/api/jobs/${job.id}`, { status: 'done' });
    expect(done.data.suficiencia.resultado).toBe('insuficiente');
    expect(done.data.job.result.mensagem_mentor).toContain('Precisamos de mais material');
    expect(done.data.job.result.mensagem_mentor).toContain('https://app.teste.local/prosperus-mentor-diagnosis/dashboard/materiais');
    expect((await api('GET', '/api/script/ficha', 'userI')).data.data.ficha_status).toBe('pre_preenchida');
  });

  it('needs_human com materiais suficientes rebaixa para parcial (nunca fecha sozinha); done -> queued funde o result', async () => {
    const job = await abrirPrefill('userH');
    // Prefill em marcos: no ultimo bloco a avaliacao ja e gravada (sem agir)
    const blocos = [[], [], [], [], [], []];
    for (const [k, v] of Object.entries(FIX.suficiente)) blocos[Number(k.split('.')[0]) - 1].push([k, v]);
    let ultimo;
    for (const b of blocos) ultimo = await worker('PUT', `/api/jobs/${job.id}/prefill`, { parcial: true, club_slug: 'clube-h', campos: Object.fromEntries(b) });
    expect(ultimo.data.blocos_importados).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ultimo.data.suficiencia).toMatchObject({ resultado: 'suficiente' });
    expect((await api('GET', '/api/script/ficha', 'userH')).data.data).toMatchObject({ ficha_status: 'pre_preenchida', suficiencia: { resultado: 'suficiente' } });

    const nh = await worker('PATCH', `/api/jobs/${job.id}`, { status: 'needs_human', error: 'confiança baixa nas fontes', result: { confianca: 'baixa' } });
    expect(nh.data.suficiencia.resultado).toBe('parcial');
    expect(nh.data.job.result.mensagem_mentor).toContain('dashboard/ficha');
    const ficha = await api('GET', '/api/script/ficha', 'userH');
    expect(ficha.data.data.ficha_status).toBe('pre_preenchida');
    expect(ficha.data.data.suficiencia.motivos.some((m) => /conferência sua/.test(m))).toBe(true);
    // Reinicio com result: funde (a mensagem anterior fica), started/finished zerados
    const q = await worker('PATCH', `/api/jobs/${job.id}`, { status: 'queued', result: { pendencia: { aberta: true } } });
    expect(q.data.job).toMatchObject({ status: 'queued', started_at: null, finished_at: null });
    expect(q.data.job.result).toMatchObject({ confianca: 'baixa', pendencia: { aberta: true } });
    expect(q.data.job.result.mensagem_mentor).toBeTruthy();
    // done pode voltar para queued tambem
    await worker('PATCH', `/api/jobs/${job.id}`, { status: 'done' });
    expect((await worker('PATCH', `/api/jobs/${job.id}`, { status: 'queued' })).data.job.status).toBe('queued');
    await worker('PATCH', `/api/jobs/${job.id}`, { status: 'done' });
  });
});

describe('admin: forçar revisão e forçar script', () => {
  it('forcar-revisao volta para em_revisao e registra quem forcou; forcar-script confirma e enfileira; 6.2 vazio -> 400', async () => {
    const rev = await api('POST', '/api/admin/clubs/clube-s/suficiencia/forcar-revisao', 'admin', {});
    expect(rev.status).toBe(200);
    expect(rev.data.ficha_status).toBe('em_revisao');
    expect(rev.data.suficiencia).toMatchObject({ resultado: 'parcial', resultado_original: 'suficiente', forcado_por: { acao: 'revisao', por: 'caio@prosperus.com' } });
    expect((await api('GET', '/api/script/ficha', 'userS')).data.data).toMatchObject({ ficha_status: 'em_revisao', confirmada_por: null });
    const rows = await api('GET', '/api/admin/cohort', 'admin');
    expect(rows.data.data.find((r) => r.club_slug === 'clube-s').suficiencia.forcado_por.acao).toBe('revisao');

    // Forcar script no clube parcial-insuficiente (Ivo): confirma o que veio, fecha e enfileira
    const sc = await api('POST', '/api/admin/clubs/clube-i/suficiencia/forcar-script', 'admin', {});
    expect(sc.status).toBe(200);
    expect(sc.data).toMatchObject({ ficha_status: 'confirmada', confirmada_por: 'admin:caio@prosperus.com' });
    expect(sc.data.suficiencia).toMatchObject({ resultado: 'suficiente', resultado_original: 'insuficiente', forcado_por: { acao: 'script' } });
    expect(sc.data.job).toMatchObject({ tipo: 'script', status: 'queued', club_slug: 'clube-i', payload: { motivo: 'forcado', forcado_por: 'caio@prosperus.com' } });
    const ficha = await api('GET', '/api/script/ficha', 'userI');
    expect(ficha.data.data.ficha_status).toBe('confirmada');
    expect(campoDe(ficha.data.data, '1.1')).toMatchObject({ status: 'confirmado', atualizado_por: 'automatica' });

    // 6.2 vazio nunca gera script, nem forcado
    const jobF = await abrirPrefill('userF');
    const semQuem = { ...FIX.suficiente, '6.2': { sugerido: '', classe: 'VZ', fonte: '', alternativas: [] } };
    await worker('PUT', `/api/jobs/${jobF.id}/prefill`, { club_slug: 'clube-f', campos: semQuem });
    const doneF = await worker('PATCH', `/api/jobs/${jobF.id}`, { status: 'done' });
    expect(doneF.data.suficiencia.resultado).toBe('parcial');
    expect(doneF.data.suficiencia.faltam).toContain('6.2');
    expect((await api('GET', '/api/script/ficha', 'userF')).data.data.ficha_status).toBe('pre_preenchida');
    const forcado = await api('POST', '/api/admin/clubs/clube-f/suficiencia/forcar-script', 'admin', {});
    expect(forcado.status).toBe(400);
    expect(forcado.data.faltam).toEqual(['6.2']);
    expect((await api('POST', '/api/admin/clubs/nao-existe/suficiencia/forcar-script', 'admin', {})).status).toBe(404);
    expect((await api('POST', '/api/admin/clubs/clube-f/suficiencia/forcar-revisao', 'userF', {})).status).toBe(403);
  });
});

describe('pendencia: o worker abre uma pendencia com o mentor', () => {
  let pend;
  it('POST /api/jobs cria 1 por clube (repetir devolve a existente); next devolve payload e result; admin mostra os nomes', async () => {
    const origem = (await worker('GET', '/api/jobs?tipo=prefill')).data.data.find((j) => j.club_slug === 'clube-f');
    const r = await worker('POST', '/api/jobs', {
      tipo: 'pendencia', club_slug: 'clube-f',
      payload: { job_origem: origem.id, campos: ['6.2', '5.3'], telefone: '5511987654321', enviado_em: '2026-09-04T12:00:00.000Z', tipo_origem: 'prefill' },
    });
    expect(r.status).toBe(201);
    expect(r.data.existing).toBe(false);
    pend = r.data.job;
    expect(pend).toMatchObject({ tipo: 'pendencia', status: 'queued', club_slug: 'clube-f', email: 'f@x.com', notify_phone: '5511987654321' });
    expect(pend.payload).toMatchObject({ job_origem: origem.id, campos: ['6.2', '5.3'], tipo_origem: 'prefill' });
    const again = await worker('POST', '/api/jobs', { tipo: 'pendencia', club_slug: 'clube-f', payload: { campos: ['6.2'] } });
    expect(again.status).toBe(200);
    expect(again.data).toMatchObject({ existing: true, job: { id: pend.id } });
    expect((await worker('POST', '/api/jobs', { tipo: 'pendencia', club_slug: 'nao-existe', payload: {} })).status).toBe(404);
    expect((await worker('POST', '/api/jobs', { tipo: 'pendencia', club_slug: 'clube-f', payload: { campos: ['9.9'] } })).status).toBe(400);
    expect((await worker('POST', '/api/jobs', { tipo: 'script', club_slug: 'clube-f', payload: {} })).status).toBe(400);

    // Admin: overview e detalhe com "Aguardando resposta do mentor" e os nomes (sem codigo)
    const rows = await api('GET', '/api/admin/cohort', 'admin');
    const f = rows.data.data.find((x) => x.club_slug === 'clube-f');
    expect(f.pendencia).toMatchObject({ job_id: pend.id, status: 'queued', desde: '2026-09-04T12:00:00.000Z' });
    expect(f.pendencia.campos).toEqual([{ key: '6.2', nome: 'Quem vende e de onde vem o lead' }, { key: '5.3', nome: 'Preço e opções' }]);
    expect((await api('GET', '/api/admin/clubs/clube-f/script-ficha', 'admin')).data.data.pendencia.job_id).toBe(pend.id);
    expect((await api('GET', '/api/admin/cohort/jobs?tipo=pendencia', 'admin')).data.data.map((j) => j.id)).toEqual([pend.id]);

    // next: o worker reivindica a pendencia com payload e result
    await worker('PATCH', `/api/jobs/${pend.id}`, { status: 'running', result: { pendencia: { enviada: true } } });
    await worker('PATCH', `/api/jobs/${pend.id}`, { status: 'queued', result: { pendencia: { resposta: 'chegou' } } });
    const next = await worker('POST', '/api/jobs/next', { tipo: 'pendencia' });
    expect(next.status).toBe(200);
    expect(next.data.job.id).toBe(pend.id);
    expect(next.data.job.payload.campos).toEqual(['6.2', '5.3']);
    expect(next.data.job.result).toEqual({ pendencia: { resposta: 'chegou' } });
    expect(next.data.pessoa).toMatchObject({ email: 'f@x.com', nome: 'Fábio' });
    await worker('PATCH', `/api/jobs/${pend.id}`, { status: 'done' });
    expect((await api('GET', '/api/admin/cohort', 'admin')).data.data.find((x) => x.club_slug === 'clube-f').pendencia).toBeNull();
  });
});
