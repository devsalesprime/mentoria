#!/usr/bin/env node
/**
 * Reset de um CLUBE do cohort (Script 7 Passos), preservando membros e usuários.
 *
 * O que faz (na ordem):
 *   1. exporta a ficha atual (campos, materiais, contexto, versões do script, comentários, jobs) para um JSON
 *   2. apaga: script_fichas, script_field_context, script_versions, script_comments, cohort_jobs do clube
 *      e os uploaded_files com categoria script_* dos membros do clube (arquivos no disco também)
 *   3. NÃO toca em cohort_clubs, cohort_members nem users (o mentor continua entrando com o e-mail)
 *
 * Uso:
 *   node scripts/reset-club.cjs --slug teste-danilo --exportar /root/exports/teste-danilo.json          (modo seco)
 *   node scripts/reset-club.cjs --slug teste-danilo --exportar /root/exports/teste-danilo.json --aplicar
 * Respeita DB_PATH (default data/prosperus.db). Faça backup do banco antes de --aplicar.
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const slug = arg('slug');
const exportar = arg('exportar');
const aplicar = process.argv.includes('--aplicar');
if (!slug) { console.error('uso: node scripts/reset-club.cjs --slug <club_slug> [--exportar <arquivo.json>] [--aplicar]'); process.exit(1); }

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'prosperus.db');
const db = new sqlite3.Database(DB_PATH);
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const tabelaExiste = async (t) => (await all(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [t])).length > 0;

(async () => {
  const club = (await all(`SELECT slug, nome, ativo FROM cohort_clubs WHERE slug = ?`, [slug]))[0];
  if (!club) { console.error(`clube ${slug} não existe`); process.exit(2); }
  const membros = await all(`SELECT email, nome FROM cohort_members WHERE club_slug = ?`, [slug]);
  const users = await all(`SELECT id, email FROM users WHERE club_slug = ?`, [slug]);
  const userIds = users.map((u) => u.id);
  const q = userIds.length ? userIds.map(() => '?').join(',') : "''";

  const dump = { club, membros, users: users.map((u) => u.email), exportado_em: new Date().toISOString() };
  dump.ficha = (await all(`SELECT * FROM script_fichas WHERE club_slug = ?`, [slug]))[0] || null;
  for (const k of ['fields', 'materials', 'prefill_meta']) {
    if (dump.ficha && typeof dump.ficha[k] === 'string') { try { dump.ficha[k] = JSON.parse(dump.ficha[k]); } catch { /* deixa string */ } }
  }
  dump.contexto = (await tabelaExiste('script_field_context')) ? await all(`SELECT * FROM script_field_context WHERE club_slug = ?`, [slug]) : [];
  dump.versoes = (await tabelaExiste('script_versions')) ? await all(`SELECT * FROM script_versions WHERE club_slug = ?`, [slug]) : [];
  dump.comentarios = (await tabelaExiste('script_comments')) ? await all(`SELECT * FROM script_comments WHERE club_slug = ?`, [slug]) : [];
  dump.jobs = (await tabelaExiste('cohort_jobs')) ? await all(`SELECT * FROM cohort_jobs WHERE club_slug = ?`, [slug]) : [];
  dump.arquivos = userIds.length ? await all(`SELECT id, user_id, category, file_name, file_path, file_size, created_at FROM uploaded_files WHERE user_id IN (${q}) AND category LIKE 'script_%'`, userIds) : [];

  console.log(`clube ${slug} (${club.nome}) · membros ${membros.length} · usuários ${users.length}`);
  console.log(`ficha: ${dump.ficha ? dump.ficha.ficha_status : 'nenhuma'} · contexto ${dump.contexto.length} · versões ${dump.versoes.length} · comentários ${dump.comentarios.length} · jobs ${dump.jobs.length} · arquivos ${dump.arquivos.length}`);

  if (exportar) {
    fs.mkdirSync(path.dirname(exportar), { recursive: true });
    fs.writeFileSync(exportar, JSON.stringify(dump, null, 2), 'utf8');
    console.log(`exportado: ${exportar} (${fs.statSync(exportar).size} bytes)`);
  }

  if (!aplicar) { console.log('modo seco: nada apagado (use --aplicar)'); db.close(); return; }

  await run('BEGIN');
  const del = async (sql, p) => { const r = await run(sql, p); return r.changes; };
  const n = {};
  if (await tabelaExiste('script_comments')) n.comentarios = await del(`DELETE FROM script_comments WHERE club_slug = ?`, [slug]);
  if (await tabelaExiste('script_versions')) n.versoes = await del(`DELETE FROM script_versions WHERE club_slug = ?`, [slug]);
  if (await tabelaExiste('script_field_context')) n.contexto = await del(`DELETE FROM script_field_context WHERE club_slug = ?`, [slug]);
  if (await tabelaExiste('cohort_jobs')) n.jobs = await del(`DELETE FROM cohort_jobs WHERE club_slug = ?`, [slug]);
  n.ficha = await del(`DELETE FROM script_fichas WHERE club_slug = ?`, [slug]);
  let apagadosDisco = 0;
  for (const f of dump.arquivos) {
    if (f.file_path && fs.existsSync(f.file_path)) { try { fs.unlinkSync(f.file_path); apagadosDisco++; } catch { /* segue */ } }
  }
  n.arquivos = userIds.length ? await del(`DELETE FROM uploaded_files WHERE user_id IN (${q}) AND category LIKE 'script_%'`, userIds) : 0;
  await run('COMMIT');
  console.log('apagado:', JSON.stringify(n), `· arquivos no disco: ${apagadosDisco}`);
  console.log('membros e usuários preservados; o mentor entra de novo com o e-mail e começa pelos Materiais.');
  db.close();
})().catch((e) => { console.error('FALHA', e.message); db.close(); process.exit(3); });
