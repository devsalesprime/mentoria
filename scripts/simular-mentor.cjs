#!/usr/bin/env node
/**
 * Simula o fluxo do mentor na PRODUÇÃO com um clube de teste:
 *   1. cria/atualiza o clube de teste com o e-mail informado (admin)
 *   2. importa um JSON de pré-preenchimento com o club_slug trocado (admin)
 *   3. faz login como o membro (só e-mail), lê a ficha, confirma os blocos pedidos e lê de novo
 * Uso: node scripts/simular-mentor.cjs --slug teste-danilo --email x@y --json <prefill.json> --blocos 1,2,3
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const slug = arg('slug', 'teste-danilo'); const email = arg('email'); const jsonPath = arg('json'); const blocos = (arg('blocos', '1,2,3')).split(',').map(Number);
const base = 'https://prosperusclub.com.br';
const secret = process.env.VPS_JWT_SECRET || process.env.JWT_SECRET;
const admin = jwt.sign({ userId: 'admin-001', role: 'admin', user: 'admin', name: 'Admin' }, secret, { expiresIn: '15m' });
const H = t => ({ headers: { Authorization: `Bearer ${t}` }, timeout: 30000 });
(async () => {
  const r1 = await axios.put(`${base}/api/admin/clubs/${slug}/members`, { nome: 'Clube de teste (Danilo)', ativo: 1, add: [{ email, nome: 'Danilo Yuzo (teste)' }] }, H(admin));
  console.log('1 clube:', r1.data.club, 'membros:', r1.data.membros.map(m => m.email));
  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); payload.club_slug = slug; payload.club_nome = 'Clube de teste (Danilo)'; payload.membros = [email];
  const r2 = await axios.put(`${base}/api/admin/clubs/${slug}/script-ficha`, payload, H(admin));
  console.log('2 import:', r2.data.importados ?? r2.data.imported, r2.data.ficha_status);
  const r3 = await axios.post(`${base}/auth/verify-member`, { email }, { timeout: 30000 });
  const tok = r3.data.token; console.log('3 login membro:', !!tok, r3.data.user?.cohort ?? '', r3.data.user?.club_slug ?? '');
  const r4 = await axios.get(`${base}/api/script/ficha`, H(tok));
  const f = r4.data.data || r4.data; const campos = {};
  for (const b of (f.blocos || [])) for (const c of (b.campos || [])) campos[c.key] = { ...c, bloco: b.numero };
  console.log('4 ficha:', f.ficha_status, 'campos:', Object.keys(campos).length, 'hoje:', JSON.stringify(f.hoje));
  const updates = {};
  for (const [k, v] of Object.entries(campos)) {
    if (!blocos.includes(Number(v.bloco ?? k.split('.')[0]))) continue;
    const st = v.status; const sug = v.sugerido ?? '';
    if (st === 'sugerido' && sug) updates[k] = { valor: sug, status: 'confirmado' };
    else if (st === 'vazio') updates[k] = { valor: '', status: 'aceito_vazio' };
  }
  const r5 = await axios.put(`${base}/api/script/ficha/fields`, { updates }, H(tok));
  console.log('5 confirmados:', Object.keys(updates).length, 'resp:', r5.data.success ?? r5.status);
  const r6 = await axios.get(`${base}/api/script/ficha`, H(tok));
  const g = r6.data.data || r6.data;
  console.log('6 depois:', g.ficha_status, 'hoje:', JSON.stringify(g.hoje), 'progresso:', JSON.stringify(g.progresso));
  console.log('   blocos:', (g.blocos || []).map(b => `${b.numero}:${b.decididos}/${b.total}${b.fechado ? '✓' : ''}`).join(' '));
})().catch(e => { console.error('FALHA', e.response?.status, JSON.stringify(e.response?.data || e.message).slice(0, 500)); process.exit(2); });
