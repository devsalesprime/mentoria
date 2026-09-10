// @ts-nocheck
/** @vitest-environment node */
/**
 * Heranca das tarefas entre versoes do script (utils/script-tarefas.cjs + utils/script-versions.cjs +
 * routes/script.cjs e routes/jobs.cjs, sqlite :memory:).
 *
 * A versao nova nascia com tudo desmarcado e quem pedia uma revisao recomecava o treino do zero. Agora:
 * - publicar a v3 como revisao da v2 (PUT /api/jobs/:id/script) leva as 5 marcacoes da v2 de cada pessoa
 * - "Escrever do zero" (job `script`) herda da ultima versao que existia
 * - so passa tarefa que ainda existe no catalogo; a linha orfa (treinamento tirado de
 *   data/treinamentos-por-passo.json) fica no banco, some da leitura do membro e o admin ve marcada
 * - cada socio herda o que ELE marcou; ninguem herda o do outro
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import createScriptRoutes from '../../routes/script.cjs';
import createJobsRoutes from '../../routes/jobs.cjs';
import SV from '../../utils/script-versions.cjs';
import ST from '../../utils/script-tarefas.cjs';

const TOKEN = 'token-heranca';
const MD = '# Script · Os 7 Passos\n\n## Passo 1 · Conexão\n\n**Objetivo estratégico:** abrir.\n';
/** As tarefas do Passo 1 hoje: assistir aos 2 recomendados + treinar, aplicar, marcar. */
const P1 = ST.tarefasDoPasso(1);
const ORFA = 'assistir-corporate.treinamento-que-saiu-do-catalogo';

let server; let base; let tmpDir; let dbRun; let dbGet; let dbAll; let uuidv4;

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

/** Cria um job direto na fila (o mesmo que o app enfileira quando alguem pede a versao nova). */
async function criarJob(tipo, payload) {
  const id = `job-${Math.random().toString(36).slice(2)}`;
  await dbRun(
    `INSERT INTO cohort_jobs (id, tipo, club_slug, email, status, payload) VALUES (?, ?, 'clube-h', 'ana@x.com', 'running', ?)`,
    [id, tipo, JSON.stringify(payload)]
  );
  return id;
}

const ids = (lista) => lista.map((t) => t.tarefa_id).sort();

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarefas-heranca-'));
  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbRun = helpers.dbRun; dbGet = helpers.dbGet; dbAll = helpers.dbAll;
  uuidv4 = () => `id-${Math.random().toString(36).slice(2)}`;
  const ddl = [
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'member', cohort TEXT, club_slug TEXT,
       last_login_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL,
       file_type TEXT, file_size INTEGER, url TEXT, module TEXT DEFAULT 'general', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_clubs (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, produto TEXT NOT NULL DEFAULT 'exclusive', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_members (email TEXT PRIMARY KEY, club_slug TEXT NOT NULL, nome TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', materials JSON NOT NULL DEFAULT '{}',
       materials_status TEXT NOT NULL DEFAULT 'pending', materials_submitted_at DATETIME, ficha_status TEXT NOT NULL DEFAULT 'vazia', prefill_meta JSON,
       prefilled_at DATETIME, reviewed_at DATETIME, last_user_activity_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const s of ddl) await dbRun(s);
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-h', 'Clube Herança', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('ana@x.com', 'clube-h', 'Ana'), ('gu@x.com', 'clube-h', 'Gustavo')`);
  await dbRun(`INSERT INTO users (id, email, name, cohort, club_slug) VALUES
    ('userAna', 'ana@x.com', 'Ana', 'exclusive', 'clube-h'),
    ('userGu', 'gu@x.com', 'Gustavo', 'exclusive', 'clube-h'),
    ('admin', 'admin@x.com', 'Admin', 'exclusive', 'clube-h')`);

  const deps = { db, ...helpers, authMiddleware, adminMiddleware, uuidv4, fs, path, safeJsonParse, DATA_DIR: tmpDir };
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(createScriptRoutes(deps));
  app.use(createJobsRoutes({ ...deps, COHORT_JOBS_TOKEN: TOKEN }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  await new Promise((r) => setTimeout(r, 60));

  // v1 e v2 do clube
  await SV.insertVersion({ dbGet, dbRun, uuidv4 }, { club_slug: 'clube-h', content_md: MD, resumo: 'v1' });
  await SV.insertVersion({ dbGet, dbRun, uuidv4 }, { club_slug: 'clube-h', content_md: MD, resumo: 'v2' });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('o catalogo manda em quais tarefas existem', () => {
  it('cada passo tem as tres fixas mais uma por treinamento recomendado', () => {
    expect(ST.tarefasDoPasso(1)).toEqual([
      'assistir-imersao.2026-06.dani-martins-mentalidade-ceo',
      'assistir-corporate.perfil-comportamental-do-cliente-com-pamela-ferrari',
      ...ST.TAREFAS_FIXAS,
    ]);
    expect(ST.tarefasDoPasso(1)).toHaveLength(5);
    // depois de 08/09 o Passo 6 tem dois recomendados (follow up + fechamento): 5 tarefas
    expect(ST.tarefasDoPasso(6)).toHaveLength(5);
    // Passos 2, 4, 5 e 7 tem um recomendado so: 4 tarefas
    expect(ST.tarefasDoPasso(5)).toHaveLength(4);
    expect(ST.tarefasDoPasso(7)).toHaveLength(4);
    expect(ST.ehDoCatalogo(1, ST.TAREFAS_FIXAS[0])).toBe(true);
    expect(ST.ehDoCatalogo(1, ORFA)).toBe(false);
    // tarefa de um passo nao vale no outro
    expect(ST.ehDoCatalogo(2, 'assistir-imersao.2026-06.dani-martins-mentalidade-ceo')).toBe(false);
  });
});

describe('publicar a versao nova leva as marcacoes da base', () => {
  it('a Ana marca as 5 tarefas do Passo 1 na v2 e uma linha orfa entra no banco', async () => {
    for (const t of P1) {
      const r = await api('PUT', `/api/script/versoes/2/tarefas/1/${t}`, 'userAna', { concluida: true });
      expect(r.status).toBe(200);
    }
    // o Gustavo marcou uma so
    await api('PUT', '/api/script/versoes/2/tarefas/1/treinar-falas', 'userGu', { concluida: true });
    // linha de um treinamento que saiu do catalogo (o app gravou quando ele ainda existia)
    await ST.setTarefa({ dbGet, dbRun, uuidv4 }, {
      club_slug: 'clube-h', versao: 2, email: 'ana@x.com', passo: 1, tarefa_id: ORFA, concluida: true,
    });

    const r = await api('GET', '/api/script/versoes/2/tarefas', 'userAna');
    expect(r.data.tarefas).toHaveLength(5);
    expect(ids(r.data.tarefas)).toEqual([...P1].sort());
  });

  it('a v3 publicada como revisao da v2 nasce com as 5 marcacoes da Ana, com a data original', async () => {
    const v2 = await api('GET', '/api/script/versoes/2/tarefas', 'userAna');
    const jobId = await criarJob('revisar', { versao: 2 });
    const put = await worker('PUT', `/api/jobs/${jobId}/script`, { content_md: MD, resumo: 'v3, com os grifos' });
    expect(put.status).toBe(200);
    expect(put.data.versao).toBe(3);

    const r = await api('GET', '/api/script/versoes/3/tarefas', 'userAna');
    expect(r.status).toBe(200);
    expect(r.data.tarefas).toHaveLength(5);
    expect(ids(r.data.tarefas)).toEqual([...P1].sort());
    for (const t of r.data.tarefas) expect(t.concluida).toBe(true);
    // a data e a da primeira marcacao, nao a da publicacao
    const porId = Object.fromEntries(v2.data.tarefas.map((t) => [t.tarefa_id, t.concluida_em]));
    for (const t of r.data.tarefas) expect(t.concluida_em).toBe(porId[t.tarefa_id]);
  });

  it('a linha orfa nao passa para a versao nova', async () => {
    const linha = await dbGet(
      `SELECT * FROM script_tarefas WHERE club_slug = 'clube-h' AND versao = 3 AND tarefa_id = ?`, [ORFA]
    );
    expect(linha).toBeUndefined();
  });

  it('cada socio herda o que ele mesmo marcou', async () => {
    const r = await api('GET', '/api/script/versoes/3/tarefas', 'userGu');
    expect(ids(r.data.tarefas)).toEqual(['treinar-falas']);
  });

  it('"Escrever do zero" (job `script`) herda da ultima versao que existia', async () => {
    const jobId = await criarJob('script', { motivo: 'gerar-script' });
    const put = await worker('PUT', `/api/jobs/${jobId}/script`, { content_md: MD, resumo: 'v4, do zero' });
    expect(put.data.versao).toBe(4);
    const r = await api('GET', '/api/script/versoes/4/tarefas', 'userAna');
    expect(r.data.tarefas).toHaveLength(5);
  });

  it('publicar de novo nao apaga o que a pessoa ja marcou na versao nova', async () => {
    await api('PUT', '/api/script/versoes/4/tarefas/2/treinar-falas', 'userGu', { concluida: true });
    await ST.copiarTarefas({ dbRun }, { club_slug: 'clube-h', de: 3, para: 4 });
    const r = await api('GET', '/api/script/versoes/4/tarefas', 'userGu');
    expect(ids(r.data.tarefas)).toEqual(['treinar-falas', 'treinar-falas']);
    const passos = r.data.tarefas.map((t) => t.passo).sort();
    expect(passos).toEqual([1, 2]);
  });
});

describe('a tarefa orfa some da leitura do membro e continua no historico', () => {
  it('o membro nao ve a orfa nem na versao em que ela foi marcada', async () => {
    const r = await api('GET', '/api/script/versoes/2/tarefas', 'userAna');
    expect(ids(r.data.tarefas)).not.toContain(ORFA);
    expect(r.data.tarefas.every((t) => t.orfa === undefined)).toBe(true);
  });

  it('a linha continua no banco e o admin ve, marcada como orfa', async () => {
    const linha = await dbGet(
      `SELECT * FROM script_tarefas WHERE club_slug = 'clube-h' AND versao = 2 AND tarefa_id = ?`, [ORFA]
    );
    expect(linha.concluida).toBe(1);
    const r = await api('GET', '/api/admin/clubs/clube-h/script-versoes/2/tarefas', 'admin');
    expect(r.status).toBe(200);
    const orfa = r.data.tarefas.find((t) => t.tarefa_id === ORFA);
    expect(orfa).toMatchObject({ email: 'ana@x.com', concluida: true, orfa: true });
    expect(r.data.tarefas.filter((t) => t.tarefa_id === 'treinar-falas').every((t) => t.orfa === false)).toBe(true);
  });
});
