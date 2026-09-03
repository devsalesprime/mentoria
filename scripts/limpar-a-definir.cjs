#!/usr/bin/env node
/**
 * Limpa sugestoes do tipo "a definir" / "a confirmar" / "nao encontramos" / "nao sei" / "???" da Ficha do Script
 * de TODOS os clubes (regra "sem a definir", utils/script-ficha.cjs limparADefinir).
 * So toca campo NAO decidido: vira `vazio` (classe VZ), o texto vai para nota_interna; alternativas com placeholder somem.
 *
 * Dry-run por padrao (so relata). `--aplicar` grava.
 *   node scripts/limpar-a-definir.cjs                       # relatorio, banco padrao (data/prosperus.db)
 *   node scripts/limpar-a-definir.cjs --aplicar             # grava
 *   DB_PATH=/tmp/e2e.db node scripts/limpar-a-definir.cjs   # outro banco
 */
const path = require('path');
const sqlite3 = require('sqlite3');
const SF = require('../utils/script-ficha.cjs');

const APLICAR = process.argv.includes('--aplicar');
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, '..', 'data', 'prosperus.db');

function parse(s, fb) { try { return s ? JSON.parse(s) : fb; } catch { return fb; } }

async function run() {
  const db = new sqlite3.Database(DB_PATH);
  const { dbGet, dbRun, dbAll } = require('../utils/db-helpers.cjs')(db);
  await dbRun('PRAGMA busy_timeout = 5000');
  const has = await dbGet(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'script_fichas'`);
  if (!has) { console.log(`Sem tabela script_fichas em ${DB_PATH}.`); db.close(); return { clubes: 0, campos: 0 }; }

  const rows = await dbAll(
    `SELECT sf.club_slug, sf.fields, cc.nome FROM script_fichas sf LEFT JOIN cohort_clubs cc ON cc.slug = sf.club_slug ORDER BY sf.club_slug`
  );
  console.log(`${APLICAR ? 'APLICANDO' : 'DRY-RUN (use --aplicar para gravar)'} em ${DB_PATH}: ${rows.length} ficha(s)`);
  let totalCampos = 0;
  let totalClubes = 0;
  for (const r of rows) {
    const { fields, alterados } = SF.limparADefinir(parse(r.fields, {}));
    if (!alterados.length) { console.log(`- ${r.club_slug} (${r.nome || 'sem nome'}): nada a limpar`); continue; }
    totalClubes += 1;
    totalCampos += alterados.length;
    console.log(`- ${r.club_slug} (${r.nome || 'sem nome'}): ${alterados.length} campo(s)`);
    for (const a of alterados) {
      const antes = a.antes ? `"${String(a.antes).replace(/\s+/g, ' ').slice(0, 80)}"` : '(sugerido vazio)';
      console.log(`    ${a.key}: ${antes} -> vazio${a.alternativas_removidas ? ` (+${a.alternativas_removidas} alternativa(s) removida(s))` : ''}`);
    }
    if (APLICAR) {
      await dbRun(`UPDATE script_fichas SET fields = ?, updated_at = CURRENT_TIMESTAMP WHERE club_slug = ?`, [JSON.stringify(fields), r.club_slug]);
    }
  }
  console.log(`\nResumo: ${totalCampos} campo(s) em ${totalClubes} clube(s)${APLICAR ? ' gravados.' : ' seriam limpos.'}`);
  await new Promise((resolve) => db.close(resolve));
  return { clubes: totalClubes, campos: totalCampos };
}

if (require.main === module) {
  run().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });
}

module.exports = { run };
