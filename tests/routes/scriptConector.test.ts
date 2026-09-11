// @ts-nocheck
/** @vitest-environment node */
/**
 * Conector de IA do clube (job `conector` + entregavel `conector`), com os routers reais em sqlite :memory:
 * e arquivos numa pasta temporaria:
 * - colunas do clube (conector, conector_porta, conector_url) nascem no boot dos routers, sem estar no CREATE TABLE
 * - aprovar uma versao enfileira o `conector` so quando produto = 'exclusive' E conector = 1 (payload do contrato)
 * - clube proprio ('club') e clube do roster com o conector desligado nao geram nada
 * - deduplicacao por (clube, versao), contando tambem o job ja concluido
 * - o worker publica em PUT /api/jobs/:id/entregavel com corpo JSON (meta + instalacao.md) e o membro ve na versao
 * - PATCH done com result.porta e result.tenant_url grava o endereco no clube
 * - admin liga e desliga pelo PATCH /api/admin/cohort/clubs/:slug/conector
 * - portal "Minha base" (migration 030): result.portal vira portal_url, portal_usuario e portal_senha,
 *   a ficha do membro entrega `club_portal` e o payload do job leva `portal_tem_senha`
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
import JOBS from '../../utils/cohort-jobs.cjs';
import SV from '../../utils/script-versions.cjs';
import SUF from '../../utils/suficiencia.cjs';

const TOKEN = 'token-da-fila-do-conector';
const MD = '# Script v1\n\n## Passo 1: Conexão\n\n"Prazer, eu sou a Ana."\n';
const INSTALACAO = '# Como instalar\n\n1. Abra o Claude.\n2. Cole o endereço.\n';
let server; let base; let tmpDir; let dataDir; let dbRun; let dbGet;

function safeJsonParse(str, fallback = {}) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

const authMiddleware = (req, res, next) => {
  const id = req.headers['x-user'] || req.query.user;
  if (!id) return res.status(401).json({ success: false });
  req.user = { userId: id, role: id === 'admin' ? 'admin' : 'member', email: `${id}@teste.local` };
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

async function worker(method, url, body, token = TOKEN) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conector-'));
  dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbRun = helpers.dbRun;
  dbGet = helpers.dbGet;
  const ddl = [
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'member', cohort TEXT, club_slug TEXT,
       last_login_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL,
       file_type TEXT, file_size INTEGER, url TEXT, module TEXT DEFAULT 'general', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    // Sem as colunas do conector de proposito: quem as cria e o ensureConectorColumns dos routers (migration 029)
    `CREATE TABLE cohort_clubs (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, produto TEXT NOT NULL DEFAULT 'exclusive', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_members (email TEXT PRIMARY KEY, club_slug TEXT NOT NULL, nome TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', materials JSON NOT NULL DEFAULT '{}',
       materials_status TEXT NOT NULL DEFAULT 'pending', materials_submitted_at DATETIME, ficha_status TEXT NOT NULL DEFAULT 'vazia', prefill_meta JSON,
       prefilled_at DATETIME, reviewed_at DATETIME, last_user_activity_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const s of ddl) await dbRun(s);
  // com = roster com o conector ligado · sem = roster com o conector desligado · proprio = clube de uma pessoa so
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo, produto) VALUES
    ('clube-com', 'Clube Com', 1, 'exclusive'),
    ('clube-sem', 'Clube Sem', 1, 'exclusive'),
    ('clube-proprio', 'Clube Próprio', 1, 'club')`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES
    ('com@x.com', 'clube-com', 'Ana'), ('sem@x.com', 'clube-sem', 'Bia'), ('proprio@x.com', 'clube-proprio', 'Caio')`);
  await dbRun(`INSERT INTO users (id, email, name, role, cohort, club_slug) VALUES
    ('userCom', 'com@x.com', 'Ana', 'member', 'exclusive', 'clube-com'),
    ('userSem', 'sem@x.com', 'Bia', 'member', 'exclusive', 'clube-sem'),
    ('userProprio', 'proprio@x.com', 'Caio', 'member', 'club', 'clube-proprio'),
    ('admin', 'admin@x.com', 'Admin', 'admin', NULL, NULL)`);

  await VM.ensureCohortJobsTable(dbRun);
  await VM.ensureCohortConfigTable(dbRun);
  await SV.ensureScriptVersionsTables(dbRun);
  await SUF.ensureSuficienciaColumns(dbRun);

  await dbRun(`INSERT INTO script_versions (id, club_slug, versao, content_md, resumo, status) VALUES
    ('sv-com-1', 'clube-com', 1, ?, 'primeira', 'rascunho'),
    ('sv-com-2', 'clube-com', 2, ?, 'segunda', 'rascunho'),
    ('sv-sem-1', 'clube-sem', 1, ?, '', 'rascunho'),
    ('sv-proprio-1', 'clube-proprio', 1, ?, '', 'rascunho')`, [MD, MD, MD, MD]);
  await dbRun(`INSERT INTO cohort_jobs (id, tipo, club_slug, email, notify_phone, status, payload)
    VALUES ('job-prefill-com', 'prefill', 'clube-com', 'com@x.com', '5511977776666', 'done', '{}')`);

  const deps = {
    db, ...helpers, authMiddleware, adminMiddleware,
    uuidv4: () => `id-${Math.random().toString(36).slice(2)}`,
    fs, path, safeJsonParse, DATA_DIR: dataDir,
  };
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(createScriptRoutes(deps));
  app.use(createAdminCohortRoutes(deps));
  app.use(createJobsRoutes({ ...deps, COHORT_JOBS_TOKEN: TOKEN, APP_URL: 'https://app.teste.local/' }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  // Os routers criam as colunas de forma assincrona; o teste espera elas aparecerem antes de ligar o conector
  await VM.ensureConectorColumns(dbRun);
  await dbRun(`UPDATE cohort_clubs SET conector = 1 WHERE slug = 'clube-com'`);
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let jobConectorV1;

describe('migration 029: as colunas do conector no clube', () => {
  it('conector, conector_porta e conector_url existem depois do boot dos routers', async () => {
    // O CREATE TABLE do teste nao tem as tres colunas: quem as cria e o ensureConectorColumns dos routers
    const row = await dbGet(`SELECT conector, conector_porta, conector_url FROM cohort_clubs WHERE slug = 'clube-sem'`);
    expect(row.conector).toBe(0);
    expect(row.conector_porta).toBe(null);
    expect(row.conector_url).toBe(null);
  });

  it('o passo de dado da migration liga o roster e deixa de fora os tres clubes combinados', async () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'migrations', '029_cohort_clubs_conector.sql'), 'utf8');
    expect(sql).toContain('ALTER TABLE cohort_clubs ADD COLUMN conector INTEGER NOT NULL DEFAULT 0');
    expect(sql).toContain('ALTER TABLE cohort_clubs ADD COLUMN conector_porta INTEGER');
    expect(sql).toContain('ALTER TABLE cohort_clubs ADD COLUMN conector_url TEXT');
    expect(sql).toMatch(/SET conector = 1/);
    expect(sql).toMatch(/COALESCE\(produto, 'exclusive'\) = 'exclusive'/);
    expect(sql).toContain("'teste-danilo', 'dani-martins', 'juliana-medeiros'");
    // Roda uma vez so: o UPDATE nao acontece depois que a versao 029 entra em schema_migrations
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '029')");
  });

  it('o passo de dado escolhe prosperus-danilo e deixa os tres de fora', async () => {
    await dbRun(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP, description TEXT)`);
    await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo, produto) VALUES
      ('prosperus-danilo', 'Prosperus Danilo', 1, 'exclusive'),
      ('teste-danilo', 'Teste Danilo', 1, 'exclusive'),
      ('dani-martins', 'Dani Martins', 1, 'exclusive'),
      ('juliana-medeiros', 'Juliana Medeiros', 1, 'exclusive'),
      ('u-fulano-abc', 'Fulano', 1, 'club')`);
    await dbRun(`UPDATE cohort_clubs SET conector = 1
                  WHERE COALESCE(produto, 'exclusive') = 'exclusive'
                    AND slug NOT IN ('teste-danilo', 'dani-martins', 'juliana-medeiros')
                    AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '029')`);
    const ligado = async (slug) => (await dbGet(`SELECT conector FROM cohort_clubs WHERE slug = ?`, [slug])).conector;
    expect(await ligado('prosperus-danilo')).toBe(1);
    expect(await ligado('teste-danilo')).toBe(0);
    expect(await ligado('dani-martins')).toBe(0);
    expect(await ligado('juliana-medeiros')).toBe(0);
    expect(await ligado('u-fulano-abc')).toBe(0);
    // clube-sem tambem foi ligado pelo passo de dado; o teste o devolve ao estado de partida
    await dbRun(`UPDATE cohort_clubs SET conector = 0 WHERE slug = 'clube-sem'`);
    // Fecha a porta: rodar de novo nao muda mais nada
    await dbRun(`INSERT OR IGNORE INTO schema_migrations (version, description) VALUES ('029', 'teste')`);
    await dbRun(`UPDATE cohort_clubs SET conector = 1
                  WHERE COALESCE(produto, 'exclusive') = 'exclusive'
                    AND slug NOT IN ('teste-danilo', 'dani-martins', 'juliana-medeiros')
                    AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '029')`);
    expect(await ligado('clube-sem')).toBe(0);
  });
});

describe('tipo de job `conector`', () => {
  it('entra na lista de tipos e divide o escopo de deduplicacao com o `slides`', () => {
    expect(VM.JOB_TIPOS).toContain('conector');
    expect(JOBS.dedupeScope('conector')).toBe('club_versao');
    expect(VM.ENTREGAVEL_TIPOS).toContain('conector');
    expect(Object.keys(VM.ENTREGAVEL_CAMPOS.conector)).toEqual(['instalacao']);
  });

  it('POST /api/jobs/next aceita `conector` como filtro (204 = fila vazia, nunca 400)', async () => {
    const r = await worker('POST', '/api/jobs/next', { tipo: 'conector' });
    expect(r.status).toBe(204);
    const invalido = await worker('POST', '/api/jobs/next', { tipo: 'inventado' });
    expect(invalido.status).toBe(400);
  });
});

describe('aprovar uma versao pede a publicacao do conector', () => {
  it('clube do Exclusive com o conector ligado: job `conector` com o payload do contrato', async () => {
    const r = await api('POST', '/api/script/versoes/1/aprovar', 'userCom');
    expect(r.status).toBe(200);
    expect(r.data.conector_job).toBeTruthy();
    expect(r.data.conector_job.tipo).toBe('conector');
    expect(r.data.conector_job.status).toBe('queued');
    expect(r.data.conector_job.existing).toBe(false);
    jobConectorV1 = r.data.conector_job.id;

    const j = await worker('GET', `/api/jobs/${jobConectorV1}`);
    const p = j.data.job.payload;
    expect(Object.keys(p).sort()).toEqual(['club_slug', 'nome_clube', 'portal_tem_senha', 'refresh_pedido_em', 'versao']);
    expect(p.club_slug).toBe('clube-com');
    expect(p.nome_clube).toBe('Clube Com');
    expect(p.versao).toBe(1);
    // Clube sem senha guardada: o runner tem de gerar uma no portal
    expect(p.portal_tem_senha).toBe(false);
    expect(typeof p.refresh_pedido_em).toBe('string');
    expect(Number.isNaN(Date.parse(p.refresh_pedido_em))).toBe(false);
    // A chave `tool` nunca entra: o runner recusa o job com ela
    expect('tool' in p).toBe(false);
    // O aviso do WhatsApp continua vindo do ultimo prefill da pessoa
    expect(j.data.job.notify_phone).toBe('5511977776666');
  });

  it('a apresentacao continua sendo pedida na mesma aprovacao', async () => {
    const jobs = await worker('GET', '/api/jobs?limit=100');
    const doClube = jobs.data.data.filter((j) => j.club_slug === 'clube-com');
    expect(doClube.some((j) => j.tipo === 'slides')).toBe(true);
    expect(doClube.filter((j) => j.tipo === 'conector')).toHaveLength(1);
  });

  it('clube do Exclusive com o conector desligado nao gera nada', async () => {
    const r = await api('POST', '/api/script/versoes/1/aprovar', 'userSem');
    expect(r.status).toBe(200);
    expect(r.data.conector_job).toBe(null);
    const jobs = await worker('GET', '/api/jobs?limit=200');
    expect(jobs.data.data.filter((j) => j.club_slug === 'clube-sem' && j.tipo === 'conector')).toHaveLength(0);
  });

  it('clube proprio nao gera nada, mesmo com a coluna ligada na mao', async () => {
    await dbRun(`UPDATE cohort_clubs SET conector = 1 WHERE slug = 'clube-proprio'`);
    const r = await api('POST', '/api/script/versoes/1/aprovar', 'userProprio');
    expect(r.status).toBe(200);
    expect(r.data.conector_job).toBe(null);
    const jobs = await worker('GET', '/api/jobs?limit=200');
    expect(jobs.data.data.filter((j) => j.club_slug === 'clube-proprio' && j.tipo === 'conector')).toHaveLength(0);
    await dbRun(`UPDATE cohort_clubs SET conector = 0 WHERE slug = 'clube-proprio'`);
  });

  it('aprovar a mesma versao de novo devolve o job que ja existe (1 por clube e versao)', async () => {
    const r = await api('POST', '/api/script/versoes/1/aprovar', 'userCom');
    expect(r.status).toBe(200);
    expect(r.data.conector_job.existing).toBe(true);
    expect(r.data.conector_job.id).toBe(jobConectorV1);
  });
});

describe('PUT /api/jobs/:id/entregavel com corpo JSON', () => {
  it('401 sem o token da fila e 404 quando o job nao existe', async () => {
    const corpo = { tipo: 'conector', versao: 1, meta: { url: 'https://x' }, arquivos: [{ nome: 'instalacao.md', conteudo: 'a' }] };
    expect((await worker('PUT', `/api/jobs/${jobConectorV1}/entregavel`, corpo, '')).status).toBe(401);
    expect((await worker('PUT', `/api/jobs/${jobConectorV1}/entregavel`, corpo, 'errado')).status).toBe(401);
    expect((await worker('PUT', '/api/jobs/nao-existe/entregavel', corpo)).status).toBe(404);
  });

  it('grava a meta e o instalacao.md, e devolve a lista sem caminho de disco', async () => {
    const meta = {
      url: 'https://conector.prosperus.app/clube-com/mcp',
      pagina: 'https://conector.prosperus.app/clube-com/instalar',
      tools: 7,
      atualizado_em: '2026-09-10T12:00:00.000Z',
      refresh: { versao: 1 },
    };
    const r = await worker('PUT', `/api/jobs/${jobConectorV1}/entregavel`, {
      tipo: 'conector', versao: 1, meta, arquivos: [{ nome: 'instalacao.md', conteudo: INSTALACAO }],
    });
    expect(r.status).toBe(200);
    expect(r.data.entregavel.tipo).toBe('conector');
    expect(r.data.entregavel.versao).toBe(1);
    expect(r.data.entregavel.meta.pagina).toBe(meta.pagina);
    expect(r.data.entregavel.meta.tools).toBe(7);
    expect(r.data.entregavel.arquivos).toHaveLength(1);
    expect(r.data.entregavel.arquivos[0].campo).toBe('instalacao');
    expect(r.data.entregavel.arquivos[0].bytes).toBe(Buffer.byteLength(INSTALACAO, 'utf8'));
    expect(r.text).not.toContain(dataDir);

    const noDisco = path.join(dataDir, 'entregaveis', 'clube-com', 'v1', 'conector', 'instalacao.md');
    expect(fs.readFileSync(noDisco, 'utf8')).toBe(INSTALACAO);
  });

  it('publicar de novo substitui a meta e o arquivo', async () => {
    const r = await worker('PUT', `/api/jobs/${jobConectorV1}/entregavel`, {
      tipo: 'conector', versao: 1, meta: { url: 'https://novo', pagina: 'https://novo/instalar', tools: 9 },
      arquivos: [{ nome: 'instalacao.md', conteudo: '# Novo texto\n' }],
    });
    expect(r.status).toBe(200);
    expect(r.data.entregavel.meta.tools).toBe(9);
    const noDisco = path.join(dataDir, 'entregaveis', 'clube-com', 'v1', 'conector', 'instalacao.md');
    expect(fs.readFileSync(noDisco, 'utf8')).toBe('# Novo texto\n');
  });

  it('arquivo fora do contrato do tipo devolve 400, e lista vazia tambem', async () => {
    const errado = await worker('PUT', `/api/jobs/${jobConectorV1}/entregavel`, {
      tipo: 'slides', versao: 1, arquivos: [{ nome: 'qualquer.txt', conteudo: 'x' }],
    });
    expect(errado.status).toBe(400);
    const vazio = await worker('PUT', `/api/jobs/${jobConectorV1}/entregavel`, { tipo: 'conector', versao: 1, arquivos: [] });
    expect(vazio.status).toBe(400);
    const semVersao = await worker('PUT', `/api/jobs/${jobConectorV1}/entregavel`, { tipo: 'conector', versao: 99, arquivos: [{ nome: 'instalacao.md', conteudo: 'x' }] });
    expect(semVersao.status).toBe(404);
  });

  it('a versao do membro passa a trazer o entregavel `conector` com a meta e a URL de download', async () => {
    const r = await api('GET', '/api/script/versoes/1', 'userCom');
    expect(r.status).toBe(200);
    const conector = r.data.versao.entregaveis.find((e) => e.tipo === 'conector');
    expect(conector).toBeTruthy();
    expect(conector.meta.pagina).toBe('https://novo/instalar');
    expect(conector.arquivos[0].url).toBe('/api/script/versoes/1/entregaveis/conector/instalacao');

    const baixa = await fetch(`${base}${conector.arquivos[0].url}`, { headers: { 'x-user': 'userCom' } });
    expect(baixa.status).toBe(200);
    expect(await baixa.text()).toBe('# Novo texto\n');
  });

  it('membro de outro clube nao ve o entregavel do clube-com', async () => {
    const r = await api('GET', '/api/script/versoes/1', 'userSem');
    expect((r.data.versao.entregaveis || []).some((e) => e.tipo === 'conector')).toBe(false);
  });
});

describe('PATCH /api/jobs/:id com status done grava o endereco no clube', () => {
  it('result.porta e result.tenant_url viram conector_porta e conector_url', async () => {
    const r = await worker('PATCH', `/api/jobs/${jobConectorV1}`, {
      status: 'done',
      result: { tenant_url: 'https://conector.prosperus.app/clube-com/mcp', porta: 8803, versao: 1, refresh: true },
    });
    expect(r.status).toBe(200);
    expect(r.data.job.status).toBe('done');
    const club = await dbGet(`SELECT conector_porta, conector_url FROM cohort_clubs WHERE slug = 'clube-com'`);
    expect(club.conector_porta).toBe(8803);
    expect(club.conector_url).toBe('https://conector.prosperus.app/clube-com/mcp');
  });

  it('done sem porta nem endereco nao apaga o que ja estava gravado', async () => {
    await worker('PATCH', `/api/jobs/${jobConectorV1}`, { status: 'done', result: { versao: 1 } });
    const club = await dbGet(`SELECT conector_porta, conector_url FROM cohort_clubs WHERE slug = 'clube-com'`);
    expect(club.conector_porta).toBe(8803);
    expect(club.conector_url).toBe('https://conector.prosperus.app/clube-com/mcp');
  });

  it('needs_human nao mexe no endereco', async () => {
    await worker('PATCH', `/api/jobs/${jobConectorV1}`, { status: 'needs_human', error: 'faltou o acesso' });
    const club = await dbGet(`SELECT conector_porta FROM cohort_clubs WHERE slug = 'clube-com'`);
    expect(club.conector_porta).toBe(8803);
  });

  it('a versao ja publicada nao volta para a fila mesmo depois do job terminar', async () => {
    await dbRun(`UPDATE cohort_jobs SET status = 'done' WHERE id = ?`, [jobConectorV1]);
    const r = await api('POST', '/api/script/versoes/1/aprovar', 'userCom');
    expect(r.data.conector_job.existing).toBe(true);
    expect(r.data.conector_job.id).toBe(jobConectorV1);
  });

  it('outra versao do mesmo clube ganha o seu proprio job', async () => {
    const r = await api('POST', '/api/script/versoes/2/aprovar', 'userCom');
    expect(r.data.conector_job.existing).toBe(false);
    expect(r.data.conector_job.id).not.toBe(jobConectorV1);
    const j = await worker('GET', `/api/jobs/${r.data.conector_job.id}`);
    expect(j.data.job.payload.versao).toBe(2);
  });
});

describe('admin liga e desliga o conector', () => {
  it('PATCH /api/admin/cohort/clubs/:slug/conector muda a coluna e devolve o clube', async () => {
    const desliga = await api('PATCH', '/api/admin/cohort/clubs/clube-com/conector', 'admin', { conector: 0 });
    expect(desliga.status).toBe(200);
    expect(desliga.data.club.conector).toBe(false);
    expect(desliga.data.club.conector_porta).toBe(8803);
    expect(desliga.data.club.conector_url).toBe('https://conector.prosperus.app/clube-com/mcp');
    expect((await dbGet(`SELECT conector FROM cohort_clubs WHERE slug = 'clube-com'`)).conector).toBe(0);

    const liga = await api('PATCH', '/api/admin/cohort/clubs/clube-com/conector', 'admin', { conector: 1 });
    expect(liga.data.club.conector).toBe(true);
    expect((await dbGet(`SELECT conector FROM cohort_clubs WHERE slug = 'clube-com'`)).conector).toBe(1);
  });

  it('clube proprio recusa com 400 e clube inexistente com 404', async () => {
    const proprio = await api('PATCH', '/api/admin/cohort/clubs/clube-proprio/conector', 'admin', { conector: 1 });
    expect(proprio.status).toBe(400);
    const naoExiste = await api('PATCH', '/api/admin/cohort/clubs/nao-existe/conector', 'admin', { conector: 1 });
    expect(naoExiste.status).toBe(404);
  });

  it('valor fora de 0 ou 1 devolve 400 e quem nao e admin leva 403', async () => {
    expect((await api('PATCH', '/api/admin/cohort/clubs/clube-com/conector', 'admin', { conector: 2 })).status).toBe(400);
    expect((await api('PATCH', '/api/admin/cohort/clubs/clube-com/conector', 'userCom', { conector: 0 })).status).toBe(403);
  });

  it('o detalhe do clube no admin mostra o estado do conector', async () => {
    const r = await api('GET', '/api/admin/clubs/clube-com/script-ficha', 'admin');
    expect(r.status).toBe(200);
    expect(r.data.data.club.conector).toBe(true);
    expect(r.data.data.club.conector_porta).toBe(8803);
    expect(r.data.data.club.conector_url).toBe('https://conector.prosperus.app/clube-com/mcp');
    const proprio = await api('GET', '/api/admin/clubs/clube-proprio/script-ficha', 'admin');
    expect(proprio.data.data.club.produto).toBe('club');
    expect(proprio.data.data.club.conector).toBe(false);
  });
});

/**
 * Portal "Minha base" (migration 030): o mentor ganha um endereco com login e senha para ver o atlas da
 * base de conhecimento do clube e cuidar dos documentos. As credenciais vivem em cohort_clubs (portal_url,
 * portal_usuario, portal_senha), o runner as devolve em result.portal no PATCH done do job `conector`, e a
 * ficha do membro as entrega em `club_portal`. Senha nula no result nunca apaga a que ja esta guardada.
 */
describe('portal "Minha base" do clube', () => {
  const URL_PORTAL = 'https://prosperusclub.com.br/minha-base/';

  it('portal_url, portal_usuario e portal_senha existem depois do boot dos routers', async () => {
    // O CREATE TABLE do teste nao tem as tres colunas: quem as cria e o ensureConectorColumns dos routers
    const row = await dbGet(`SELECT portal_url, portal_usuario, portal_senha FROM cohort_clubs WHERE slug = 'clube-sem'`);
    expect(row.portal_url).toBe(null);
    expect(row.portal_usuario).toBe(null);
    expect(row.portal_senha).toBe(null);
  });

  it('a migration 030 so acrescenta as colunas, sem passo de dado', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'migrations', '030_cohort_clubs_portal.sql'), 'utf8');
    expect(sql).toContain('ALTER TABLE cohort_clubs ADD COLUMN portal_url TEXT');
    expect(sql).toContain('ALTER TABLE cohort_clubs ADD COLUMN portal_usuario TEXT');
    expect(sql).toContain('ALTER TABLE cohort_clubs ADD COLUMN portal_senha TEXT');
    expect(sql).toContain("VALUES ('030'");
    expect(sql).not.toMatch(/UPDATE cohort_clubs/);
    expect(VM.COHORT_CLUBS_PORTAL_DDL).toHaveLength(3);
  });

  it('antes da publicacao a ficha do membro traz club_portal nulo', async () => {
    const r = await api('GET', '/api/script/ficha', 'userCom');
    expect(r.status).toBe(200);
    expect(r.data.data.club_portal).toBe(null);
  });

  it('PATCH done com result.portal grava endereco, usuario e senha no clube', async () => {
    const r = await worker('PATCH', `/api/jobs/${jobConectorV1}`, {
      status: 'done',
      result: {
        tenant_url: 'https://conector.prosperus.app/clube-com/mcp',
        porta: 8803,
        portal: { url: URL_PORTAL, usuario: 'clube-com', porta: 8820, senha: 'chave-inicial-123', criado: true, senha_redefinida: false },
      },
    });
    expect(r.status).toBe(200);
    const club = await dbGet(`SELECT portal_url, portal_usuario, portal_senha FROM cohort_clubs WHERE slug = 'clube-com'`);
    expect(club.portal_url).toBe(URL_PORTAL);
    expect(club.portal_usuario).toBe('clube-com');
    expect(club.portal_senha).toBe('chave-inicial-123');
  });

  it('senha nula ou vazia no result nao apaga a que ja esta guardada', async () => {
    await worker('PATCH', `/api/jobs/${jobConectorV1}`, {
      status: 'done',
      result: { portal: { url: URL_PORTAL, usuario: 'clube-com', porta: 8820, senha: null, criado: false, senha_redefinida: false } },
    });
    expect((await dbGet(`SELECT portal_senha FROM cohort_clubs WHERE slug = 'clube-com'`)).portal_senha).toBe('chave-inicial-123');

    await worker('PATCH', `/api/jobs/${jobConectorV1}`, {
      status: 'done',
      result: { portal: { url: URL_PORTAL, usuario: 'clube-com', senha: '   ' } },
    });
    expect((await dbGet(`SELECT portal_senha FROM cohort_clubs WHERE slug = 'clube-com'`)).portal_senha).toBe('chave-inicial-123');

    // done sem `portal` nenhum tambem deixa tudo como estava
    await worker('PATCH', `/api/jobs/${jobConectorV1}`, { status: 'done', result: { versao: 1 } });
    const club = await dbGet(`SELECT portal_url, portal_usuario, portal_senha FROM cohort_clubs WHERE slug = 'clube-com'`);
    expect(club.portal_usuario).toBe('clube-com');
    expect(club.portal_senha).toBe('chave-inicial-123');
  });

  it('senha nova preenchida substitui a anterior', async () => {
    await worker('PATCH', `/api/jobs/${jobConectorV1}`, {
      status: 'done',
      result: { portal: { url: URL_PORTAL, usuario: 'clube-com', senha: 'chave-nova-456', senha_redefinida: true } },
    });
    expect((await dbGet(`SELECT portal_senha FROM cohort_clubs WHERE slug = 'clube-com'`)).portal_senha).toBe('chave-nova-456');
  });

  it('a ficha do membro passa a trazer club_portal com endereco, usuario e senha', async () => {
    const r = await api('GET', '/api/script/ficha', 'userCom');
    expect(r.status).toBe(200);
    expect(r.data.data.club_portal).toEqual({ url: URL_PORTAL, usuario: 'clube-com', senha: 'chave-nova-456' });
  });

  it('membro de outro clube nao ve o portal do clube-com', async () => {
    const r = await api('GET', '/api/script/ficha', 'userSem');
    expect(r.status).toBe(200);
    expect(r.data.data.club_portal).toBe(null);
    expect(r.text).not.toContain('chave-nova-456');
  });

  it('com senha guardada, o job novo sai com portal_tem_senha true', async () => {
    await dbRun(`INSERT INTO script_versions (id, club_slug, versao, content_md, resumo, status) VALUES ('sv-com-3', 'clube-com', 3, ?, '', 'rascunho')`, [MD]);
    const r = await api('POST', '/api/script/versoes/3/aprovar', 'userCom');
    expect(r.status).toBe(200);
    expect(r.data.conector_job.existing).toBe(false);
    const j = await worker('GET', `/api/jobs/${r.data.conector_job.id}`);
    expect(j.data.job.payload.portal_tem_senha).toBe(true);
    expect(j.data.job.payload.versao).toBe(3);
  });

  it('o detalhe do clube no admin mostra o usuario e se ha senha, nunca a senha', async () => {
    const r = await api('GET', '/api/admin/clubs/clube-com/script-ficha', 'admin');
    expect(r.status).toBe(200);
    expect(r.data.data.club.portal_usuario).toBe('clube-com');
    expect(r.data.data.club.portal_senha_definida).toBe(true);
    // O clube do admin leva o sinal, nunca a senha (o result do job continua sendo coisa da fila)
    expect(JSON.stringify(r.data.data.club)).not.toContain('chave-nova-456');

    const sem = await api('GET', '/api/admin/clubs/clube-sem/script-ficha', 'admin');
    expect(sem.data.data.club.portal_usuario).toBe(null);
    expect(sem.data.data.club.portal_senha_definida).toBe(false);
  });
});
