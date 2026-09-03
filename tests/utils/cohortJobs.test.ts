// @ts-nocheck
/** @vitest-environment node */
/**
 * Fila cohort_jobs (utils/cohort-jobs.cjs) em banco sqlite TEMPORARIO em arquivo:
 * - normalizePhone (aviso no WhatsApp)
 * - 1 job ativo por pessoa (enqueue devolve o existente)
 * - claim atomico: 5 conexoes em paralelo, 3 jobs na fila -> 3 claims distintos + 2 vazios
 * - done grava finished_at; requeue volta para queued
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import { normalizePhone, ensureCohortJobsTable } from '../../utils/validation-materials.cjs';
import { enqueueJob, claimNextJob, getJob, updateJobStatus, requeueJob, listJobs, listPhones, findActiveJob, findLatestJob, listRefiningKeys, dedupeScope } from '../../utils/cohort-jobs.cjs';

describe('normalizePhone', () => {
  it('vazio = sem telefone (ok, null)', () => {
    expect(normalizePhone('')).toEqual({ ok: true, phone: null });
    expect(normalizePhone(undefined)).toEqual({ ok: true, phone: null });
    expect(normalizePhone('  ')).toEqual({ ok: true, phone: null });
  });

  it('10 ou 11 digitos ganham o 55; 12 ou 13 com 55 ficam como estao', () => {
    expect(normalizePhone('(11) 98765-4321').phone).toBe('5511987654321');
    expect(normalizePhone('11 3456 7890').phone).toBe('551134567890');
    expect(normalizePhone('+55 11 98765 4321').phone).toBe('5511987654321');
    expect(normalizePhone('5511987654321').phone).toBe('5511987654321');
    expect(normalizePhone('55 11 3456-7890').phone).toBe('551134567890');
  });

  it('rejeita fora de 10 a 13 digitos ou 12/13 sem 55', () => {
    expect(normalizePhone('123').ok).toBe(false);
    expect(normalizePhone('12345678901234').ok).toBe(false);
    expect(normalizePhone('1234567890123').ok).toBe(false); // 13 digitos sem 55
    expect(normalizePhone('abc').ok).toBe(false);
    expect(normalizePhone('123').message).toMatch(/DDD/);
  });
});

function openDb(file) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, (err) => {
      if (err) return reject(err);
      db.serialize(() => {
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA busy_timeout = 5000', () => resolve(db));
      });
    });
  });
}

function closeDb(db) {
  return new Promise((resolve) => db.close(() => resolve()));
}

describe('cohort_jobs em arquivo temporario', () => {
  let dir; let file; let db; let h;
  const uuidv4 = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-jobs-'));
    file = path.join(dir, 'jobs.db');
    db = await openDb(file);
    h = createDbHelpers(db);
    await ensureCohortJobsTable(h.dbRun);
    await ensureCohortJobsTable(h.dbRun); // idempotente
  });

  afterAll(async () => {
    await closeDb(db);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('enfileira 3 pessoas; a mesma pessoa de novo devolve o job existente (e atualiza o telefone)', async () => {
    const a = await enqueueJob({ ...h, uuidv4 }, { club_slug: 'clube-x', email: 'A@x.com', notify_phone: null, payload: { nome: 'Ana' } });
    const b = await enqueueJob({ ...h, uuidv4 }, { club_slug: 'clube-x', email: 'b@x.com', notify_phone: '5511999990000' });
    const c = await enqueueJob({ ...h, uuidv4 }, { club_slug: 'clube-y', email: 'c@y.com' });
    expect(a.existing).toBe(false);
    expect(a.job.status).toBe('queued');
    expect(a.job.email).toBe('a@x.com');
    expect(a.job.payload).toEqual({ nome: 'Ana' });
    expect(a.job.attempts).toBe(0);

    const again = await enqueueJob({ ...h, uuidv4 }, { club_slug: 'clube-x', email: 'a@x.com', notify_phone: '5511987654321' });
    expect(again.existing).toBe(true);
    expect(again.job.id).toBe(a.job.id);
    expect(again.job.notify_phone).toBe('5511987654321');
    expect((await getJob(h, a.job.id)).notify_phone).toBe('5511987654321');
    expect((await listJobs(h)).map((j) => j.id).sort()).toEqual([a.job.id, b.job.id, c.job.id].sort());
    expect(await findActiveJob(h, { club_slug: 'clube-x', email: 'A@X.COM' })).toMatchObject({ id: a.job.id });
  });

  it('claim atomico: 5 conexoes em paralelo, 3 jobs -> 3 ids distintos e 2 vazios; attempts = 1', async () => {
    const conns = await Promise.all([1, 2, 3, 4, 5].map(() => openDb(file)));
    try {
      const results = await Promise.all(conns.map((c) => claimNextJob(createDbHelpers(c), 'prefill')));
      const claimed = results.filter(Boolean);
      expect(claimed).toHaveLength(3);
      expect(results.filter((r) => r === null)).toHaveLength(2);
      expect(new Set(claimed.map((j) => j.id)).size).toBe(3);
      for (const j of claimed) {
        expect(j.status).toBe('running');
        expect(j.attempts).toBe(1);
        expect(j.started_at).toBeTruthy();
      }
      // O primeiro reivindicado e o mais antigo (a@x.com foi o primeiro INSERT)
      const rows = await h.dbAll(`SELECT id, status, attempts FROM cohort_jobs`);
      expect(rows.every((r) => r.status === 'running' && r.attempts === 1)).toBe(true);
      expect(await claimNextJob(h, 'prefill')).toBeNull();
    } finally {
      await Promise.all(conns.map(closeDb));
    }
  });

  it('done grava finished_at e result; error guarda a mensagem; requeue volta para queued e o worker pega de novo', async () => {
    const jobs = await listJobs(h, { status: 'running' });
    const a = jobs.find((j) => j.email === 'a@x.com');
    const b = jobs.find((j) => j.email === 'b@x.com');
    const done = await updateJobStatus(h, a.id, { status: 'done', result: { imported: 30, skipped: 4 } });
    expect(done.status).toBe('done');
    expect(done.finished_at).toBeTruthy();
    expect(done.result).toEqual({ imported: 30, skipped: 4 });

    const err = await updateJobStatus(h, b.id, { status: 'error', error: 'falhou ao ler o PDF' });
    expect(err.status).toBe('error');
    expect(err.error).toBe('falhou ao ler o PDF');
    expect(err.finished_at).toBeTruthy();

    const re = await requeueJob(h, b.id);
    expect(re.status).toBe('queued');
    expect(re.started_at).toBeNull();
    expect(re.finished_at).toBeNull();
    expect(re.error).toBeNull();
    expect(re.attempts).toBe(1);

    const next = await claimNextJob(h, 'prefill');
    expect(next.id).toBe(b.id);
    expect(next.attempts).toBe(2);
    await updateJobStatus(h, b.id, { status: 'needs_human', error: 'sem materiais' });
    expect((await listJobs(h, { status: 'needs_human' })).map((j) => j.id)).toEqual([b.id]);
    expect(await updateJobStatus(h, 'nao-existe', { status: 'done' })).toBeNull();
    await expect(updateJobStatus(h, b.id, { status: 'invalido' })).rejects.toThrow();
  });

  it('phones: distintos, sem nulos', async () => {
    expect(await listPhones(h)).toEqual(['5511987654321', '5511999990000']);
  });

  it('depois de done, a mesma pessoa pode enfileirar de novo (job novo)', async () => {
    const r = await enqueueJob({ ...h, uuidv4 }, { club_slug: 'clube-x', email: 'a@x.com' });
    expect(r.existing).toBe(false);
    expect(r.job.status).toBe('queued');
  });
});

describe('tipos script e refinar: escopo de deduplicacao e claim "any"', () => {
  let dir; let file; let db; let h;
  const uuidv4 = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-jobs-tipos-'));
    file = path.join(dir, 'jobs.db');
    db = await openDb(file);
    h = createDbHelpers(db);
    await ensureCohortJobsTable(h.dbRun);
  });

  afterAll(async () => {
    await closeDb(db);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('dedupeScope: prefill por pessoa, script por clube, refinar por clube + campo', () => {
    expect(dedupeScope('prefill')).toBe('pessoa');
    expect(dedupeScope('script')).toBe('club');
    expect(dedupeScope('refinar')).toBe('club_field');
    expect(dedupeScope('revisar')).toBe('club');
  });

  it('script: 1 ativo por clube (socio diferente recebe o mesmo job); refinar: 1 ativo por campo', async () => {
    const s1 = await enqueueJob({ ...h, uuidv4 }, { tipo: 'script', club_slug: 'clube-x', email: 'a@x.com', payload: { motivo: 'complete' } });
    const s2 = await enqueueJob({ ...h, uuidv4 }, { tipo: 'script', club_slug: 'clube-x', email: 'b@x.com', payload: { motivo: 'gerar-script' } });
    const sy = await enqueueJob({ ...h, uuidv4 }, { tipo: 'script', club_slug: 'clube-y', email: 'c@y.com' });
    expect(s1.existing).toBe(false);
    expect(s2.existing).toBe(true);
    expect(s2.job.id).toBe(s1.job.id);
    expect(sy.job.id).not.toBe(s1.job.id);

    await expect(enqueueJob({ ...h, uuidv4 }, { tipo: 'refinar', club_slug: 'clube-x', email: 'a@x.com' })).rejects.toThrow(/field_key/);
    await expect(enqueueJob({ ...h, uuidv4 }, { tipo: 'outro', club_slug: 'clube-x', email: 'a@x.com' })).rejects.toThrow(/inválido/);
    const r33 = await enqueueJob({ ...h, uuidv4 }, { tipo: 'refinar', club_slug: 'clube-x', email: 'a@x.com', payload: { field_key: '3.3' } });
    const r33b = await enqueueJob({ ...h, uuidv4 }, { tipo: 'refinar', club_slug: 'clube-x', email: 'b@x.com', payload: { field_key: '3.3' } });
    const r41 = await enqueueJob({ ...h, uuidv4 }, { tipo: 'refinar', club_slug: 'clube-x', email: 'a@x.com', payload: { field_key: '4.1' } });
    expect(r33b.existing).toBe(true);
    expect(r33b.job.id).toBe(r33.job.id);
    expect(r41.existing).toBe(false);
    expect((await listRefiningKeys(h, 'clube-x')).sort()).toEqual(['3.3', '4.1']);
    expect(await listRefiningKeys(h, 'clube-y')).toEqual([]);

    // prefill da mesma pessoa nao colide com o script dela
    const p = await enqueueJob({ ...h, uuidv4 }, { tipo: 'prefill', club_slug: 'clube-x', email: 'a@x.com' });
    expect(p.existing).toBe(false);
    expect((await findActiveJob(h, { tipo: 'script', club_slug: 'clube-x' })).id).toBe(s1.job.id);
    expect((await findLatestJob(h, { tipo: 'refinar', club_slug: 'clube-x', field_key: '4.1' })).id).toBe(r41.job.id);
  });

  it('claim "any" pega o mais antigo de qualquer tipo; claim por tipo filtra', async () => {
    const first = await claimNextJob(h, null); // s1 (script, clube-x) e o mais antigo
    expect(first.tipo).toBe('script');
    expect(first.club_slug).toBe('clube-x');
    expect(first.status).toBe('running');
    const onlyPrefill = await claimNextJob(h, 'prefill');
    expect(onlyPrefill.tipo).toBe('prefill');
    const anyAgain = await claimNextJob(h, 'any');
    expect(anyAgain.tipo).toBe('script'); // sy (clube-y) e o proximo mais antigo
    expect(anyAgain.club_slug).toBe('clube-y');
    const ref = await claimNextJob(h, 'refinar');
    expect(ref.tipo).toBe('refinar');
    expect(ref.payload.field_key).toBe('3.3');
    // depois de rodar, refinar de 3.3 sai da lista de "refinando"
    await updateJobStatus(h, ref.id, { status: 'done' });
    expect(await listRefiningKeys(h, 'clube-x')).toEqual(['4.1']);
    await claimNextJob(h, null);
    expect(await claimNextJob(h, null)).toBeNull();
    expect((await listJobs(h, { tipo: 'script' })).length).toBe(2);
  });

  it('revisar divide o escopo com script: 1 ativo por clube entre os dois; depois de done, nasce outro', async () => {
    const comentarios = [{ passo: 2, texto: 'Trocar a dor', autor: 'Ana', created_at: '2026-09-03 12:00:00' }];
    const rv = await enqueueJob({ ...h, uuidv4 }, { tipo: 'revisar', club_slug: 'clube-r', email: 'a@r.com', payload: { versao: 1, content_md: '# v1', comentarios } });
    expect(rv.existing).toBe(false);
    expect(rv.job.payload).toEqual({ versao: 1, content_md: '# v1', comentarios });
    const rv2 = await enqueueJob({ ...h, uuidv4 }, { tipo: 'revisar', club_slug: 'clube-r', email: 'b@r.com', payload: { versao: 1, content_md: '# v1', comentarios: [] } });
    expect(rv2).toMatchObject({ existing: true, job: { id: rv.job.id } });
    // "gerar do zero" com um revisar ativo devolve o revisar (os dois escrevem a proxima versao do mesmo clube)
    const sc = await enqueueJob({ ...h, uuidv4 }, { tipo: 'script', club_slug: 'clube-r', email: 'a@r.com', payload: { motivo: 'gerar-script' } });
    expect(sc).toMatchObject({ existing: true, job: { id: rv.job.id, tipo: 'revisar' } });
    expect((await findActiveJob(h, { tipo: 'script', club_slug: 'clube-r' })).id).toBe(rv.job.id);
    expect((await findLatestJob(h, { tipo: 'script', club_slug: 'clube-r' })).tipo).toBe('revisar');
    // outro clube nao colide; prefill da pessoa tambem nao
    expect((await enqueueJob({ ...h, uuidv4 }, { tipo: 'revisar', club_slug: 'clube-s', email: 'c@s.com', payload: { versao: 1, content_md: '#', comentarios: [] } })).existing).toBe(false);
    expect((await enqueueJob({ ...h, uuidv4 }, { tipo: 'prefill', club_slug: 'clube-r', email: 'a@r.com' })).existing).toBe(false);
    const claimed = await claimNextJob(h, 'revisar');
    expect(claimed.id).toBe(rv.job.id);
    await updateJobStatus(h, claimed.id, { status: 'done', result: { versao: 2 } });
    const sc2 = await enqueueJob({ ...h, uuidv4 }, { tipo: 'script', club_slug: 'clube-r', email: 'a@r.com' });
    expect(sc2.existing).toBe(false);
    expect(sc2.job.tipo).toBe('script');
    expect((await listJobs(h, { tipo: 'revisar' })).length).toBe(2);
  });
});
