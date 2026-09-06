// @ts-nocheck
/** @vitest-environment node */
/**
 * Tarefas dos movimentos do script (tabela script_tarefas), com o router real em sqlite :memory:
 * - GET devolve só o que ESTA pessoa marcou nesta versão (sócio do mesmo clube não herda nem contamina)
 * - PUT marca e desmarca; idempotente (repetir o mesmo PUT preserva `concluida_em` e não duplica linha)
 * - validações: passo fora de 1..7, tarefa com caractere estranho, corpo sem `concluida`, versão inexistente
 * - isolamento: quem é de outro clube não enxerga nem grava as tarefas do clube-x
 * - admin lê as tarefas do clube (com e-mail); membro de outro clube que tenta pela rota do admin recebe 403
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import createScriptRoutes from '../../routes/script.cjs';
import SV from '../../utils/script-versions.cjs';
import ST from '../../utils/script-tarefas.cjs';

let server; let base; let tmpDir; let dbRun; let dbGet; let dbAll;

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

const MD_V1 = '# Script · Os 7 Passos · Clube X\n\n## Passo 1 · Conexão\n\n**Objetivo estratégico:** abrir.\n';
const ASSISTIR = 'assistir-corporate.perfil-do-cliente-com-thiago-chiovatto';

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-tarefas-'));
  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbRun = helpers.dbRun; dbGet = helpers.dbGet; dbAll = helpers.dbAll;
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
    ('userA', 'a@x.com', 'Ana Souza', 'exclusive', 'clube-x'), ('userB', 'b@x.com', 'Beto', 'exclusive', 'clube-x'),
    ('userZ', 'z@z.com', 'Zeca', 'exclusive', 'clube-z'), ('admin', 'admin@x.com', 'Admin', 'exclusive', 'clube-x')`);

  const deps = { db, ...helpers, authMiddleware, adminMiddleware, uuidv4: () => `id-${Math.random().toString(36).slice(2)}`, fs, path, safeJsonParse, DATA_DIR: tmpDir };
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(createScriptRoutes(deps));
  await SV.ensureScriptVersionsTables(dbRun);
  await ST.ensureScriptTarefasTable(dbRun);
  await SV.insertVersion({ dbGet, dbRun, uuidv4: deps.uuidv4 }, { club_slug: 'clube-x', content_md: MD_V1, resumo: 'primeira' });
  await SV.insertVersion({ dbGet, dbRun, uuidv4: deps.uuidv4 }, { club_slug: 'clube-z', content_md: MD_V1, resumo: 'do Z' });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('utils/script-tarefas: DDL idempotente e leitura dos parâmetros', () => {
  it('rodar o DDL de novo não quebra nada', async () => {
    await ST.ensureScriptTarefasTable(dbRun);
    await ST.ensureScriptTarefasTable(dbRun);
    const t = await dbGet(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'script_tarefas'`);
    expect(t.name).toBe('script_tarefas');
  });

  it('passo só de 1 a 7; id de tarefa em minúsculas, com ponto, hífen e sublinhado', () => {
    expect(ST.parsePasso('1')).toBe(1);
    expect(ST.parsePasso('7')).toBe(7);
    expect(ST.parsePasso('0')).toBeNull();
    expect(ST.parsePasso('8')).toBeNull();
    expect(ST.parsePasso('abc')).toBeNull();
    expect(ST.parseTarefaId('treinar-falas')).toBe('treinar-falas');
    expect(ST.parseTarefaId('ASSISTIR-Corporate.Fechamento')).toBe('assistir-corporate.fechamento');
    expect(ST.parseTarefaId('tarefa com espaço')).toBeNull();
    expect(ST.parseTarefaId('-comeca-com-hifen')).toBeNull();
    expect(ST.parseTarefaId('a'.repeat(81))).toBeNull();
    expect(ST.parseTarefaId('')).toBeNull();
  });
});

describe('GET e PUT das tarefas (membro)', () => {
  it('a versão nasce sem nenhuma tarefa marcada', async () => {
    const r = await api('GET', '/api/script/versoes/1/tarefas', 'userA');
    expect(r.status).toBe(200);
    expect(r.data.versao).toBe(1);
    expect(r.data.tarefas).toEqual([]);
  });

  it('marcar grava com data; o GET devolve concluída', async () => {
    const put = await api('PUT', `/api/script/versoes/1/tarefas/1/${ASSISTIR}`, 'userA', { concluida: true });
    expect(put.status).toBe(200);
    expect(put.data.tarefa).toMatchObject({ passo: 1, tarefa_id: ASSISTIR, concluida: true });
    expect(put.data.tarefa.concluida_em).toBeTruthy();

    await api('PUT', '/api/script/versoes/1/tarefas/2/treinar-falas', 'userA', { concluida: true });
    const r = await api('GET', '/api/script/versoes/1/tarefas', 'userA');
    expect(r.data.tarefas.map((t) => [t.passo, t.tarefa_id, t.concluida])).toEqual([
      [1, ASSISTIR, true],
      [2, 'treinar-falas', true],
    ]);
  });

  it('PUT é idempotente: repetir mantém a mesma linha e a data da primeira marcação', async () => {
    const antes = await api('GET', '/api/script/versoes/1/tarefas', 'userA');
    const marcada = antes.data.tarefas.find((t) => t.tarefa_id === ASSISTIR);
    const de1 = await api('PUT', `/api/script/versoes/1/tarefas/1/${ASSISTIR}`, 'userA', { concluida: true });
    const de2 = await api('PUT', `/api/script/versoes/1/tarefas/1/${ASSISTIR}`, 'userA', { concluida: true });
    expect(de1.data.tarefa.concluida).toBe(true);
    expect(de2.data.tarefa.concluida).toBe(true);
    expect(de2.data.tarefa.concluida_em).toBe(marcada.concluida_em);
    const linhas = await dbAll(
      `SELECT * FROM script_tarefas WHERE club_slug = 'clube-x' AND versao = 1 AND email = 'a@x.com' AND passo = 1 AND tarefa_id = ?`,
      [ASSISTIR]
    );
    expect(linhas).toHaveLength(1);
    const depois = await api('GET', '/api/script/versoes/1/tarefas', 'userA');
    expect(depois.data.tarefas).toHaveLength(2);
  });

  it('desmarcar limpa a data e o GET reflete', async () => {
    const off = await api('PUT', '/api/script/versoes/1/tarefas/2/treinar-falas', 'userA', { concluida: false });
    expect(off.data.tarefa).toMatchObject({ passo: 2, tarefa_id: 'treinar-falas', concluida: false, concluida_em: null });
    const r = await api('GET', '/api/script/versoes/1/tarefas', 'userA');
    expect(r.data.tarefas.find((t) => t.tarefa_id === 'treinar-falas').concluida).toBe(false);
    // marcar de novo carimba data nova
    const on = await api('PUT', '/api/script/versoes/1/tarefas/2/treinar-falas', 'userA', { concluida: true });
    expect(on.data.tarefa.concluida_em).toBeTruthy();
  });

  it('é por pessoa: o sócio do mesmo clube tem a lista dele', async () => {
    const antes = await api('GET', '/api/script/versoes/1/tarefas', 'userB');
    expect(antes.data.tarefas).toEqual([]);
    await api('PUT', '/api/script/versoes/1/tarefas/5/aplicar-reuniao', 'userB', { concluida: true });
    const doB = await api('GET', '/api/script/versoes/1/tarefas', 'userB');
    expect(doB.data.tarefas.map((t) => t.tarefa_id)).toEqual(['aplicar-reuniao']);
    const doA = await api('GET', '/api/script/versoes/1/tarefas', 'userA');
    expect(doA.data.tarefas.map((t) => t.tarefa_id)).not.toContain('aplicar-reuniao');
  });

  it('validações: passo fora de 1..7, tarefa inválida, corpo errado, versão inexistente, sem login', async () => {
    expect((await api('PUT', '/api/script/versoes/1/tarefas/0/treinar-falas', 'userA', { concluida: true })).status).toBe(400);
    expect((await api('PUT', '/api/script/versoes/1/tarefas/8/treinar-falas', 'userA', { concluida: true })).status).toBe(400);
    expect((await api('PUT', '/api/script/versoes/1/tarefas/2/tarefa%20com%20espaco', 'userA', { concluida: true })).status).toBe(400);
    expect((await api('PUT', '/api/script/versoes/1/tarefas/2/treinar-falas', 'userA', {})).status).toBe(400);
    expect((await api('PUT', '/api/script/versoes/1/tarefas/2/treinar-falas', 'userA', { concluida: 'sim' })).status).toBe(400);
    expect((await api('PUT', '/api/script/versoes/9/tarefas/2/treinar-falas', 'userA', { concluida: true })).status).toBe(404);
    expect((await api('GET', '/api/script/versoes/9/tarefas', 'userA')).status).toBe(404);
    expect((await api('GET', '/api/script/versoes/abc/tarefas', 'userA')).status).toBe(400);
    expect((await api('GET', '/api/script/versoes/1/tarefas', null)).status).toBe(401);
  });

  it('outro clube não enxerga nem grava no clube-x: a v1 dele é a dele', async () => {
    await api('PUT', '/api/script/versoes/1/tarefas/3/treinar-falas', 'userZ', { concluida: true });
    const doZ = await api('GET', '/api/script/versoes/1/tarefas', 'userZ');
    expect(doZ.data.tarefas.map((t) => [t.passo, t.tarefa_id])).toEqual([[3, 'treinar-falas']]);
    const noBanco = await dbAll(`SELECT club_slug, email FROM script_tarefas WHERE passo = 3 AND tarefa_id = 'treinar-falas'`);
    expect(noBanco).toEqual([{ club_slug: 'clube-z', email: 'z@z.com' }]);
    const doA = await api('GET', '/api/script/versoes/1/tarefas', 'userA');
    expect(doA.data.tarefas.some((t) => t.passo === 3)).toBe(false);
  });
});

describe('admin (só leitura)', () => {
  it('o admin vê as tarefas do clube com o e-mail de quem marcou', async () => {
    const r = await api('GET', '/api/admin/clubs/clube-x/script-versoes/1/tarefas', 'admin');
    expect(r.status).toBe(200);
    expect(r.data.club_slug).toBe('clube-x');
    expect(r.data.versao).toBe(1);
    const emails = [...new Set(r.data.tarefas.map((t) => t.email))].sort();
    expect(emails).toEqual(['a@x.com', 'b@x.com']);
    expect(r.data.tarefas.every((t) => t.passo >= 1 && t.passo <= 7)).toBe(true);
    // nada do clube-z vaza para cá
    expect(r.data.tarefas.some((t) => t.email === 'z@z.com')).toBe(false);
  });

  it('membro de outro clube que tenta ler o clube-x pela rota do admin recebe 403', async () => {
    expect((await api('GET', '/api/admin/clubs/clube-x/script-versoes/1/tarefas', 'userZ')).status).toBe(403);
    expect((await api('GET', '/api/admin/clubs/clube-x/script-versoes/1/tarefas', 'userA')).status).toBe(403);
    expect((await api('GET', '/api/admin/clubs/clube-x/script-versoes/1/tarefas', null)).status).toBe(401);
  });
});
