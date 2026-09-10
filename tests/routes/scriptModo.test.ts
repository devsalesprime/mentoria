// @ts-nocheck
/** @vitest-environment node */
/**
 * Caminho escolhido na entrada (SPEC-workflow-v2-decisoes-06-09 §1, decisoes 1 e 2) em sqlite :memory'
 * com o router real de routes/script.cjs:
 * - GET /api/script/ficha devolve `modo` (null antes da escolha) e marca `essencial` em cada campo
 * - PUT /api/script/ficha/modo grava 'essencial' | 'completo' (coluna criada pelo ALTER idempotente da 023)
 * - POST /api/script/ficha/materials/skip ("Nao tenho materiais, ir para a ficha") marca skipped
 *   POR PESSOA, sem enfileirar leitura de material nenhuma, e guarda o WhatsApp SO com a permissao marcada
 * - PUT /api/script/ficha/notify-phone grava o mesmo WhatsApp fora do envio (fim da ficha), tambem so com permissao
 * - POST /api/script/ficha/complete no modo essencial fecha com as perguntas essenciais; no completo, 400 com `faltam`
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import createScriptRoutes from '../../routes/script.cjs';
import SF from '../../utils/script-ficha.cjs';

let server; let base; let dbRun; let dbGet; let dbAll;

function safeJsonParse(str, fallback = {}) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

const authMiddleware = (req, res, next) => {
  const id = req.headers['x-user'];
  if (!id) return res.status(401).json({ success: false });
  req.user = { userId: id, role: 'member' };
  next();
};

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

/** Decide (status `editado`) as chaves pedidas direto na linha da ficha, como se o mentor tivesse respondido. */
async function responder(slug, keys) {
  const row = await dbGet(`SELECT fields FROM script_fichas WHERE club_slug = ?`, [slug]);
  const fields = SF.normalizeFields(safeJsonParse(row ? row.fields : '{}', {}));
  for (const k of keys) {
    fields[k] = { ...fields[k], status: 'editado', valor: `resposta de ${k}`, atualizado_por: 'teste', atualizado_em: new Date().toISOString() };
  }
  await dbRun(`UPDATE script_fichas SET fields = ? WHERE club_slug = ?`, [JSON.stringify(fields), slug]);
}

beforeAll(async () => {
  const db = new sqlite3.Database(':memory:');
  const helpers = createDbHelpers(db);
  dbRun = helpers.dbRun; dbGet = helpers.dbGet; dbAll = helpers.dbAll;
  const ddl = [
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'member', cohort TEXT, club_slug TEXT,
       last_login_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL,
       file_type TEXT, file_size INTEGER, url TEXT, module TEXT DEFAULT 'general', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_clubs (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, produto TEXT NOT NULL DEFAULT 'exclusive', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE cohort_members (email TEXT PRIMARY KEY, club_slug TEXT NOT NULL, nome TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    // script_fichas SEM as colunas novas: os ALTER idempotentes (020 e 023) criam suficiencia, confirmada_por e modo
    `CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', materials JSON NOT NULL DEFAULT '{}',
       materials_status TEXT NOT NULL DEFAULT 'pending', materials_submitted_at DATETIME, ficha_status TEXT NOT NULL DEFAULT 'vazia', prefill_meta JSON,
       prefilled_at DATETIME, reviewed_at DATETIME, last_user_activity_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const s of ddl) await dbRun(s);
  await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES ('clube-e', 'Clube Essencial', 1), ('clube-c', 'Clube Completo', 1), ('clube-s', 'Clube Skip', 1)`);
  await dbRun(`INSERT INTO cohort_members (email, club_slug, nome) VALUES ('e@x.com', 'clube-e', 'Elis'), ('c@x.com', 'clube-c', 'Caio'), ('s@x.com', 'clube-s', 'Sara')`);
  await dbRun(`INSERT INTO users (id, email, name, cohort, club_slug) VALUES
    ('userE', 'e@x.com', 'Elis', 'exclusive', 'clube-e'),
    ('userC', 'c@x.com', 'Caio', 'exclusive', 'clube-c'),
    ('userS', 's@x.com', 'Sara', 'exclusive', 'clube-s')`);

  const deps = { db, ...helpers, authMiddleware, adminMiddleware: (req, res, next) => next(), uuidv4: () => `id-${Math.random().toString(36).slice(2)}`, fs, path, safeJsonParse };
  const app = express();
  app.use(express.json());
  app.use(createScriptRoutes(deps));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  // os ALTER idempotentes rodam fora do await da criacao do router
  await new Promise((r) => setTimeout(r, 60));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('as perguntas essenciais', () => {
  it('a ficha essencial e um subconjunto da completa: mesmas chaves, todas existentes na ficha de 34', () => {
    expect(SF.ESSENCIAL_KEYS.length).toBeGreaterThan(0);
    for (const k of SF.ESSENCIAL_KEYS) expect(SF.FIELD_KEYS).toContain(k);
    // as perguntas essenciais do refino (algumas valem duas chaves)
    expect(SF.ESSENCIAL_KEYS).toEqual([
      '2.1', '2.2', '3.1', '3.3', '3.4', '3.9', '4.1', '4.2', '5.1', '5.2', '5.3', '5.4', '6.2', '6.3', '6.5', '6.6',
    ]);
  });

  it('missingPorModo: no essencial so as 12 seguram a ficha; no completo, os obrigatorios', () => {
    const vazia = {};
    expect(SF.missingPorModo(vazia, 'essencial')).toEqual(SF.ESSENCIAL_KEYS);
    expect(SF.missingPorModo(vazia, 'completo')).toEqual(SF.REQUIRED_KEYS);
    // sem modo (fichas antigas) vale 'completo'
    expect(SF.missingPorModo(vazia, null)).toEqual(SF.REQUIRED_KEYS);
  });
});

describe('PUT /api/script/ficha/modo', () => {
  it('GET devolve modo null antes da escolha e marca `essencial` em cada campo', async () => {
    const r = await api('GET', '/api/script/ficha', 'userE');
    expect(r.status).toBe(200);
    expect(r.data.data.modo).toBeNull();
    const campos = r.data.data.blocos.flatMap((b) => b.campos);
    expect(campos.filter((c) => c.essencial).map((c) => c.key)).toEqual(SF.ESSENCIAL_KEYS);
  });

  it('grava a escolha e o GET passa a devolver o modo', async () => {
    const put = await api('PUT', '/api/script/ficha/modo', 'userE', { modo: 'essencial' });
    expect(put.status).toBe(200);
    expect(put.data.modo).toBe('essencial');
    const r = await api('GET', '/api/script/ficha', 'userE');
    expect(r.data.data.modo).toBe('essencial');
    // trocar para o completo e permitido (aprofundar): nada se perde
    const troca = await api('PUT', '/api/script/ficha/modo', 'userE', { modo: 'completo' });
    expect(troca.status).toBe(200);
    expect((await api('GET', '/api/script/ficha', 'userE')).data.data.modo).toBe('completo');
    await api('PUT', '/api/script/ficha/modo', 'userE', { modo: 'essencial' });
  });

  it('modo desconhecido: 400 e a escolha anterior fica', async () => {
    const r = await api('PUT', '/api/script/ficha/modo', 'userE', { modo: 'resumido' });
    expect(r.status).toBe(400);
    expect((await api('GET', '/api/script/ficha', 'userE')).data.data.modo).toBe('essencial');
  });
});

describe('POST /api/script/ficha/materials/skip', () => {
  it('"Nao tenho materiais, ir para a ficha": vira skipped sem pedir leitura de material nenhuma', async () => {
    const antes = await dbAll(`SELECT id FROM cohort_jobs`);
    const r = await api('POST', '/api/script/ficha/materials/skip', 'userS');
    expect(r.status).toBe(200);
    expect(r.data.materials_status).toBe('skipped');
    expect(r.data.materials_skipped_at).toBeTruthy();
    const ficha = await api('GET', '/api/script/ficha', 'userS');
    expect(ficha.data.data.materials_status).toBe('skipped');
    // nenhum job novo: pular NAO enfileira o pre-preenchimento
    const depois = await dbAll(`SELECT id FROM cohort_jobs`);
    expect(depois.length).toBe(antes.length);
  });

  it('pular duas vezes nao muda nada (idempotente)', async () => {
    const um = await api('POST', '/api/script/ficha/materials/skip', 'userS');
    const dois = await api('POST', '/api/script/ficha/materials/skip', 'userS');
    expect(dois.status).toBe(200);
    expect(dois.data.materials_skipped_at).toBe(um.data.materials_skipped_at);
  });

  it('sem a permissao marcada o numero nao e guardado', async () => {
    const r = await api('POST', '/api/script/ficha/materials/skip', 'userS', { notify_phone: '(11) 98765-4321' });
    expect(r.status).toBe(200);
    expect(r.data.notify_phone).toBeNull();
    const semConsent = await dbGet(`SELECT materials FROM script_fichas WHERE club_slug = 'clube-s'`);
    expect(safeJsonParse(semConsent.materials).por_pessoa['s@x.com']).not.toHaveProperty('notify_phone');
  });

  it('com a permissao marcada o WhatsApp vai para o mesmo campo do envio (por_pessoa.notify_phone)', async () => {
    const r = await api('POST', '/api/script/ficha/materials/skip', 'userS', { notify_phone: '(11) 98765-4321', consentimento: true });
    expect(r.status).toBe(200);
    expect(r.data.notify_phone).toBe('5511987654321');
    const row = await dbGet(`SELECT materials FROM script_fichas WHERE club_slug = 'clube-s'`);
    expect(safeJsonParse(row.materials).por_pessoa['s@x.com'].notify_phone).toBe('5511987654321');
    const ficha = await api('GET', '/api/script/ficha', 'userS');
    expect(ficha.data.data.materials.notify_phone).toBe('5511987654321');
    expect(ficha.data.data.materials.notify_consent_at).toBeTruthy();
    // continua sem leitura de material: pular nao enfileira pre-preenchimento
    const jobs = await dbAll(`SELECT id FROM cohort_jobs WHERE club_slug = 'clube-s'`);
    expect(jobs.length).toBe(0);
  });

  it('numero incompleto: 400 em portugues e o que estava guardado fica', async () => {
    const r = await api('POST', '/api/script/ficha/materials/skip', 'userS', { notify_phone: '123', consentimento: true });
    expect(r.status).toBe(400);
    expect(r.data.message).toMatch(/WhatsApp inválido/);
    expect(r.data.message).not.toMatch(/—/);
    const ficha = await api('GET', '/api/script/ficha', 'userS');
    expect(ficha.data.data.materials.notify_phone).toBe('5511987654321');
  });
});

describe('PUT /api/script/ficha/notify-phone', () => {
  it('sem consentimento: 400 e nada e guardado', async () => {
    const r = await api('PUT', '/api/script/ficha/notify-phone', 'userE', { notify_phone: '11 98765-4321' });
    expect(r.status).toBe(400);
    expect(r.data.message).toMatch(/permissão/);
    expect(r.data.message).not.toMatch(/—/);
    expect((await api('GET', '/api/script/ficha', 'userE')).data.data.materials).not.toHaveProperty('notify_phone');
  });

  it('consentimento false tambem e 400 (nada de guardar sem a marcacao)', async () => {
    const r = await api('PUT', '/api/script/ficha/notify-phone', 'userE', { notify_phone: '11 98765-4321', consentimento: false });
    expect(r.status).toBe(400);
    expect((await api('GET', '/api/script/ficha', 'userE')).data.data.materials).not.toHaveProperty('notify_phone');
  });

  it('com consentimento: grava numero, data e a frase que a pessoa viu; o GET passa a devolver', async () => {
    const texto = 'Quero receber no meu WhatsApp, pelo número do Danilo (Prosperus), as atualizações do meu script: quando a ficha ficar pronta, quando o script sair e se faltar alguma informação.';
    const r = await api('PUT', '/api/script/ficha/notify-phone', 'userE', { notify_phone: '11 98765-4321', consentimento: true, consent_texto: texto });
    expect(r.status).toBe(200);
    expect(r.data.notify_phone).toBe('5511987654321');
    expect(r.data.notify_consent_at).toBeTruthy();
    const row = await dbGet(`SELECT materials FROM script_fichas WHERE club_slug = 'clube-e'`);
    const p = safeJsonParse(row.materials).por_pessoa['e@x.com'];
    expect(p.notify_consent_texto).toBe(texto);
    expect(p.notify_consent_at).toBe(r.data.notify_consent_at);
    const ficha = await api('GET', '/api/script/ficha', 'userE');
    expect(ficha.data.data.materials.notify_phone).toBe('5511987654321');
    expect(ficha.data.data.materials.notify_consent_at).toBe(r.data.notify_consent_at);
  });

  it('numero invalido: 400 e o que estava salvo continua la', async () => {
    const r = await api('PUT', '/api/script/ficha/notify-phone', 'userE', { notify_phone: '99', consentimento: true });
    expect(r.status).toBe(400);
    expect(r.data.message).toMatch(/WhatsApp inválido/);
    expect((await api('GET', '/api/script/ficha', 'userE')).data.data.materials.notify_phone).toBe('5511987654321');
  });

  it('vazio com consentimento tambem e 400: nao existe permissao sem numero', async () => {
    const r = await api('PUT', '/api/script/ficha/notify-phone', 'userE', { notify_phone: '', consentimento: true });
    expect(r.status).toBe(400);
    expect((await api('GET', '/api/script/ficha', 'userE')).data.data.materials.notify_phone).toBe('5511987654321');
  });

  it('o numero de quem pulou vale para o pre-preenchimento: o submit sem numero reaproveita', async () => {
    const sub = await api('POST', '/api/script/ficha/materials/submit', 'userS');
    expect(sub.status).toBe(200);
    expect(sub.data.notify_phone).toBe('5511987654321');
    const job = await dbGet(`SELECT tipo, notify_phone FROM cohort_jobs WHERE club_slug = 'clube-s' ORDER BY created_at DESC, rowid DESC LIMIT 1`);
    expect(job).toMatchObject({ tipo: 'prefill', notify_phone: '5511987654321' });
  });

  it('o numero sugerido do cadastro nunca vira o numero dos avisos', async () => {
    const row = await dbGet(`SELECT materials FROM script_fichas WHERE club_slug = 'clube-e'`);
    const m = safeJsonParse(row.materials);
    const pessoa = { ...(m.por_pessoa['e@x.com'] || {}), notify_phone_sugerido: '5511911112222' };
    delete pessoa.notify_phone;
    delete pessoa.notify_consent_at;
    delete pessoa.notify_consent_texto;
    m.por_pessoa['e@x.com'] = pessoa;
    await dbRun(`UPDATE script_fichas SET materials = ? WHERE club_slug = 'clube-e'`, [JSON.stringify(m)]);
    const ficha = await api('GET', '/api/script/ficha', 'userE');
    expect(ficha.data.data.materials.notify_phone_sugerido).toBe('5511911112222');
    expect(ficha.data.data.materials).not.toHaveProperty('notify_phone');
    // o envio sem numero nao promove o sugerido a numero dos avisos
    const sub = await api('POST', '/api/script/ficha/materials/submit', 'userE');
    expect(sub.status).toBe(200);
    expect(sub.data.notify_phone).toBeNull();
  });
});

describe('POST /api/script/ficha/complete por modo', () => {
  it('essencial: fecha com as 12 respondidas, mesmo com obrigatorios do completo em aberto', async () => {
    await responder('clube-e', SF.ESSENCIAL_KEYS);
    const r = await api('POST', '/api/script/ficha/complete', 'userE');
    expect(r.status).toBe(200);
    expect(r.data.ficha_status).toBe('confirmada');
    expect(r.data.modo).toBe('essencial');
    const row = await dbGet(`SELECT ficha_status FROM script_fichas WHERE club_slug = 'clube-e'`);
    expect(row.ficha_status).toBe('confirmada');
    // o que ficou de fora do essencial continua sem decisao (para quando a pessoa aprofundar)
    const ficha = await api('GET', '/api/script/ficha', 'userE');
    const fora = ficha.data.data.blocos.flatMap((b) => b.campos).filter((c) => !c.essencial);
    expect(fora.some((c) => !c.decidido)).toBe(true);
  });

  it('completo: as mesmas 12 respostas nao bastam; 400 com `faltam` em portugues', async () => {
    await api('PUT', '/api/script/ficha/modo', 'userC', { modo: 'completo' });
    await responder('clube-c', SF.ESSENCIAL_KEYS);
    const r = await api('POST', '/api/script/ficha/complete', 'userC');
    expect(r.status).toBe(400);
    expect(r.data.faltam.length).toBeGreaterThan(0);
    expect(r.data.message).toMatch(/campos obrigat/i);
    expect(r.data.message).not.toMatch(/—/);
  });
});
