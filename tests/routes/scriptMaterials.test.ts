// @ts-nocheck
/** @vitest-environment node */
/**
 * Materiais por PESSOA (routes/script.cjs + routes/admin-cohort.cjs) em banco sqlite em memoria:
 * - o membro lista/baixa so os proprios arquivos (socio recebe [] e 404)
 * - acessos de plataforma de A nunca aparecem na resposta de B
 * - "Enviei o que tinha" e por pessoa; o clube vira submitted com o primeiro
 * - forma antiga do JSON vira `legado` (so o admin ve)
 * - cohort_config.prazo_materiais: admin grava, membro le
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import createScriptRoutes from '../../routes/script.cjs';
import createAdminCohortRoutes from '../../routes/admin-cohort.cjs';

const SENHA_A = 'SEGREDO-DE-A-123';
let server; let base; let tmpDir; let fileAId = 'file-a-1';
let dbRun;

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

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-materials-'));
  const fileA = path.join(tmpDir, 'reuniao.txt');
  fs.writeFileSync(fileA, 'transcricao de A');

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
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-x', 'Clube X', 1), ('clube-legado', 'Clube Legado', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('a@x.com', 'clube-x', 'Ana'), ('b@x.com', 'clube-x', 'Beto'), ('c@x.com', 'clube-legado', 'Caio')`);
  await dbRun(`INSERT INTO users (id, email, name, cohort, club_slug) VALUES
    ('userA', 'a@x.com', 'Ana', 'exclusive', 'clube-x'),
    ('userB', 'B@x.com', 'Beto', 'exclusive', 'clube-x'),
    ('userC', 'c@x.com', 'Caio', 'exclusive', 'clube-legado')`);
  await dbRun(`INSERT INTO uploaded_files (id, user_id, category, module, file_name, file_path, file_type, file_size)
    VALUES (?, 'userA', 'script_transcricao_venda', 'script', 'reuniao.txt', ?, 'text/plain', 16)`, [fileAId, fileA]);
  await dbRun(`INSERT INTO script_fichas (id, club_slug, fields, materials) VALUES ('ficha-legado', 'clube-legado', '{}',
    '{"links":[{"url":"https://drive.google.com/antigo","rotulo":"Pasta","tipo":"drive"}],"observacoes":"obs do clube inteiro"}')`);

  const deps = { db, ...helpers, authMiddleware, adminMiddleware, uuidv4: () => `id-${Math.random().toString(36).slice(2)}`, fs, path, safeJsonParse };
  const app = express();
  app.use(express.json());
  app.use(createScriptRoutes(deps));
  app.use(createAdminCohortRoutes(deps));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('arquivos: so os proprios', () => {
  it('A ve o proprio arquivo; B (socio do mesmo clube) nao ve nada', async () => {
    const a = await api('GET', '/api/script/ficha', 'userA');
    expect(a.status).toBe(200);
    expect(a.data.data.files.map((f) => f.id)).toEqual([fileAId]);
    expect(a.data.data.files[0].mine).toBe(true);

    const b = await api('GET', '/api/script/ficha', 'userB');
    expect(b.status).toBe(200);
    expect(b.data.data.files).toEqual([]);
    const bList = await api('GET', '/api/script/materials/files', 'userB');
    expect(bList.data.data).toEqual([]);
  });

  it('download: dono 200, socio 404', async () => {
    const own = await api('GET', `/api/script/materials/files/${fileAId}/download`, 'userA');
    expect(own.status).toBe(200);
    expect(own.text).toBe('transcricao de A');
    const other = await api('GET', `/api/script/materials/files/${fileAId}/download`, 'userB');
    expect(other.status).toBe(404);
  });
});

describe('links, observacoes e acessos por pessoa', () => {
  it('A salva acessos; B nao recebe nada de A (nem a senha em lugar nenhum)', async () => {
    const put = await api('PUT', '/api/script/ficha/materials', 'userA', {
      acessos: [{ plataforma_url: 'https://plataforma.com/login', login: 'ana@x.com', senha: SENHA_A, observacoes: 'curso X na aba Y' }],
    });
    expect(put.status).toBe(200);
    expect(put.data.materials.acessos).toHaveLength(1);
    expect(put.data.materials.acessos[0].senha).toBe(SENHA_A);

    const b = await api('GET', '/api/script/ficha', 'userB');
    expect(b.data.data.materials).toEqual({ links: [], observacoes: '', acessos: [], submitted_at: null });
    expect(b.text).not.toContain(SENHA_A);
    expect(b.text).not.toContain('plataforma.com');
  });

  it('PUT parcial mantem o que nao veio (links nao apagam acessos)', async () => {
    const put = await api('PUT', '/api/script/ficha/materials', 'userA', {
      links: [{ url: 'https://drive.google.com/a', rotulo: 'Drive da Ana', tipo: 'drive' }],
    });
    expect(put.data.materials.links).toHaveLength(1);
    expect(put.data.materials.acessos).toHaveLength(1);
    const obs = await api('PUT', '/api/script/ficha/materials', 'userA', { observacoes: 'obs da Ana' });
    expect(obs.data.materials).toMatchObject({ observacoes: 'obs da Ana', links: [{ url: 'https://drive.google.com/a' }], acessos: [{ senha: SENHA_A }] });
  });

  it('valida o acesso (URL sem http -> 400)', async () => {
    const bad = await api('PUT', '/api/script/ficha/materials', 'userA', { acessos: [{ plataforma_url: 'plataforma.com', senha: 'x' }] });
    expect(bad.status).toBe(400);
  });

  it('B salva os proprios links sem tocar nos de A', async () => {
    const put = await api('PUT', '/api/script/ficha/materials', 'userB', { links: [{ url: 'https://site.do.beto', rotulo: 'Site', tipo: 'site' }] });
    expect(put.data.materials.links[0].url).toBe('https://site.do.beto');
    expect(put.data.materials.acessos).toEqual([]);
    const a = await api('GET', '/api/script/ficha', 'userA');
    expect(a.data.data.materials.links[0].url).toBe('https://drive.google.com/a');
    expect(a.text).not.toContain('site.do.beto');
  });
});

describe('"Enviei o que tinha" por pessoa', () => {
  it('B envia: B submitted, A pending; clube vira submitted com o primeiro', async () => {
    const sub = await api('POST', '/api/script/ficha/materials/submit', 'userB');
    expect(sub.status).toBe(200);
    expect(sub.data.materials_status).toBe('submitted');
    const b = await api('GET', '/api/script/ficha', 'userB');
    expect(b.data.data.materials_status).toBe('submitted');
    expect(b.data.data.materials.submitted_at).toBe(sub.data.materials_submitted_at);
    const a = await api('GET', '/api/script/ficha', 'userA');
    expect(a.data.data.materials_status).toBe('pending');
    expect(a.data.data.materials_submitted_at).toBeNull();

    const ov = await api('GET', '/api/admin/cohort', 'admin');
    const row = ov.data.data.find((r) => r.club_slug === 'clube-x');
    expect(row.materials_status).toBe('submitted');
    expect(row.pessoas_enviaram).toBe(1);
    expect(row.materiais_count).toBe(1);
    expect(row.links_count).toBe(3); // 1 link A + 1 acesso A + 1 link B
  });

  it('admin ve tudo por pessoa, inclusive a senha de A', async () => {
    const det = await api('GET', '/api/admin/clubs/clube-x/script-ficha', 'admin');
    expect(det.status).toBe(200);
    const a = det.data.data.pessoas.find((p) => p.email === 'a@x.com');
    const b = det.data.data.pessoas.find((p) => p.email === 'b@x.com');
    expect(a.files.map((f) => f.id)).toEqual([fileAId]);
    expect(a.files[0].ownerEmail).toBe('a@x.com');
    expect(a.acessos[0].senha).toBe(SENHA_A);
    expect(a.links).toHaveLength(1);
    expect(a.observacoes).toBe('obs da Ana');
    expect(a.submitted_at).toBeNull();
    expect(b.files).toEqual([]);
    expect(b.links[0].url).toBe('https://site.do.beto');
    expect(b.submitted_at).toBeTruthy();
    expect(det.data.data.pessoas_enviaram).toBe(1);
    expect(det.data.data.legado).toBeNull();
  });

  it('membro fora do cohort -> 403 enabled:false', async () => {
    await dbRun(`INSERT INTO users (id, email, name) VALUES ('userZ', 'z@x.com', 'Zeca')`);
    const z = await api('GET', '/api/script/materials/files', 'userZ');
    expect(z.status).toBe(403);
    expect(z.data.enabled).toBe(false);
  });
});

describe('forma antiga do JSON (por clube)', () => {
  it('membro nao ve o legado; admin ve', async () => {
    const c = await api('GET', '/api/script/ficha', 'userC');
    expect(c.status).toBe(200);
    expect(c.data.data.materials).toEqual({ links: [], observacoes: '', acessos: [], submitted_at: null });
    expect(c.data.data).not.toHaveProperty('legado');
    expect(c.text).not.toContain('drive.google.com/antigo');
    expect(c.text).not.toContain('obs do clube inteiro');

    const det = await api('GET', '/api/admin/clubs/clube-legado/script-ficha', 'admin');
    expect(det.data.data.legado.links[0].url).toBe('https://drive.google.com/antigo');
    expect(det.data.data.legado.observacoes).toBe('obs do clube inteiro');
  });

  it('salvar por pessoa preserva o legado', async () => {
    await api('PUT', '/api/script/ficha/materials', 'userC', { observacoes: 'obs do Caio' });
    const det = await api('GET', '/api/admin/clubs/clube-legado/script-ficha', 'admin');
    expect(det.data.data.legado.observacoes).toBe('obs do clube inteiro');
    expect(det.data.data.pessoas.find((p) => p.email === 'c@x.com').observacoes).toBe('obs do Caio');
  });
});

describe('cohort_config.prazo_materiais', () => {
  it('membro le vazio por padrao; admin grava; membro passa a ler', async () => {
    const before = await api('GET', '/api/script/ficha', 'userA');
    expect(before.data.data.config).toEqual({ prazo_materiais: '' });
    const put = await api('PUT', '/api/admin/cohort/config', 'admin', { prazo_materiais: '  até sexta, 12/09 ' });
    expect(put.status).toBe(200);
    expect(put.data.data.prazo_materiais).toBe('até sexta, 12/09');
    const after = await api('GET', '/api/script/ficha', 'userA');
    expect(after.data.data.config.prazo_materiais).toBe('até sexta, 12/09');
    const get = await api('GET', '/api/admin/cohort/config', 'admin');
    expect(get.data.data.prazo_materiais).toBe('até sexta, 12/09');
    const member = await api('PUT', '/api/admin/cohort/config', 'userA', { prazo_materiais: 'x' });
    expect(member.status).toBe(403);
  });
});
