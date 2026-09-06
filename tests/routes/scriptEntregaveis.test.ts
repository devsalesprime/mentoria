// @ts-nocheck
/** @vitest-environment node */
/**
 * Apresentacao comercial (entregavel `slides` de uma versao do script), com os routers reais em sqlite :memory:
 * e arquivos numa pasta temporaria:
 * - membro pede a apresentacao (POST /api/script/versoes/:versao/slides): job `slides` com o payload do contrato
 *   ({ versao, content_md, club_slug, nome_clube, email, notify_phone, aprovada, ficha_md }); 1 ativo por clube + versao
 * - aprovar a versao (POST .../aprovar) tambem enfileira; pedir de novo devolve o mesmo job
 * - worker publica em PUT /api/jobs/:id/entregavel (multipart): 200, publicar de novo substitui, 401 sem token, 404 sem job
 * - membro lista e baixa (sem caminho de disco); membro de outro clube nao ve; sem cohort e 403
 * - admin: "Gerar slides" mesmo com a versao em rascunho, lista e download
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
import VM from '../../utils/validation-materials.cjs';
import SV from '../../utils/script-versions.cjs';
import SUF from '../../utils/suficiencia.cjs';

const TOKEN = 'token-da-fila-de-entregaveis';
const MD_V1 = '# Script v1\n\n## Passo 1: Conexão\n\n"Prazer, eu sou o Rafael."\n';
let server; let base; let tmpDir; let dataDir; let dbRun;

function safeJsonParse(str, fallback = {}) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

const authMiddleware = (req, res, next) => {
  const id = req.headers['x-user'] || req.query.user;
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
  return { status: res.status, data, text, headers: res.headers };
}

async function worker(method, url, body, token = TOKEN) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

/** PUT /api/jobs/:id/entregavel com multipart (o que a Naia manda). `arquivos` = { campo: [nome, conteudo] }. */
async function publicar(jobId, { tipo = 'slides', versao = 1, meta = null, arquivos = {}, token = TOKEN } = {}) {
  const fd = new FormData();
  if (tipo != null) fd.append('tipo', String(tipo));
  if (versao != null) fd.append('versao', String(versao));
  if (meta) fd.append('meta', JSON.stringify(meta));
  for (const [campo, [nome, conteudo]] of Object.entries(arquivos)) {
    fd.append(campo, new Blob([conteudo]), nome);
  }
  const res = await fetch(`${base}/api/jobs/${jobId}/entregavel`, {
    method: 'PUT',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entregaveis-'));
  dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

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
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('a@x.com', 'clube-x', 'Ana'), ('z@z.com', 'clube-z', 'Zeca')`);
  await dbRun(`INSERT INTO users (id, email, name, role, cohort, club_slug) VALUES
    ('userA', 'a@x.com', 'Ana', 'member', 'exclusive', 'clube-x'),
    ('userZ', 'z@z.com', 'Zeca', 'member', 'exclusive', 'clube-z'),
    ('semCohort', 's@x.com', 'Sem', 'member', NULL, NULL),
    ('admin', 'admin@x.com', 'Admin', 'admin', NULL, NULL)`);

  await VM.ensureCohortJobsTable(dbRun);
  await VM.ensureCohortConfigTable(dbRun);
  await SV.ensureScriptVersionsTables(dbRun);
  await SUF.ensureSuficienciaColumns(dbRun);

  // 2 versoes do clube-x (v1 rascunho, v2 rascunho) e 1 do clube-z
  await dbRun(`INSERT INTO script_versions (id, club_slug, versao, content_md, resumo, status) VALUES
    ('sv-x-1', 'clube-x', 1, ?, 'primeira', 'rascunho'),
    ('sv-x-2', 'clube-x', 2, ?, 'segunda', 'rascunho'),
    ('sv-z-1', 'clube-z', 1, '# Outro clube', '', 'rascunho')`, [MD_V1, MD_V1.replace('v1', 'v2')]);
  // ficha do clube-x com 2 respostas (viram o ficha_md do payload) e um prefill antigo com o WhatsApp do aviso
  await dbRun(`INSERT INTO script_fichas (id, club_slug, fields, materials) VALUES ('ficha-x', 'clube-x', ?, '{"por_pessoa":{}}')`, [
    JSON.stringify({ '1.1': { sugerido: 'Mentoria de gestão', classe: 'Fato', status: 'sugerido' }, '2.1': { valor: 'Sou a Ana', status: 'editado' } }),
  ]);
  await dbRun(`INSERT INTO cohort_jobs (id, tipo, club_slug, email, notify_phone, status, payload)
    VALUES ('job-prefill-a', 'prefill', 'clube-x', 'a@x.com', '5511988887777', 'done', '{}')`);

  const deps = {
    db, ...helpers, authMiddleware, adminMiddleware,
    uuidv4: () => `id-${Math.random().toString(36).slice(2)}`,
    fs, path, safeJsonParse, DATA_DIR: dataDir,
  };
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(createScriptRoutes(deps));
  app.use(createAdminCohortRoutes(deps));
  app.use(createJobsRoutes({ ...deps, COHORT_JOBS_TOKEN: TOKEN, APP_URL: 'https://app.teste.local/' }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let jobSlidesV1;

describe('membro pede a apresentacao comercial', () => {
  it('POST /api/script/versoes/1/slides enfileira o job `slides` com o payload do contrato', async () => {
    const r = await api('POST', '/api/script/versoes/1/slides', 'userA');
    expect(r.status).toBe(200);
    expect(r.data.job.tipo).toBe('slides');
    expect(r.data.job.status).toBe('queued');
    expect(r.data.job.existing).toBe(false);
    jobSlidesV1 = r.data.job.id;

    const j = await worker('GET', `/api/jobs/${jobSlidesV1}`);
    expect(j.status).toBe(200);
    const p = j.data.job.payload;
    expect(p.versao).toBe(1);
    expect(p.content_md).toContain('## Passo 1: Conexão');
    expect(p.club_slug).toBe('clube-x');
    expect(p.nome_clube).toBe('Clube X');
    expect(p.email).toBe('a@x.com');
    expect(p.aprovada).toBe(false);
    // notify_phone vem do ultimo prefill da pessoa
    expect(p.notify_phone).toBe('5511988887777');
    expect(j.data.job.notify_phone).toBe('5511988887777');
    // ficha_md = "- chave · pergunta · valor", so os campos respondidos
    expect(p.ficha_md).toContain('- 1.1 · ');
    expect(p.ficha_md).toContain('· Mentoria de gestão');
    expect(p.ficha_md).toContain('- 2.1 · ');
    expect(p.ficha_md).toContain('· Sou a Ana');
    expect(p.ficha_md).not.toContain('- 3.1 ·');
  });

  it('pedir de novo a mesma versao devolve o job que ja esta na fila (1 por clube + versao)', async () => {
    const r = await api('POST', '/api/script/versoes/1/slides', 'userA');
    expect(r.status).toBe(200);
    expect(r.data.job.existing).toBe(true);
    expect(r.data.job.id).toBe(jobSlidesV1);
  });

  it('versao inexistente devolve 404 e versao invalida 400', async () => {
    expect((await api('POST', '/api/script/versoes/9/slides', 'userA')).status).toBe(404);
    expect((await api('POST', '/api/script/versoes/0/slides', 'userA')).status).toBe(400);
    expect((await api('POST', '/api/script/versoes/1/slides', 'semCohort')).status).toBe(403);
  });
});

describe('PUT /api/jobs/:id/entregavel (o worker publica)', () => {
  it('401 sem o token da fila e 404 quando o job nao existe', async () => {
    const semToken = await publicar(jobSlidesV1, { arquivos: { pptx: ['a.pptx', 'x'] }, token: '' });
    expect(semToken.status).toBe(401);
    const errado = await publicar(jobSlidesV1, { arquivos: { pptx: ['a.pptx', 'x'] }, token: 'token-errado' });
    expect(errado.status).toBe(401);
    const semJob = await publicar('job-que-nao-existe', { arquivos: { pptx: ['a.pptx', 'x'] } });
    expect(semJob.status).toBe(404);
  });

  it('grava pptx, pdf, notas e contato em DATA_DIR/entregaveis/<clube>/v1/slides e devolve a lista', async () => {
    const r = await publicar(jobSlidesV1, {
      versao: 1,
      meta: { slides: 12, gerado_por: 'naia' },
      arquivos: {
        pptx: ['apresentação comercial.pptx', 'PPTX-ORIGINAL'],
        pdf: ['apresentacao.pdf', '%PDF-1.4 original'],
        notas: ['notas.md', '# Notas\n\nFala do passo 1.'],
        contact: ['contato.png', 'PNG-BYTES'],
      },
    });
    expect(r.status).toBe(200);
    expect(r.data.entregavel.tipo).toBe('slides');
    expect(r.data.entregavel.versao).toBe(1);
    expect(r.data.entregavel.arquivos.map((a) => a.campo).sort()).toEqual(['contact', 'notas', 'pdf', 'pptx']);
    // nome seguro (sem acento nem espaco) e tamanho em bytes
    expect(r.data.entregavel.arquivos.find((a) => a.campo === 'pptx').nome).toBe('apresentacao-comercial.pptx');
    expect(r.data.entregavel.arquivos.find((a) => a.campo === 'pptx').bytes).toBe('PPTX-ORIGINAL'.length);
    expect(r.text).not.toContain(dataDir);

    const dir = path.join(dataDir, 'entregaveis', 'clube-x', 'v1', 'slides');
    expect(fs.readdirSync(dir).sort()).toEqual(['contact.png', 'notas.md', 'pdf.pdf', 'pptx.pptx']);
    expect(fs.readFileSync(path.join(dir, 'pptx.pptx'), 'utf8')).toBe('PPTX-ORIGINAL');
  });

  it('publicar de novo a mesma versao substitui os arquivos e a linha (idempotente)', async () => {
    const r = await publicar(jobSlidesV1, {
      versao: 1,
      arquivos: { pptx: ['nova.pptx', 'PPTX-NOVO'], pdf: ['nova.pdf', '%PDF-1.4 novo'] },
    });
    expect(r.status).toBe(200);
    expect(r.data.entregavel.arquivos.map((a) => a.campo).sort()).toEqual(['pdf', 'pptx']);
    const dir = path.join(dataDir, 'entregaveis', 'clube-x', 'v1', 'slides');
    expect(fs.readFileSync(path.join(dir, 'pptx.pptx'), 'utf8')).toBe('PPTX-NOVO');
    // o que saiu do entregavel sai do disco
    expect(fs.existsSync(path.join(dir, 'notas.md'))).toBe(false);
    // continua 1 linha por (clube, versao, tipo)
    const lista = await api('GET', '/api/script/versoes/1/entregaveis', 'userA');
    expect(lista.data.entregaveis).toHaveLength(1);
  });

  it('recusa arquivo com extensao errada, campo desconhecido, sem arquivo e meta que nao e JSON', async () => {
    const ext = await publicar(jobSlidesV1, { arquivos: { pptx: ['errado.zip', 'x'] } });
    expect(ext.status).toBe(400);
    expect(ext.data.message).toContain('.pptx');
    const desconhecido = await publicar(jobSlidesV1, { arquivos: { planilha: ['a.xlsx', 'x'] } });
    expect(desconhecido.status).toBe(400);
    const semArquivo = await publicar(jobSlidesV1, { arquivos: {} });
    expect(semArquivo.status).toBe(400);
    const semVersao = await publicar(jobSlidesV1, { versao: null, arquivos: { pptx: ['a.pptx', 'x'] } });
    expect(semVersao.status).toBe(400);

    const fd = new FormData();
    fd.append('tipo', 'slides');
    fd.append('versao', '1');
    fd.append('meta', 'isso não é json');
    fd.append('pptx', new Blob(['x']), 'a.pptx');
    const res = await fetch(`${base}/api/jobs/${jobSlidesV1}/entregavel`, { method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}` }, body: fd });
    expect(res.status).toBe(400);
  });
});

describe('membro le e baixa a apresentacao', () => {
  it('GET .../entregaveis lista campo, nome, bytes e url, sem caminho de disco', async () => {
    const r = await api('GET', '/api/script/versoes/1/entregaveis', 'userA');
    expect(r.status).toBe(200);
    const e = r.data.entregaveis[0];
    expect(e.tipo).toBe('slides');
    expect(e.arquivos[0]).toEqual(expect.objectContaining({ campo: 'pptx', nome: 'nova.pptx', bytes: 'PPTX-NOVO'.length }));
    expect(e.arquivos[0].url).toBe('/api/script/versoes/1/entregaveis/slides/pptx');
    expect(r.text).not.toContain('path');
    expect(r.text).not.toContain(dataDir);
  });

  it('a versao ja vem com `entregaveis` e `slides_job` (a tela nao precisa de outra chamada)', async () => {
    const lista = await api('GET', '/api/script/versoes', 'userA');
    const v1 = lista.data.versoes.find((v) => v.versao === 1);
    expect(v1.entregaveis).toHaveLength(1);
    expect(v1.slides_job.tipo).toBe('slides');
    const uma = await api('GET', '/api/script/versoes/1', 'userA');
    expect(uma.data.versao.entregaveis[0].arquivos.map((a) => a.campo)).toContain('pdf');
    // e GET /api/script/ficha traz o mapa por versao
    const ficha = await api('GET', '/api/script/ficha', 'userA');
    expect(ficha.data.data.script.entregaveis['1']).toHaveLength(1);
  });

  it('baixa o arquivo (attachment) e o contato abre no navegador (inline)', async () => {
    const r = await fetch(`${base}/api/script/versoes/1/entregaveis/slides/pptx`, { headers: { 'x-user': 'userA' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toContain('attachment');
    expect(r.headers.get('content-type')).toContain('presentationml');
    expect(await r.text()).toBe('PPTX-NOVO');
    const inline = await fetch(`${base}/api/script/versoes/1/entregaveis/slides/pdf?inline=1`, { headers: { 'x-user': 'userA' } });
    expect(inline.headers.get('content-disposition')).toContain('inline');
    // campo que nao existe neste entregavel
    const naoTem = await api('GET', '/api/script/versoes/1/entregaveis/slides/notas', 'userA');
    expect(naoTem.status).toBe(404);
  });

  it('membro de outro clube nao ve nem baixa; sem cohort e 403', async () => {
    // o clube-z tem uma v1 propria: a lista dele vem vazia e o download nao acha
    const lista = await api('GET', '/api/script/versoes/1/entregaveis', 'userZ');
    expect(lista.status).toBe(200);
    expect(lista.data.entregaveis).toEqual([]);
    expect(lista.text).not.toContain('PPTX-NOVO');
    const download = await api('GET', '/api/script/versoes/1/entregaveis/slides/pptx', 'userZ');
    expect(download.status).toBe(404);
    // versao que so existe no clube-x
    expect((await api('GET', '/api/script/versoes/2/entregaveis', 'userZ')).status).toBe(404);
    // fora do Exclusive
    expect((await api('GET', '/api/script/versoes/1/entregaveis', 'semCohort')).status).toBe(403);
    expect((await api('GET', '/api/script/versoes/1/entregaveis/slides/pptx', 'semCohort')).status).toBe(403);
  });
});

describe('aprovar a versao e o admin', () => {
  it('POST .../aprovar enfileira a apresentacao da versao aprovada (e nao duplica)', async () => {
    const r = await api('POST', '/api/script/versoes/2/aprovar', 'userA');
    expect(r.status).toBe(200);
    expect(r.data.versao.status).toBe('aprovado');
    expect(r.data.slides_job.tipo).toBe('slides');
    expect(r.data.slides_job.existing).toBe(false);
    const jobId = r.data.slides_job.id;

    const j = await worker('GET', `/api/jobs/${jobId}`);
    expect(j.data.job.payload.versao).toBe(2);
    expect(j.data.job.payload.aprovada).toBe(true);

    // aprovar de novo (ou pedir pelo menu) devolve o mesmo job
    const denovo = await api('POST', '/api/script/versoes/2/aprovar', 'userA');
    expect(denovo.data.slides_job.existing).toBe(true);
    expect(denovo.data.slides_job.id).toBe(jobId);
    const pedido = await api('POST', '/api/script/versoes/2/slides', 'userA');
    expect(pedido.data.job.id).toBe(jobId);
    // a v1 continua com o job dela: a deduplicacao e por versao
    expect((await api('POST', '/api/script/versoes/1/slides', 'userA')).data.job.id).toBe(jobSlidesV1);
  });

  it('admin gera slides de uma versao em rascunho e ve os entregaveis do clube', async () => {
    // v1 esta em rascunho e ja tem job ativo: o admin recebe o existente
    const forcado = await api('POST', '/api/admin/clubs/clube-x/script-versoes/1/slides', 'admin');
    expect(forcado.status).toBe(200);
    expect(forcado.data.job.existing).toBe(true);
    expect((await api('POST', '/api/admin/clubs/clube-x/script-versoes/9/slides', 'admin')).status).toBe(404);
    expect((await api('POST', '/api/admin/clubs/clube-x/script-versoes/1/slides', 'userA')).status).toBe(403);

    const lista = await api('GET', '/api/admin/clubs/clube-x/script-versoes/1/entregaveis', 'admin');
    expect(lista.data.entregaveis[0].arquivos[0].url).toBe('/api/admin/clubs/clube-x/script-versoes/1/entregaveis/slides/pptx');
    const bin = await fetch(`${base}/api/admin/clubs/clube-x/script-versoes/1/entregaveis/slides/pptx?user=admin`);
    expect(bin.status).toBe(200);
    expect(await bin.text()).toBe('PPTX-NOVO');

    // o detalhe do clube ja traz entregaveis e slides_job por versao
    const detalhe = await api('GET', '/api/admin/clubs/clube-x/script-ficha', 'admin');
    const v1 = detalhe.data.data.versoes.find((v) => v.versao === 1);
    expect(v1.entregaveis).toHaveLength(1);
    expect(v1.slides_job.status).toBe('queued');
  });
});
