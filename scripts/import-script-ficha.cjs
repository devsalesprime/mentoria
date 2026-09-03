#!/usr/bin/env node
/**
 * Importa um JSON de pré-preenchimento da Ficha do Script (contrato CONTRATO-prefill-json.md)
 * na produção, pelo endpoint admin. Uso:
 *   node scripts/import-script-ficha.cjs <caminho.json> [--local] [--dry]
 * Token admin cunhado com VPS_JWT_SECRET (produção) ou JWT_SECRET (--local), como o deliver.cjs.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const useLocal = args.includes('--local');
const dry = args.includes('--dry');
if (!file) { console.error('uso: node scripts/import-script-ficha.cjs <caminho.json> [--local] [--dry]'); process.exit(1); }

const secret = useLocal ? process.env.JWT_SECRET : (process.env.VPS_JWT_SECRET || process.env.JWT_SECRET);
if (!secret) { console.error('segredo JWT ausente no .env'); process.exit(1); }
const base = useLocal ? 'http://localhost:3005' : 'https://prosperusclub.com.br';
const token = jwt.sign({ userId: 'admin-001', role: 'admin', user: 'admin', name: 'Admin' }, secret, { expiresIn: '15m' });

(async () => {
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const slug = payload.club_slug;
  const campos = Object.keys(payload.campos || {});
  console.log(`clube=${slug} campos=${campos.length} destino=${base}${dry ? ' (dry)' : ''}`);
  if (dry) return;
  try {
    const r = await axios.put(`${base}/api/admin/clubs/${slug}/script-ficha`, payload, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 30000,
    });
    const d = r.data || {};
    console.log(`HTTP ${r.status}`, JSON.stringify({ importados: d.importados ?? d.imported, pulados: d.pulados ?? d.skipped, ficha_status: d.ficha_status ?? d.fichaStatus, warnings: (d.warnings || []).length, erros: (d.errors || d.erros || []).length }));
    if ((d.warnings || []).length) console.log('warnings:', d.warnings.slice(0, 5));
  } catch (e) {
    const s = e.response?.status; const b = e.response?.data;
    console.error(`FALHA HTTP ${s}:`, typeof b === 'string' ? b.slice(0, 300) : JSON.stringify(b).slice(0, 600));
    process.exit(2);
  }
})();
