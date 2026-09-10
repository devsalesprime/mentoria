// @ts-nocheck
/** @vitest-environment node */
/**
 * Modelo de acesso decidido em 10/09 (migração 028 + routes/auth.cjs).
 *
 * Quem PODE entrar não mudou: estar no roster do Exclusive (cohort_members de clube ativo) ou ter negócio
 * ganho no HubSpot. O que mudou é o que a pessoa encontra depois de entrar:
 *   - roster  -> clube da equipe, users.cohort = 'exclusive' (nada mudou para ela)
 *   - HubSpot -> ganha um clube próprio, criado uma vez só, users.cohort = 'club'
 *   - nem um nem outro -> continua recusada
 *
 * Cobre: roster intacto · clube próprio criado uma vez e reaproveitado no segundo login · claim `cohort`
 * no token · recusa sem negócio ganho · cohortGuard aceitando 'club' · GET /api/diagnostic com o produto.
 */
import express from 'express';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import createDbHelpers from '../../utils/db-helpers.cjs';
import createAuthRoutes from '../../routes/auth.cjs';
import createScriptRoutes from '../../routes/script.cjs';
import createDiagnosticRoutes from '../../routes/diagnostic.cjs';
import createAdminCohortRoutes from '../../routes/admin-cohort.cjs';

let server; let base; let dbGet; let dbAll; let dbRun;
let seq = 0;

function safeJsonParse(str, fallback = {}) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

const authMiddleware = (req, res, next) => {
  const id = req.headers['x-user'];
  if (!id) return res.status(401).json({ success: false });
  req.user = { userId: id, user: req.headers['x-email'] || '', role: id === 'admin' ? 'admin' : 'member' };
  next();
};
const adminMiddleware = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ success: false }));

async function api(method, url, headers, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

const entrar = (email) => api('POST', '/auth/verify-member', null, { email });

/** O HubSpot de mentira: quem existe como contato e quem tem negócio ganho. */
const HUBSPOT = {
  'ana@roster.com': { contato: true, ganho: false },
  'nova@fora.com': { contato: true, ganho: true },
  'semdeal@fora.com': { contato: true, ganho: false },
};

const axiosFake = {
  post: async (_url, body) => {
    const email = body.filterGroups[0].filters[0].value;
    const c = HUBSPOT[email];
    if (!c || !c.contato) return { data: { results: [] } };
    return { data: { results: [{ id: `hs-${email}`, properties: { firstname: 'Nome', lastname: 'De Teste', email } }] } };
  },
  get: async (url) => {
    const assoc = url.match(/contacts\/hs-(.+)\/associations\/deals/);
    if (assoc) {
      const email = assoc[1];
      return { data: { results: HUBSPOT[email] && HUBSPOT[email].ganho ? [{ id: `deal-${email}` }] : [] } };
    }
    if (/objects\/deals\/deal-/.test(url)) return { data: { properties: { dealstage: 'closedwon', dealname: 'Mentoria' } } };
    throw new Error('url inesperada do HubSpot: ' + url);
  },
};

/** O mesmo slug que routes/auth.cjs monta: 'u-' + parte local do e-mail + 6 do sha1 do e-mail. */
function slugEsperado(email) {
  const local = email.split('@')[0].replace(/[^a-z0-9]+/g, '-');
  return `u-${local}-${crypto.createHash('sha1').update(email).digest('hex').slice(0, 6)}`;
}

const contarClubes = async () => (await dbGet(`SELECT COUNT(*) AS n FROM cohort_clubs`)).n;
const clube = (slug) => dbGet(`SELECT * FROM cohort_clubs WHERE slug = ?`, [slug]);
const usuario = (email) => dbGet(`SELECT * FROM users WHERE lower(email) = ?`, [email]);

beforeAll(async () => {
  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbGet = helpers.dbGet; dbAll = helpers.dbAll; dbRun = helpers.dbRun;
  const ddl = [
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'member', cohort TEXT, club_slug TEXT,
       last_login_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE diagnostic_data (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT, name TEXT, pre_module JSON, mentor JSON, mentee JSON,
       method JSON, offer JSON, priorities JSON, current_module TEXT DEFAULT 'pre_module', current_step INTEGER DEFAULT 0,
       progress_percentage INTEGER DEFAULT 0, status TEXT DEFAULT 'in_progress', is_legacy INTEGER DEFAULT 0, submitted_at DATETIME,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL,
       file_type TEXT, file_size INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_clubs (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1,
       produto TEXT NOT NULL DEFAULT 'exclusive' CHECK(produto IN ('exclusive', 'club')), created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_members (email TEXT PRIMARY KEY, club_slug TEXT NOT NULL, nome TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', materials JSON NOT NULL DEFAULT '{}',
       materials_status TEXT NOT NULL DEFAULT 'pending', materials_submitted_at DATETIME, ficha_status TEXT NOT NULL DEFAULT 'vazia', prefill_meta JSON,
       prefilled_at DATETIME, reviewed_at DATETIME, last_user_activity_at DATETIME, suficiencia TEXT, confirmada_por TEXT, modo TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const s of ddl) await dbRun(s);
  // O roster do Exclusive: clube da equipe, produto 'exclusive'
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-x', 'Clube X', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('ana@roster.com', 'clube-x', 'Ana')`);
  // Conta sem cohort nenhum: serve para conferir a recusa do cohortGuard
  await dbRun(`INSERT INTO users (id, email, name) VALUES ('userSemCohort', 'sem@fora.com', 'Sem Clube')`);

  const deps = {
    db,
    ...helpers,
    authMiddleware,
    adminMiddleware,
    uuidv4: () => `id-${++seq}`,
    generateId: () => `${++seq}`,
    // O token de teste é o payload em JSON: o teste lê as claims direto
    jwt: { sign: (payload) => JSON.stringify(payload) },
    axios: axiosFake,
    JWT_SECRET: 'segredo',
    HUBSPOT_TOKEN: 'token-de-teste',
    HUBSPOT_WIN_STAGE: 'closedwon',
    ADMIN_EMAIL: 'admin@x.com',
    ADMIN_PASSWORD_HASH: '',
    logToFile: () => {},
    safeJsonParse,
    fs: require('fs'),
    path: require('path'),
  };
  const app = express();
  app.use(express.json());
  app.use(createAuthRoutes(deps));
  app.use(createScriptRoutes(deps));
  app.use(createDiagnosticRoutes(deps));
  app.use(createAdminCohortRoutes(deps));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('roster do Exclusive: nada mudou', () => {
  it('entra pelo cohort_members, recebe cohort "exclusive" e não ganha clube nenhum', async () => {
    const antes = await contarClubes();
    const r = await entrar('ana@roster.com');
    expect(r.status).toBe(200);
    expect(r.data.user.cohort).toBe('exclusive');
    expect(r.data.user.clubSlug).toBe('clube-x');
    expect(JSON.parse(r.data.token).cohort).toBe('exclusive');
    expect(JSON.parse(r.data.token).clubSlug).toBe('clube-x');

    const u = await usuario('ana@roster.com');
    expect(u.cohort).toBe('exclusive');
    expect(u.club_slug).toBe('clube-x');
    expect(await contarClubes()).toBe(antes);
  });
});

describe('clube próprio de quem vem pelo HubSpot', () => {
  const EMAIL = 'nova@fora.com';
  const SLUG = slugEsperado(EMAIL);

  it('o primeiro login cria o clube com produto "club" e marca a conta', async () => {
    const r = await entrar(EMAIL);
    expect(r.status).toBe(200);
    expect(r.data.user.cohort).toBe('club');
    expect(r.data.user.clubSlug).toBe(SLUG);
    expect(JSON.parse(r.data.token).cohort).toBe('club');

    const c = await clube(SLUG);
    expect(c).toBeTruthy();
    expect(c.produto).toBe('club');
    expect(c.ativo).toBe(1);
    expect(c.nome).toBe('Nome De Teste');

    const m = await dbGet(`SELECT * FROM cohort_members WHERE email = ?`, [EMAIL]);
    expect(m.club_slug).toBe(SLUG);

    const u = await usuario(EMAIL);
    expect(u.cohort).toBe('club');
    expect(u.club_slug).toBe(SLUG);
  });

  it('o segundo login reaproveita o mesmo clube, sem criar outro', async () => {
    const antes = await contarClubes();
    const r = await entrar(EMAIL);
    expect(r.status).toBe(200);
    expect(r.data.user.clubSlug).toBe(SLUG);
    expect(await contarClubes()).toBe(antes);
    expect((await dbAll(`SELECT slug FROM cohort_clubs WHERE produto = 'club'`)).map((x) => x.slug)).toEqual([SLUG]);
  });

  it('o cohortGuard abre a área para o produto "club" e a ficha é a do clube dela', async () => {
    const u = await usuario(EMAIL);
    const r = await api('GET', '/api/script/ficha', { 'x-user': u.id });
    expect(r.status).toBe(200);
    expect(r.data.enabled).toBe(true);
    expect(r.data.data.club.slug).toBe(SLUG);
    expect(r.data.data.club.nome).toBe('Nome De Teste');
  });

  it('GET /api/diagnostic devolve cohort "club" com o clube e o produto', async () => {
    const u = await usuario(EMAIL);
    const r = await api('GET', '/api/diagnostic', { 'x-user': u.id });
    expect(r.status).toBe(200);
    expect(r.data.data.cohort).toBe('club');
    expect(r.data.data.club_slug).toBe(SLUG);
    expect(r.data.data.club_nome).toBe('Nome De Teste');
    expect(r.data.data.club_produto).toBe('club');
  });
});

describe('quem não passa continua de fora', () => {
  it('contato no HubSpot sem negócio ganho: 403 e nenhum clube criado', async () => {
    const antes = await contarClubes();
    const r = await entrar('semdeal@fora.com');
    expect(r.status).toBe(403);
    expect(r.data.success).toBe(false);
    expect(await contarClubes()).toBe(antes);
    expect(await dbGet(`SELECT * FROM cohort_members WHERE email = ?`, ['semdeal@fora.com'])).toBeUndefined();
  });

  it('e-mail que não existe no HubSpot: 404', async () => {
    const r = await entrar('ninguem@fora.com');
    expect(r.status).toBe(404);
  });

  it('conta sem cohort: o cohortGuard recusa com a mensagem do Prosperus', async () => {
    const r = await api('GET', '/api/script/ficha', { 'x-user': 'userSemCohort' });
    expect(r.status).toBe(403);
    expect(r.data.enabled).toBe(false);
    expect(r.data.message).toBe('Área disponível para membros do Prosperus.');
  });
});

describe('clube desativado não vira clube novo', () => {
  it('quem tem clube próprio desligado entra sem cohort e não ganha um segundo clube', async () => {
    const EMAIL = 'nova@fora.com';
    const SLUG = slugEsperado(EMAIL);
    await dbRun(`UPDATE cohort_clubs SET ativo = 0 WHERE slug = ?`, [SLUG]);
    const antes = await contarClubes();

    const r = await entrar(EMAIL);
    expect(r.status).toBe(200);
    // Clube desligado entra sem cohort, como sempre foi para o roster. O que não pode acontecer é
    // o login abrir um SEGUNDO clube e separar a pessoa da ficha dela.
    expect(r.data.user.cohort).toBeNull();
    expect(await contarClubes()).toBe(antes);
    expect(await dbGet(`SELECT club_slug FROM cohort_members WHERE email = ?`, [EMAIL])).toEqual({ club_slug: SLUG });

    // A linha da conta continua apontando para o clube: religar o clube devolve o acesso
    const u = await usuario(EMAIL);
    expect(u.club_slug).toBe(SLUG);
    const d = await api('GET', '/api/diagnostic', { 'x-user': u.id });
    expect(d.data.data.cohort).toBeNull();
    expect(d.data.data.club_slug).toBeNull();

    await dbRun(`UPDATE cohort_clubs SET ativo = 1 WHERE slug = ?`, [SLUG]);
  });
});

describe('o admin lê os dois produtos sem confundir um com o outro', () => {
  it('a lista de clubes marca cada clube com o produto dele', async () => {
    const r = await api('GET', '/api/admin/cohort', { 'x-user': 'admin' });
    expect(r.status).toBe(200);
    const porSlug = Object.fromEntries(r.data.data.map((c) => [c.club_slug, c.produto]));
    expect(porSlug['clube-x']).toBe('exclusive');
    expect(porSlug[slugEsperado('nova@fora.com')]).toBe('club');
  });

  it('o detalhe do clube traz o produto', async () => {
    const r = await api('GET', `/api/admin/clubs/${slugEsperado('nova@fora.com')}/script-ficha`, { 'x-user': 'admin' });
    expect(r.status).toBe(200);
    expect(r.data.data.club.produto).toBe('club');
  });

  it('desligar e religar um clube próprio devolve cohort "club", nunca "exclusive"', async () => {
    const EMAIL = 'nova@fora.com';
    const SLUG = slugEsperado(EMAIL);
    await api('PUT', `/api/admin/clubs/${SLUG}/members`, { 'x-user': 'admin' }, { ativo: 0 });
    expect((await usuario(EMAIL)).cohort).toBeNull();

    await api('PUT', `/api/admin/clubs/${SLUG}/members`, { 'x-user': 'admin' }, { ativo: 1 });
    const u = await usuario(EMAIL);
    expect(u.cohort).toBe('club');
    expect(u.club_slug).toBe(SLUG);
  });

  it('o clube do roster continua devolvendo "exclusive" no mesmo caminho', async () => {
    await api('PUT', '/api/admin/clubs/clube-x/members', { 'x-user': 'admin' }, { ativo: 0 });
    await api('PUT', '/api/admin/clubs/clube-x/members', { 'x-user': 'admin' }, { ativo: 1 });
    expect((await usuario('ana@roster.com')).cohort).toBe('exclusive');
  });
});
