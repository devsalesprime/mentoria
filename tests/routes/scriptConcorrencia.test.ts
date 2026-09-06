// @ts-nocheck
/** @vitest-environment node */
/**
 * Escrita concorrente de socios na mesma ficha (routes/script.cjs + routes/jobs.cjs, sqlite :memory:).
 * A ficha e do CLUBE: os dois donos respondem as mesmas perguntas. Ate aqui a ultima gravacao vencia em
 * silencio; agora cada campo carrega uma versao (`rev`):
 * - GET /api/script/ficha devolve `rev` e `decidido_por` (quem respondeu, com nome) em cada campo
 * - a segunda gravacao com a `rev` velha recebe 409 com o valor do socio, o nome e a data
 * - o mesmo PUT com `forcar: true` ("Usar a minha") grava por cima
 * - no lote, o campo sem conflito entra e so o disputado volta em `conflitos`
 * - PUT sem `rev` (tela antiga) grava como sempre gravou; a propria pessoa nunca conflita consigo mesma
 * - o runner (PUT /api/jobs/:id/campo) fica FORA da checagem
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import createScriptRoutes from '../../routes/script.cjs';
import createJobsRoutes from '../../routes/jobs.cjs';

const TOKEN = 'token-concorrencia';
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

const campoDe = (ficha, k) => ficha.blocos.flatMap((b) => b.campos).find((c) => c.key === k);
async function ler(user, key) {
  const r = await api('GET', '/api/script/ficha', user);
  expect(r.status).toBe(200);
  return campoDe(r.data.data, key);
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
    `CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', materials JSON NOT NULL DEFAULT '{}',
       materials_status TEXT NOT NULL DEFAULT 'pending', materials_submitted_at DATETIME, ficha_status TEXT NOT NULL DEFAULT 'vazia', prefill_meta JSON,
       prefilled_at DATETIME, reviewed_at DATETIME, last_user_activity_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const s of ddl) await dbRun(s);
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-socios', 'Ana e Gustavo', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('ana@x.com', 'clube-socios', 'Ana Prado'), ('gu@x.com', 'clube-socios', 'Gustavo Prado')`);
  await dbRun(`INSERT INTO users (id, email, name, cohort, club_slug) VALUES
    ('userAna', 'ana@x.com', 'Ana Prado', 'exclusive', 'clube-socios'),
    ('userGu', 'gu@x.com', 'Gustavo Prado', 'exclusive', 'clube-socios')`);

  const deps = { db, ...helpers, authMiddleware, adminMiddleware: (req, res, next) => next(), uuidv4: () => `id-${Math.random().toString(36).slice(2)}`, fs, path, safeJsonParse };
  const app = express();
  app.use(express.json());
  app.use(createScriptRoutes(deps));
  app.use(createJobsRoutes({ ...deps, COHORT_JOBS_TOKEN: TOKEN }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  await new Promise((r) => setTimeout(r, 60));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('a versao do campo (`rev`) e quem respondeu', () => {
  it('a ficha nasce com rev 0 em todo campo e sem ninguem respondendo', async () => {
    const campo = await ler('userAna', '3.3');
    expect(campo.rev).toBe(0);
    expect(campo.decidido_por).toBeNull();
  });

  it('gravar sobe a rev e a ficha passa a dizer quem respondeu, com nome', async () => {
    const put = await api('PUT', '/api/script/ficha/fields', 'userGu', {
      updates: { '3.3': { status: 'editado', valor: 'A dor do Gustavo', rev: 0 } },
    });
    expect(put.status).toBe(200);
    expect(put.data.applied).toEqual(['3.3']);
    expect(put.data.revs['3.3']).toBe(1);

    const campo = await ler('userAna', '3.3');
    expect(campo.rev).toBe(1);
    expect(campo.valor_efetivo).toBe('A dor do Gustavo');
    expect(campo.decidido_por).toEqual({ email: 'gu@x.com', nome: 'Gustavo Prado' });
  });
});

describe('duas sessoes no mesmo campo', () => {
  it('a segunda gravacao com a rev velha recebe 409 com o valor do socio, o nome e a data', async () => {
    const r = await api('PUT', '/api/script/ficha/fields', 'userAna', {
      updates: { '3.3': { status: 'editado', valor: 'A dor da Ana', rev: 0 } },
    });
    expect(r.status).toBe(409);
    expect(r.data.success).toBe(false);
    expect(r.data.applied).toEqual([]);
    expect(r.data.conflitos).toHaveLength(1);
    const c = r.data.conflitos[0];
    expect(c.field_key).toBe('3.3');
    expect(c.rev).toBe(1);
    expect(c.valor_efetivo).toBe('A dor do Gustavo');
    expect(c.decidido_por).toEqual({ email: 'gu@x.com', nome: 'Gustavo Prado' });
    expect(c.atualizado_em).toBeTruthy();
    // a mensagem fala com a pessoa, sem jargao de codigo
    expect(r.data.message).toBe('O seu sócio respondeu este campo antes de você.');
    // nada foi gravado: o campo continua com o texto do socio
    expect((await ler('userAna', '3.3')).valor_efetivo).toBe('A dor do Gustavo');
  });

  it('"Usar a minha" (forcar) grava por cima e a rev sobe de novo', async () => {
    const r = await api('PUT', '/api/script/ficha/fields', 'userAna', {
      updates: { '3.3': { status: 'editado', valor: 'A dor da Ana', rev: 1, forcar: true } },
    });
    expect(r.status).toBe(200);
    expect(r.data.applied).toEqual(['3.3']);
    const campo = await ler('userGu', '3.3');
    expect(campo.valor_efetivo).toBe('A dor da Ana');
    expect(campo.rev).toBe(2);
    expect(campo.decidido_por).toEqual({ email: 'ana@x.com', nome: 'Ana Prado' });
  });

  it('no lote, o campo sem disputa entra e so o disputado volta em `conflitos`', async () => {
    await api('PUT', '/api/script/ficha/fields', 'userGu', {
      updates: { '3.4': { status: 'editado', valor: 'O desejo, pelo Gustavo', rev: 0 } },
    });
    const r = await api('PUT', '/api/script/ficha/fields', 'userAna', {
      updates: {
        '3.4': { status: 'editado', valor: 'O desejo, pela Ana', rev: 0 },
        '3.9': { status: 'editado', valor: 'Quem nao entra, pela Ana', rev: 0 },
      },
    });
    expect(r.status).toBe(409);
    expect(r.data.applied).toEqual(['3.9']);
    expect(r.data.conflitos.map((c) => c.field_key)).toEqual(['3.4']);
    expect((await ler('userAna', '3.4')).valor_efetivo).toBe('O desejo, pelo Gustavo');
    expect((await ler('userAna', '3.9')).valor_efetivo).toBe('Quem nao entra, pela Ana');
  });

  it('a pessoa nunca conflita consigo mesma, mesmo com a rev velha', async () => {
    const r = await api('PUT', '/api/script/ficha/fields', 'userAna', {
      updates: { '3.9': { status: 'editado', valor: 'Ana de novo, na outra aba', rev: 0 } },
    });
    expect(r.status).toBe(200);
    expect((await ler('userAna', '3.9')).valor_efetivo).toBe('Ana de novo, na outra aba');
  });

  it('PUT sem `rev` (tela antiga) grava como sempre gravou', async () => {
    const r = await api('PUT', '/api/script/ficha/fields', 'userGu', {
      updates: { '3.9': { status: 'editado', valor: 'Gustavo sem versao' } },
    });
    expect(r.status).toBe(200);
    expect((await ler('userGu', '3.9')).valor_efetivo).toBe('Gustavo sem versao');
  });

  it('campo que o socio nao decidiu (so desfez) nao vira conflito', async () => {
    await api('PUT', '/api/script/ficha/fields', 'userGu', { updates: { '3.9': { status: 'vazio' } } });
    const r = await api('PUT', '/api/script/ficha/fields', 'userAna', {
      updates: { '3.9': { status: 'editado', valor: 'Ana escreve depois', rev: 0 } },
    });
    expect(r.status).toBe(200);
  });
});

describe('o runner nao passa pela checagem', () => {
  it('PUT /api/jobs/:id/campo escreve num campo decidido pelo socio sem 409', async () => {
    const criar = await worker('POST', '/api/jobs', {
      tipo: 'pendencia', club_slug: 'clube-socios', email: 'ana@x.com', payload: { campos: ['3.3'] },
    });
    expect([200, 201]).toContain(criar.status);
    const jobId = criar.data.job.id;
    const antes = await ler('userAna', '3.3');
    const put = await worker('PUT', `/api/jobs/${jobId}/campo`, {
      field_key: '3.3', sugerido: 'Sugestão nova do runner', classe: 'Fato', fonte: 'materiais',
    });
    expect(put.status).toBe(200);
    const depois = await ler('userAna', '3.3');
    expect(depois.sugerido).toBe('Sugestão nova do runner');
    // a versao sobe (a tela do socio percebe na proxima gravacao), mas o worker nunca e barrado
    expect(depois.rev).toBe(antes.rev + 1);
  });
});
