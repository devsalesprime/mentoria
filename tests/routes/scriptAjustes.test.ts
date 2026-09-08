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
 *
 * SPEC-workflow-v4 item 26 (a outra chance de ajuste): UMA atualizacao da ficha depois do primeiro script.
 * - com versao escrita, o primeiro POST /api/script/ficha/complete passa e enfileira `script`
 * - o segundo devolve 409 { motivo: 'limite_ficha' } com a copy da casa
 * - job `script` forcado pelo admin (`origem: 'admin'`, `motivo: 'forcado'`) nao entra na conta
 * - clube sem versao nenhuma fecha a ficha quantas vezes quiser
 * - GET /api/script/ficha traz `ficha_atualizacoes_usadas` e `ficha_limite` dentro de `script`
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
import SF from '../../utils/script-ficha.cjs';

const TOKEN = 'token-da-fila-de-ajustes';
const MD_V1 = '# Script v1\n\n## Passo 1: Conexão\n\n"Prazer, eu sou o Rafael, do time da Paloma."\n';
const COPY_LIMITE = 'A sua rodada de ajustes já foi usada. Precisa de mais? Fale com a equipe.';
const COPY_LIMITE_FICHA = 'Você já usou a sua atualização da ficha. Agora só dá para ajustar pelos grifos no script.';

/** Ficha inteira decidida (os 27 obrigatorios), com 6.2 preenchido: e o que o `complete` exige. */
function fichaCheia() {
  const f: Record<string, any> = {};
  for (const k of SF.FIELD_KEYS) f[k] = { status: 'aceito_vazio' };
  f['6.2'] = { status: 'editado', valor: 'A Ana vende, o lead vem do Instagram' };
  return JSON.stringify(f);
}

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

/**
 * Item 26: uma atualizacao da ficha por clube depois do primeiro script. Clubes proprios para nao
 * misturar com a rodada de grifos: `clube-ficha` ja tem a v1 escrita (com data antiga, para os jobs
 * novos caírem depois dela) e `clube-novo` ainda nao tem script nenhum.
 */
describe('uma atualização da ficha depois do primeiro script', () => {
  /** `ficha_atualizacoes_usadas` / `ficha_limite` como a tela do mentor os recebe. */
  async function conta(user: string) {
    const r = await api('GET', '/api/script/ficha', user);
    return { usadas: r.data.data.script.ficha_atualizacoes_usadas, limite: r.data.data.script.ficha_limite };
  }
  const esvaziarFila = () => dbRun(`UPDATE cohort_jobs SET status = 'done' WHERE status IN ('queued', 'running')`);

  beforeAll(async () => {
    await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-ficha', 'Clube da Ficha', 1), ('clube-novo', 'Clube Novo', 1)`);
    await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('f@x.com', 'clube-ficha', 'Fabi'), ('n@x.com', 'clube-novo', 'Nina')`);
    await dbRun(`INSERT INTO users (id, email, name, role, cohort, club_slug) VALUES
      ('userF', 'f@x.com', 'Fabi', 'member', 'exclusive', 'clube-ficha'),
      ('userN', 'n@x.com', 'Nina', 'member', 'exclusive', 'clube-novo')`);
    await dbRun(`INSERT INTO script_fichas (id, club_slug, fields, materials, ficha_status) VALUES
      ('ficha-f', 'clube-ficha', ?, '{"por_pessoa":{}}', 'em_revisao'),
      ('ficha-n', 'clube-novo', ?, '{"por_pessoa":{}}', 'em_revisao')`, [fichaCheia(), fichaCheia()]);
    // v1 do clube-ficha com data antiga: so os jobs nascidos DEPOIS dela entram na conta
    await dbRun(`INSERT INTO script_versions (id, club_slug, versao, content_md, resumo, status, created_at)
      VALUES ('sv-f-1', 'clube-ficha', 1, ?, 'primeira', 'rascunho', '2026-01-01 00:00:00')`, [MD_V1]);
  });

  it('sem script escrito, fechar a ficha não gasta nada e não trava', async () => {
    expect(await conta('userN')).toEqual({ usadas: 0, limite: 1 });
    await esvaziarFila();
    const primeiro = await api('POST', '/api/script/ficha/complete', 'userN');
    expect(primeiro.status).toBe(200);
    await esvaziarFila();
    const segundo = await api('POST', '/api/script/ficha/complete', 'userN');
    expect(segundo.status).toBe(200);
    expect(await conta('userN')).toEqual({ usadas: 0, limite: 1 });
  });

  it('com a v1 escrita, a primeira atualização passa e enfileira o job `script`', async () => {
    expect(await conta('userF')).toEqual({ usadas: 0, limite: 1 });
    await esvaziarFila();
    const r = await api('POST', '/api/script/ficha/complete', 'userF');
    expect(r.status).toBe(200);
    expect(r.data.ficha_status).toBe('confirmada');
    expect(r.data.job.tipo).toBe('script');
    const job = await dbGet(`SELECT payload FROM cohort_jobs WHERE id = ?`, [r.data.job.id]);
    expect(safeJsonParse(job.payload).motivo).toBe('complete');
    expect(await conta('userF')).toEqual({ usadas: 1, limite: 1 });
  });

  it('a segunda devolve 409 limite_ficha, com a copy da casa e sem job novo', async () => {
    const antes = await dbGet(`SELECT COUNT(*) AS n FROM cohort_jobs WHERE tipo = 'script' AND club_slug = 'clube-ficha'`);
    const r = await api('POST', '/api/script/ficha/complete', 'userF');
    expect(r.status).toBe(409);
    expect(r.data.motivo).toBe('limite_ficha');
    expect(r.data.message).toBe(COPY_LIMITE_FICHA);
    expect(r.data.ficha_atualizacoes_usadas).toBe(1);
    expect(r.data.ficha_limite).toBe(1);
    // a copy segue as regras da casa: sem travessão e sem a palavra vetada
    expect(r.data.message).not.toContain('—');
    expect(r.data.message).not.toMatch(/diagn[oó]stic/i);
    const depois = await dbGet(`SELECT COUNT(*) AS n FROM cohort_jobs WHERE tipo = 'script' AND club_slug = 'clube-ficha'`);
    expect(depois.n).toBe(antes.n);
  });

  it('job `script` forçado pelo admin não entra na conta', async () => {
    await dbRun(`INSERT INTO cohort_jobs (id, tipo, club_slug, email, status, payload)
      VALUES ('job-script-forcado', 'script', 'clube-ficha', 'f@x.com', 'done', ?)`,
      [JSON.stringify({ motivo: 'forcado', origem: 'admin', forcado_por: 'admin' })]);
    expect(await conta('userF')).toEqual({ usadas: 1, limite: 1 });
  });

  it('`cohort_config.ficha_limite` muda o teto: com 2, o mentor fecha de novo', async () => {
    await dbRun(`INSERT OR REPLACE INTO cohort_config (key, value) VALUES ('ficha_limite', '2')`);
    expect(await conta('userF')).toEqual({ usadas: 1, limite: 2 });
    await esvaziarFila();
    expect((await api('POST', '/api/script/ficha/complete', 'userF')).status).toBe(200);
    expect(await conta('userF')).toEqual({ usadas: 2, limite: 2 });
    expect((await api('POST', '/api/script/ficha/complete', 'userF')).status).toBe(409);
    await dbRun(`DELETE FROM cohort_config WHERE key = 'ficha_limite'`);
  });

  it('a trava da ficha não mexe na rodada de grifos do outro clube', async () => {
    const r = await api('GET', '/api/script/ficha', 'userA');
    expect(r.data.data.script.ajustes_usados).toBeGreaterThanOrEqual(1);
    expect(r.data.data.script.ficha_atualizacoes_usadas).toBe(0);
  });
});
