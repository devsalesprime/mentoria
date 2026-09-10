// @ts-nocheck
/** @vitest-environment node */
/**
 * Onda I (SPEC-experiencia-pre-script-v1 §3) em sqlite :memory: com o router real de routes/script.cjs:
 * - GET /api/script/tempos: mediana dos ultimos 20 concluidos por tipo, em minutos, teto para cima, piso de 5
 * - GET /api/script/fila?tipo=: quantos entraram antes e o NOME dos clubes na ordem (decisao D8)
 * - PUT /api/script/visto: marcos por pessoa (como_funciona, whatsapp_lembrete), idempotentes
 * - GET /api/script/amostra: o script de exemplo configurado pelo admin; 404 sem configuracao
 * - GET /api/script/ficha: `visto_como_funciona` e `config.amostra_disponivel`
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import createScriptRoutes from '../../routes/script.cjs';
import createAdminCohortRoutes from '../../routes/admin-cohort.cjs';
import TEMPOS from '../../utils/script-tempos.cjs';
import MARCOS from '../../utils/script-marcos.cjs';

let server; let base; let dbRun; let dbGet; let dbAll;

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

/** Um job concluido com duracao exata em minutos, terminado `haMin` minutos atras. */
async function jobFeito(id, tipo, minutos, haMin, slug = 'clube-a') {
  const fim = new Date(Date.now() - haMin * 60000);
  const inicio = new Date(fim.getTime() - minutos * 60000);
  const iso = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
  await dbRun(
    `INSERT INTO cohort_jobs (id, tipo, club_slug, email, status, attempts, created_at, started_at, finished_at, updated_at)
     VALUES (?, ?, ?, 'a@x.com', 'done', 1, ?, ?, ?, ?)`,
    [id, tipo, slug, iso(inicio), iso(inicio), iso(fim), iso(fim)]
  );
}

/** Um job na fila, criado em `created` (string do sqlite). */
async function jobNaFila(id, tipo, slug, email, created, status = 'queued') {
  await dbRun(
    `INSERT INTO cohort_jobs (id, tipo, club_slug, email, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, tipo, slug, email, status, created, created]
  );
}

beforeAll(async () => {
  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbRun = helpers.dbRun; dbGet = helpers.dbGet; dbAll = helpers.dbAll;
  const ddl = [
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'member', cohort TEXT, club_slug TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL,
       file_type TEXT, file_size INTEGER, url TEXT, module TEXT DEFAULT 'general', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_clubs (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, produto TEXT NOT NULL DEFAULT 'exclusive', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    // cohort_members SEM as colunas novas: o ALTER idempotente da 027 as cria ao subir o router
    `CREATE TABLE cohort_members (email TEXT PRIMARY KEY, club_slug TEXT NOT NULL, nome TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', materials JSON NOT NULL DEFAULT '{}',
       materials_status TEXT NOT NULL DEFAULT 'pending', materials_submitted_at DATETIME, ficha_status TEXT NOT NULL DEFAULT 'vazia', prefill_meta JSON,
       prefilled_at DATETIME, reviewed_at DATETIME, last_user_activity_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const s of ddl) await dbRun(s);
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES
    ('clube-a', 'Ceramfix', 1), ('clube-b', 'Laser Tech', 1), ('clube-c', 'Elos Club', 1), ('amostra-clube', 'Clube Exemplo', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES
    ('a@x.com', 'clube-a', 'Ana'), ('b@x.com', 'clube-b', 'Bruno'), ('c@x.com', 'clube-c', 'Caio')`);
  await dbRun(`INSERT INTO users (id, email, name, cohort, club_slug) VALUES
    ('userA', 'a@x.com', 'Ana', 'exclusive', 'clube-a'),
    ('userB', 'b@x.com', 'Bruno', 'exclusive', 'clube-b'),
    ('userC', 'c@x.com', 'Caio', 'exclusive', 'clube-c'),
    ('userD', 'd@x.com', 'Dora', 'exclusive', 'clube-a')`);

  const deps = { db, ...helpers, authMiddleware, adminMiddleware, uuidv4: () => `id-${Math.random().toString(36).slice(2)}`, fs, path, safeJsonParse };
  const app = express();
  app.use(express.json());
  app.use(createScriptRoutes(deps));
  app.use(createAdminCohortRoutes(deps));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  // os DDL idempotentes (cohort_jobs, script_versions, cohort_config, marcos) rodam fora do await
  await new Promise((r) => setTimeout(r, 120));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('medianaMinutos: o numero que a copy pode prometer', () => {
  it('mediana, nao media: um job preso nao empurra a promessa', () => {
    const min = (m) => m * 60000;
    expect(TEMPOS.medianaMinutos([min(10), min(12), min(600)])).toBe(12);
  });

  it('arredonda para cima e respeita o piso de 5 min', () => {
    expect(TEMPOS.medianaMinutos([12.2 * 60000])).toBe(13);
    expect(TEMPOS.medianaMinutos([30000, 40000, 50000])).toBe(5);
    expect(TEMPOS.medianaMinutos([])).toBeNull();
    expect(TEMPOS.medianaMinutos([NaN, -5])).toBeNull();
  });

  it('lista par: a media dos dois do meio', () => {
    expect(TEMPOS.medianaMinutos([6 * 60000, 10 * 60000, 20 * 60000, 30 * 60000])).toBe(15);
  });
});

describe('GET /api/script/tempos', () => {
  it('sem historico: mediana null e n = 0 (a tela sai sem numero)', async () => {
    const r = await api('GET', '/api/script/tempos', 'userA');
    expect(r.status).toBe(200);
    expect(r.data.tempos.prefill).toEqual({ mediana_min: null, n: 0 });
    expect(r.data.tempos.script).toEqual({ mediana_min: null, n: 0 });
    expect(Object.keys(r.data.tempos).sort()).toEqual(['prefill', 'refinar', 'script', 'slides']);
  });

  it('so entram os `done` com comeco E fim; a mediana sai em minutos', async () => {
    await jobFeito('p1', 'prefill', 10, 60);
    await jobFeito('p2', 'prefill', 20, 50);
    await jobFeito('p3', 'prefill', 30, 40);
    // requeue zera o started_at: nao pode contar
    await dbRun(`INSERT INTO cohort_jobs (id, tipo, club_slug, email, status, attempts, finished_at) VALUES ('p4', 'prefill', 'clube-a', 'a@x.com', 'done', 2, CURRENT_TIMESTAMP)`);
    // job com erro tambem fica de fora
    await dbRun(`INSERT INTO cohort_jobs (id, tipo, club_slug, email, status, attempts, started_at, finished_at) VALUES ('p5', 'prefill', 'clube-a', 'a@x.com', 'error', 1, '2026-09-01 10:00:00', '2026-09-01 18:00:00')`);
    const r = await api('GET', '/api/script/tempos', 'userA');
    expect(r.data.tempos.prefill).toEqual({ mediana_min: 20, n: 3 });
  });

  it('`script` e `revisar` contam juntos: os dois escrevem a proxima versao', async () => {
    await jobFeito('s1', 'script', 40, 30);
    await jobFeito('s2', 'revisar', 60, 20);
    const r = await api('GET', '/api/script/tempos', 'userA');
    expect(r.data.tempos.script).toEqual({ mediana_min: 50, n: 2 });
  });

  it('so os 20 mais recentes por `finished_at` entram na conta', async () => {
    for (let i = 0; i < 25; i += 1) await jobFeito(`r-antigo-${i}`, 'refinar', 100, 5000 + i);
    for (let i = 0; i < 20; i += 1) await jobFeito(`r-novo-${i}`, 'refinar', 7, i + 1);
    const r = await api('GET', '/api/script/tempos', 'userA');
    expect(r.data.tempos.refinar).toEqual({ mediana_min: 7, n: 20 });
  });

  it('exige login e cohort', async () => {
    expect((await api('GET', '/api/script/tempos', null)).status).toBe(401);
  });
});

describe('GET /api/script/fila', () => {
  beforeAll(async () => {
    // A fila do prefill, em ordem de entrada: Ceramfix, Laser Tech e, por ultimo, o Elos Club (userC)
    await jobNaFila('f1', 'prefill', 'clube-a', 'a@x.com', '2026-09-07 10:00:00', 'running');
    await jobNaFila('f2', 'prefill', 'clube-b', 'b@x.com', '2026-09-07 10:05:00');
    await jobNaFila('f3', 'prefill', 'clube-c', 'c@x.com', '2026-09-07 10:09:00');
  });

  it('conta quem entrou antes e devolve o NOME dos clubes na ordem (D8)', async () => {
    const r = await api('GET', '/api/script/fila?tipo=prefill', 'userC');
    expect(r.status).toBe(200);
    expect(r.data.na_frente).toBe(2);
    expect(r.data.clubes).toEqual(['Ceramfix', 'Laser Tech']);
    expect(r.data.tem_job).toBe(true);
    expect(r.data.status).toBe('queued');
  });

  it('quem esta na frente de todo mundo tem a fila vazia e o proprio status', async () => {
    const r = await api('GET', '/api/script/fila?tipo=prefill', 'userA');
    expect(r.data.na_frente).toBe(0);
    expect(r.data.clubes).toEqual([]);
    expect(r.data.status).toBe('running');
  });

  it('sem trabalho proprio na fila: tem_job false e nada de contagem', async () => {
    const r = await api('GET', '/api/script/fila?tipo=script', 'userA');
    expect(r.data).toMatchObject({ na_frente: 0, clubes: [], tem_job: false, status: null });
  });

  it('a fila do script conta `revisar` junto e nunca repete o nome do mesmo clube', async () => {
    await jobNaFila('g1', 'script', 'clube-a', 'a@x.com', '2026-09-07 11:00:00', 'running');
    await jobNaFila('g2', 'revisar', 'clube-a', 'a@x.com', '2026-09-07 11:01:00');
    await jobNaFila('g3', 'script', 'clube-b', 'b@x.com', '2026-09-07 11:02:00');
    await jobNaFila('g4', 'script', 'clube-c', 'c@x.com', '2026-09-07 11:03:00');
    const r = await api('GET', '/api/script/fila?tipo=script', 'userC');
    expect(r.data.na_frente).toBe(3);
    expect(r.data.clubes).toEqual(['Ceramfix', 'Laser Tech']);
  });

  it('tipo desconhecido: 400', async () => {
    const r = await api('GET', '/api/script/fila?tipo=slides', 'userA');
    expect(r.status).toBe(400);
  });
});

describe('PUT /api/script/visto (marcos por pessoa)', () => {
  it('a ficha comeca com visto_como_funciona null e a marca fica gravada', async () => {
    const antes = await api('GET', '/api/script/ficha', 'userB');
    expect(antes.data.data.visto_como_funciona).toBeNull();
    expect(antes.data.data.visto_whatsapp_lembrete).toBeNull();

    const put = await api('PUT', '/api/script/visto', 'userB', { marco: 'como_funciona' });
    expect(put.status).toBe(200);
    expect(put.data.marcos.como_funciona).toBeTruthy();

    const depois = await api('GET', '/api/script/ficha', 'userB');
    expect(depois.data.data.visto_como_funciona).toBeTruthy();
    // outra pessoa nao herda a marca: ela e por pessoa, nao por clube
    expect((await api('GET', '/api/script/ficha', 'userC')).data.data.visto_como_funciona).toBeNull();
  });

  it('regravar mantem a primeira data (idempotente)', async () => {
    const primeira = (await api('PUT', '/api/script/visto', 'userB', { marco: 'como_funciona' })).data.marcos.como_funciona;
    const segunda = (await api('PUT', '/api/script/visto', 'userB', { marco: 'como_funciona' })).data.marcos.como_funciona;
    expect(segunda).toBe(primeira);
  });

  it('marca de tela vista NUNCA cria linha em cohort_members (a lista que libera login)', async () => {
    // Dora entra pelo users.club_slug, sem estar na lista do clube
    const antes = await dbAll(`SELECT email FROM cohort_members`);
    const put = await api('PUT', '/api/script/visto', 'userD', { marco: 'como_funciona' });
    expect(put.status).toBe(200);
    expect(put.data.gravado).toBe(false);
    const depois = await dbAll(`SELECT email FROM cohort_members`);
    expect(depois.map((r) => r.email).sort()).toEqual(antes.map((r) => r.email).sort());
    expect(await dbGet(`SELECT email FROM cohort_members WHERE email = 'd@x.com'`)).toBeFalsy();
    // sem linha, a marca nao persiste: a tela volta na proxima visita
    expect((await api('GET', '/api/script/ficha', 'userD')).data.data.visto_como_funciona).toBeNull();
  });

  it('marcarMarco direto: e-mail fora da lista nao insere nada e devolve gravado false', async () => {
    const r = await MARCOS.marcarMarco({ dbRun }, { email: 'ninguem@x.com', marco: 'como_funciona' });
    expect(r).toEqual({ gravado: false });
    expect(await dbGet(`SELECT email FROM cohort_members WHERE email = 'ninguem@x.com'`)).toBeFalsy();
    expect(await MARCOS.marcarMarco({ dbRun }, { email: 'a@x.com', marco: 'marco_que_nao_existe' })).toBeNull();
  });

  it('o lembrete do WhatsApp tem marca propria e recusa marco desconhecido', async () => {
    const put = await api('PUT', '/api/script/visto', 'userB', { marco: 'whatsapp_lembrete' });
    expect(put.data.marcos.whatsapp_lembrete).toBeTruthy();
    expect((await api('GET', '/api/script/ficha', 'userB')).data.data.visto_whatsapp_lembrete).toBeTruthy();
    expect((await api('PUT', '/api/script/visto', 'userB', { marco: 'outra_coisa' })).status).toBe(400);
  });
});

describe('GET /api/script/amostra', () => {
  it('sem configuracao: 404 e a ficha diz que nao ha amostra', async () => {
    const r = await api('GET', '/api/script/amostra', 'userA');
    expect(r.status).toBe(404);
    expect((await api('GET', '/api/script/ficha', 'userA')).data.data.config.amostra_disponivel).toBe(false);
  });

  it('configurada: devolve o conteudo da versao daquele clube e a ficha passa a oferecer o exemplo', async () => {
    await dbRun(
      `INSERT INTO script_versions (id, club_slug, versao, status, content_md, resumo, meta, created_at)
       VALUES ('v-amostra', 'amostra-clube', 5, 'aprovado', '# Script de exemplo', 'resumo', '{}', CURRENT_TIMESTAMP)`
    );
    await dbRun(
      `INSERT INTO cohort_config (key, value) VALUES ('amostra_script', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [JSON.stringify({ club_slug: 'amostra-clube', versao: 5 })]
    );
    const r = await api('GET', '/api/script/amostra', 'userA');
    expect(r.status).toBe(200);
    expect(r.data.amostra).toMatchObject({ club_slug: 'amostra-clube', club_nome: 'Clube Exemplo', versao: 5 });
    expect(r.data.amostra.content_md).toContain('Script de exemplo');
    const ficha = await api('GET', '/api/script/ficha', 'userA');
    expect(ficha.data.data.config.amostra_disponivel).toBe(true);
    // o clube e a versao da amostra nunca vao para a tela do membro
    expect(JSON.stringify(ficha.data.data.config)).not.toContain('amostra-clube');
  });

  it('configuracao apontando para versao que nao existe: 404', async () => {
    await dbRun(`UPDATE cohort_config SET value = ? WHERE key = 'amostra_script'`, [JSON.stringify({ club_slug: 'amostra-clube', versao: 99 })]);
    expect((await api('GET', '/api/script/amostra', 'userA')).status).toBe(404);
    await dbRun(`UPDATE cohort_config SET value = '' WHERE key = 'amostra_script'`);
    expect((await api('GET', '/api/script/amostra', 'userA')).status).toBe(404);
  });
});

describe('PUT /api/admin/cohort/config: o corpo e parcial', () => {
  it('salvar so a amostra nao apaga o prazo, e salvar so o prazo nao apaga a amostra', async () => {
    const amostra = JSON.stringify({ club_slug: 'amostra-clube', versao: 5 });
    await api('PUT', '/api/admin/cohort/config', 'admin', { prazo_materiais: 'até sexta, 12/09' });
    await api('PUT', '/api/admin/cohort/config', 'admin', { amostra_script: amostra });

    // o prazo sobreviveu ao salvamento da amostra (era o bug: `.default('')` zerava a chave ausente)
    let cfg = (await api('GET', '/api/admin/cohort/config', 'admin')).data.data;
    expect(cfg.prazo_materiais).toBe('até sexta, 12/09');
    expect(cfg.amostra_script).toBe(amostra);

    // e o caminho simetrico: salvar so o prazo mantem a amostra
    await api('PUT', '/api/admin/cohort/config', 'admin', { prazo_materiais: 'até 20/09' });
    cfg = (await api('GET', '/api/admin/cohort/config', 'admin')).data.data;
    expect(cfg.prazo_materiais).toBe('até 20/09');
    expect(cfg.amostra_script).toBe(amostra);
  });

  it('string vazia continua limpando de proposito, uma chave por vez', async () => {
    await api('PUT', '/api/admin/cohort/config', 'admin', { amostra_script: '' });
    const cfg = (await api('GET', '/api/admin/cohort/config', 'admin')).data.data;
    expect(cfg.amostra_script).toBe('');
    expect(cfg.prazo_materiais).toBe('até 20/09');
    expect((await api('GET', '/api/script/ficha', 'userA')).data.data.config.amostra_disponivel).toBe(false);
  });
});
