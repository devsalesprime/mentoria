// @ts-nocheck
/** @vitest-environment node */
/**
 * Onda E4: UMA rodada de ajustes por clube, com os routers reais em sqlite :memory:.
 * - o primeiro POST /api/script/versoes/:versao/revisar do mentor passa e gasta a rodada
 * - o segundo devolve 409 { motivo: 'limite_ajustes' } com a copy da casa
 * - GET /api/script/ficha traz `ajustes_usados` e `ajustes_limite` dentro de `script`
 * - job `revisar` que nao nasceu do mentor (payload.origem diferente) nao entra na conta
 * - `cohort_config.ajustes_limite` muda o teto (0 = sem trava)
 * - o admin nao passa pela trava: "forçar script" continua enfileirando depois de a rodada acabar
 * - POST /api/admin/clubs/:slug/script-versoes/:versao/revisar: a equipe pede uma nova versao com
 *   `origem: 'admin'` (o mesmo payload do mentor), sem consumir a rodada do clube
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
import VM from '../../utils/validation-materials.cjs';
import SV from '../../utils/script-versions.cjs';
import SG from '../../utils/script-grifos.cjs';
import SUF from '../../utils/suficiencia.cjs';

const TOKEN = 'token-da-fila-de-ajustes';
const MD_V1 = '# Script v1\n\n## Passo 1: Conexão\n\n"Prazer, eu sou o Rafael, do time da Paloma."\n';
const COPY_LIMITE = 'A sua rodada de ajustes já foi usada. Precisa de mais? Fale com a equipe.';

let server; let base; let tmpDir; let dbRun; let dbGet;

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
  let data = null; try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

/** `ajustes_usados` / `ajustes_limite` como a tela do mentor os recebe. */
async function rodada() {
  const r = await api('GET', '/api/script/ficha', 'userA');
  return { usados: r.data.data.script.ajustes_usados, limite: r.data.data.script.ajustes_limite };
}

async function limite(valor) {
  await dbRun(`INSERT OR REPLACE INTO cohort_config (key, value) VALUES ('ajustes_limite', ?)`, [String(valor)]);
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-ajustes-'));
  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbRun = helpers.dbRun; dbGet = helpers.dbGet;
  const ddl = [
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'member', cohort TEXT, club_slug TEXT,
       last_login_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL,
       file_type TEXT, file_size INTEGER, url TEXT, module TEXT DEFAULT 'general', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_clubs (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_members (email TEXT PRIMARY KEY, club_slug TEXT NOT NULL, nome TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', materials JSON NOT NULL DEFAULT '{}',
       materials_status TEXT NOT NULL DEFAULT 'pending', materials_submitted_at DATETIME, ficha_status TEXT NOT NULL DEFAULT 'vazia', prefill_meta JSON,
       prefilled_at DATETIME, reviewed_at DATETIME, last_user_activity_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const s of ddl) await dbRun(s);
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-x', 'Clube X', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('a@x.com', 'clube-x', 'Ana')`);
  await dbRun(`INSERT INTO users (id, email, name, role, cohort, club_slug) VALUES
    ('userA', 'a@x.com', 'Ana', 'member', 'exclusive', 'clube-x'),
    ('admin', 'admin@x.com', 'Admin', 'admin', NULL, NULL)`);

  await VM.ensureCohortJobsTable(dbRun);
  await VM.ensureCohortConfigTable(dbRun);
  await SV.ensureScriptVersionsTables(dbRun);
  await SG.ensureScriptGrifosTable(dbRun);
  await SUF.ensureSuficienciaColumns(dbRun);

  await dbRun(`INSERT INTO script_versions (id, club_slug, versao, content_md, resumo, status)
    VALUES ('sv-x-1', 'clube-x', 1, ?, 'primeira', 'rascunho')`, [MD_V1]);
  // 6.2 preenchido: sem ele o "forçar script" do admin devolve 400
  await dbRun(`INSERT INTO script_fichas (id, club_slug, fields, materials, ficha_status) VALUES ('ficha-x', 'clube-x', ?, '{"por_pessoa":{}}', 'confirmada')`, [
    JSON.stringify({ '6.2': { valor: 'A Ana vende, o lead vem do Instagram', status: 'editado' } }),
  ]);

  const deps = {
    db, ...helpers, authMiddleware, adminMiddleware,
    uuidv4: () => `id-${Math.random().toString(36).slice(2)}`,
    fs, path, safeJsonParse, DATA_DIR: tmpDir,
  };
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
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('uma rodada de ajustes por clube', () => {
  it('a ficha nasce com a rodada inteira: 0 de 1', async () => {
    expect(await rodada()).toEqual({ usados: 0, limite: 1 });
  });

  it('a primeira revisão do mentor passa e marca `origem: membro` no payload', async () => {
    const r = await api('POST', '/api/script/versoes/1/revisar', 'userA', { pedido: 'Deixar a abertura mais curta.' });
    expect(r.status).toBe(200);
    expect(r.data.job.tipo).toBe('revisar');
    const job = await dbGet(`SELECT payload FROM cohort_jobs WHERE id = ?`, [r.data.job.id]);
    expect(safeJsonParse(job.payload).origem).toBe('membro');
    expect(await rodada()).toEqual({ usados: 1, limite: 1 });
  });

  it('a segunda revisão do mentor devolve 409 limite_ajustes, com a copy da casa', async () => {
    const r = await api('POST', '/api/script/versoes/1/revisar', 'userA', { pedido: 'Mais uma volta.' });
    expect(r.status).toBe(409);
    expect(r.data.motivo).toBe('limite_ajustes');
    expect(r.data.message).toBe(COPY_LIMITE);
    expect(r.data.ajustes_usados).toBe(1);
    expect(r.data.ajustes_limite).toBe(1);
    // a copy segue as regras da casa: sem travessão, sem a palavra vetada e sem emoji
    expect(r.data.message).not.toContain('—');
    expect(r.data.message).not.toMatch(/diagn[oó]stic/i);
    // e nenhum job novo nasceu
    const n = await dbGet(`SELECT COUNT(*) AS n FROM cohort_jobs WHERE tipo = 'revisar' AND club_slug = 'clube-x'`);
    expect(n.n).toBe(1);
  });

  it('job `revisar` que não nasceu do mentor não entra na conta', async () => {
    await dbRun(`INSERT INTO cohort_jobs (id, tipo, club_slug, email, status, payload)
      VALUES ('job-forcado', 'revisar', 'clube-x', 'a@x.com', 'done', ?)`, [JSON.stringify({ versao: 1, origem: 'admin' })]);
    expect(await rodada()).toEqual({ usados: 1, limite: 1 });
  });

  it('`cohort_config.ajustes_limite` muda o teto: com 2, o mentor pede de novo', async () => {
    await limite(2);
    expect(await rodada()).toEqual({ usados: 1, limite: 2 });
    // o job anterior sai da fila para o novo pedido não cair na dedupe de "1 ativo por clube"
    await dbRun(`UPDATE cohort_jobs SET status = 'done' WHERE tipo = 'revisar' AND status IN ('queued', 'running')`);
    const r = await api('POST', '/api/script/versoes/1/revisar', 'userA', { pedido: 'Segunda volta.' });
    expect(r.status).toBe(200);
    expect(await rodada()).toEqual({ usados: 2, limite: 2 });

    // gasto de novo, volta o 409
    const t = await api('POST', '/api/script/versoes/1/revisar', 'userA', { pedido: 'Terceira volta.' });
    expect(t.status).toBe(409);
    expect(t.data.motivo).toBe('limite_ajustes');
  });

  it('teto 0 desliga a trava', async () => {
    await limite(0);
    await dbRun(`UPDATE cohort_jobs SET status = 'done' WHERE tipo = 'revisar' AND status IN ('queued', 'running')`);
    const r = await api('POST', '/api/script/versoes/1/revisar', 'userA', { pedido: 'Sem teto.' });
    expect(r.status).toBe(200);
    expect((await rodada()).limite).toBe(0);
  });

  it('o admin não passa pela trava: "forçar script" continua enfileirando com a rodada gasta', async () => {
    await limite(1);
    // `script` e `revisar` dividem a vaga de "1 ativo por clube": esvaziar a fila para ver o job novo do admin
    await dbRun(`UPDATE cohort_jobs SET status = 'done' WHERE status IN ('queued', 'running')`);
    const antes = await rodada();
    expect(antes.usados).toBeGreaterThanOrEqual(1);

    // o mentor está travado
    const m = await api('POST', '/api/script/versoes/1/revisar', 'userA', { pedido: 'Mais uma.' });
    expect(m.status).toBe(409);

    // o admin não: "forçar script" enfileira um job `script` e não gasta a rodada do mentor
    const r = await api('POST', '/api/admin/clubs/clube-x/suficiencia/forcar-script', 'admin');
    expect(r.status).toBe(200);
    expect(r.data.job.tipo).toBe('script');
    expect(await rodada()).toEqual(antes);
  });
});

describe('o admin pede uma nova versão pelo clube', () => {
  const URL = '/api/admin/clubs/clube-x/script-versoes/1/revisar';
  const PEDIDO = 'Trocar a abertura do passo 1 pela fala que a Ana usa na reunião.';
  let rodadaAntes;

  it('com um trabalho na fila, o pedido do admin devolve 409', async () => {
    // o teste anterior deixou o job `script` do "forçar script" na fila; script e revisar dividem a vaga do clube
    const r = await api('POST', URL, 'admin', { pedido: PEDIDO });
    expect(r.status).toBe(409);
    expect(r.data.motivo).toBe('job_ativo');
    expect(r.data.tipo).toBe('script');
    expect(r.data.message).not.toContain('—');
  });

  it('com a fila vazia, enfileira `revisar` com o payload do mentor e `origem: admin`', async () => {
    await dbRun(`UPDATE cohort_jobs SET status = 'done' WHERE status IN ('queued', 'running')`);
    rodadaAntes = await rodada();

    const r = await api('POST', URL, 'admin', { pedido: PEDIDO });
    expect(r.status).toBe(200);
    expect(r.data.versao_base).toBe(1);
    expect(r.data.job_id).toBeTruthy();

    const job = await dbGet(`SELECT tipo, club_slug, status, payload FROM cohort_jobs WHERE id = ?`, [r.data.job_id]);
    expect(job.tipo).toBe('revisar');
    expect(job.status).toBe('queued');
    const payload = safeJsonParse(job.payload);
    expect(payload.origem).toBe('admin');
    expect(payload.motivo).toBe('forcado-admin');
    expect(payload.pedido).toBe(PEDIDO);
    expect(payload.versao).toBe(1);
    expect(payload.content_md).toBe(MD_V1);
    expect(Array.isArray(payload.comentarios)).toBe(true);
    expect(payload.forcado_por).toBe('admin');
  });

  it('o pedido forçado não gasta a rodada do mentor', async () => {
    expect(await rodada()).toEqual(rodadaAntes);
    // e o mentor continua barrado pelo limite dele, não pelo job do admin
    const m = await api('POST', '/api/script/versoes/1/revisar', 'userA', { pedido: 'Mais uma.' });
    expect(m.status).toBe(409);
    expect(m.data.motivo).toBe('limite_ajustes');
  });

  it('com o `revisar` do admin ainda na fila, um segundo pedido devolve 409', async () => {
    const r = await api('POST', URL, 'admin', { pedido: 'Outra volta.' });
    expect(r.status).toBe(409);
    expect(r.data.motivo).toBe('job_ativo');
    expect(r.data.tipo).toBe('revisar');
  });

  it('versão ou clube que não existe devolve 404; pedido vazio devolve 400', async () => {
    const semVersao = await api('POST', '/api/admin/clubs/clube-x/script-versoes/99/revisar', 'admin', { pedido: PEDIDO });
    expect(semVersao.status).toBe(404);
    const semClube = await api('POST', '/api/admin/clubs/clube-fantasma/script-versoes/1/revisar', 'admin', { pedido: PEDIDO });
    expect(semClube.status).toBe(404);
    const semPedido = await api('POST', URL, 'admin', { pedido: '   ' });
    expect(semPedido.status).toBe(400);
    // nenhum desses criou job novo
    const n = await dbGet(`SELECT COUNT(*) AS n FROM cohort_jobs WHERE tipo = 'revisar' AND club_slug = 'clube-x' AND status = 'queued'`);
    expect(n.n).toBe(1);
  });

  it('o token do mentor não abre a rota do admin', async () => {
    expect((await api('POST', URL, 'userA', { pedido: PEDIDO })).status).toBe(403);
    expect((await api('POST', URL, null, { pedido: PEDIDO })).status).toBe(401);
  });
});
