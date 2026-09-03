// @ts-nocheck
/** @vitest-environment node */
/**
 * Ship 2 do Script 7 Passos, com os routers reais em sqlite :memory: (script, admin-cohort, jobs):
 * - contexto por pergunta: nota, link, imagem (multipart), 400s, lista por campo e agrupada, download por socio,
 *   apagar so pelo autor, contexto_count/refinando na ficha, worker ve `contexto` e `valores` e baixa o arquivo
 * - complete -> job `script` (1 por clube); gerar-script; refinar -> job por campo
 * - worker: POST next sem tipo (any) e com tipo; PUT campo reabre campo decidido com "sua versão anterior"
 *   e aplica a regra "sem a definir"; PUT script numera max + 1 e devolve url
 * - membro: versoes, conteudo, comentarios por passo, aprovar; admin: detalhe com versoes/comentarios e conteudo
 * - "Pedir nova versao": POST versoes/:versao/revisar -> job `revisar` com versao + content_md + comentarios no payload,
 *   dedupe por clube junto com `script`; worker le GET :id/script e :id/script/:versao; PUT script marca meta.tipo = 'revisao'
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

const TOKEN = 'token-fila';
let server; let base; let tmpDir; let dbRun; let sample;

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
async function multipart(user, fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append('file', new Blob([file.content], { type: file.type }), file.name);
  const res = await fetch(base + '/api/script/context', { method: 'POST', headers: { 'x-user': user }, body: fd });
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

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-ctx-'));
  sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'samples', 'prefill-exemplo.json'), 'utf8'));
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
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-x', 'Clube X', 1), ('clube-z', 'Clube Z', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('a@x.com', 'clube-x', 'Ana'), ('b@x.com', 'clube-x', 'Beto'), ('z@z.com', 'clube-z', 'Zeca')`);
  await dbRun(`INSERT INTO users (id, email, name, cohort, club_slug) VALUES
    ('userA', 'a@x.com', 'Ana', 'exclusive', 'clube-x'), ('userB', 'b@x.com', 'Beto', 'exclusive', 'clube-x'), ('userZ', 'z@z.com', 'Zeca', 'exclusive', 'clube-z')`);

  const deps = { db, ...helpers, authMiddleware, adminMiddleware, uuidv4: () => `id-${Math.random().toString(36).slice(2)}`, fs, path, safeJsonParse, DATA_DIR: tmpDir };
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(createScriptRoutes(deps));
  app.use(createAdminCohortRoutes(deps));
  app.use(createJobsRoutes({ ...deps, COHORT_JOBS_TOKEN: TOKEN, APP_URL: 'https://app.teste.local/' }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  delete process.env.GROQ_API_KEY;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let notaId; let linkId; let imgId; let imgFileId; let audioId;

describe('contexto por pergunta', () => {
  it('nota e link para 3.3 (validacoes), imagem por multipart; lista por campo e agrupada', async () => {
    expect((await multipart('userA', { field_key: '9.9', tipo: 'nota', texto: 'x' })).status).toBe(400);
    expect((await multipart('userA', { field_key: '3.3', tipo: 'nota', texto: '  ' })).data.message).toMatch(/Escreva a nota/);
    expect((await multipart('userA', { field_key: '3.3', tipo: 'link', url: 'sem-protocolo' })).data.message).toMatch(/http/);
    expect((await multipart('userA', { field_key: '3.3', tipo: 'imagem' })).data.message).toMatch(/Envie o arquivo/);
    expect((await multipart('userA', { field_key: '3.3', tipo: 'imagem' }, { name: 'x.txt', type: 'text/plain', content: 'nao' })).data.message).toMatch(/Imagem não aceita/);
    expect((await multipart('userA', { field_key: '3.3', tipo: 'foto', texto: 'x' })).status).toBe(400);

    const nota = await multipart('userA', { field_key: '3.3', tipo: 'nota', texto: 'Ele diz: "não tenho tempo para nada"' });
    expect(nota.status).toBe(200);
    expect(nota.data.item).toMatchObject({ field_key: '3.3', tipo: 'nota', autor_email: 'a@x.com', autor_nome: 'Ana', download_url: null });
    notaId = nota.data.item.id;
    const link = await multipart('userB', { field_key: '3.3', tipo: 'link', url: 'https://instagram.com/p/1', legenda: 'depoimento' });
    expect(link.status).toBe(200);
    expect(link.data.item).toMatchObject({ tipo: 'link', url: 'https://instagram.com/p/1', legenda: 'depoimento', autor_email: 'b@x.com' });
    linkId = link.data.item.id;
    const img = await multipart('userA', { field_key: '1.1', tipo: 'imagem', legenda: 'print do site' }, { name: 'print.png', type: 'image/png', content: 'PNGDATA' });
    expect(img.status).toBe(200);
    expect(img.data.item).toMatchObject({ tipo: 'imagem', file_name: 'print.png', file_type: 'image/png', file_size: 7 });
    expect(img.data.item.download_url).toBe(`/api/script/context/files/${img.data.item.file_id}/download`);
    imgId = img.data.item.id; imgFileId = img.data.item.file_id;
    const uf = await api('GET', '/api/script/materials/files', 'userA');
    expect(uf.data.data.map((f) => f.id)).not.toContain(imgFileId); // contexto nao e material

    const so33 = await api('GET', '/api/script/context?field=3.3', 'userB');
    expect(so33.data.items.map((i) => i.id)).toEqual([notaId, linkId]); // clube inteiro, com autor
    expect(so33.data.por_campo).toBeUndefined();
    const all = await api('GET', '/api/script/context', 'userA');
    expect(Object.keys(all.data.por_campo).sort()).toEqual(['1.1', '3.3']);
    expect((await api('GET', '/api/script/context?field=9.9', 'userA')).status).toBe(400);
    expect((await api('GET', '/api/script/context', 'userZ')).data.items).toEqual([]);
  });

  it('audio sem GROQ_API_KEY: guarda com erro_transcricao e devolve warning', async () => {
    const a = await multipart('userA', { field_key: '3.4', tipo: 'audio' }, { name: 'voz.webm', type: 'audio/webm', content: 'WEBM' });
    expect(a.status).toBe(200);
    expect(a.data.item.transcricao).toBeNull();
    expect(a.data.item.erro_transcricao).toMatch(/GROQ_API_KEY/);
    expect(a.data.warning).toMatch(/transcrição falhou/);
    audioId = a.data.item.id;
    expect((await multipart('userA', { field_key: '3.4', tipo: 'audio' }, { name: 'voz.txt', type: 'text/plain', content: 'x' })).data.message).toMatch(/Áudio não aceito/);
  });

  it('download por socio (200), por outro clube (404); apagar so o autor', async () => {
    const dl = await fetch(`${base}/api/script/context/files/${imgFileId}/download`, { headers: { 'x-user': 'userB' } });
    expect(dl.status).toBe(200);
    expect(await dl.text()).toBe('PNGDATA');
    expect((await fetch(`${base}/api/script/context/files/${imgFileId}/download`, { headers: { 'x-user': 'userZ' } })).status).toBe(404);
    expect((await api('DELETE', `/api/script/context/${notaId}`, 'userB')).status).toBe(403);
    expect((await api('DELETE', `/api/script/context/${notaId}`, 'userZ')).status).toBe(404);
    const del = await api('DELETE', `/api/script/context/${imgId}`, 'userA');
    expect(del.status).toBe(200);
    expect((await fetch(`${base}/api/script/context/files/${imgFileId}/download`, { headers: { 'x-user': 'userA' } })).status).toBe(404);
    expect((await api('GET', '/api/script/context?field=1.1', 'userA')).data.items).toEqual([]);
  });

  it('GET ficha traz contexto_count e refinando por campo; refinar enfileira 1 job por campo', async () => {
    const imp = await api('PUT', '/api/admin/clubs/clube-x/script-ficha', 'admin', { ...sample, club_slug: 'clube-x' });
    expect(imp.status).toBe(200);
    const r = await api('POST', '/api/script/ficha/refinar', 'userA', { field_key: '3.3', pedido: 'mais direto' });
    expect(r.status).toBe(200);
    expect(r.data.job).toMatchObject({ tipo: 'refinar', status: 'queued', existing: false });
    const again = await api('POST', '/api/script/ficha/refinar', 'userB', { field_key: '3.3' });
    expect(again.data.job).toMatchObject({ id: r.data.job.id, existing: true });
    expect((await api('POST', '/api/script/ficha/refinar', 'userA', { field_key: '9.9' })).status).toBe(400);
    const f = await api('GET', '/api/script/ficha', 'userB');
    const campos = f.data.data.blocos.flatMap((b) => b.campos);
    expect(campos.find((c) => c.key === '3.3')).toMatchObject({ contexto_count: 2, refinando: true });
    expect(campos.find((c) => c.key === '3.4')).toMatchObject({ contexto_count: 1, refinando: false });
    expect(campos.find((c) => c.key === '1.1')).toMatchObject({ contexto_count: 0, refinando: false });
    expect(f.data.data.script).toEqual({ versoes: 0, ultima: null, aprovada: null, job: null });
  });
});

let scriptJob; let refinarJob;

describe('complete -> job script; worker any; PUT campo; PUT script', () => {
  it('gerar-script antes de fechar -> 400; complete fecha e enfileira 1 job script por clube', async () => {
    expect((await api('POST', '/api/script/ficha/gerar-script', 'userA', {})).status).toBe(400);
    const ficha = await api('GET', '/api/script/ficha', 'userA');
    const updates = {};
    for (const b of ficha.data.data.blocos) for (const c of b.campos) {
      if (c.key === '3.3') { updates[c.key] = { status: 'editado', valor: 'Minha frase decidida' }; continue; }
      updates[c.key] = c.sugerido ? { status: 'confirmado' } : (c.obrigatorio ? { status: 'editado', valor: `Valor ${c.key}` } : { status: 'aceito_vazio' });
    }
    await api('PUT', '/api/script/ficha/fields', 'userA', { updates });
    const done = await api('POST', '/api/script/ficha/complete', 'userA', {});
    expect(done.status).toBe(200);
    expect(done.data.ficha_status).toBe('confirmada');
    expect(done.data.job).toMatchObject({ tipo: 'script', status: 'queued', existing: false });
    scriptJob = done.data.job;
    const again = await api('POST', '/api/script/ficha/gerar-script', 'userB', {});
    expect(again.data.job).toMatchObject({ id: scriptJob.id, existing: true });
    const f = await api('GET', '/api/script/ficha', 'userA');
    expect(f.data.data.script.job).toMatchObject({ id: scriptJob.id, tipo: 'script', status: 'queued' });
    const v = await api('GET', '/api/script/versoes', 'userA');
    expect(v.data.versoes).toEqual([]);
    expect(v.data.job.id).toBe(scriptJob.id);
    expect((await api('GET', '/api/script/versoes/1', 'userA')).status).toBe(404);
  });

  it('worker: next sem tipo pega o mais antigo (refinar), tipo invalido 400, ficha traz contexto + valores, baixa arquivo de contexto', async () => {
    expect((await worker('POST', '/api/jobs/next', { tipo: 'xyz' })).status).toBe(400);
    const n1 = await worker('POST', '/api/jobs/next', {});
    expect(n1.status).toBe(200);
    expect(n1.data.job.tipo).toBe('refinar');
    expect(n1.data.job.payload).toMatchObject({ field_key: '3.3', pedido: 'mais direto' });
    refinarJob = n1.data.job;
    const f = await worker('GET', `/api/jobs/${refinarJob.id}/ficha`);
    expect(f.data.contexto['3.3'].map((i) => i.tipo)).toEqual(['nota', 'link']);
    expect(f.data.contexto['3.3'][0].texto).toMatch(/não tenho tempo/);
    expect(f.data.contexto['3.4'][0]).toMatchObject({ tipo: 'audio', transcricao: null });
    expect(f.data.contexto['3.4'][0].download_url).toBe(`/api/jobs/${refinarJob.id}/files/${f.data.contexto['3.4'][0].file_id}`);
    expect(f.data.valores['3.3']).toBe('Minha frase decidida');
    expect(f.data.valores['1.1']).toBe(sample.campos['1.1'].sugerido);
    const dl = await worker('GET', f.data.contexto['3.4'][0].download_url);
    expect(dl.status).toBe(200);
    expect(dl.text).toBe('WEBM');
  });

  it('PUT campo: reabre 3.3 (decidido) com "sua versão anterior" em alternativas[0]; ficha volta a em_revisao; "a definir" vira vazio', async () => {
    expect((await worker('PUT', `/api/jobs/${refinarJob.id}/campo`, { field_key: '9.9', sugerido: 'x', classe: 'Fato', fonte: 'y' })).status).toBe(400);
    const r = await worker('PUT', `/api/jobs/${refinarJob.id}/campo`, {
      field_key: '3.3', sugerido: 'Frase nova, do áudio', classe: 'DER', fonte: 'contexto: nota', alternativas: [{ sugerido: 'Outra frase', fonte: 'link' }],
    });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ reaberto: true, limpo: false, ficha_status: 'em_revisao' });
    expect(r.data.campo).toMatchObject({ key: '3.3', status: 'sugerido', sugerido: 'Frase nova, do áudio', decidido: false, atualizado_por: `worker:${refinarJob.id}` });
    expect(r.data.campo.alternativas[0]).toEqual({ sugerido: 'Minha frase decidida', fonte: 'sua versão anterior' });
    expect(r.data.campo.alternativas[1]).toEqual({ sugerido: 'Outra frase', fonte: 'link' });
    const m = await api('GET', '/api/script/ficha', 'userA');
    expect(m.data.data.ficha_status).toBe('em_revisao');
    const c33 = m.data.data.blocos.flatMap((b) => b.campos).find((c) => c.key === '3.3');
    expect(c33.status).toBe('sugerido');
    expect(c33.refinando).toBe(true); // job ainda running; fecha no PATCH
    await worker('PATCH', `/api/jobs/${refinarJob.id}`, { status: 'done' });
    const m2 = await api('GET', '/api/script/ficha', 'userA');
    expect(m2.data.data.blocos.flatMap((b) => b.campos).find((c) => c.key === '3.3').refinando).toBe(false);

    const bad = await worker('PUT', `/api/jobs/${refinarJob.id}/campo`, { field_key: '3.5', sugerido: 'a definir com a gente', classe: 'Fato', fonte: 'x' });
    expect(bad.data.limpo).toBe(true);
    expect(bad.data.campo).toMatchObject({ status: 'vazio', sugerido: '', classe: 'VZ' });
    expect(bad.data.campo.nota_interna).toContain('a definir com a gente');
    expect(bad.data.warnings[0]).toMatch(/a definir/);
    // o mentor volta para a versao anterior com 1 toque
    const back = await api('PUT', '/api/script/ficha/fields', 'userA', { updates: { '3.3': { status: 'editado', valor: 'Minha frase decidida' } } });
    expect(back.data.applied).toEqual(['3.3']);
  });

  it('prefill via PUT tambem limpa "a definir" (campo nao decidido)', async () => {
    const body = { ...JSON.parse(JSON.stringify(sample)), club_slug: 'clube-x' };
    body.campos['3.5'] = { sugerido: '???', classe: 'DER', fonte: 'x', alternativas: [], nota_interna: '' };
    const n = await worker('POST', '/api/jobs/next', { tipo: 'script' });
    expect(n.data.job.id).toBe(scriptJob.id);
    const r = await worker('PUT', `/api/jobs/${scriptJob.id}/prefill`, body);
    expect(r.status).toBe(200);
    expect(r.data.skipped.length).toBe(33); // so 3.5 estava sem decisao (reaberto e limpo pelo PUT campo)
    const f = await worker('GET', `/api/jobs/${scriptJob.id}/ficha`);
    const c35 = f.data.blocos[2].campos.find((c) => c.key === '3.5');
    expect(c35).toMatchObject({ status: 'vazio', sugerido: '', classe: 'VZ' });
    expect(c35.nota_interna).toContain('???');
  });

  it('PUT script grava v1 e v2 (max + 1) com url; membro le, comenta por passo e aprova', async () => {
    expect((await worker('PUT', `/api/jobs/${scriptJob.id}/script`, { content_md: '' })).status).toBe(400);
    const md1 = '# Script\n\nAbertura.\n\n## Passo 1: Entregar o controle\n\nTexto 1.\n\n## Passo 2: Dor\n\nTexto 2.';
    const v1 = await worker('PUT', `/api/jobs/${scriptJob.id}/script`, { content_md: md1, resumo: 'primeira versão', meta: { modelo: 'x' } });
    expect(v1.status).toBe(200);
    expect(v1.data).toMatchObject({ versao: 1, status: 'rascunho', url: 'https://app.teste.local/prosperus-mentor-diagnosis/dashboard/script', warnings: [] });
    const v2 = await worker('PUT', `/api/jobs/${scriptJob.id}/script`, { content_md: '# v2 — com travessão e diagnóstico' });
    expect(v2.data.versao).toBe(2);
    expect(v2.data.warnings).toHaveLength(2);
    await worker('PATCH', `/api/jobs/${scriptJob.id}`, { status: 'done', result: { versao: 2 } });

    const list = await api('GET', '/api/script/versoes', 'userA');
    expect(list.data.versoes.map((v) => v.versao)).toEqual([2, 1]);
    expect(list.data.versoes[1]).toMatchObject({ resumo: 'primeira versão', status: 'rascunho', comentarios_count: 0 });
    expect(list.data.versoes[1].content_md).toBeUndefined();
    expect(list.data.job.status).toBe('done');
    const one = await api('GET', '/api/script/versoes/1', 'userB');
    expect(one.data.versao.content_md).toBe(md1);
    expect(one.data.versao.meta).toEqual({ modelo: 'x' });
    expect(one.data.comentarios).toEqual([]);
    expect((await api('GET', '/api/script/versoes/1', 'userZ')).status).toBe(404); // outro clube
    expect((await api('GET', '/api/script/versoes/abc', 'userA')).status).toBe(400);

    expect((await api('POST', '/api/script/versoes/1/comentarios', 'userA', { passo: 8, texto: 'x' })).status).toBe(400);
    expect((await api('POST', '/api/script/versoes/1/comentarios', 'userA', { passo: 1, texto: '  ' })).status).toBe(400);
    const c = await api('POST', '/api/script/versoes/1/comentarios', 'userA', { passo: 2, texto: 'Trocar a frase da dor' });
    expect(c.data.comentario).toMatchObject({ versao: 1, passo: 2, texto: 'Trocar a frase da dor', autor_email: 'a@x.com', autor_nome: 'Ana' });
    const g = await api('POST', '/api/script/versoes/1/comentarios', 'userB', { texto: 'Gostei do todo' });
    expect(g.data.comentario.passo).toBe(0);
    expect((await api('GET', '/api/script/versoes/1/comentarios', 'userB')).data.comentarios.map((x) => x.passo)).toEqual([0, 2]);
    expect((await api('POST', '/api/script/versoes/9/comentarios', 'userA', { texto: 'x' })).status).toBe(404);

    const ap = await api('POST', '/api/script/versoes/1/aprovar', 'userA');
    expect(ap.data.versao).toMatchObject({ versao: 1, status: 'aprovado', aprovado_por: 'a@x.com' });
    expect((await api('POST', '/api/script/versoes/9/aprovar', 'userA')).status).toBe(404);
    const f = await api('GET', '/api/script/ficha', 'userA');
    expect(f.data.data.script).toMatchObject({ versoes: 2, ultima: { versao: 2, status: 'rascunho' }, aprovada: 1 });
    expect(f.data.data.script.job.status).toBe('done');

    // ficha esta em_revisao (3.5, obrigatorio, ficou vazio depois do "a definir"): gerar-script -> 400 com faltam
    const gen = await api('POST', '/api/script/ficha/gerar-script', 'userA', {});
    expect(gen.status).toBe(400);
    expect(gen.data.faltam).toEqual(['3.5']);
    // o mentor decide 3.5 e fecha de novo: nasce job script novo (o anterior esta done)
    await api('PUT', '/api/script/ficha/fields', 'userA', { updates: { '3.5': { status: 'editado', valor: 'Mais um ano igual: perde a equipe' } } });
    const done2 = await api('POST', '/api/script/ficha/complete', 'userA', {});
    expect(done2.data.job).toMatchObject({ tipo: 'script', status: 'queued', existing: false });
    expect(done2.data.job.id).not.toBe(scriptJob.id);
  });

  it('admin: detalhe traz versoes, comentarios, contexto e jobs com tipo; conteudo por versao; lista da fila filtra por tipo', async () => {
    const det = await api('GET', '/api/admin/clubs/clube-x/script-ficha', 'admin');
    expect(det.data.data.versoes.map((v) => v.versao)).toEqual([2, 1]);
    expect(det.data.data.versoes[1]).toMatchObject({ status: 'aprovado', comentarios_count: 2 });
    expect(det.data.data.comentarios).toHaveLength(2);
    expect(det.data.data.contexto['3.3']).toHaveLength(2);
    expect(det.data.data.contexto['3.4'][0].download_url).toMatch(/^\/api\/admin\/files\//);
    expect(det.data.data.blocos[2].campos.find((c) => c.key === '3.3').contexto_count).toBe(2);
    expect(det.data.data.jobs.map((j) => j.tipo).sort()).toEqual(['refinar', 'script', 'script']);
    expect(det.data.data.files).toEqual([]); // contexto nao e material
    const v1 = await api('GET', '/api/admin/clubs/clube-x/script-versoes/1', 'admin');
    expect(v1.data.versao.content_md).toMatch(/## Passo 1/);
    expect(v1.data.comentarios).toHaveLength(2);
    expect((await api('GET', '/api/admin/clubs/clube-x/script-versoes/9', 'admin')).status).toBe(404);
    expect((await api('GET', '/api/admin/clubs/clube-x/script-versoes/1', 'userA')).status).toBe(403);
    const fila = await api('GET', '/api/admin/cohort/jobs?tipo=refinar', 'admin');
    expect(fila.data.data.map((j) => j.tipo)).toEqual(['refinar']);
    expect(fila.data.data[0].payload.field_key).toBe('3.3');
    expect((await api('GET', '/api/admin/cohort/jobs?tipo=xyz', 'admin')).status).toBe(400);
    const ov = await api('GET', '/api/admin/cohort', 'admin');
    expect(ov.data.data.find((r) => r.club_slug === 'clube-x').materiais_count).toBe(0);
  });
});

describe('pedir nova versao -> job revisar; worker le a versao base; PUT script marca a revisao', () => {
  let revisarJob;

  it('POST versoes/:versao/revisar cria o job com versao, conteudo e todos os comentarios no payload; dedupe por clube junto com script', async () => {
    // O complete anterior deixou um job `script` na fila: o worker fecha para liberar o escopo script|revisar do clube
    const pend = await worker('POST', '/api/jobs/next', { tipo: 'script' });
    expect(pend.status).toBe(200);
    await worker('PATCH', `/api/jobs/${pend.data.job.id}`, { status: 'done' });

    expect((await api('POST', '/api/script/versoes/abc/revisar', 'userA', {})).status).toBe(400);
    expect((await api('POST', '/api/script/versoes/9/revisar', 'userA', {})).status).toBe(404);
    expect((await api('POST', '/api/script/versoes/1/revisar', 'userZ', {})).status).toBe(404); // outro clube

    const r = await api('POST', '/api/script/versoes/1/revisar', 'userA', { pedido: 'Mais curto no passo 2' });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ versao: 1, comentarios: 2, job: { tipo: 'revisar', status: 'queued', existing: false } });
    revisarJob = r.data.job;
    const raw = await worker('GET', `/api/jobs/${revisarJob.id}`);
    expect(raw.data.job.payload).toMatchObject({ versao: 1, pedido: 'Mais curto no passo 2', nome: 'Ana' });
    expect(raw.data.job.payload.content_md).toMatch(/## Passo 1/);
    expect(raw.data.job.payload.comentarios).toEqual([
      { passo: 0, texto: 'Gostei do todo', autor: 'Beto', created_at: expect.any(String) },
      { passo: 2, texto: 'Trocar a frase da dor', autor: 'Ana', created_at: expect.any(String) },
    ]);
    // dedupe: B pedindo de novo (em outra versao) e A pedindo "do zero" recebem o mesmo job
    const again = await api('POST', '/api/script/versoes/2/revisar', 'userB', {});
    expect(again.data.job).toMatchObject({ id: revisarJob.id, existing: true });
    const zero = await api('POST', '/api/script/ficha/gerar-script', 'userA', {});
    expect(zero.data.job).toMatchObject({ id: revisarJob.id, tipo: 'revisar', existing: true });
    // o membro ve o job revisar como o job do script
    const v = await api('GET', '/api/script/versoes', 'userA');
    expect(v.data.job).toMatchObject({ id: revisarJob.id, tipo: 'revisar', status: 'queued' });
    expect((await api('GET', '/api/script/ficha', 'userA')).data.data.script.job.tipo).toBe('revisar');
  });

  it('worker: GET :id/script (ultima) e :id/script/:versao (base) com comentarios; PUT script grava meta.tipo revisao + base_versao', async () => {
    const n = await worker('POST', '/api/jobs/next', { tipo: 'revisar' });
    expect(n.status).toBe(200);
    expect(n.data.job.id).toBe(revisarJob.id);
    const last = await worker('GET', `/api/jobs/${revisarJob.id}/script`);
    expect(last.status).toBe(200);
    expect(last.data).toMatchObject({ job_id: revisarJob.id, club_slug: 'clube-x', versao: 2, status: 'rascunho', comentarios: [] });
    expect(last.data.content_md).toMatch(/^# v2/);
    const base = await worker('GET', `/api/jobs/${revisarJob.id}/script/${n.data.job.payload.versao}`);
    expect(base.data.versao).toBe(1);
    expect(base.data.content_md).toMatch(/## Passo 1/);
    expect(base.data.meta).toEqual({ modelo: 'x' });
    expect(base.data.comentarios.map((c) => c.passo)).toEqual([0, 2]);
    expect(base.data.comentarios[1]).toMatchObject({ versao: 1, texto: 'Trocar a frase da dor', autor_email: 'a@x.com', autor_nome: 'Ana' });
    expect((await worker('GET', `/api/jobs/${revisarJob.id}/script/9`)).status).toBe(404);
    expect((await worker('GET', `/api/jobs/${revisarJob.id}/script/abc`)).status).toBe(400);

    const put = await worker('PUT', `/api/jobs/${revisarJob.id}/script`, { content_md: '# v3\n\n## Passo 1: Revisado\n\nTexto.', resumo: 'revisão', meta: { modelo: 'y' } });
    expect(put.status).toBe(200);
    expect(put.data).toMatchObject({ versao: 3, meta: { modelo: 'y', tipo: 'revisao', base_versao: 1 } });
    await worker('PATCH', `/api/jobs/${revisarJob.id}`, { status: 'done', result: { versao: 3 } });
    const v3 = await api('GET', '/api/script/versoes/3', 'userB');
    expect(v3.data.versao.meta).toEqual({ modelo: 'y', tipo: 'revisao', base_versao: 1 });
    expect(v3.data.versao.job_id).toBe(revisarJob.id);
    // depois de done, o clube pode pedir de novo (job novo); sem pedido e sem comentarios o payload vem enxuto
    const again = await api('POST', '/api/script/versoes/3/revisar', 'userB', {});
    expect(again.data.job).toMatchObject({ tipo: 'revisar', existing: false });
    expect(again.data.job.id).not.toBe(revisarJob.id);
    const raw = await worker('GET', `/api/jobs/${again.data.job.id}`);
    expect(raw.data.job.payload.pedido).toBeUndefined();
    expect(raw.data.job.payload.comentarios).toEqual([]);
    expect(raw.data.job.payload.versao).toBe(3);
  });

  it('admin: fila filtra por revisar; detalhe traz os jobs revisar e a v3 com meta de revisao', async () => {
    const fila = await api('GET', '/api/admin/cohort/jobs?tipo=revisar', 'admin');
    expect(fila.status).toBe(200);
    expect(fila.data.data.map((j) => j.tipo)).toEqual(['revisar', 'revisar']);
    expect(fila.data.data.map((j) => j.payload.versao).sort()).toEqual([1, 3]);
    const det = await api('GET', '/api/admin/clubs/clube-x/script-ficha', 'admin');
    expect(det.data.data.jobs.filter((j) => j.tipo === 'revisar')).toHaveLength(2);
    expect(det.data.data.versoes[0]).toMatchObject({ versao: 3, meta: { tipo: 'revisao', base_versao: 1 } });
    expect(det.data.data.comentarios.filter((c) => c.versao === 1)).toHaveLength(2);
  });
});
