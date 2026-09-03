// @ts-nocheck
/** @vitest-environment node */
/**
 * API da fila (routes/jobs.cjs) + submit com job (routes/script.cjs) + admin da fila (routes/admin-cohort.cjs)
 * em sqlite :memory:, com os routers reais:
 * - submit cria 1 job por pessoa; repetir devolve o existente; telefone invalido -> 400
 * - jobsAuth: 503 sem COHORT_JOBS_TOKEN, 401 com token errado
 * - POST next reivindica o mais antigo; materiais do CLUBE inteiro por pessoa; stream do arquivo do clube
 * - PUT prefill via job nao sobrescreve campo decidido; PATCH done; lista; phones; admin list + requeue
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import createScriptRoutes from '../../routes/script.cjs';
import createAdminCohortRoutes from '../../routes/admin-cohort.cjs';
import createJobsRoutes from '../../routes/jobs.cjs';

const TOKEN = 'token-da-fila-de-teste';
const SENHA_A = 'SEGREDO-DE-A-987';
let server; let base; let offServer; let offBase; let tmpDir; let fileAId = 'file-a-1'; let fileOtherId = 'file-z-1';
let dbRun;
let sample;

function safeJsonParse(str, fallback = {}) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

const authMiddleware = (req, res, next) => {
  const id = req.headers['x-user'];
  if (!id) return res.status(401).json({ success: false });
  req.user = { userId: id, role: id === 'admin' ? 'admin' : 'member' };
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

async function worker(method, url, body, token = TOKEN, b = base) {
  const res = await fetch(b + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-routes-'));
  const fileA = path.join(tmpDir, 'reuniao.txt');
  fs.writeFileSync(fileA, 'transcricao de A para o worker');
  const fileZ = path.join(tmpDir, 'outro-clube.txt');
  fs.writeFileSync(fileZ, 'arquivo de outro clube');
  sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'samples', 'prefill-exemplo.json'), 'utf8'));

  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbRun = helpers.dbRun;
  const ddl = [
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'member', cohort TEXT, club_slug TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL,
       file_type TEXT, file_size INTEGER, url TEXT, module TEXT DEFAULT 'general', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_clubs (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_members (email TEXT PRIMARY KEY, club_slug TEXT NOT NULL, nome TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', materials JSON NOT NULL DEFAULT '{}',
       materials_status TEXT NOT NULL DEFAULT 'pending', materials_submitted_at DATETIME, ficha_status TEXT NOT NULL DEFAULT 'vazia', prefill_meta JSON,
       prefilled_at DATETIME, reviewed_at DATETIME, last_user_activity_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const s of ddl) await dbRun(s);
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-x', 'Clube X', 1), ('clube-z', 'Clube Z', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('a@x.com', 'clube-x', 'Ana'), ('b@x.com', 'clube-x', 'Beto'), ('z@z.com', 'clube-z', 'Zeca')`);
  await dbRun(`INSERT INTO users (id, email, name, cohort, club_slug) VALUES
    ('userA', 'a@x.com', 'Ana', 'exclusive', 'clube-x'),
    ('userB', 'b@x.com', 'Beto', 'exclusive', 'clube-x'),
    ('userZ', 'z@z.com', 'Zeca', 'exclusive', 'clube-z')`);
  await dbRun(`INSERT INTO uploaded_files (id, user_id, category, module, file_name, file_path, file_type, file_size)
    VALUES (?, 'userA', 'script_transcricao_venda', 'script', 'reuniao.txt', ?, 'text/plain', 30)`, [fileAId, fileA]);
  await dbRun(`INSERT INTO uploaded_files (id, user_id, category, module, file_name, file_path, file_type, file_size)
    VALUES (?, 'userZ', 'script_outros', 'script', 'outro-clube.txt', ?, 'text/plain', 22)`, [fileOtherId, fileZ]);

  const deps = { db, ...helpers, authMiddleware, adminMiddleware, uuidv4: () => `id-${Math.random().toString(36).slice(2)}`, fs, path, safeJsonParse };
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(createScriptRoutes(deps));
  app.use(createAdminCohortRoutes(deps));
  app.use(createJobsRoutes({ ...deps, COHORT_JOBS_TOKEN: TOKEN, APP_URL: 'https://app.teste.local/' }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;

  // Segundo app com a fila DESLIGADA (sem token)
  delete process.env.COHORT_JOBS_TOKEN;
  const off = express();
  off.use(express.json());
  off.use(createJobsRoutes({ ...deps, COHORT_JOBS_TOKEN: '' }));
  await new Promise((resolve) => { offServer = off.listen(0, '127.0.0.1', resolve); });
  offBase = `http://127.0.0.1:${offServer.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => offServer.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let jobA; let jobB;

describe('prompt da IA e resposta colada', () => {
  it('GET /api/script/prompt-ia devolve o prompt com o nome da pessoa e os 34 campos', async () => {
    const r = await api('GET', '/api/script/prompt-ia', 'userA');
    expect(r.status).toBe(200);
    expect(r.data.prompt).toContain('Ana (Clube X)');
    expect(r.data.prompt).toContain('Ana e Beto');
    expect(r.data.prompt).toContain('6.7. ');
    expect(r.data.prompt).toContain('### FONTES');
    expect(r.data.campos).toBe(34);
    const z = await api('GET', '/api/script/prompt-ia', 'nao-existe');
    expect(z.status).toBe(403);
  });

  it('PUT materials { resposta_ia } salva por pessoa com resumo; B nao ve', async () => {
    const texto = '### 1.1 [CERTO]\nMentoria X\n### 2.1 [PARCIAL]\nquase\n### 3.3 [INCERTO]\nnão sei\n### FONTES\n- doc';
    const r = await api('PUT', '/api/script/ficha/materials', 'userA', { resposta_ia: texto });
    expect(r.status).toBe(200);
    expect(r.data.resposta_ia.resumo).toBe('3 campos: 1 certo, 1 parcial, 1 incerto');
    expect(r.data.materials.resposta_ia.texto).toBe(texto);
    expect(r.data.materials.resposta_ia.salvo_em).toBeTruthy();
    const b = await api('GET', '/api/script/ficha', 'userB');
    expect(b.data.data.materials.resposta_ia).toBeUndefined();
    expect(b.text).not.toContain('Mentoria X');
    // texto sem formato: salva mesmo assim
    const r2 = await api('PUT', '/api/script/ficha/materials', 'userB', { resposta_ia: 'texto solto' });
    expect(r2.data.resposta_ia.resumo).toBe('formato não reconhecido, salvamos mesmo assim');
    // vazio apaga
    const r3 = await api('PUT', '/api/script/ficha/materials', 'userB', { resposta_ia: '' });
    expect(r3.data.materials.resposta_ia).toBeUndefined();
  });
});

describe('submit: telefone + job por pessoa', () => {
  it('telefone invalido -> 400; sem telefone ok', async () => {
    const bad = await api('POST', '/api/script/ficha/materials/submit', 'userA', { notify_phone: '123' });
    expect(bad.status).toBe(400);
    expect(bad.data.errors[0]).toMatch(/WhatsApp/);
  });

  it('A confirma com telefone: job queued com 55; repetir devolve o mesmo job', async () => {
    await api('PUT', '/api/script/ficha/materials', 'userA', {
      links: [{ url: 'https://drive.google.com/a', rotulo: 'Drive', tipo: 'drive' }],
      acessos: [{ plataforma_url: 'https://plataforma.com/login', login: 'ana', senha: SENHA_A, observacoes: '' }],
    });
    const r = await api('POST', '/api/script/ficha/materials/submit', 'userA', { notify_phone: '(11) 98765-4321' });
    expect(r.status).toBe(200);
    expect(r.data.materials_status).toBe('submitted');
    expect(r.data.notify_phone).toBe('5511987654321');
    expect(r.data.job.status).toBe('queued');
    expect(r.data.job.existing).toBe(false);
    jobA = r.data.job;

    const again = await api('POST', '/api/script/ficha/materials/submit', 'userA', {});
    expect(again.data.job.id).toBe(jobA.id);
    expect(again.data.job.existing).toBe(true);

    const ficha = await api('GET', '/api/script/ficha', 'userA');
    expect(ficha.data.data.job).toMatchObject({ id: jobA.id, status: 'queued' });
    expect(ficha.data.data.materials.notify_phone).toBe('5511987654321');
    expect(ficha.data.data).not.toHaveProperty('payload');
  });

  it('B confirma sem aviso (notify false): job sem telefone', async () => {
    const r = await api('POST', '/api/script/ficha/materials/submit', 'userB', { notify_phone: '11 3333 4444', notify: false });
    expect(r.status).toBe(200);
    expect(r.data.notify_phone).toBeNull();
    expect(r.data.job.existing).toBe(false);
    jobB = r.data.job;
    expect(jobB.id).not.toBe(jobA.id);
  });
});

describe('jobsAuth', () => {
  it('fila desligada -> 503 em qualquer rota', async () => {
    const r = await worker('POST', '/api/jobs/next', { tipo: 'prefill' }, TOKEN, offBase);
    expect(r.status).toBe(503);
    expect(r.data.message).toBe('fila desligada');
    expect((await worker('GET', '/api/jobs/phones', null, TOKEN, offBase)).status).toBe(503);
  });

  it('sem token ou token errado -> 401', async () => {
    expect((await worker('POST', '/api/jobs/next', { tipo: 'prefill' }, null)).status).toBe(401);
    expect((await worker('POST', '/api/jobs/next', { tipo: 'prefill' }, 'errado')).status).toBe(401);
    expect((await worker('GET', '/api/jobs', null, 'errado')).status).toBe(401);
  });
});

describe('worker: next, materials, files, ficha, prefill, patch', () => {
  it('POST next reivindica o mais antigo (A), com clube, pessoa e app_url; depois B; depois 204', async () => {
    const r = await worker('POST', '/api/jobs/next', { tipo: 'prefill' });
    expect(r.status).toBe(200);
    expect(r.data.job.id).toBe(jobA.id);
    expect(r.data.job.status).toBe('running');
    expect(r.data.job.attempts).toBe(1);
    expect(r.data.club).toEqual({ slug: 'clube-x', nome: 'Clube X', ativo: true });
    expect(r.data.pessoa).toEqual({ email: 'a@x.com', nome: 'Ana', notify_phone: '5511987654321' });
    expect(r.data.app_url).toBe('https://app.teste.local');

    const r2 = await worker('POST', '/api/jobs/next', {});
    expect(r2.data.job.id).toBe(jobB.id);
    expect(r2.data.pessoa.notify_phone).toBeNull();

    const r3 = await worker('POST', '/api/jobs/next', { tipo: 'prefill' });
    expect(r3.status).toBe(204);
    expect((await worker('POST', '/api/jobs/next', { tipo: 'outro' })).status).toBe(400);
  });

  it('GET /api/jobs/:id e lista por status', async () => {
    const g = await worker('GET', `/api/jobs/${jobA.id}`);
    expect(g.data.job).toMatchObject({ id: jobA.id, status: 'running', email: 'a@x.com', club_slug: 'clube-x' });
    expect((await worker('GET', '/api/jobs/nao-existe')).status).toBe(404);
    const running = await worker('GET', '/api/jobs?status=running');
    expect(running.data.data.map((j) => j.id).sort()).toEqual([jobA.id, jobB.id].sort());
    expect((await worker('GET', '/api/jobs?status=queued')).data.data).toEqual([]);
    expect((await worker('GET', '/api/jobs?status=xyz')).status).toBe(400);
  });

  it('materials: TODO o clube por pessoa, com download_url, acessos e resposta_ia; nunca outro clube', async () => {
    const m = await worker('GET', `/api/jobs/${jobA.id}/materials`);
    expect(m.status).toBe(200);
    expect(m.data.club.slug).toBe('clube-x');
    const a = m.data.pessoas.find((p) => p.email === 'a@x.com');
    const b = m.data.pessoas.find((p) => p.email === 'b@x.com');
    expect(a.files).toHaveLength(1);
    expect(a.files[0]).toMatchObject({ id: fileAId, name: 'reuniao.txt', type: 'text/plain', size: 30, category: 'script_transcricao_venda' });
    expect(a.files[0].download_url).toBe(`/api/jobs/${jobA.id}/files/${fileAId}`);
    expect(a.links[0].url).toBe('https://drive.google.com/a');
    expect(a.acessos[0].senha).toBe(SENHA_A);
    expect(a.resposta_ia.resumo).toBe('3 campos: 1 certo, 1 parcial, 1 incerto');
    expect(a.notify_phone).toBe('5511987654321');
    expect(a.submitted_at).toBeTruthy();
    expect(b.files).toEqual([]);
    expect(b.submitted_at).toBeTruthy();
    expect(m.data.legado).toBeNull();
    expect(m.text).not.toContain('outro-clube');
    expect(m.data.pessoas.map((p) => p.email)).not.toContain('z@z.com');
  });

  it('files: arquivo do clube 200 com o conteudo; arquivo de outro clube 404', async () => {
    const ok = await worker('GET', `/api/jobs/${jobA.id}/files/${fileAId}`);
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('transcricao de A para o worker');
    const other = await worker('GET', `/api/jobs/${jobA.id}/files/${fileOtherId}`);
    expect(other.status).toBe(404);
    expect((await worker('GET', `/api/jobs/${jobA.id}/files/nao-existe`)).status).toBe(404);
  });

  it('ficha: campos com status; prefill nao sobrescreve o que o mentor decidiu', async () => {
    // Mentor decide 1.1 antes do worker
    const dec = await api('PUT', '/api/script/ficha/fields', 'userA', { updates: { '1.1': { status: 'editado', valor: 'Mentoria decidida pela Ana' }, '1.2': { status: 'aceito_vazio' } } });
    expect(dec.data.applied).toEqual(['1.1', '1.2']);

    const f = await worker('GET', `/api/jobs/${jobA.id}/ficha`);
    expect(f.status).toBe(200);
    expect(f.data.club.slug).toBe('clube-x');
    expect(f.data.ficha_status).toBe('em_revisao');
    expect(f.data.decididos).toEqual(['1.1', '1.2']);
    expect(f.data.blocos).toHaveLength(6);
    const c11 = f.data.blocos[0].campos.find((c) => c.key === '1.1');
    expect(c11).toMatchObject({ status: 'editado', valor: 'Mentoria decidida pela Ana', decidido: true });
    expect(c11).toHaveProperty('nota_interna');

    const body = { ...sample, club_slug: 'clube-x' };
    const wrong = await worker('PUT', `/api/jobs/${jobA.id}/prefill`, { ...sample, club_slug: 'outro' });
    expect(wrong.status).toBe(400);
    expect(wrong.data.errors[0]).toMatch(/club_slug/);
    const bad = JSON.parse(JSON.stringify(body));
    delete bad.campos['6.7'];
    expect((await worker('PUT', `/api/jobs/${jobA.id}/prefill`, bad)).status).toBe(400);

    const ok = await worker('PUT', `/api/jobs/${jobA.id}/prefill`, body);
    expect(ok.status).toBe(200);
    expect(ok.data.imported).toBe(32);
    expect(ok.data.skipped).toEqual(['1.1', '1.2']);
    expect(ok.data.ficha_status).toBe('em_revisao');
    expect(ok.data.resumo.total).toBe(34);

    const after = await api('GET', '/api/script/ficha', 'userA');
    const a11 = after.data.data.blocos[0].campos.find((c) => c.key === '1.1');
    expect(a11.valor_efetivo).toBe('Mentoria decidida pela Ana');
    expect(a11.status).toBe('editado');
    const a21 = after.data.data.blocos[1].campos.find((c) => c.key === '2.1');
    expect(a21.status).toBe('sugerido');
    expect(a21.sugerido).toBe(sample.campos['2.1'].sugerido);
    expect(after.data.data.prefilled_at).toBeTruthy();

    const det = await api('GET', '/api/admin/clubs/clube-x/script-ficha', 'admin');
    expect(det.data.data.prefill_meta.job_id).toBe(jobA.id);
  });

  it('PATCH done/needs_human grava finished_at; queued limpa', async () => {
    const done = await worker('PATCH', `/api/jobs/${jobA.id}`, { status: 'done', result: { imported: 32, skipped: 2 } });
    expect(done.status).toBe(200);
    expect(done.data.job.status).toBe('done');
    expect(done.data.job.finished_at).toBeTruthy();
    expect(done.data.job.result).toEqual({ imported: 32, skipped: 2 });
    const nh = await worker('PATCH', `/api/jobs/${jobB.id}`, { status: 'needs_human', error: 'sem materiais suficientes' });
    expect(nh.data.job).toMatchObject({ status: 'needs_human', error: 'sem materiais suficientes' });
    expect((await worker('PATCH', `/api/jobs/${jobB.id}`, { status: 'feito' })).status).toBe(400);
    expect((await worker('GET', '/api/jobs?status=done')).data.data.map((j) => j.id)).toEqual([jobA.id]);
    const fichaA = await api('GET', '/api/script/ficha', 'userA');
    expect(fichaA.data.data.job.status).toBe('done');
  });

  it('phones: distintos, sem nulos', async () => {
    const r = await worker('GET', '/api/jobs/phones');
    expect(r.data.phones).toEqual(['5511987654321']);
  });
});

describe('admin: lista da fila e requeue', () => {
  it('GET /api/admin/cohort/jobs traz clube e pessoa; membro nao acessa', async () => {
    const r = await api('GET', '/api/admin/cohort/jobs', 'admin');
    expect(r.status).toBe(200);
    const a = r.data.data.find((j) => j.id === jobA.id);
    expect(a).toMatchObject({ club_nome: 'Clube X', pessoa_nome: 'Ana', status: 'done', notify_phone: '5511987654321' });
    expect(r.data.fila_ligada).toBe(false); // process.env vazio no teste
    expect((await api('GET', '/api/admin/cohort/jobs', 'userA')).status).toBe(403);
    expect((await api('GET', '/api/admin/cohort/jobs?status=needs_human', 'admin')).data.data.map((j) => j.id)).toEqual([jobB.id]);
  });

  it('requeue volta para queued e o worker pega de novo; running -> 409', async () => {
    const r = await api('POST', `/api/admin/cohort/jobs/${jobB.id}/requeue`, 'admin', {});
    expect(r.status).toBe(200);
    expect(r.data.job).toMatchObject({ status: 'queued', error: null, attempts: 1 });
    const next = await worker('POST', '/api/jobs/next', { tipo: 'prefill' });
    expect(next.data.job.id).toBe(jobB.id);
    expect(next.data.job.attempts).toBe(2);
    expect((await api('POST', `/api/admin/cohort/jobs/${jobB.id}/requeue`, 'admin', {})).status).toBe(409);
    expect((await api('POST', '/api/admin/cohort/jobs/nao-existe/requeue', 'admin', {})).status).toBe(404);
    await worker('PATCH', `/api/jobs/${jobB.id}`, { status: 'done' });
  });

  it('detalhe do clube mostra jobs, notify_phone e resposta_ia por pessoa', async () => {
    const det = await api('GET', '/api/admin/clubs/clube-x/script-ficha', 'admin');
    const a = det.data.data.pessoas.find((p) => p.email === 'a@x.com');
    expect(a.notify_phone).toBe('5511987654321');
    expect(a.resposta_ia.resumo).toBe('3 campos: 1 certo, 1 parcial, 1 incerto');
    expect(det.data.data.jobs.map((j) => j.id).sort()).toEqual([jobA.id, jobB.id].sort());
  });

  it('depois de done, a pessoa confirma de novo e nasce um job novo', async () => {
    const r = await api('POST', '/api/script/ficha/materials/submit', 'userA', { notify_phone: '5511987654321' });
    expect(r.data.job.existing).toBe(false);
    expect(r.data.job.id).not.toBe(jobA.id);
    expect(r.data.job.status).toBe('queued');
  });
});
