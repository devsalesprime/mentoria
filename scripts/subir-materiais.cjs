#!/usr/bin/env node
/**
 * Sobe materiais em nome de um membro do cohort (login so por e-mail) e grava links + observacoes.
 * Nao clica em "Enviei o que tinha": o submit (que dispara o pre-preenchimento) fica para o gate humano.
 *
 * Uso (raiz do app, .env com nada especial; usa a API publica):
 *   node scripts/subir-materiais.cjs --email <e-mail do membro> --lista <LISTA-selecionada.json> [--base https://prosperusclub.com.br] [--raiz <pasta base dos paths relativos>] [--dry]
 *
 * LISTA-selecionada.json: { links: [{url, rotulo, tipo}], arquivos: [{id, titulo, path, categoria}], observacoes?: string }
 * Categorias validas: script_transcricao_venda, script_apostila_slides, script_proposta_roteiro, script_crm, script_outros.
 * Idempotente por nome de arquivo: nao sobe de novo o que ja esta na lista de arquivos do membro.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const EMAIL = opt('--email'); const LISTA = opt('--lista'); const BASE = opt('--base', 'https://prosperusclub.com.br');
const RAIZ = opt('--raiz', process.cwd()); const DRY = args.includes('--dry');
if (!EMAIL || !LISTA) { console.error('uso: --email <e-mail> --lista <json>'); process.exit(2); }

const MIME = { '.md': 'text/markdown', '.txt': 'text/plain', '.json': 'application/json', '.csv': 'text/csv', '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.html': 'text/html' };

(async () => {
  const lista = JSON.parse(fs.readFileSync(LISTA, 'utf8'));
  const login = await axios.post(`${BASE}/auth/verify-member`, { email: EMAIL }, { timeout: 30000 });
  const token = login.data.token; const H = { Authorization: `Bearer ${token}` };
  const ficha = (await axios.get(`${BASE}/api/script/ficha`, { headers: H, timeout: 30000 })).data.data;
  const jaTem = new Set((ficha.files || []).map((f) => f.fileName || f.name || f.file_name));
  console.log(`membro ${EMAIL} · clube ${ficha.club?.slug} · arquivos ja no app: ${jaTem.size}`);

  let subidos = 0, pulados = 0, falhas = [];
  for (const a of lista.arquivos || []) {
    const abs = path.isAbsolute(a.path) ? a.path : path.join(RAIZ, a.path);
    if (!fs.existsSync(abs)) { falhas.push(`${a.id}: arquivo nao existe (${abs})`); continue; }
    const ext = path.extname(abs).toLowerCase();
    const nome = `${a.id} - ${a.titulo.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 90)}${ext}`;
    if (jaTem.has(nome)) { pulados++; continue; }
    if (DRY) { console.log('subiria:', nome, `(${Math.round(fs.statSync(abs).size / 1024)} KB, ${a.categoria})`); continue; }
    const fd = new FormData();
    fd.append('file', fs.createReadStream(abs), { filename: nome, contentType: MIME[ext] || 'application/octet-stream' });
    fd.append('category', a.categoria); fd.append('module', 'script');
    try {
      await axios.post(`${BASE}/api/files/upload`, fd, { headers: { ...H, ...fd.getHeaders() }, timeout: 120000, maxBodyLength: Infinity });
      subidos++; console.log('ok', nome);
    } catch (e) { falhas.push(`${a.id}: ${e.response?.status} ${JSON.stringify(e.response?.data || e.message).slice(0, 120)}`); }
  }
  if (!DRY && (lista.links || lista.observacoes)) {
    const atual = ficha.materials || {};
    const links = [...(atual.links || [])];
    for (const l of lista.links || []) if (!links.some((x) => x.url === l.url)) links.push(l);
    const body = { links };
    if (lista.observacoes) body.observacoes = lista.observacoes;
    await axios.put(`${BASE}/api/script/ficha/materials`, body, { headers: H, timeout: 30000 });
    console.log(`links gravados: ${links.length}`);
  }
  console.log(`subidos ${subidos} · pulados ${pulados} · falhas ${falhas.length}`);
  falhas.forEach((f) => console.log('  FALHA', f));
})().catch((e) => { console.error('FALHA', e.response?.status, JSON.stringify(e.response?.data || e.message).slice(0, 300)); process.exit(1); });
