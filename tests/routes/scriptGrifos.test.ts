// @ts-nocheck
/** @vitest-environment node */
/**
 * Grifos do leitor "Seu script", com os routers reais em sqlite :memory: (script + jobs):
 * - CRUD: validacoes (trecho 20..600, cor, tela 0..9), lista da versao com autor, PATCH/DELETE so do autor, outro clube 404
 * - "Pedir nova versao com os grifos": POST revisar com `comentarios` (convertidos pelo front) -> payload com os 3 formatos
 *   ([GRIFO manter] «trecho», [GRIFO tirar] «trecho» → nota, [GRIFO ajustar] «trecho» → nota), passo 0/1..7/9 no payload e
 *   0..7 no banco (9 vira 0), autor = quem pediu, sem duplicar ao pedir de novo
 * - publicar a versao nova (PUT /api/jobs/:id/script do job revisar) marca resolvido_em nos grifos da versao base
 * - sem `comentarios` no body, o servidor converte os grifos pendentes sozinho
 * - admin le os grifos do clube; membro nao
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
import SG from '../../utils/script-grifos.cjs';

const TOKEN = 'token-fila';
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
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}
async function worker(method, url, body, token = TOKEN) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

const MD_V1 = '# Script · Os 7 Passos · Clube X\n\n# Documento 1 · Script completo para treinamento\n\n## Passo 1 · Conexão\n\n**Objetivo estratégico:** abrir.\n\n**Fala sugerida:**\n\n1. "Prazer, eu sou o Rafael, do time da Paloma. Se eu concluir que não é para você, eu mesmo digo."\n\n## Passo 2 · Investigação\n\n**Objetivo estratégico:** ouvir.\n';

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-grifos-'));
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
    ('userA', 'a@x.com', 'Ana Souza', 'exclusive', 'clube-x'), ('userB', 'b@x.com', 'Beto', 'exclusive', 'clube-x'), ('userZ', 'z@z.com', 'Zeca', 'exclusive', 'clube-z')`);

  const deps = { db, ...helpers, authMiddleware, adminMiddleware, uuidv4: () => `id-${Math.random().toString(36).slice(2)}`, fs, path, safeJsonParse, DATA_DIR: tmpDir };
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(createScriptRoutes(deps));
  app.use(createJobsRoutes({ ...deps, COHORT_JOBS_TOKEN: TOKEN, APP_URL: 'https://app.teste.local/' }));
  await SV.ensureScriptVersionsTables(dbRun);
  await SG.ensureScriptGrifosTable(dbRun);
  await SV.insertVersion({ dbGet, dbRun, uuidv4: deps.uuidv4 }, { club_slug: 'clube-x', content_md: MD_V1, resumo: 'primeira' });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('utils/script-grifos: conversao grifo -> comentario', () => {
  it('3 formatos, passo da tela (0 cartao/sumario, 1..7, 9 preparacao), 9 vira 0 no banco, resumo', () => {
    expect(SG.grifoParaComentario({ cor: 'verde', texto: ' Prazer, eu sou o Rafael ', nota: '', passo: 0 })).toEqual({ passo: 0, texto: '[GRIFO manter] «Prazer, eu sou o Rafael»' });
    expect(SG.grifoParaComentario({ cor: 'vermelho', texto: 'Se eu concluir que não é para você', nota: 'soa arrogante', passo: 2 })).toEqual({ passo: 1, texto: '[GRIFO tirar] «Se eu concluir que não é para você» → soa arrogante' });
    expect(SG.grifoParaComentario({ cor: 'dourado', texto: 'do time da Paloma', nota: 'dizer o nome dele antes', passo: 8 })).toEqual({ passo: 7, texto: '[GRIFO ajustar] «do time da Paloma» → dizer o nome dele antes' });
    expect(SG.grifoParaComentario({ cor: 'verde', texto: 'x', nota: '', passo: 1 }).passo).toBe(0);
    expect(SG.grifoParaComentario({ cor: 'verde', texto: 'x', nota: '', passo: 9 }).passo).toBe(9);
    expect(SG.passoNoBanco(9)).toBe(0);
    expect(SG.passoNoBanco(7)).toBe(7);
    expect(SG.comentarioEhGrifo('[GRIFO manter] «a»')).toBe(true);
    expect(SG.comentarioEhGrifo('Gostei do todo')).toBe(false);
    expect(SG.resumoGrifos([{ cor: 'verde' }, { cor: 'dourado' }, { cor: 'dourado' }, { cor: 'vermelho' }])).toEqual({ total: 4, ajustar: 2, manter: 1, tirar: 1 });
  });
});

const TRECHO_A = 'Prazer, eu sou o Rafael, do time da Paloma.';
const TRECHO_B = 'Se eu concluir que não é para você, eu mesmo digo.';
const TRECHO_C = 'Contexto, desejo, dor, consequência, soluções tentadas.';
let grifoA; let grifoB; let grifoC; let grifoBeto;

describe('grifos: criar, listar, editar e apagar', () => {
  it('validacoes: trecho curto, trecho longo, cor invalida, tela fora de 0..9, versao inexistente', async () => {
    const base = { passo: 2, documento: 'treinamento', texto: TRECHO_A, prefixo: 'Fala 1', sufixo: 'Diga o nome', cor: 'dourado', nota: 'x' };
    expect((await api('POST', '/api/script/versoes/1/grifos', 'userA', { ...base, texto: 'curto demais' })).status).toBe(400);
    expect((await api('POST', '/api/script/versoes/1/grifos', 'userA', { ...base, texto: 'curto demais' })).data.errors.join(' ')).toMatch(/pelo menos 20/);
    expect((await api('POST', '/api/script/versoes/1/grifos', 'userA', { ...base, texto: 'x'.repeat(601) })).status).toBe(400);
    expect((await api('POST', '/api/script/versoes/1/grifos', 'userA', { ...base, cor: 'azul' })).status).toBe(400);
    expect((await api('POST', '/api/script/versoes/1/grifos', 'userA', { ...base, passo: 10 })).status).toBe(400);
    expect((await api('POST', '/api/script/versoes/1/grifos', 'userA', { ...base, nota: 'n'.repeat(301) })).status).toBe(400);
    expect((await api('POST', '/api/script/versoes/9/grifos', 'userA', base)).status).toBe(404);
    expect((await api('POST', '/api/script/versoes/1/grifos', 'userZ', base)).status).toBe(404); // outro clube
    expect((await api('POST', '/api/script/versoes/1/grifos', null, base)).status).toBe(401);
  });

  it('cria 3 grifos de Ana (uma cor cada, telas 2, 0 e 9) e 1 de Beto; a lista traz autor e prefixo/sufixo cortados em 40', async () => {
    const a = await api('POST', '/api/script/versoes/1/grifos', 'userA', { passo: 2, documento: 'treinamento', texto: TRECHO_A, prefixo: 'p'.repeat(60), sufixo: 's'.repeat(60), cor: 'dourado', nota: 'dizer o nome dele antes' });
    expect(a.status).toBe(200);
    expect(a.data.grifo).toMatchObject({ versao: 1, passo: 2, documento: 'treinamento', texto: TRECHO_A, cor: 'dourado', nota: 'dizer o nome dele antes', autor_email: 'a@x.com', autor_nome: 'Ana Souza', resolvido_em: null });
    expect(a.data.grifo.prefixo).toHaveLength(40);
    expect(a.data.grifo.sufixo).toHaveLength(40);
    grifoA = a.data.grifo;
    grifoB = (await api('POST', '/api/script/versoes/1/grifos', 'userA', { passo: 0, documento: 'campo', texto: TRECHO_B, cor: 'verde' })).data.grifo;
    expect(grifoB).toMatchObject({ passo: 0, documento: 'campo', cor: 'verde', nota: '' });
    grifoC = (await api('POST', '/api/script/versoes/1/grifos', 'userA', { passo: 9, texto: TRECHO_C, cor: 'vermelho', nota: 'não cabe no mapa' })).data.grifo;
    expect(grifoC).toMatchObject({ passo: 9, documento: 'treinamento', cor: 'vermelho' });
    grifoBeto = (await api('POST', '/api/script/versoes/1/grifos', 'userB', { passo: 3, documento: 'campo', texto: 'Uma pergunta por vez; desejo antes da dor.', cor: 'verde' })).data.grifo;
    expect(grifoBeto.autor_nome).toBe('Beto');

    const lista = await api('GET', '/api/script/versoes/1/grifos', 'userB');
    expect(lista.status).toBe(200);
    expect(lista.data.grifos).toHaveLength(4);
    expect(lista.data.grifos.map((g) => g.passo)).toEqual([0, 2, 3, 9]);
    expect((await api('GET', '/api/script/versoes/1/grifos', 'userZ')).status).toBe(404);
    expect((await api('GET', '/api/script/versoes/abc/grifos', 'userA')).status).toBe(400);
  });

  it('so o autor edita (nota, cor) e apaga; 404 para id de outro clube', async () => {
    expect((await api('PATCH', `/api/script/grifos/${grifoA.id}`, 'userB', { nota: 'x' })).status).toBe(403);
    expect((await api('PATCH', `/api/script/grifos/${grifoA.id}`, 'userA', {})).status).toBe(400);
    const p = await api('PATCH', `/api/script/grifos/${grifoA.id}`, 'userA', { nota: 'dizer o nome dele antes da empresa', cor: 'dourado' });
    expect(p.status).toBe(200);
    expect(p.data.grifo.nota).toBe('dizer o nome dele antes da empresa');
    grifoA = p.data.grifo;
    expect((await api('PATCH', `/api/script/grifos/${grifoA.id}`, 'userZ', { nota: 'x' })).status).toBe(404);
    expect((await api('DELETE', `/api/script/grifos/${grifoBeto.id}`, 'userA')).status).toBe(403);
    expect((await api('DELETE', `/api/script/grifos/${grifoBeto.id}`, 'userB')).status).toBe(200);
    expect((await api('DELETE', `/api/script/grifos/${grifoBeto.id}`, 'userB')).status).toBe(404);
    expect((await api('GET', '/api/script/versoes/1/grifos', 'userA')).data.grifos).toHaveLength(3);
  });
});

describe('pedir nova versao com os grifos -> comentarios da revisao; publicar resolve', () => {
  let jobId;

  it('POST revisar com comentarios convertidos: payload com os 3 formatos e o passo da tela; no banco, passo 9 vira 0 e autor = quem pediu', async () => {
    const comentarios = [grifoA, grifoB, grifoC].map(SG.grifoParaComentario);
    expect(comentarios).toEqual([
      { passo: 1, texto: `[GRIFO ajustar] «${TRECHO_A}» → dizer o nome dele antes da empresa` },
      { passo: 0, texto: `[GRIFO manter] «${TRECHO_B}»` },
      { passo: 9, texto: `[GRIFO tirar] «${TRECHO_C}» → não cabe no mapa` },
    ]);
    expect((await api('POST', '/api/script/versoes/1/revisar', 'userA', { comentarios: [{ passo: 12, texto: 'x' }] })).status).toBe(400);
    const r = await api('POST', '/api/script/versoes/1/revisar', 'userA', { pedido: 'Falas mais curtas', comentarios });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ versao: 1, comentarios: 3, grifos: 3, job: { tipo: 'revisar', status: 'queued', existing: false } });
    jobId = r.data.job.id;
    const raw = await worker('GET', `/api/jobs/${jobId}`);
    const payload = raw.data.job.payload;
    expect(payload.pedido).toBe('Falas mais curtas');
    expect(payload.grifos).toEqual({ total: 3, ajustar: 1, manter: 1, tirar: 1 });
    expect(payload.comentarios.map((c) => [c.passo, c.texto, c.autor])).toEqual([
      [1, `[GRIFO ajustar] «${TRECHO_A}» → dizer o nome dele antes da empresa`, 'Ana Souza'],
      [0, `[GRIFO manter] «${TRECHO_B}»`, 'Ana Souza'],
      [9, `[GRIFO tirar] «${TRECHO_C}» → não cabe no mapa`, 'Ana Souza'],
    ]);
    // gravados como comentarios da versao (o worker tambem os ve em GET :id/script/:versao); 9 vira 0 no banco
    const coms = await api('GET', '/api/script/versoes/1/comentarios', 'userB');
    expect(coms.data.comentarios.map((c) => [c.passo, c.autor_nome])).toEqual([[0, 'Ana Souza'], [0, 'Ana Souza'], [1, 'Ana Souza']]);
    const base = await worker('GET', `/api/jobs/${jobId}/script/1`);
    expect(base.data.comentarios).toHaveLength(3);
    expect(base.data.comentarios.some((c) => /^\[GRIFO tirar\]/.test(c.texto))).toBe(true);
    // grifos continuam pendentes ate a versao nova ser publicada
    expect((await api('GET', '/api/script/versoes/1/grifos', 'userA')).data.grifos.every((g) => g.resolvido_em == null)).toBe(true);
  });

  it('pedir de novo com os mesmos grifos nao duplica os comentarios (job existente)', async () => {
    const r = await api('POST', '/api/script/versoes/1/revisar', 'userB', { comentarios: [grifoA, grifoB, grifoC].map(SG.grifoParaComentario) });
    expect(r.data.job).toMatchObject({ id: jobId, existing: true });
    expect((await api('GET', '/api/script/versoes/1/comentarios', 'userB')).data.comentarios).toHaveLength(3);
  });

  it('worker publica a v2 (PUT script do job revisar): grifos da v1 ficam resolvidos; a v2 abre sem grifos pendentes', async () => {
    const n = await worker('POST', '/api/jobs/next', { tipo: 'revisar' });
    expect(n.data.job.id).toBe(jobId);
    const put = await worker('PUT', `/api/jobs/${jobId}/script`, { content_md: '# v2\n\n## Passo 1 · Conexão\n\n1. "Prazer, Rafael. Eu sou do time da Paloma."\n', resumo: 'revisão com grifos' });
    expect(put.status).toBe(200);
    expect(put.data).toMatchObject({ versao: 2, meta: { tipo: 'revisao', base_versao: 1 } });
    await worker('PATCH', `/api/jobs/${jobId}`, { status: 'done', result: { versao: 2 } });
    const v1 = await api('GET', '/api/script/versoes/1/grifos', 'userA');
    expect(v1.data.grifos).toHaveLength(3);
    expect(v1.data.grifos.every((g) => typeof g.resolvido_em === 'string' && g.resolvido_em.length > 0)).toBe(true);
    expect((await api('GET', '/api/script/versoes/2/grifos', 'userA')).data.grifos).toEqual([]);
  });

  it('sem `comentarios` no body, o servidor converte os grifos pendentes (inclusive de versao anterior) no mesmo formato', async () => {
    const novo = (await api('POST', '/api/script/versoes/2/grifos', 'userB', { passo: 2, documento: 'campo', texto: 'Eu sou do time da Paloma.', cor: 'verde' })).data.grifo;
    expect(novo.versao).toBe(2);
    const r = await api('POST', '/api/script/versoes/2/revisar', 'userA', {});
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ versao: 2, comentarios: 1, grifos: 1, job: { existing: false } });
    const raw = await worker('GET', `/api/jobs/${r.data.job.id}`);
    expect(raw.data.job.payload.comentarios).toEqual([
      { passo: 1, texto: '[GRIFO manter] «Eu sou do time da Paloma.»', autor: 'Ana Souza', created_at: expect.any(String), origem: 'grifo' },
    ]);
    expect(raw.data.job.payload.grifos).toEqual({ total: 1, ajustar: 0, manter: 1, tirar: 0 });
    // publicar a v3 resolve o grifo da v2; "gerar do zero" nao resolve (fica para a proxima revisao)
    const n = await worker('POST', '/api/jobs/next', { tipo: 'revisar' });
    await worker('PUT', `/api/jobs/${n.data.job.id}/script`, { content_md: '# v3\n\n## Passo 1 · Conexão\n\nTexto.' });
    await worker('PATCH', `/api/jobs/${n.data.job.id}`, { status: 'done' });
    expect((await api('GET', '/api/script/versoes/2/grifos', 'userA')).data.grifos[0].resolvido_em).toBeTruthy();
  });

  it('admin le os grifos do clube (so leitura); membro recebe 403', async () => {
    const adm = await api('GET', '/api/admin/clubs/clube-x/script-grifos', 'admin');
    expect(adm.status).toBe(200);
    expect(adm.data.grifos).toHaveLength(4);
    expect(adm.data.grifos.map((g) => g.versao)).toEqual([2, 1, 1, 1]);
    expect(adm.data.grifos.every((g) => g.resolvido_em)).toBe(true);
    expect((await api('GET', '/api/admin/clubs/clube-x/script-grifos', 'userA')).status).toBe(403);
  });
});
