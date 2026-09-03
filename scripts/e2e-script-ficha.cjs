#!/usr/bin/env node
/**
 * E2E local do Script 7 Passos (Ship 1). NUNCA rodar contra producao.
 *
 * Pre-requisito: servidor local rodando com banco temporario, ex.:
 *   DB_PATH=/tmp/e2e.db PORT=3999 node server.cjs
 *
 * Uso:
 *   node scripts/e2e-script-ficha.cjs [--base=http://localhost:3999] [--email=mentor.exemplo@teste.local]
 *
 * Fluxo: cria clube exemplo-clube (admin) -> login do membro pelo cohort (sem etapa do HubSpot)
 *        -> importa data/samples/prefill-exemplo.json -> GET ficha -> PUT fields -> complete
 *        -> materiais POR PESSOA (A sobe arquivo, B do mesmo clube nao ve nem baixa; acessos de A
 *           nao chegam a B; submit por pessoa; admin ve tudo; prazo via cohort_config) -> overview admin.
 * O token admin e cunhado com o JWT_SECRET do .env (mesmo padrao de scripts/deliver.cjs).
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=');
  return [k, v === undefined ? true : v];
}));
const BASE = args.base || 'http://localhost:3999';
const EMAIL = args.email || 'mentor.exemplo@teste.local';
const EMAIL_B = args.emailB || 'socio.exemplo@teste.local';
const SLUG = 'exemplo-clube';
const SENHA_A = 'Segredo#A-123';

if (/prosperusclub|salesprime|\/\/(?!localhost|127\.0\.0\.1)/.test(BASE)) {
  console.error('Recusado: este e2e so roda em localhost.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET ausente no .env');
  process.exit(1);
}

const adminToken = jwt.sign({ userId: 'admin-001', role: 'admin', user: 'admin', name: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function call(method, url, token, body, expectOk = true) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (expectOk && !res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}

/** Sobe um arquivo pequeno via POST /api/files/upload (multipart), como o front faz. */
async function upload(token, category, name, content, expectOk = true) {
  const fd = new FormData();
  fd.append('category', category);
  fd.append('file', new Blob([content], { type: 'text/plain' }), name);
  const res = await fetch(BASE + '/api/files/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (expectOk && !res.ok) throw new Error(`upload ${name} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}

async function raw(method, url, token) {
  const res = await fetch(BASE + url, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, text: await res.text() };
}

function step(msg) { console.log(`\n== ${msg}`); }

(async () => {
  step('0. Health');
  console.log((await call('GET', '/health')).data);

  step('1. Sem token: GET /api/script/ficha -> 401');
  const noTok = await call('GET', '/api/script/ficha', null, null, false);
  if (noTok.status !== 401) throw new Error(`esperado 401, veio ${noTok.status}`);
  console.log('401 ok');

  step(`2. Admin cria/atualiza clube ${SLUG} com membro ${EMAIL}`);
  const members = await call('PUT', `/api/admin/clubs/${SLUG}/members`, adminToken, {
    nome: 'Clube Exemplo', add: [{ email: EMAIL, nome: 'Mentor Exemplo' }],
  });
  console.log(members.data.club, 'membros:', members.data.membros.map((m) => m.email));

  step('3. Login do membro pelo cohort (POST /auth/verify-member)');
  const login = await call('POST', '/auth/verify-member', null, { email: EMAIL });
  if (!login.data.token) throw new Error('login sem token');
  const memberToken = login.data.token;
  console.log('login ok; cohort =', login.data.user.cohort, 'clube =', login.data.user.clubSlug);

  step('3b. Mesmo e-mail em outra caixa -> mesma conta (sem linha duplicada em users)');
  const mixed = EMAIL.replace(/^(\w)(\w*)@(\w)/, (_, a, b, c) => `${a.toUpperCase()}${b}@${c.toUpperCase()}`);
  const login2 = await call('POST', '/auth/verify-member', null, { email: `  ${mixed} ` });
  console.log(mixed, '->', login2.data.user.email, '| userId igual:', login2.data.user.userId === login.data.user.userId);
  if (login2.data.user.userId !== login.data.user.userId) throw new Error('e-mail em caixa diferente criou outra conta');
  if (login2.data.user.email !== EMAIL.toLowerCase()) throw new Error('e-mail nao normalizado');

  step('4. GET /api/diagnostic expoe cohort/club');
  const diag = await call('GET', '/api/diagnostic', memberToken);
  console.log({ cohort: diag.data.data.cohort, club_slug: diag.data.data.club_slug, club_nome: diag.data.data.club_nome });

  step('5. GET /api/script/ficha (vazia)');
  let ficha = await call('GET', '/api/script/ficha', memberToken);
  console.log('status:', ficha.data.data.ficha_status, '| hoje:', ficha.data.data.hoje.dia, `(${ficha.data.data.hoje.minutos} min)`, '| progresso:', ficha.data.data.progresso);

  step('6. Admin importa prefill (data/samples/prefill-exemplo.json)');
  const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'samples', 'prefill-exemplo.json'), 'utf8'));
  const bad = JSON.parse(JSON.stringify(sample));
  delete bad.campos['6.7'];
  bad.campos['2.1'].fonte = '';
  const rej = await call('PUT', `/api/admin/clubs/${SLUG}/script-ficha`, adminToken, bad, false);
  console.log('JSON invalido ->', rej.status, rej.data.errors);
  if (rej.status !== 400) throw new Error('esperado 400 no JSON invalido');
  const imp = await call('PUT', `/api/admin/clubs/${SLUG}/script-ficha`, adminToken, sample);
  console.log(imp.data.message, '| status:', imp.data.ficha_status, '| resumo:', imp.data.resumo);

  step('7. GET /api/script/ficha (pre_preenchida)');
  ficha = await call('GET', '/api/script/ficha', memberToken);
  const b1 = ficha.data.data.blocos[0];
  console.log('status:', ficha.data.data.ficha_status, '| bloco 1:', b1.campos.map((c) => `${c.key}=${c.status}`).join(' '));

  step('8. PUT fields: confirma 1.1, edita 3.8, aceita vazio 1.2, tenta confirmar campo vazio (rejeitado)');
  const upd = await call('PUT', '/api/script/ficha/fields', memberToken, {
    updates: {
      '1.1': { status: 'confirmado' },
      '3.8': { status: 'editado', valor: 'Faturamento atual\nTamanho da equipe\nTicket médio\nCidade\nQuem decide junto' },
      '1.2': { status: 'aceito_vazio' },
      '5.3': { status: 'confirmado' },
    },
  });
  console.log('applied:', upd.data.applied, '| rejected:', upd.data.rejected, '| status:', upd.data.ficha_status, '| hoje:', upd.data.hoje.dia);

  step('9. complete antes da hora -> 400 com lista');
  const early = await call('POST', '/api/script/ficha/complete', memberToken, {}, false);
  console.log(early.status, early.data.message, 'faltam:', (early.data.faltam || []).length);
  if (early.status !== 400) throw new Error('esperado 400');

  step('10. Decide tudo que falta e fecha a ficha');
  ficha = await call('GET', '/api/script/ficha', memberToken);
  const updates = {};
  for (const b of ficha.data.data.blocos) for (const c of b.campos) {
    if (c.decidido) continue;
    updates[c.key] = c.sugerido ? { status: 'confirmado' } : (c.obrigatorio ? { status: 'editado', valor: `Resposta de teste para ${c.key}` } : { status: 'aceito_vazio' });
  }
  const all = await call('PUT', '/api/script/ficha/fields', memberToken, { updates });
  console.log('applied:', all.data.applied.length, '| progresso:', all.data.progresso, '| hoje:', all.data.hoje);
  const done = await call('POST', '/api/script/ficha/complete', memberToken, {});
  console.log('complete ->', done.data);

  step('11. Re-importar nao sobrescreve decididos');
  const reimp = await call('PUT', `/api/admin/clubs/${SLUG}/script-ficha`, adminToken, sample);
  console.log(reimp.data.message, '| skipped:', reimp.data.skipped.length);
  if (reimp.data.skipped.length !== 34) throw new Error('esperado 34 campos mantidos');

  step('12. Materiais por pessoa: A salva links + observacoes (sem submit ainda)');
  const mat = await call('PUT', '/api/script/ficha/materials', memberToken, {
    links: [{ url: 'https://drive.google.com/drive/folders/exemplo', rotulo: 'Pasta do Drive', tipo: 'drive' }],
    observacoes: 'Gravações vão pelo WhatsApp.',
  });
  console.log('links salvos:', mat.data.materials.links.length, '| acessos:', mat.data.materials.acessos.length);
  if (mat.data.materials.links.length !== 1) throw new Error('esperado 1 link de A');

  step(`12a. Admin adiciona o socio B (${EMAIL_B}) ao mesmo clube; login de B`);
  await call('PUT', `/api/admin/clubs/${SLUG}/members`, adminToken, { add: [{ email: EMAIL_B, nome: 'Sócio Exemplo' }] });
  const loginB = await call('POST', '/auth/verify-member', null, { email: EMAIL_B });
  if (!loginB.data.token) throw new Error('login de B sem token');
  const memberBToken = loginB.data.token;
  console.log('B logado; clube =', loginB.data.user.clubSlug);

  step('12b. A sobe um arquivo (multipart); B nao ve nem baixa; A baixa');
  const up = await upload(memberToken, 'script_transcricao_venda', 'reuniao-exemplo.txt', 'Transcrição de teste da reunião de venda.');
  const fileId = up.data.data.id;
  console.log('upload ->', fileId, up.data.data.fileName);
  const badCat = await upload(memberToken, 'script_invalida', 'x.txt', 'x', false);
  if (badCat.status !== 400) throw new Error('categoria invalida deveria dar 400');
  const filesA = await call('GET', '/api/script/materials/files', memberToken);
  const filesB = await call('GET', '/api/script/materials/files', memberBToken);
  console.log('A ve', filesA.data.data.length, 'arquivo(s) | B ve', filesB.data.data.length);
  if (!filesA.data.data.some((f) => f.id === fileId)) throw new Error('A deveria ver o proprio arquivo');
  if (filesB.data.data.some((f) => f.id === fileId)) throw new Error('B NAO deveria ver o arquivo de A');
  const fichaB = await call('GET', '/api/script/ficha', memberBToken);
  if (fichaB.data.data.files.length !== 0) throw new Error('GET ficha de B deveria vir sem arquivos');
  const dlB = await raw('GET', `/api/script/materials/files/${fileId}/download`, memberBToken);
  const dlA = await raw('GET', `/api/script/materials/files/${fileId}/download`, memberToken);
  console.log('download por B ->', dlB.status, '| por A ->', dlA.status, `(${dlA.text.length} bytes)`);
  if (dlB.status !== 404 && dlB.status !== 403) throw new Error('B nao pode baixar o arquivo de A');
  if (dlA.status !== 200 || !dlA.text.includes('Transcrição de teste')) throw new Error('A deveria baixar o proprio arquivo');

  step('12c. A salva acesso de plataforma; B nao recebe nada de A');
  const ac = await call('PUT', '/api/script/ficha/materials', memberToken, {
    acessos: [{ plataforma_url: 'https://plataforma.exemplo.com/login', login: EMAIL, senha: SENHA_A, observacoes: 'O curso X está na aba Y.' }],
  });
  console.log('acessos de A:', ac.data.materials.acessos.length, '| links mantidos:', ac.data.materials.links.length);
  if (ac.data.materials.acessos.length !== 1 || ac.data.materials.links.length !== 1) throw new Error('PUT parcial deveria manter os links');
  const badAc = await call('PUT', '/api/script/ficha/materials', memberToken, { acessos: [{ plataforma_url: 'sem-protocolo', senha: 'x' }] }, false);
  if (badAc.status !== 400) throw new Error('acesso sem http(s) deveria dar 400');
  const fichaB2 = await raw('GET', '/api/script/ficha', memberBToken);
  const fichaB2Json = JSON.parse(fichaB2.text);
  console.log('B: materials =', JSON.stringify(fichaB2Json.data.materials));
  if (fichaB2.text.includes(SENHA_A) || fichaB2.text.includes('plataforma.exemplo.com')) throw new Error('acessos de A vazaram para B');
  if (fichaB2Json.data.materials.acessos.length !== 0 || fichaB2Json.data.materials.links.length !== 0) throw new Error('B deveria ver so os proprios materiais (vazios)');

  step('12d. Submit por pessoa: B envia; A continua pending; clube vira submitted');
  const subB = await call('POST', '/api/script/ficha/materials/submit', memberBToken, {});
  console.log('submit B ->', subB.data.materials_status, subB.data.materials_submitted_at);
  const fichaA = await call('GET', '/api/script/ficha', memberToken);
  const fichaB3 = await call('GET', '/api/script/ficha', memberBToken);
  console.log('A materials_status =', fichaA.data.data.materials_status, '| B =', fichaB3.data.data.materials_status);
  if (fichaA.data.data.materials_status !== 'pending') throw new Error('A nao clicou ainda: deveria estar pending');
  if (fichaB3.data.data.materials_status !== 'submitted') throw new Error('B deveria estar submitted');
  const ov1 = await call('GET', '/api/admin/cohort', adminToken);
  const row1 = ov1.data.data.find((r) => r.club_slug === SLUG);
  console.log('overview: materials_status =', row1.materials_status, '| pessoas_enviaram =', row1.pessoas_enviaram, '| materiais_count =', row1.materiais_count);
  if (row1.materials_status !== 'submitted' || row1.pessoas_enviaram !== 1) throw new Error('clube deveria estar submitted com 1 pessoa');
  if (row1.materiais_count < 1) throw new Error('materiais_count deveria contar o arquivo de A');
  const subA = await call('POST', '/api/script/ficha/materials/submit', memberToken, {});
  console.log('submit A ->', subA.data.materials_status);

  step('12e. Prazo (cohort_config): admin grava, membro le; vazio esconde');
  const cfg = await call('PUT', '/api/admin/cohort/config', adminToken, { prazo_materiais: 'até sexta, 12/09' });
  console.log('config ->', cfg.data.data);
  const fichaCfg = await call('GET', '/api/script/ficha', memberToken);
  if (fichaCfg.data.data.config.prazo_materiais !== 'até sexta, 12/09') throw new Error('membro deveria ler o prazo');
  const cfgMember = await call('PUT', '/api/admin/cohort/config', memberToken, { prazo_materiais: 'x' }, false);
  if (cfgMember.status !== 403) throw new Error('membro nao pode gravar config');
  await call('PUT', '/api/admin/cohort/config', adminToken, { prazo_materiais: '' });
  const fichaCfg2 = await call('GET', '/api/script/ficha', memberToken);
  if (fichaCfg2.data.data.config.prazo_materiais !== '') throw new Error('prazo vazio deveria voltar vazio');
  console.log('prazo lido pelo membro:', JSON.stringify(fichaCfg.data.data.config.prazo_materiais), '-> depois de limpar:', JSON.stringify(fichaCfg2.data.data.config.prazo_materiais));

  step('13. Admin overview + detalhe por pessoa');
  const ov = await call('GET', '/api/admin/cohort', adminToken);
  const row = ov.data.data.find((r) => r.club_slug === SLUG);
  console.log(row);
  if (row.pessoas_enviaram !== 2) throw new Error('esperado 2 pessoas com submit');
  const det = await call('GET', `/api/admin/clubs/${SLUG}/script-ficha`, adminToken);
  console.log('detalhe: status', det.data.data.ficha_status, '| campos', det.data.data.blocos.reduce((s, b) => s + b.campos.length, 0), '| membros', det.data.data.membros.length, '| pessoas', det.data.data.pessoas.length);
  const pA = det.data.data.pessoas.find((p) => p.email === EMAIL.toLowerCase());
  const pB = det.data.data.pessoas.find((p) => p.email === EMAIL_B.toLowerCase());
  console.log('A:', { files: pA.files.length, links: pA.links.length, acessos: pA.acessos.length, submitted_at: pA.submitted_at });
  console.log('B:', { files: pB.files.length, links: pB.links.length, acessos: pB.acessos.length, submitted_at: pB.submitted_at });
  if (!pA.files.some((f) => f.id === fileId) || pA.acessos.length !== 1 || pA.acessos[0].senha !== SENHA_A || pA.links.length !== 1) throw new Error('admin deveria ver arquivo, link e acesso (com senha) de A');
  if (pB.files.length !== 0 || pB.acessos.length !== 0 || !pB.submitted_at) throw new Error('admin deveria ver B sem materiais e com submit');
  const adminDl = await raw('GET', `/api/admin/files/${fileId}?token=${encodeURIComponent(adminToken)}`, null);
  console.log('download admin ->', adminDl.status);
  if (adminDl.status !== 200) throw new Error('admin deveria baixar o arquivo de A');

  step('13a. Limpeza: A apaga o proprio arquivo');
  await call('DELETE', `/api/files/${fileId}`, memberToken);
  const afterDel = await call('GET', '/api/script/materials/files', memberToken);
  console.log('arquivos de A depois:', afterDel.data.data.length);

  step('14. Usuario fora do cohort -> 403 { enabled: false }');
  const outsider = jwt.sign({ userId: 'user-fora-do-cohort', user: 'fora@teste.local', role: 'member', name: 'Fora' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  await call('POST', '/api/diagnostic', outsider, { current_module: 'pre_module' });
  const forbidden = await call('GET', '/api/script/ficha', outsider, null, false);
  console.log(forbidden.status, forbidden.data);
  if (forbidden.status !== 403 || forbidden.data.enabled !== false) throw new Error('esperado 403 enabled:false');

  step('15. Clube desativado (ativo = 0): membro perde a area e o menu; reativar devolve');
  await call('PUT', `/api/admin/clubs/${SLUG}/members`, adminToken, { ativo: 0 });
  const offFicha = await call('GET', '/api/script/ficha', memberToken, null, false);
  const offDiag = await call('GET', '/api/diagnostic', memberToken);
  console.log('ficha ->', offFicha.status, offFicha.data, '| diagnostic.cohort =', offDiag.data.data.cohort, '| club_slug =', offDiag.data.data.club_slug);
  if (offFicha.status !== 403 || offFicha.data.enabled !== false) throw new Error('clube inativo deveria dar 403 enabled:false');
  if (offDiag.data.data.cohort !== null) throw new Error('clube inativo deveria esconder o cohort no /api/diagnostic (menu)');
  const offLogin = await call('POST', '/auth/verify-member', null, { email: EMAIL }, false);
  console.log('login com clube inativo ->', offLogin.status, '(sem bypass; segue a regra do HubSpot)');
  if (offLogin.status === 200 && offLogin.data.user && offLogin.data.user.cohort) throw new Error('login nao deveria marcar cohort com clube inativo');
  await call('PUT', `/api/admin/clubs/${SLUG}/members`, adminToken, { ativo: 1 });
  const onFicha = await call('GET', '/api/script/ficha', memberToken);
  const onDiag = await call('GET', '/api/diagnostic', memberToken);
  console.log('reativado: ficha ->', onFicha.status, '| diagnostic.cohort =', onDiag.data.data.cohort);
  if (onDiag.data.data.cohort !== 'exclusive') throw new Error('reativar deveria devolver o cohort');

  console.log('\nE2E OK');
})().catch((err) => {
  console.error('\nE2E FALHOU:', err.message);
  process.exit(1);
});
