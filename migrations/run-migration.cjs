/**
 * Prosperus DB Migration Runner — v1.x → v2.0
 *
 * Runs all migration steps using Node.js + sqlite3 driver.
 * Usage: node migrations/run-migration.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'prosperus.db');
const BACKUP_PATH = path.join(__dirname, '..', 'data', `prosperus-backup-${Date.now()}.db`);

// Helper: run a SQL statement and return a promise
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

// Helper: get all rows
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Helper: get single row
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Helper: exec multiple statements
function exec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function migrate() {
  console.log('============================================');
  console.log('  Prosperus DB Migration v1.x → v2.0');
  console.log('============================================\n');

  // Check DB exists
  if (!fs.existsSync(DB_PATH)) {
    console.error(`ERROR: Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  // === PHASE 0: BACKUP ===
  console.log('[0/11] Creating backup...');
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  const backupSize = fs.statSync(BACKUP_PATH).size;
  console.log(`  Backup: ${BACKUP_PATH} (${backupSize} bytes)\n`);

  // Open DB
  const db = new sqlite3.Database(DB_PATH);

  try {
    // === PHASE 1: PRE-CHECK ===
    console.log('[1/11] Pre-check: Verifying current state...');

    const tables = await all(db, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
    console.log(`  Tables found: ${tables.map(t => t.name).join(', ')}`);

    const counts = {};
    for (const t of tables) {
      const row = await get(db, `SELECT COUNT(*) as cnt FROM "${t.name}"`);
      counts[t.name] = row.cnt;
      console.log(`  ${t.name}: ${row.cnt} rows`);
    }

    // Check orphaned user_progress
    let orphanedProgress = [];
    if (tables.some(t => t.name === 'user_progress')) {
      orphanedProgress = await all(db, `
        SELECT up.user_id, up.email, up.name
        FROM user_progress up
        LEFT JOIN diagnostic_data dd ON up.user_id = dd.user_id
        WHERE dd.id IS NULL
          AND up.user_id IS NOT NULL
          AND up.email IS NOT NULL
          AND up.form_data IS NOT NULL
          AND up.form_data != '{}'
          AND up.form_data != '{"mentor":{},"mentee":{},"method":{},"delivery":{}}'
      `);
      if (orphanedProgress.length > 0) {
        console.log(`  WARNING: ${orphanedProgress.length} orphaned user_progress rows found — will migrate`);
      } else {
        console.log('  No orphaned user_progress data');
      }
    }

    // Check constraint violations
    const violations = [];

    const invalidRoles = await get(db, `SELECT COUNT(*) as cnt FROM users WHERE role NOT IN ('member', 'admin')`);
    if (invalidRoles.cnt > 0) violations.push(`${invalidRoles.cnt} users with invalid role`);

    const invalidDiagStatus = await get(db, `SELECT COUNT(*) as cnt FROM diagnostic_data WHERE status NOT IN ('in_progress', 'submitted')`);
    if (invalidDiagStatus.cnt > 0) violations.push(`${invalidDiagStatus.cnt} diagnostic_data with invalid status`);

    const invalidDiagModule = await get(db, `SELECT COUNT(*) as cnt FROM diagnostic_data WHERE current_module NOT IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')`);
    if (invalidDiagModule.cnt > 0) violations.push(`${invalidDiagModule.cnt} diagnostic_data with invalid module`);

    if (violations.length > 0) {
      console.log(`  Data issues found (will be auto-fixed): ${violations.join('; ')}`);
    } else {
      console.log('  No constraint violations found');
    }
    console.log('');

    // === PHASE 2: MIGRATE LEGACY DATA ===
    console.log('[2/11] Migrating orphaned legacy data...');

    if (tables.some(t => t.name === 'user_progress')) {
      // Ensure users exist for orphaned data
      await run(db, `
        INSERT OR IGNORE INTO users (id, email, name, role, created_at)
        SELECT up.user_id, up.email, COALESCE(up.name, 'Migrated User'), 'member', CURRENT_TIMESTAMP
        FROM user_progress up
        LEFT JOIN users u ON up.user_id = u.id
        WHERE u.id IS NULL AND up.user_id IS NOT NULL AND up.email IS NOT NULL
      `);

      // Migrate orphaned progress into diagnostic_data
      const migResult = await run(db, `
        INSERT OR IGNORE INTO diagnostic_data (id, user_id, email, name, progress_percentage, status, created_at, last_updated)
        SELECT 'migrated-' || up.user_id, up.user_id, up.email, up.name,
               up.progress_percentage, COALESCE(up.status, 'in_progress'),
               CURRENT_TIMESTAMP, COALESCE(up.last_updated, CURRENT_TIMESTAMP)
        FROM user_progress up
        LEFT JOIN diagnostic_data dd ON up.user_id = dd.user_id
        WHERE dd.id IS NULL AND up.user_id IS NOT NULL AND up.email IS NOT NULL
      `);
      console.log(`  Migrated ${migResult.changes} orphaned rows`);
    } else {
      console.log('  No user_progress table found — skipping');
    }
    console.log('');

    // === PHASE 3: RECREATE USERS TABLE + ENABLE WAL ===
    console.log('[3/11] Recreating users table + enabling WAL mode...');

    await run(db, 'PRAGMA journal_mode = WAL');
    await run(db, 'PRAGMA foreign_keys = OFF');

    // Recreate users table with updated_at and CHECK constraint
    // SQLite doesn't allow ALTER ADD COLUMN with non-constant defaults
    await exec(db, 'BEGIN TRANSACTION');

    await exec(db, `
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if old table has updated_at
    const userCols = await all(db, "PRAGMA table_info(users)");
    const hasUpdatedAt = userCols.some(c => c.name === 'updated_at');

    if (hasUpdatedAt) {
      await run(db, `
        INSERT INTO users_new (id, email, name, role, created_at, updated_at)
        SELECT id, email, name,
          CASE WHEN role IN ('member', 'admin') THEN role ELSE 'member' END,
          COALESCE(created_at, CURRENT_TIMESTAMP),
          COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
        FROM users
      `);
    } else {
      await run(db, `
        INSERT INTO users_new (id, email, name, role, created_at, updated_at)
        SELECT id, email, name,
          CASE WHEN role IN ('member', 'admin') THEN role ELSE 'member' END,
          COALESCE(created_at, CURRENT_TIMESTAMP),
          COALESCE(created_at, CURRENT_TIMESTAMP)
        FROM users
      `);
    }

    await exec(db, 'DROP TABLE users');
    await exec(db, 'ALTER TABLE users_new RENAME TO users');
    await exec(db, 'COMMIT');

    const usersCount = await get(db, 'SELECT COUNT(*) as cnt FROM users');
    console.log(`  Users migrated: ${usersCount.cnt} rows`);

    const walMode = await get(db, 'PRAGMA journal_mode');
    console.log(`  WAL mode: ${walMode.journal_mode}`);
    console.log('');

    // === PHASE 4: RECREATE diagnostic_data ===
    console.log('[4/11] Recreating diagnostic_data with constraints...');

    await run(db, 'PRAGMA foreign_keys = OFF');
    await exec(db, 'BEGIN TRANSACTION');

    await exec(db, `
      CREATE TABLE diagnostic_data_new (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        name TEXT,
        pre_module JSON,
        mentor JSON,
        mentee JSON,
        method JSON,
        offer JSON,
        current_module TEXT DEFAULT 'pre_module'
          CHECK(current_module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')),
        current_step INTEGER DEFAULT 0,
        progress_percentage INTEGER DEFAULT 0
          CHECK(progress_percentage BETWEEN 0 AND 100),
        status TEXT NOT NULL DEFAULT 'in_progress'
          CHECK(status IN ('in_progress', 'submitted')),
        submitted_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const diagResult = await run(db, `
      INSERT INTO diagnostic_data_new (
        id, user_id, email, name,
        pre_module, mentor, mentee, method, offer,
        current_module, current_step, progress_percentage,
        status, submitted_at, created_at, updated_at
      )
      SELECT
        id, user_id, email, name,
        pre_module, mentor, mentee, method, offer,
        CASE WHEN current_module IN ('pre_module','mentor','mentee','method','offer') THEN current_module ELSE 'pre_module' END,
        COALESCE(current_step, 0),
        CASE WHEN progress_percentage < 0 THEN 0 WHEN progress_percentage > 100 THEN 100 ELSE COALESCE(progress_percentage, 0) END,
        CASE WHEN status IN ('in_progress','submitted') THEN status ELSE 'in_progress' END,
        submitted_at,
        COALESCE(created_at, CURRENT_TIMESTAMP),
        COALESCE(last_updated, CURRENT_TIMESTAMP)
      FROM diagnostic_data
      WHERE user_id IN (SELECT id FROM users)
    `);

    await exec(db, 'DROP TABLE diagnostic_data');
    await exec(db, 'ALTER TABLE diagnostic_data_new RENAME TO diagnostic_data');
    await exec(db, 'COMMIT');
    console.log(`  Migrated ${diagResult.changes} rows`);
    console.log('');

    // === PHASE 5: RECREATE pipeline ===
    console.log('[5/11] Recreating pipeline with constraints...');

    await exec(db, 'BEGIN TRANSACTION');

    await exec(db, `
      CREATE TABLE pipeline_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        research_dossier JSON,
        research_status TEXT DEFAULT 'pending'
          CHECK(research_status IN ('pending', 'in_progress', 'complete')),
        research_completed_at DATETIME,
        brand_brain JSON,
        brand_brain_status TEXT DEFAULT 'pending'
          CHECK(brand_brain_status IN ('pending', 'generated', 'danilo_review', 'mentor_review', 'approved')),
        brand_brain_version INTEGER DEFAULT 0,
        brand_brain_completed_at DATETIME,
        section_approvals JSON,
        review_notes JSON,
        assets JSON,
        assets_status TEXT DEFAULT 'pending'
          CHECK(assets_status IN ('pending', 'ready', 'delivered')),
        assets_delivered_at DATETIME,
        toolkit_enabled INTEGER DEFAULT 0 CHECK(toolkit_enabled IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const pipeResult = await run(db, `
      INSERT INTO pipeline_new (
        id, user_id, research_dossier, research_status, research_completed_at,
        brand_brain, brand_brain_status, brand_brain_version, brand_brain_completed_at,
        section_approvals, review_notes, assets, assets_status, assets_delivered_at,
        toolkit_enabled, created_at, updated_at
      )
      SELECT
        id, user_id, research_dossier,
        CASE WHEN research_status IN ('pending','in_progress','complete') THEN research_status ELSE 'pending' END,
        research_completed_at, brand_brain,
        CASE WHEN brand_brain_status IN ('pending','generated','danilo_review','mentor_review','approved') THEN brand_brain_status ELSE 'pending' END,
        COALESCE(brand_brain_version, 0), brand_brain_completed_at,
        section_approvals, review_notes, assets,
        CASE WHEN assets_status IN ('pending','ready','delivered') THEN assets_status ELSE 'pending' END,
        assets_delivered_at, COALESCE(toolkit_enabled, 0),
        COALESCE(created_at, CURRENT_TIMESTAMP), COALESCE(updated_at, CURRENT_TIMESTAMP)
      FROM pipeline
      WHERE user_id IN (SELECT id FROM users)
    `);

    await exec(db, 'DROP TABLE pipeline');
    await exec(db, 'ALTER TABLE pipeline_new RENAME TO pipeline');
    await exec(db, 'COMMIT');
    console.log(`  Migrated ${pipeResult.changes} rows`);
    console.log('');

    // === PHASE 6: RECREATE audio_recordings ===
    console.log('[6/11] Recreating audio_recordings with constraints...');

    await exec(db, 'BEGIN TRANSACTION');

    await exec(db, `
      CREATE TABLE audio_recordings_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module TEXT NOT NULL CHECK(module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')),
        question_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        transcript TEXT,
        duration_seconds INTEGER CHECK(duration_seconds >= 0),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const audioResult = await run(db, `
      INSERT INTO audio_recordings_new (id, user_id, module, question_id, file_path, transcript, duration_seconds, created_at)
      SELECT id, user_id,
        CASE WHEN module IN ('pre_module','mentor','mentee','method','offer') THEN module ELSE 'mentor' END,
        question_id, file_path, transcript,
        CASE WHEN duration_seconds < 0 THEN 0 ELSE duration_seconds END,
        COALESCE(created_at, CURRENT_TIMESTAMP)
      FROM audio_recordings
      WHERE user_id IN (SELECT id FROM users)
    `);

    await exec(db, 'DROP TABLE audio_recordings');
    await exec(db, 'ALTER TABLE audio_recordings_new RENAME TO audio_recordings');
    await exec(db, 'COMMIT');
    console.log(`  Migrated ${audioResult.changes} rows`);
    console.log('');

    // === PHASE 7: RECREATE uploaded_files ===
    console.log('[7/11] Recreating uploaded_files with constraints...');

    await exec(db, 'BEGIN TRANSACTION');

    await exec(db, `
      CREATE TABLE uploaded_files_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER CHECK(file_size >= 0),
        url TEXT,
        module TEXT DEFAULT 'general',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const filesResult = await run(db, `
      INSERT INTO uploaded_files_new (id, user_id, category, file_name, file_path, file_type, file_size, url, module, created_at, updated_at)
      SELECT id, user_id, category, file_name, file_path, file_type,
        CASE WHEN file_size < 0 THEN 0 ELSE file_size END,
        url, COALESCE(module, 'general'),
        COALESCE(created_at, CURRENT_TIMESTAMP), COALESCE(created_at, CURRENT_TIMESTAMP)
      FROM uploaded_files
      WHERE user_id IN (SELECT id FROM users)
    `);

    await exec(db, 'DROP TABLE uploaded_files');
    await exec(db, 'ALTER TABLE uploaded_files_new RENAME TO uploaded_files');
    await exec(db, 'COMMIT');
    console.log(`  Migrated ${filesResult.changes} rows`);
    console.log('');

    // === PHASE 8: DROP LEGACY TABLES ===
    console.log('[8/11] Dropping legacy tables...');

    const legacyTables = ['user_progress', 'tasks', 'submissions'];
    for (const tbl of legacyTables) {
      try {
        const cnt = await get(db, `SELECT COUNT(*) as cnt FROM "${tbl}"`);
        console.log(`  ${tbl}: ${cnt.cnt} rows (dropping)`);
        await run(db, `DROP TABLE IF EXISTS "${tbl}"`);
      } catch {
        console.log(`  ${tbl}: already removed`);
      }
    }
    console.log('');

    // === PHASE 9: CREATE INDEXES ===
    console.log('[9/11] Creating indexes...');

    await run(db, 'PRAGMA foreign_keys = ON');

    const indexes = [
      ['idx_diagnostic_status', 'diagnostic_data', 'status'],
      ['idx_pipeline_user_id', 'pipeline', 'user_id'],
      ['idx_pipeline_status_composite', 'pipeline', 'research_status, brand_brain_status, assets_status'],
      ['idx_audio_user_id', 'audio_recordings', 'user_id'],
      ['idx_audio_user_module', 'audio_recordings', 'user_id, module'],
      ['idx_files_user_id', 'uploaded_files', 'user_id'],
      ['idx_files_user_category', 'uploaded_files', 'user_id, category'],
      ['idx_users_role', 'users', 'role'],
    ];

    for (const [name, table, cols] of indexes) {
      await run(db, `CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${cols})`);
      console.log(`  Created ${name}`);
    }
    console.log('');

    // === PHASE 10: CREATE TRIGGERS ===
    console.log('[10/11] Creating triggers...');

    const triggerDefs = [
      ['trg_users_updated_at', 'users'],
      ['trg_diagnostic_updated_at', 'diagnostic_data'],
      ['trg_pipeline_updated_at', 'pipeline'],
      ['trg_files_updated_at', 'uploaded_files'],
    ];

    for (const [name, table] of triggerDefs) {
      await exec(db, `
        CREATE TRIGGER IF NOT EXISTS ${name}
          AFTER UPDATE ON ${table}
          FOR EACH ROW
          WHEN NEW.updated_at = OLD.updated_at
          BEGIN
            UPDATE ${table} SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
          END
      `);
      console.log(`  Created ${name}`);
    }
    console.log('');

    // === PHASE 11: POST-VERIFY ===
    console.log('[11/11] Post-migration verification...');
    console.log('');

    // Check tables
    const finalTables = await all(db, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
    const tableNames = finalTables.map(t => t.name);
    const expectedTables = ['audio_recordings', 'diagnostic_data', 'pipeline', 'uploaded_files', 'users'];
    const tablesOk = JSON.stringify(tableNames) === JSON.stringify(expectedTables);
    console.log(`  Tables: ${tableNames.join(', ')} ${tablesOk ? '✅' : '❌'}`);

    // Check legacy gone
    const legacyGone = !tableNames.includes('user_progress') && !tableNames.includes('tasks') && !tableNames.includes('submissions');
    console.log(`  Legacy tables removed: ${legacyGone ? '✅' : '❌'}`);

    // Check WAL
    const wal = await get(db, 'PRAGMA journal_mode');
    console.log(`  WAL mode: ${wal.journal_mode} ${wal.journal_mode === 'wal' ? '✅' : '❌'}`);

    // Check FK
    const fk = await get(db, 'PRAGMA foreign_keys');
    console.log(`  Foreign keys: ${fk.foreign_keys ? 'ON' : 'OFF'} ${fk.foreign_keys ? '✅' : '❌'}`);

    // Check indexes
    const idxCount = await get(db, `SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`);
    console.log(`  Custom indexes: ${idxCount.cnt} ${idxCount.cnt === 8 ? '✅' : '❌'}`);

    // Check triggers
    const trgCount = await get(db, `SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'`);
    console.log(`  Triggers: ${trgCount.cnt} ${trgCount.cnt === 4 ? '✅' : '❌'}`);

    // Check row counts
    console.log('  Row counts:');
    for (const tbl of expectedTables) {
      const cnt = await get(db, `SELECT COUNT(*) as cnt FROM "${tbl}"`);
      console.log(`    ${tbl}: ${cnt.cnt}`);
    }

    // Check orphans
    const orphanChecks = [
      ['diagnostic_data', 'SELECT COUNT(*) as cnt FROM diagnostic_data dd LEFT JOIN users u ON dd.user_id = u.id WHERE u.id IS NULL'],
      ['pipeline', 'SELECT COUNT(*) as cnt FROM pipeline p LEFT JOIN users u ON p.user_id = u.id WHERE u.id IS NULL'],
      ['audio_recordings', 'SELECT COUNT(*) as cnt FROM audio_recordings ar LEFT JOIN users u ON ar.user_id = u.id WHERE u.id IS NULL'],
      ['uploaded_files', 'SELECT COUNT(*) as cnt FROM uploaded_files uf LEFT JOIN users u ON uf.user_id = u.id WHERE u.id IS NULL'],
    ];

    let orphanTotal = 0;
    for (const [name, sql] of orphanChecks) {
      const r = await get(db, sql);
      orphanTotal += r.cnt;
    }
    console.log(`  Orphaned records: ${orphanTotal} ${orphanTotal === 0 ? '✅' : '❌'}`);

    // FK integrity
    const fkCheck = await all(db, 'PRAGMA foreign_key_check');
    console.log(`  FK integrity violations: ${fkCheck.length} ${fkCheck.length === 0 ? '✅' : '❌'}`);

    // Final verdict
    const allPassed = tablesOk && legacyGone && wal.journal_mode === 'wal' && idxCount.cnt === 8 && trgCount.cnt === 4 && orphanTotal === 0 && fkCheck.length === 0;

    console.log('');
    console.log('============================================');
    if (allPassed) {
      console.log('  MIGRATION SUCCESSFUL ✅');
    } else {
      console.log('  MIGRATION COMPLETED WITH WARNINGS ⚠️');
      console.log('  Review checks above for issues.');
    }
    console.log('============================================');
    console.log(`  Backup at: ${BACKUP_PATH}`);
    console.log(`  Rollback: copy backup file back to ${DB_PATH}`);
    console.log('============================================');

    db.close();
    process.exit(allPassed ? 0 : 1);

  } catch (err) {
    console.error('\n❌ MIGRATION FAILED:', err.message);
    console.error('Stack:', err.stack);
    console.error(`\nTo rollback: copy ${BACKUP_PATH} to ${DB_PATH}`);
    db.close();
    process.exit(1);
  }
}

migrate();
