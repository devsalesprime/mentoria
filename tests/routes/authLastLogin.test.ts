// @ts-nocheck
/** @vitest-environment node */
/**
 * "Último login" do admin (PENDENCIAS-2026-09-06 §1 item 33).
 *
 * O painel do cohort mostrava users.updated_at como último login. updated_at muda em QUALQUER escrita
 * na linha (resync de clube, troca de nome), então quem nunca entrou aparecia com login recente e o
 * Caio cobrava a pessoa errada. Agora quem grava a data é o próprio login (POST /auth/verify-member),
 * em users.last_login_at, e nada mais escreve nessa coluna.
 *
 * Cobre: nunca entrou = null · o login grava · um UPDATE de perfil NÃO mexe na data · entrar de novo move.
 */
import express from 'express';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import createAuthRoutes from '../../routes/auth.cjs';
import createAdminCohortRoutes from '../../routes/admin-cohort.cjs';

let server; let base; let dbGet; let dbRun;
let seq = 0;

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

const entrar = (email) => api('POST', '/auth/verify-member', null, { email });

/** A linha do clube na visão geral do admin (é ela que a aba Cohort desenha). */
async function linhaDoClube() {
  const r = await api('GET', '/api/admin/cohort', 'admin');
  expect(r.status).toBe(200);
  return r.data.data.find((c) => c.club_slug === 'clube-x');
}

const membro = (linha, email) => linha.membros.find((m) => m.email === email);

beforeAll(async () => {
  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbGet = helpers.dbGet;
  dbRun = helpers.dbRun;
  const ddl = [
    // last_login_at existe desde migrations/025_users_last_login.sql (ALTER idempotente no boot)
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'member', cohort TEXT, club_slug TEXT,
       last_login_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE diagnostic_data (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT, name TEXT, progress_percentage INTEGER, status TEXT)`,
    `CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL,
       file_type TEXT, file_size INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_clubs (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_members (email TEXT PRIMARY KEY, club_slug TEXT NOT NULL, nome TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', materials JSON NOT NULL DEFAULT '{}',
       materials_status TEXT NOT NULL DEFAULT 'pending', materials_submitted_at DATETIME, ficha_status TEXT NOT NULL DEFAULT 'vazia', prefill_meta JSON,
       prefilled_at DATETIME, reviewed_at DATETIME, last_user_activity_at DATETIME, suficiencia TEXT, confirmada_por TEXT, modo TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const s of ddl) await dbRun(s);
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-x', 'Clube X', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('ana@x.com', 'clube-x', 'Ana'), ('beto@x.com', 'clube-x', 'Beto')`);

  const deps = {
    db,
    ...helpers,
    authMiddleware,
    adminMiddleware,
    uuidv4: () => `id-${++seq}`,
    generateId: () => `${++seq}`,
    // Sem token do HubSpot o login do cohort passa direto por cohort_members (é o caso do Exclusive)
    jwt: { sign: () => 'token-de-teste' },
    axios: { post: async () => { throw new Error('HubSpot não deveria ser chamado'); } },
    JWT_SECRET: 'segredo',
    HUBSPOT_TOKEN: '',
    HUBSPOT_WIN_STAGE: 'closedwon',
    ADMIN_EMAIL: 'admin@x.com',
    ADMIN_PASSWORD_HASH: '',
    logToFile: () => {},
    safeJsonParse,
  };
  const app = express();
  app.use(express.json());
  app.use(createAuthRoutes(deps));
  app.use(createAdminCohortRoutes(deps));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('users.last_login_at: a hora de entrar, não a hora de mexer na linha', () => {
  it('quem nunca entrou não tem conta nem último login', async () => {
    const linha = await linhaDoClube();
    expect(membro(linha, 'ana@x.com').user_id).toBeNull();
    expect(membro(linha, 'ana@x.com').ultimo_login).toBeNull();
    expect(linha.ultimo_login).toBeNull();
  });

  it('o login grava a data na conta nova e o admin passa a mostrar', async () => {
    const r = await entrar('ana@x.com');
    expect(r.status).toBe(200);
    expect(r.data.user.clubSlug).toBe('clube-x');

    const u = await dbGet(`SELECT id, last_login_at FROM users WHERE email = 'ana@x.com'`);
    expect(u.last_login_at).toBeTruthy();

    const linha = await linhaDoClube();
    expect(membro(linha, 'ana@x.com').ultimo_login).toBe(u.last_login_at);
    // Beto continua sem conta: o clube inteiro tem o login da Ana como o mais recente
    expect(membro(linha, 'beto@x.com').ultimo_login).toBeNull();
    expect(linha.ultimo_login).toBe(u.last_login_at);
  });

  it('mexer na linha do usuário NÃO conta como login (era o bug: lia updated_at)', async () => {
    const antes = await dbGet(`SELECT last_login_at, updated_at FROM users WHERE email = 'ana@x.com'`);

    // O mesmo UPDATE que o resync de clube do admin faz (routes/admin-cohort.cjs markUsers)
    await dbRun(`UPDATE users SET name = 'Ana Maria', cohort = 'exclusive', club_slug = 'clube-x',
                   updated_at = '2099-01-01 00:00:00' WHERE email = 'ana@x.com'`);

    const depois = await dbGet(`SELECT last_login_at, updated_at FROM users WHERE email = 'ana@x.com'`);
    expect(depois.updated_at).toBe('2099-01-01 00:00:00');
    expect(depois.last_login_at).toBe(antes.last_login_at);

    const linha = await linhaDoClube();
    expect(membro(linha, 'ana@x.com').ultimo_login).toBe(antes.last_login_at);
    expect(membro(linha, 'ana@x.com').ultimo_login).not.toBe('2099-01-01 00:00:00');
  });

  it('entrar de novo move a data para frente (conta que já existe)', async () => {
    await dbRun(`UPDATE users SET last_login_at = '2020-01-01 00:00:00' WHERE email = 'ana@x.com'`);

    const r = await entrar('ana@x.com');
    expect(r.status).toBe(200);

    const u = await dbGet(`SELECT id, last_login_at FROM users WHERE email = 'ana@x.com'`);
    expect(u.last_login_at).not.toBe('2020-01-01 00:00:00');
    expect(u.last_login_at > '2020-01-01 00:00:00').toBe(true);

    // e continua sendo uma conta só (o login não duplica a pessoa)
    const contas = await dbGet(`SELECT COUNT(*) AS n FROM users WHERE lower(email) = 'ana@x.com'`);
    expect(contas.n).toBe(1);
  });

  it('e-mail fora do cohort não entra e não cria conta', async () => {
    const r = await entrar('estranho@x.com');
    expect(r.status).toBe(500); // sem HubSpot e sem cohort_members não há como liberar
    const u = await dbGet(`SELECT id FROM users WHERE email = 'estranho@x.com'`);
    expect(u).toBeFalsy();
  });
});
