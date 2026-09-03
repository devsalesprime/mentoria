#!/usr/bin/env node
/**
 * Seed idempotente do cohort (clubes + membros) a partir de data/cohort-seed.json.
 *
 * Uso:
 *   node scripts/seed-cohort.cjs                 # banco padrao (data/prosperus.db ou DB_PATH)
 *   DB_PATH=/tmp/x.db node scripts/seed-cohort.cjs
 *   node scripts/seed-cohort.cjs --seed=outro.json
 *
 * Regras:
 *   - clube: cria se nao existe; atualiza nome e ativo do que existe
 *   - membro: cria se nao existe (INSERT OR IGNORE); nunca sobrescreve membro editado pelo admin
 *   - users: marca cohort='exclusive' + club_slug para quem ja tem conta e ainda nao esta marcado
 *
 * Tambem e usado pelo server.cjs no boot (exporta seedCohort).
 */
const path = require('path');
const fs = require('fs');

const DEFAULT_SEED = path.join(__dirname, '..', 'data', 'cohort-seed.json');

function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

function readSeed(seedPath) {
  const raw = fs.readFileSync(seedPath, 'utf8');
  const json = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  if (!json || !Array.isArray(json.clubs)) throw new Error('cohort-seed.json: esperado { clubs: [...] }');
  return json;
}

/**
 * @param {{dbRun:Function, dbGet:Function, dbAll:Function}} h  helpers promisificados (utils/db-helpers.cjs)
 * @param {string} [seedPath]
 * @returns {Promise<{clubs:number, members:number, membersInserted:number, usersMarked:number}>}
 */
async function seedCohort(h, seedPath = DEFAULT_SEED) {
  const seed = readSeed(seedPath);
  let clubs = 0;
  let members = 0;
  let membersInserted = 0;

  for (const club of seed.clubs) {
    const slug = String(club.slug || '').trim();
    const nome = String(club.nome || '').trim();
    if (!slug || !nome) continue;
    const ativo = club.ativo === 0 || club.ativo === false ? 0 : 1;

    await h.dbRun(
      `INSERT INTO cohort_clubs (slug, nome, ativo) VALUES (?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET nome = excluded.nome, ativo = excluded.ativo`,
      [slug, nome, ativo]
    );
    clubs += 1;

    for (const m of club.members || []) {
      const email = normEmail(m.email);
      if (!email || !email.includes('@')) continue;
      const r = await h.dbRun(
        `INSERT OR IGNORE INTO cohort_members (email, club_slug, nome) VALUES (?, ?, ?)`,
        [email, slug, m.nome ? String(m.nome).trim() : null]
      );
      members += 1;
      if (r.changes) membersInserted += 1;
    }
  }

  // Marca usuarios ja existentes que ainda nao tem cohort (so clube ativo)
  const marked = await h.dbRun(
    `UPDATE users
       SET cohort = 'exclusive',
           club_slug = (SELECT cm.club_slug FROM cohort_members cm
                          JOIN cohort_clubs cc ON cc.slug = cm.club_slug
                         WHERE cm.email = lower(users.email) AND cc.ativo = 1),
           updated_at = CURRENT_TIMESTAMP
     WHERE cohort IS NULL
       AND lower(email) IN (SELECT cm.email FROM cohort_members cm
                              JOIN cohort_clubs cc ON cc.slug = cm.club_slug
                             WHERE cc.ativo = 1)`
  );

  // Clube desativado no seed: tira o cohort de quem esta nele (club_slug fica, para reativar)
  const unmarked = await h.dbRun(
    `UPDATE users SET cohort = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE cohort = 'exclusive'
        AND club_slug IN (SELECT slug FROM cohort_clubs WHERE ativo = 0)`
  );

  return { clubs, members, membersInserted, usersMarked: marked.changes || 0, usersUnmarked: unmarked.changes || 0 };
}

module.exports = { seedCohort, DEFAULT_SEED };

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const sqlite3 = require('sqlite3').verbose();
  const seedArg = process.argv.find((a) => a.startsWith('--seed='));
  const seedPath = seedArg ? path.resolve(seedArg.slice('--seed='.length)) : DEFAULT_SEED;
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'prosperus.db');

  if (!fs.existsSync(seedPath)) {
    console.error(`Seed nao encontrado: ${seedPath}`);
    process.exit(1);
  }

  const db = new sqlite3.Database(dbPath);
  const helpers = require('../utils/db-helpers.cjs')(db);

  db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');
  });

  (async () => {
    // Garante as tabelas (mesmo DDL do server.cjs) para rodar em banco novo
    await helpers.dbRun(`CREATE TABLE IF NOT EXISTS cohort_clubs (
      slug TEXT PRIMARY KEY, nome TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0, 1)),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await helpers.dbRun(`CREATE TABLE IF NOT EXISTS cohort_members (
      email TEXT PRIMARY KEY,
      club_slug TEXT NOT NULL REFERENCES cohort_clubs(slug) ON DELETE CASCADE,
      nome TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    const cols = await helpers.dbAll(`PRAGMA table_info(users)`);
    if (cols.length && !cols.some((c) => c.name === 'cohort')) await helpers.dbRun(`ALTER TABLE users ADD COLUMN cohort TEXT DEFAULT NULL`);
    if (cols.length && !cols.some((c) => c.name === 'club_slug')) await helpers.dbRun(`ALTER TABLE users ADD COLUMN club_slug TEXT DEFAULT NULL`);

    const result = await seedCohort(helpers, seedPath);
    console.log(`Seed do cohort: ${result.clubs} clubes, ${result.members} membros lidos (${result.membersInserted} novos), ${result.usersMarked} usuarios marcados. Banco: ${dbPath}`);
    db.close();
  })().catch((err) => {
    console.error('Erro no seed do cohort:', err.message);
    db.close();
    process.exit(1);
  });
}
