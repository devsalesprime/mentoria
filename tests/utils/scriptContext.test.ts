// @ts-nocheck
/** @vitest-environment node */
/**
 * Contexto por pergunta (utils/script-context.cjs): schema, validacao por tipo (mime/ext/tamanho),
 * transcricao via Groq (fetch simulado: User-Agent de navegador, timeout, falha nao derruba),
 * DDL + CRUD em sqlite :memory:. Versoes (utils/script-versions.cjs): numeracao max + 1 e comentarios.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import CTX from '../../utils/script-context.cjs';
import SV from '../../utils/script-versions.cjs';
import SF from '../../utils/script-ficha.cjs';

const KEYS = SF.FIELD_KEYS;

describe('contextBodySchema + validateContextRequest', () => {
  it('link exige http(s); nota exige texto; campo desconhecido -> erro', () => {
    const p = CTX.contextBodySchema.safeParse({ field_key: '3.3', tipo: 'link', url: 'https://x.com/a' });
    expect(p.success).toBe(true);
    expect(CTX.validateContextRequest(p.data, null, KEYS)).toMatchObject({ ok: true, item: { tipo: 'link', url: 'https://x.com/a' } });
    expect(CTX.validateContextRequest({ field_key: '3.3', tipo: 'link', url: 'x.com' }, null, KEYS).ok).toBe(false);
    expect(CTX.validateContextRequest({ field_key: '3.3', tipo: 'nota', texto: '  ' }, null, KEYS).ok).toBe(false);
    expect(CTX.validateContextRequest({ field_key: '3.3', tipo: 'nota', texto: ' oi ' }, null, KEYS)).toMatchObject({ ok: true, item: { texto: 'oi' } });
    expect(CTX.validateContextRequest({ field_key: '9.9', tipo: 'nota', texto: 'x' }, null, KEYS).message).toMatch(/desconhecido/);
    expect(CTX.contextBodySchema.safeParse({ field_key: '3.3', tipo: 'foto' }).success).toBe(false);
  });

  it('arquivo: mime ou extensao aceitos por tipo; limites 25/10/50 MB', () => {
    const f = (name, mimetype, size) => ({ originalname: name, mimetype, size });
    expect(CTX.fileError('audio', null)).toMatch(/Envie o arquivo/);
    expect(CTX.fileError('audio', f('a.webm', 'audio/webm', 1000))).toBeNull();
    expect(CTX.fileError('audio', f('a.bin', 'video/webm', 1000))).toBeNull(); // MediaRecorder de audio pode vir video/webm
    expect(CTX.fileError('audio', f('a.m4a', 'application/octet-stream', 1000))).toBeNull(); // extensao salva
    expect(CTX.fileError('audio', f('a.txt', 'text/plain', 10))).toMatch(/Áudio não aceito/);
    expect(CTX.fileError('audio', f('a.mp3', 'audio/mpeg', 26 * 1024 * 1024))).toMatch(/25 MB/);
    expect(CTX.fileError('imagem', f('a.png', 'image/png', 10))).toBeNull();
    expect(CTX.fileError('imagem', f('a.heic', 'application/octet-stream', 10))).toBeNull();
    expect(CTX.fileError('imagem', f('a.gif', 'image/gif', 10))).toMatch(/Imagem não aceita/);
    expect(CTX.fileError('imagem', f('a.png', 'image/png', 11 * 1024 * 1024))).toMatch(/10 MB/);
    expect(CTX.fileError('video', f('a.mov', 'video/quicktime', 10))).toBeNull();
    expect(CTX.fileError('video', f('a.avi', 'video/x-msvideo', 10))).toMatch(/Vídeo não aceito/);
    expect(CTX.fileError('video', f('a.mp4', 'video/mp4', 51 * 1024 * 1024))).toMatch(/50 MB/);
    expect(CTX.fileError('nota', null)).toBeNull();
  });
});

describe('transcribeAudio (Groq simulado)', () => {
  let dir; let audio;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-audio-'));
    audio = path.join(dir, 'a.webm');
    fs.writeFileSync(audio, Buffer.from('fake-audio'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('manda multipart com model/language e User-Agent de navegador; devolve o texto', async () => {
    let seen = null;
    const fetchImpl = async (url, opts) => {
      seen = { url, headers: opts.headers, body: opts.body };
      return { ok: true, status: 200, text: async () => JSON.stringify({ text: ' olá mundo ' }) };
    };
    const r = await CTX.transcribeAudio(audio, { mimetype: 'audio/webm', fileName: 'a.webm', apiKey: 'k', fetchImpl });
    expect(r).toEqual({ ok: true, texto: 'olá mundo' });
    expect(seen.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(seen.headers.Authorization).toBe('Bearer k');
    expect(seen.headers['User-Agent']).toMatch(/Mozilla/);
    expect(seen.body.get('model')).toBe('whisper-large-v3-turbo');
    expect(seen.body.get('language')).toBe('pt');
    expect(seen.body.get('file')).toBeTruthy();
  });

  it('sem chave, erro HTTP e timeout viram { ok: false, erro } (nunca explode)', async () => {
    const prev = process.env.GROQ_API_KEY; delete process.env.GROQ_API_KEY;
    try {
      expect((await CTX.transcribeAudio(audio, { fetchImpl: async () => { throw new Error('nao deveria chamar'); } })).erro).toMatch(/GROQ_API_KEY/);
    } finally { if (prev !== undefined) process.env.GROQ_API_KEY = prev; }
    const r403 = await CTX.transcribeAudio(audio, { apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'forbidden' }) });
    expect(r403.ok).toBe(false);
    expect(r403.erro).toMatch(/Groq 403/);
    const slow = (url, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    });
    const rt = await CTX.transcribeAudio(audio, { apiKey: 'k', fetchImpl: slow, timeoutMs: 30 });
    expect(rt.ok).toBe(false);
    expect(rt.erro).toMatch(/tempo esgotado/);
    const empty = await CTX.transcribeAudio(audio, { apiKey: 'k', fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{"text":""}' }) });
    expect(empty.erro).toMatch(/vazia/);
  });
});

describe('script_field_context + script_versions em sqlite :memory:', () => {
  let h; let db;
  const uuidv4 = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  beforeAll(async () => {
    db = new sqlite3.Database(':memory:');
    h = createDbHelpers(db);
    await h.dbRun(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await h.dbRun(`CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, user_id TEXT, category TEXT, file_name TEXT, file_path TEXT, file_type TEXT, file_size INTEGER, module TEXT)`);
    await h.dbRun(`INSERT INTO users (id, email, name) VALUES ('u1', 'A@x.com', 'Ana'), ('u2', 'b@x.com', 'Beto')`);
    await CTX.ensureScriptContextTable(h.dbRun);
    await CTX.ensureScriptContextTable(h.dbRun); // idempotente
    await SV.ensureScriptVersionsTables(h.dbRun);
    await SV.ensureScriptVersionsTables(h.dbRun);
  });
  afterAll(() => new Promise((r) => db.close(r)));

  it('insere nota/link/imagem, lista por campo e agrupa; conta por campo; apaga com o arquivo', async () => {
    await CTX.insertContext(h, { id: 'c1', club_slug: 'x', user_id: 'u1', field_key: '3.3', tipo: 'nota', texto: 'frase do cliente' });
    await CTX.insertContext(h, { id: 'c2', club_slug: 'x', user_id: 'u2', field_key: '3.3', tipo: 'link', url: 'https://x.com', legenda: 'site' });
    await h.dbRun(`INSERT INTO uploaded_files (id, user_id, category, file_name, file_path, file_type, file_size, module) VALUES ('f1', 'u1', 'script_contexto', 'foto.png', '/nao/existe.png', 'image/png', 12, 'script')`);
    await CTX.insertContext(h, { id: 'c3', club_slug: 'x', user_id: 'u1', field_key: '1.1', tipo: 'imagem', file_id: 'f1' });
    await CTX.insertContext(h, { id: 'c9', club_slug: 'outro', user_id: 'u1', field_key: '3.3', tipo: 'nota', texto: 'de outro clube' });
    const fileUrl = (id) => `/dl/${id}`;
    const all = await CTX.listContext(h, 'x', { fileUrl });
    expect(all.map((i) => i.id)).toEqual(['c1', 'c2', 'c3']);
    expect(all[0]).toMatchObject({ tipo: 'nota', texto: 'frase do cliente', autor_email: 'a@x.com', autor_nome: 'Ana', download_url: null });
    expect(all[2]).toMatchObject({ tipo: 'imagem', file_id: 'f1', file_name: 'foto.png', file_type: 'image/png', download_url: '/dl/f1' });
    const so33 = await CTX.listContext(h, 'x', { field: '3.3' });
    expect(so33).toHaveLength(2);
    expect(Object.keys(CTX.groupByField(all)).sort()).toEqual(['1.1', '3.3']);
    expect(await CTX.countByField(h, 'x')).toEqual({ '1.1': 1, '3.3': 2 });
    expect(await CTX.getContextFile(h, 'x', 'f1')).toMatchObject({ id: 'f1' });
    expect(await CTX.getContextFile(h, 'outro', 'f1')).toBeUndefined();
    const del = await CTX.deleteContext(h, 'x', 'c3', { fs });
    expect(del.id).toBe('c3');
    expect(await h.dbGet(`SELECT * FROM uploaded_files WHERE id = 'f1'`)).toBeUndefined();
    expect(await CTX.deleteContext(h, 'x', 'c9', { fs })).toBeNull(); // outro clube
  });

  it('versoes: max + 1 por clube; aprovar; comentarios com nome do autor; resumo', async () => {
    const v1 = await SV.insertVersion({ ...h, uuidv4 }, { club_slug: 'x', content_md: '# v1', resumo: 'primeira', job_id: 'j1' });
    const v2 = await SV.insertVersion({ ...h, uuidv4 }, { club_slug: 'x', content_md: '# v2', meta: { tokens: 10 } });
    const outro = await SV.insertVersion({ ...h, uuidv4 }, { club_slug: 'y', content_md: '# y' });
    expect([v1.versao, v2.versao, outro.versao]).toEqual([1, 2, 1]);
    expect(v2.meta).toEqual({ tokens: 10 });
    const list = await SV.listVersions(h, 'x');
    expect(list.map((v) => v.versao)).toEqual([2, 1]);
    expect(list[0].content_md).toBeUndefined();
    const full = await SV.getVersion(h, 'x', 1);
    expect(full.content_md).toBe('# v1');
    expect(full.status).toBe('rascunho');
    const c = await SV.insertComment({ ...h, uuidv4 }, { club_slug: 'x', versao: 1, passo: 3, texto: 'mudar', autor_email: 'A@x.com' });
    expect(c).toMatchObject({ versao: 1, passo: 3, texto: 'mudar', autor_email: 'a@x.com', autor_nome: 'Ana' });
    expect((await SV.listComments(h, 'x', 1)).map((x) => x.id)).toEqual([c.id]);
    expect((await SV.listVersions(h, 'x')).find((v) => v.versao === 1).comentarios_count).toBe(1);
    const ap = await SV.approveVersion(h, 'x', 1, 'a@x.com');
    expect(ap).toMatchObject({ status: 'aprovado', aprovado_por: 'a@x.com' });
    expect(ap.aprovado_em).toBeTruthy();
    expect(await SV.approveVersion(h, 'x', 9, 'a@x.com')).toBeNull();
    expect(await SV.scriptSummary(h, 'x')).toMatchObject({ versoes: 2, ultima: { versao: 2, status: 'rascunho' }, aprovada: 1 });
    expect(await SV.scriptSummary(h, 'zzz')).toEqual({ versoes: 0, ultima: null, aprovada: null });
    expect(SV.scriptCommentSchema.safeParse({ passo: 8, texto: 'x' }).success).toBe(false);
    expect(SV.scriptCommentSchema.safeParse({ texto: 'x' }).data.passo).toBe(0);
  });
});
