// @ts-nocheck
/** @vitest-environment node */
/**
 * Onda E3: anexos do grifo, com os routers reais em sqlite :memory: (script + jobs).
 * - anexar nota e link (JSON), imagem e áudio (multipart); o áudio é transcrito pela Groq (fetch mockado)
 * - GET /api/script/versoes/:v/grifos devolve `contexto` por grifo; o admin também
 * - só quem anexou apaga (403 para o sócio); grifo de outro clube não existe para quem é de fora (404)
 * - o contexto da FICHA não se mistura com o anexo do grifo (mesma tabela, `grifo_id` separa)
 * - "Pedir nova versão com os grifos": o comentário leva os anexos no texto
 *   ([GRIFO ajustar] «trecho» → nota · anexos: áudio (transcrição: "..."), link (url), ...)
 * - apagar o grifo leva os anexos junto
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
const TRANSCRICAO = 'Aqui eu preciso falar do preço antes de mostrar a proposta.';
let server; let base; let tmpDir; let dbRun; let dbGet; let dbAll; let fetchOriginal;

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
  const res = await fetchOriginal(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { 'x-user': user } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}
/** POST multipart num caminho qualquer (anexo do grifo ou contexto da ficha). */
async function multipart(url, user, fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append('file', new Blob([file.content], { type: file.type }), file.name);
  const res = await fetchOriginal(base + url, { method: 'POST', headers: { 'x-user': user }, body: fd });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}
async function worker(method, url, body, token = TOKEN) {
  const res = await fetchOriginal(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

const MD_V1 = '# Script · Os 7 Passos · Clube X\n\n# Documento 1 · Script completo para treinamento\n\n## Passo 1 · Conexão\n\n**Objetivo estratégico:** abrir.\n\n**Fala sugerida:**\n\n1. "Prazer, eu sou o Rafael, do time da Paloma."\n';
const TRECHO = 'Prazer, eu sou o Rafael, do time da Paloma.';

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grifo-anexos-'));
  // A Groq responde a transcrição pronta; o resto das chamadas (o próprio servidor de teste) passa direto.
  fetchOriginal = globalThis.fetch;
  process.env.GROQ_API_KEY = 'chave-de-teste';
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.groq.com')) {
      return new Response(JSON.stringify({ text: TRANSCRICAO }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return fetchOriginal(url, init);
  };

  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbRun = helpers.dbRun; dbGet = helpers.dbGet; dbAll = helpers.dbAll;
  const ddl = [
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'member', cohort TEXT, club_slug TEXT,
       last_login_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
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
  globalThis.fetch = fetchOriginal;
  delete process.env.GROQ_API_KEY;
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('utils/script-grifos: anexos no texto do comentario', () => {
  it('sem anexo o texto e o de sempre; com anexo ganha " · anexos: ..." com a transcricao', () => {
    const g = { cor: 'dourado', texto: TRECHO, nota: 'dizer o nome dele antes', passo: 2 };
    expect(SG.grifoParaComentario(g).texto).toBe(`[GRIFO ajustar] «${TRECHO}» → dizer o nome dele antes`);
    expect(SG.grifoParaComentario({ ...g, contexto: [] }).texto).toBe(`[GRIFO ajustar] «${TRECHO}» → dizer o nome dele antes`);
    const comAnexos = SG.grifoParaComentario({
      ...g,
      contexto: [
        { tipo: 'audio', transcricao: 'fala do preço antes' },
        { tipo: 'link', url: 'https://drive.google.com/x' },
        { tipo: 'imagem', legenda: 'print do CRM' },
        { tipo: 'nota', texto: 'usar o nome do cliente' },
        { tipo: 'video', legenda: 'reunião gravada' },
      ],
    });
    expect(comAnexos.texto).toBe(
      `[GRIFO ajustar] «${TRECHO}» → dizer o nome dele antes · anexos: áudio (transcrição: "fala do preço antes"), `
      + 'link (https://drive.google.com/x), imagem (print do CRM), nota ("usar o nome do cliente"), vídeo (reunião gravada)'
    );
    // audio sem transcricao ainda entra, avisando o estado
    expect(SG.grifoParaComentario({ ...g, nota: '', contexto: [{ tipo: 'audio', erro_transcricao: 'Groq 500' }] }).texto)
      .toBe(`[GRIFO ajustar] «${TRECHO}» · anexos: áudio (sem transcrição)`);
    // o casamento com o que o front manda ignora o sufixo
    expect(SG.comentarioSemAnexos(comAnexos.texto)).toBe(`[GRIFO ajustar] «${TRECHO}» → dizer o nome dele antes`);
    expect(SG.comentarioSemAnexos('[GRIFO manter] «x»')).toBe('[GRIFO manter] «x»');
  });
});

let grifo; let grifoBeto; let notaId; let linkId; let imagemId; let audioId; let imagemFileId;

describe('anexar material a um grifo', () => {
  it('cria o grifo e anexa nota e link por JSON; validacoes', async () => {
    grifo = (await api('POST', '/api/script/versoes/1/grifos', 'userA', {
      passo: 2, documento: 'treinamento', texto: TRECHO, prefixo: 'Fala 1', sufixo: 'Diga o nome', cor: 'dourado', nota: 'dizer o nome dele antes',
    })).data.grifo;
    expect(grifo.id).toBeTruthy();

    expect((await api('POST', `/api/script/grifos/${grifo.id}/contexto`, 'userA', { tipo: 'nota', texto: '  ' })).data.message).toMatch(/Escreva a nota/);
    expect((await api('POST', `/api/script/grifos/${grifo.id}/contexto`, 'userA', { tipo: 'link', url: 'sem-protocolo' })).data.message).toMatch(/http/);
    expect((await api('POST', `/api/script/grifos/${grifo.id}/contexto`, 'userA', { tipo: 'foto', texto: 'x' })).status).toBe(400);
    expect((await api('POST', '/api/script/grifos/sg-nao-existe/contexto', 'userA', { tipo: 'nota', texto: 'x' })).status).toBe(404);
    expect((await api('POST', `/api/script/grifos/${grifo.id}/contexto`, null, { tipo: 'nota', texto: 'x' })).status).toBe(401);

    const nota = await api('POST', `/api/script/grifos/${grifo.id}/contexto`, 'userA', { tipo: 'nota', texto: 'Ele repete: "quanto custa?" antes de eu terminar' });
    expect(nota.status).toBe(200);
    expect(nota.data).toMatchObject({ grifo_id: grifo.id });
    expect(nota.data.item).toMatchObject({ tipo: 'nota', grifo_id: grifo.id, field_key: '', autor_email: 'a@x.com', autor_nome: 'Ana Souza', download_url: null });
    notaId = nota.data.item.id;

    // o sócio do clube também anexa (o grifo é do clube, como o contexto da ficha)
    const link = await api('POST', `/api/script/grifos/${grifo.id}/contexto`, 'userB', { tipo: 'link', url: 'https://drive.google.com/reuniao', texto: 'gravação da call' });
    expect(link.status).toBe(200);
    expect(link.data.item).toMatchObject({ tipo: 'link', url: 'https://drive.google.com/reuniao', autor_email: 'b@x.com' });
    linkId = link.data.item.id;
  });

  it('anexa imagem por multipart e áudio transcrito pela Groq', async () => {
    expect((await multipart(`/api/script/grifos/${grifo.id}/contexto`, 'userA', { tipo: 'imagem' })).data.message).toMatch(/Envie o arquivo/);
    expect((await multipart(`/api/script/grifos/${grifo.id}/contexto`, 'userA', { tipo: 'imagem' }, { name: 'x.txt', type: 'text/plain', content: 'nao' })).data.message).toMatch(/Imagem não aceita/);

    const img = await multipart(`/api/script/grifos/${grifo.id}/contexto`, 'userA', { tipo: 'imagem', legenda: 'print do CRM' }, { name: 'crm.png', type: 'image/png', content: 'PNGDATA' });
    expect(img.status).toBe(200);
    expect(img.data.item).toMatchObject({ tipo: 'imagem', legenda: 'print do CRM', file_name: 'crm.png', file_type: 'image/png' });
    expect(img.data.item.download_url).toBe(`/api/script/context/files/${img.data.item.file_id}/download`);
    imagemId = img.data.item.id; imagemFileId = img.data.item.file_id;

    const audio = await multipart(`/api/script/grifos/${grifo.id}/contexto`, 'userA', { tipo: 'audio' }, { name: 'voz.webm', type: 'audio/webm', content: 'WEBM' });
    expect(audio.status).toBe(200);
    expect(audio.data.item).toMatchObject({ tipo: 'audio', file_name: 'voz.webm', erro_transcricao: null });
    expect(audio.data.item.transcricao).toBe(TRANSCRICAO);
    expect(audio.data.warning).toBeUndefined();
    audioId = audio.data.item.id;

    // o arquivo baixa pela rota que já existia (sócio e worker)
    const down = await fetchOriginal(`${base}/api/script/context/files/${imagemFileId}/download`, { headers: { 'x-user': 'userB' } });
    expect(down.status).toBe(200);
  });

  it('a lista da versao traz `contexto` por grifo; o admin também; outro clube nao ve nada', async () => {
    const lista = await api('GET', '/api/script/versoes/1/grifos', 'userB');
    expect(lista.status).toBe(200);
    expect(lista.data.grifos).toHaveLength(1);
    const g = lista.data.grifos[0];
    expect(g.contexto.map((i) => i.tipo)).toEqual(['nota', 'link', 'imagem', 'audio']);
    expect(g.contexto.find((i) => i.tipo === 'audio').transcricao).toBe(TRANSCRICAO);

    const adm = await api('GET', '/api/admin/clubs/clube-x/script-grifos', 'admin');
    expect(adm.data.grifos[0].contexto).toHaveLength(4);

    expect((await api('GET', '/api/script/versoes/1/grifos', 'userZ')).status).toBe(404);
    expect((await api('POST', `/api/script/grifos/${grifo.id}/contexto`, 'userZ', { tipo: 'nota', texto: 'de fora' })).status).toBe(404);
  });

  it('o contexto da ficha nao se mistura com o anexo do grifo (mesma tabela, `grifo_id` separa)', async () => {
    const daFicha = await multipart('/api/script/context', 'userA', { field_key: '3.3', tipo: 'nota', texto: 'contexto da pergunta 3.3' });
    expect(daFicha.status).toBe(200);
    const ctx = await api('GET', '/api/script/context', 'userA');
    expect(ctx.data.items.map((i) => i.id)).toEqual([daFicha.data.item.id]);
    expect(Object.keys(ctx.data.por_campo)).toEqual(['3.3']);
    const ficha = await api('GET', '/api/script/ficha', 'userA');
    const campos = ficha.data.data.blocos.flatMap((b) => b.campos);
    expect(campos.find((c) => c.key === '3.3').contexto_count).toBe(1);
    // o worker vê o contexto da ficha sem os anexos do grifo
    const job = await api('POST', '/api/script/ficha/refinar', 'userA', { field_key: '3.3' });
    const visao = await worker('GET', `/api/jobs/${job.data.job.id}/ficha`);
    expect(Object.keys(visao.data.contexto)).toEqual(['3.3']);
    expect(visao.data.contexto['3.3']).toHaveLength(1);
  });

  it('so quem anexou apaga (403 para o socio); 404 fora do clube ou com id errado', async () => {
    expect((await api('DELETE', `/api/script/grifos/${grifo.id}/contexto/${notaId}`, 'userB')).status).toBe(403);
    expect((await api('DELETE', `/api/script/grifos/${grifo.id}/contexto/${linkId}`, 'userA')).status).toBe(403);
    expect((await api('DELETE', `/api/script/grifos/${grifo.id}/contexto/ctx-nao-existe`, 'userA')).status).toBe(404);
    expect((await api('DELETE', `/api/script/grifos/${grifo.id}/contexto/${notaId}`, 'userZ')).status).toBe(404);

    const del = await api('DELETE', `/api/script/grifos/${grifo.id}/contexto/${imagemId}`, 'userA');
    expect(del.status).toBe(200);
    expect(del.data).toMatchObject({ grifo_id: grifo.id, id: imagemId });
    const lista = await api('GET', '/api/script/versoes/1/grifos', 'userA');
    expect(lista.data.grifos[0].contexto.map((i) => i.tipo)).toEqual(['nota', 'link', 'audio']);
    // o arquivo da imagem foi junto
    expect((await fetchOriginal(`${base}/api/script/context/files/${imagemFileId}/download`, { headers: { 'x-user': 'userA' } })).status).toBe(404);
  });
});

describe('pedir nova versao: os anexos entram no comentario do grifo', () => {
  it('o texto do comentario leva a transcricao do audio, o link e a nota', async () => {
    const r = await api('POST', '/api/script/versoes/1/revisar', 'userA', {});
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ versao: 1, comentarios: 1, grifos: 1 });
    const raw = await worker('GET', `/api/jobs/${r.data.job.id}`);
    const [comentario] = raw.data.job.payload.comentarios;
    expect(comentario.passo).toBe(1);
    expect(comentario.texto).toBe(
      `[GRIFO ajustar] «${TRECHO}» → dizer o nome dele antes · anexos: nota ("Ele repete: "quanto custa?" antes de eu terminar"), `
      + `link (https://drive.google.com/reuniao), áudio (transcrição: "${TRANSCRICAO}")`
    );
    expect(raw.data.job.payload.grifos).toEqual({ total: 1, ajustar: 1, manter: 0, tirar: 0 });
    // o worker lê o mesmo texto pelos comentários da versão base
    const versao = await worker('GET', `/api/jobs/${r.data.job.id}/script/1`);
    expect(versao.data.comentarios[0].texto).toContain(`anexos: nota (`);
    expect(versao.data.comentarios[0].texto).toContain(TRANSCRICAO);
  });

  it('o servidor troca o texto que o front mandou pelo que tem os anexos de agora (sem duplicar)', async () => {
    const semAnexos = { passo: 1, texto: `[GRIFO ajustar] «${TRECHO}» → dizer o nome dele antes` };
    const r = await api('POST', '/api/script/versoes/1/revisar', 'userB', { comentarios: [semAnexos] });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ comentarios: 1, grifos: 1, job: { existing: true } });
    expect((await api('GET', '/api/script/versoes/1/comentarios', 'userA')).data.comentarios).toHaveLength(1);
  });
});

describe('apagar o grifo leva os anexos junto', () => {
  it('DELETE do grifo limpa script_field_context e os arquivos', async () => {
    grifoBeto = (await api('POST', '/api/script/versoes/1/grifos', 'userB', { passo: 3, texto: 'Uma pergunta por vez; desejo antes da dor.', cor: 'verde' })).data.grifo;
    const anexo = await multipart(`/api/script/grifos/${grifoBeto.id}/contexto`, 'userB', { tipo: 'imagem', legenda: 'quadro' }, { name: 'quadro.png', type: 'image/png', content: 'PNG2' });
    expect(anexo.status).toBe(200);
    const fileId = anexo.data.item.file_id;
    expect((await dbAll('SELECT id FROM script_field_context WHERE grifo_id = ?', [grifoBeto.id]))).toHaveLength(1);

    expect((await api('DELETE', `/api/script/grifos/${grifoBeto.id}`, 'userB')).status).toBe(200);
    expect((await dbAll('SELECT id FROM script_field_context WHERE grifo_id = ?', [grifoBeto.id]))).toHaveLength(0);
    expect(await dbGet('SELECT id FROM uploaded_files WHERE id = ?', [fileId])).toBeUndefined();
    // o do outro grifo continua de pé
    expect((await api('GET', '/api/script/versoes/1/grifos', 'userA')).data.grifos[0].contexto).toHaveLength(3);
  });
});
