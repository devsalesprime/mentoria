// @ts-nocheck
/** @vitest-environment node */
/**
 * Modo antes do script automatico (routes/jobs.cjs + routes/script.cjs, sqlite :memory:).
 *
 * Quando o material basta, a ficha fecha sozinha e o script entra na fila ANTES de a pessoa ver a tela
 * "Como você quer construir o seu script?" (foi o que aconteceu com os 13 clubes que entraram com dossiê).
 * A ficha ficava sem `modo` e o app mandava a pessoa para a tela de escolha depois de ja ter escrito.
 * Agora:
 * - sem escolha, o auto-confirm grava `modo = 'completo'` (o caminho mais fundo, porque havia material)
 *   e registra que quem escolheu foi o app (`prefill_meta.modo_origem = 'automatico'`)
 * - GET /api/script/ficha devolve `modo` e `modo_origem`, e a tela oferece o essencial uma vez
 * - quem ja escolheu nunca tem a escolha trocada, e nao ve oferta nenhuma
 * - trocar pelo essencial (PUT /api/script/ficha/modo) limpa a oferta
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import createScriptRoutes from '../../routes/script.cjs';
import createJobsRoutes from '../../routes/jobs.cjs';

const TOKEN = 'token-modo-automatico';
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'suficiencia-campos.json'), 'utf8'));
let server; let base; let dbRun; let dbGet;

function safeJsonParse(str, fallback = {}) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

const authMiddleware = (req, res, next) => {
  const id = req.headers['x-user'];
  if (!id) return res.status(401).json({ success: false });
  req.user = { userId: id, role: 'member' };
  next();
};

async function api(method, url, user, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { 'x-user': user } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

async function worker(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

/** O caminho de quem entrou pelo dossiê: envia os materiais, o worker le e fecha. */
async function prefillCompleto(user, slug) {
  const sub = await api('POST', '/api/script/ficha/materials/submit', user, {});
  expect(sub.status).toBe(200);
  const job = sub.data.job;
  await worker('POST', '/api/jobs/next', { tipo: 'prefill' });
  const put = await worker('PUT', `/api/jobs/${job.id}/prefill`, { club_slug: slug, campos: FIX.suficiente });
  expect(put.status).toBe(200);
  return worker('PATCH', `/api/jobs/${job.id}`, { status: 'done', result: { imported: 34 } });
}

beforeAll(async () => {
  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbRun = helpers.dbRun; dbGet = helpers.dbGet;
  const ddl = [
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'member', cohort TEXT, club_slug TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL,
       file_type TEXT, file_size INTEGER, url TEXT, module TEXT DEFAULT 'general', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_clubs (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_members (email TEXT PRIMARY KEY, club_slug TEXT NOT NULL, nome TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    // script_fichas SEM as colunas novas: os ALTER idempotentes (020 e 023) criam suficiencia, confirmada_por e modo
    `CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', materials JSON NOT NULL DEFAULT '{}',
       materials_status TEXT NOT NULL DEFAULT 'pending', materials_submitted_at DATETIME, ficha_status TEXT NOT NULL DEFAULT 'vazia', prefill_meta JSON,
       prefilled_at DATETIME, reviewed_at DATETIME, last_user_activity_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const s of ddl) await dbRun(s);
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-dossie', 'Clube do Dossiê', 1), ('clube-escolheu', 'Clube que Escolheu', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('d@x.com', 'clube-dossie', 'Dora'), ('e@x.com', 'clube-escolheu', 'Elis')`);
  await dbRun(`INSERT INTO users (id, email, name, cohort, club_slug) VALUES
    ('userD', 'd@x.com', 'Dora', 'exclusive', 'clube-dossie'),
    ('userE', 'e@x.com', 'Elis', 'exclusive', 'clube-escolheu')`);

  const deps = { db, ...helpers, authMiddleware, adminMiddleware: (req, res, next) => next(), uuidv4: () => `id-${Math.random().toString(36).slice(2)}`, fs, path, safeJsonParse };
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(createScriptRoutes(deps));
  app.use(createJobsRoutes({ ...deps, COHORT_JOBS_TOKEN: TOKEN, APP_URL: 'https://app.teste.local/' }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  await new Promise((r) => setTimeout(r, 60));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('a ficha que fecha sozinha sem a pessoa ter escolhido o caminho', () => {
  it('a ficha comeca sem modo nenhum', async () => {
    const r = await api('GET', '/api/script/ficha', 'userD');
    expect(r.data.data.modo).toBeNull();
    expect(r.data.data.modo_origem).toBeNull();
  });

  it('o auto-confirm grava o caminho completo e registra que quem escolheu foi o app', async () => {
    const done = await prefillCompleto('userD', 'clube-dossie');
    expect(done.status).toBe(200);
    expect(done.data.suficiencia).toMatchObject({ resultado: 'suficiente', ficha_status: 'confirmada', modo: 'completo', modo_origem: 'automatico' });
    // o script foi para a fila com o caminho ja definido
    expect(done.data.suficiencia.script_job_id).toBeTruthy();

    const linha = await dbGet(`SELECT modo, prefill_meta FROM script_fichas WHERE club_slug = 'clube-dossie'`);
    expect(linha.modo).toBe('completo');
    const meta = JSON.parse(linha.prefill_meta);
    expect(meta.modo_origem).toBe('automatico');
    expect(meta.modo_definido_em).toBeTruthy();
    // o resto do meta do pre-preenchimento continua la
    expect(meta.importado_em).toBeTruthy();
  });

  it('GET /api/script/ficha devolve modo e modo_origem para a tela oferecer o essencial', async () => {
    const r = await api('GET', '/api/script/ficha', 'userD');
    expect(r.data.data.modo).toBe('completo');
    expect(r.data.data.modo_origem).toBe('automatico');
    expect(r.data.data.ficha_status).toBe('confirmada');
  });

  it('trocar pelo essencial em um toque limpa a oferta', async () => {
    const put = await api('PUT', '/api/script/ficha/modo', 'userD', { modo: 'essencial' });
    expect(put.status).toBe(200);
    const r = await api('GET', '/api/script/ficha', 'userD');
    expect(r.data.data.modo).toBe('essencial');
    // a marca de origem some junto com a escolha do app
    expect(r.data.data.modo_origem).toBeNull();
  });
});

describe('quem escolheu antes nunca tem a escolha trocada', () => {
  it('a ficha do clube que escolheu o essencial fecha sozinha no essencial, sem oferta', async () => {
    const escolha = await api('PUT', '/api/script/ficha/modo', 'userE', { modo: 'essencial' });
    expect(escolha.status).toBe(200);

    const done = await prefillCompleto('userE', 'clube-escolheu');
    expect(done.status).toBe(200);
    expect(done.data.suficiencia.modo).toBe('essencial');
    expect(done.data.suficiencia.modo_origem).toBeNull();

    const r = await api('GET', '/api/script/ficha', 'userE');
    expect(r.data.data.modo).toBe('essencial');
    expect(r.data.data.modo_origem).toBeNull();
  });
});
