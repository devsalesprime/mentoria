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
 *           nao chegam a B; submit por pessoa; admin ve tudo; prazo via cohort_config)
 *        -> prompt da IA + resposta colada -> "Confirmar e ir para a ficha" com WhatsApp -> job na fila
 *        -> worker (POST /api/jobs/next com COHORT_JOBS_TOKEN) le materiais/ficha, grava o prefill, fecha o job
 *        -> admin ve a fila e reprocessa -> overview admin
 *        -> ship 2 (passos 16 a 19): contexto por pergunta (nota + link em 3.3, visiveis no GET context e na ficha do job),
 *           complete -> job `script` -> worker PUT script -> membro le v1, comenta e aprova; refinar -> worker pega (any)
 *           -> PUT campo volta o campo para sugerido com "sua versão anterior"; "a definir" vira vazio; limpar-a-definir.
 * O token admin e cunhado com o JWT_SECRET do .env (mesmo padrao de scripts/deliver.cjs).
 * COHORT_JOBS_TOKEN precisa estar no ambiente DOS DOIS processos (servidor e este script), com o mesmo valor:
 *   COHORT_JOBS_TOKEN=e2e-token DB_PATH=/tmp/e2e.db PORT=3999 node server.cjs
 *   COHORT_JOBS_TOKEN=e2e-token node scripts/e2e-script-ficha.cjs
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
const JOBS_TOKEN = (process.env.COHORT_JOBS_TOKEN || '').trim();
if (!JOBS_TOKEN) {
  console.error('COHORT_JOBS_TOKEN ausente no ambiente (o mesmo valor tem que estar no servidor). Ex.: COHORT_JOBS_TOKEN=e2e-token');
  process.exit(1);
}
const PHONE_A = '(11) 98765-4321';
const PHONE_A_NORM = '5511987654321';

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

/** Contexto por pergunta: POST /api/script/context (multipart), como o front faz. */
async function contexto(token, fields, file, expectOk = true) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append('file', new Blob([file.content], { type: file.type }), file.name);
  const res = await fetch(BASE + '/api/script/context', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (expectOk && !res.ok) throw new Error(`contexto ${fields.tipo} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}

/** Chamadas do worker (a Naia): Authorization: Bearer <COHORT_JOBS_TOKEN>. */
async function worker(method, url, body, token = JOBS_TOKEN, expectOk = true) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  if (expectOk && !res.ok) throw new Error(`worker ${method} ${url} -> ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, data, text };
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

  step('12f. Prompt da IA (GET /api/script/prompt-ia) e resposta colada (PUT materials { resposta_ia })');
  const pr = await call('GET', '/api/script/prompt-ia', memberToken);
  const promptLines = pr.data.prompt.split('\n').filter((l) => /^\d\.\d+\. /.test(l));
  console.log('prompt:', pr.data.prompt.length, 'chars |', promptLines.length, 'campos | FONTES:', pr.data.prompt.includes('### FONTES'), '| travessão:', pr.data.prompt.includes('—'));
  if (promptLines.length !== 34 || !pr.data.prompt.includes('### FONTES') || pr.data.prompt.includes('—')) throw new Error('prompt fora do esperado');
  if (!pr.data.prompt.includes('Mentor Exemplo')) throw new Error('prompt deveria citar o nome do mentor');
  // Marcador unico: a ficha (por clube) legitimamente contem "Mentoria Exemplo" do prefill; o que nao pode vazar e a resposta de A
  const MARCA_IA = 'MARCADOR-RESPOSTA-IA-DE-A-7391';
  const respostaIA = `### 1.1 [CERTO]\nMentoria Exemplo (${MARCA_IA})\n### 2.1 [PARCIAL]\nEspecialista em X\n### 3.3 [INCERTO]\nnão sei\n### FONTES\n- exclusive book`;
  const ria = await call('PUT', '/api/script/ficha/materials', memberToken, { resposta_ia: respostaIA });
  console.log('resposta_ia ->', ria.data.resposta_ia.resumo, '| salvo_em:', ria.data.materials.resposta_ia.salvo_em);
  if (ria.data.resposta_ia.resumo !== '3 campos: 1 certo, 1 parcial, 1 incerto') throw new Error('resumo da resposta da IA errado');
  const fichaBria = await raw('GET', '/api/script/ficha', memberBToken);
  if (fichaBria.text.includes(MARCA_IA)) throw new Error('resposta da IA de A vazou para B');
  const fichaAria = await raw('GET', '/api/script/ficha', memberToken);
  if (!fichaAria.text.includes(MARCA_IA)) throw new Error('A deveria receber a propria resposta da IA no GET ficha');

  step('12g. "Confirmar e ir para a ficha": telefone invalido -> 400; A confirma com WhatsApp -> job (ja existia do 12d: existing)');
  const badPhone = await call('POST', '/api/script/ficha/materials/submit', memberToken, { notify_phone: '123' }, false);
  console.log('telefone invalido ->', badPhone.status, badPhone.data.message);
  if (badPhone.status !== 400) throw new Error('telefone invalido deveria dar 400');
  const subPhone = await call('POST', '/api/script/ficha/materials/submit', memberToken, { notify_phone: PHONE_A });
  console.log('submit com telefone ->', subPhone.data.notify_phone, '| job:', subPhone.data.job.id, subPhone.data.job.status, '| existing:', subPhone.data.job.existing);
  if (subPhone.data.notify_phone !== PHONE_A_NORM) throw new Error('telefone deveria vir normalizado com 55');
  if (subPhone.data.job.status !== 'queued' || subPhone.data.job.existing !== true) throw new Error('A ja tinha job queued (12d): deveria devolver o existente');
  const jobAId = subPhone.data.job.id;
  const fichaJob = await call('GET', '/api/script/ficha', memberToken);
  console.log('GET ficha: job =', fichaJob.data.data.job, '| notify_phone =', fichaJob.data.data.materials.notify_phone);
  if (!fichaJob.data.data.job || fichaJob.data.data.job.id !== jobAId || fichaJob.data.data.job.status !== 'queued') throw new Error('GET ficha deveria trazer o job queued da pessoa');

  step('12h. Worker (Naia): auth da fila');
  const noTokW = await worker('POST', '/api/jobs/next', { tipo: 'prefill' }, null, false);
  const badTokW = await worker('POST', '/api/jobs/next', { tipo: 'prefill' }, 'token-errado', false);
  console.log('sem token ->', noTokW.status, '| token errado ->', badTokW.status);
  if (noTokW.status !== 401 || badTokW.status !== 401) throw new Error('fila deveria exigir o Bearer certo (401)');
  const memberW = await call('GET', '/api/jobs', memberToken, null, false);
  if (memberW.status !== 401) throw new Error('token de membro nao vale na fila');

  step('12i. Worker: POST /api/jobs/next pega o mais antigo (B, do 12d), depois A (com telefone), depois 204');
  const n1 = await worker('POST', '/api/jobs/next', { tipo: 'prefill' });
  console.log('next 1 ->', n1.data.job.email, n1.data.job.status, 'tentativa', n1.data.job.attempts, '| clube:', n1.data.club.nome, '| app_url:', n1.data.app_url);
  if (n1.data.job.email !== EMAIL_B.toLowerCase() || n1.data.job.status !== 'running' || n1.data.job.attempts !== 1) throw new Error('primeiro da fila deveria ser B, running, tentativa 1');
  const jobBId = n1.data.job.id;
  const n2 = await worker('POST', '/api/jobs/next', { tipo: 'prefill' });
  console.log('next 2 ->', n2.data.job.email, '| pessoa:', n2.data.pessoa);
  if (n2.data.job.id !== jobAId || n2.data.pessoa.notify_phone !== PHONE_A_NORM || n2.data.pessoa.nome !== 'Mentor Exemplo') throw new Error('segundo da fila deveria ser A com o telefone e o nome');
  const n3 = await worker('POST', '/api/jobs/next', { tipo: 'prefill' }, JOBS_TOKEN, false);
  console.log('next 3 ->', n3.status, '(fila vazia)');
  if (n3.status !== 204) throw new Error('fila vazia deveria dar 204');
  const gj = await worker('GET', `/api/jobs/${jobAId}`);
  if (gj.data.job.status !== 'running' || gj.data.job.club_slug !== SLUG) throw new Error('GET /api/jobs/:id fora do esperado');

  step('12j. Worker: materiais do CLUBE por pessoa (arquivo de A com download_url, acesso com senha, resposta da IA), download do arquivo');
  const wm = await worker('GET', `/api/jobs/${jobAId}/materials`);
  const wA = wm.data.pessoas.find((p) => p.email === EMAIL.toLowerCase());
  const wB = wm.data.pessoas.find((p) => p.email === EMAIL_B.toLowerCase());
  console.log('A:', { files: wA.files.map((f) => f.name), links: wA.links.length, acessos: wA.acessos.length, resposta_ia: wA.resposta_ia && wA.resposta_ia.resumo, notify_phone: wA.notify_phone });
  console.log('B:', { files: wB.files.length, submitted_at: wB.submitted_at });
  if (!wA.files.some((f) => f.id === fileId && f.download_url === `/api/jobs/${jobAId}/files/${fileId}`)) throw new Error('worker deveria ver o arquivo de A com download_url');
  if (wA.acessos.length !== 1 || wA.acessos[0].senha !== SENHA_A) throw new Error('worker precisa dos acessos (com senha) para extrair a plataforma');
  if (!wA.resposta_ia || !wA.resposta_ia.texto.includes(MARCA_IA)) throw new Error('worker deveria receber a resposta da IA de A');
  if (wA.notify_phone !== PHONE_A_NORM || !wB.submitted_at) throw new Error('worker deveria ver telefone de A e submit de B');
  const wdl = await worker('GET', wA.files.find((f) => f.id === fileId).download_url);
  console.log('download pelo worker ->', wdl.status, `(${wdl.text.length} bytes)`);
  if (wdl.status !== 200 || !wdl.text.includes('Transcrição de teste')) throw new Error('worker deveria baixar o arquivo do clube');
  const wdl404 = await worker('GET', `/api/jobs/${jobAId}/files/nao-existe`, null, JOBS_TOKEN, false);
  if (wdl404.status !== 404) throw new Error('arquivo inexistente deveria dar 404');

  step('12k. Worker: GET ficha (o que o mentor ja decidiu) e PUT prefill (nao sobrescreve os 34 decididos)');
  const wf = await worker('GET', `/api/jobs/${jobAId}/ficha`);
  console.log('ficha pelo worker: status', wf.data.ficha_status, '| decididos', wf.data.decididos.length, '| blocos', wf.data.blocos.length);
  if (wf.data.decididos.length !== 34 || wf.data.blocos.length !== 6) throw new Error('ficha pelo worker fora do esperado (a ficha foi fechada no passo 10)');
  const wrongSlug = await worker('PUT', `/api/jobs/${jobAId}/prefill`, { ...sample, club_slug: 'outro-clube' }, JOBS_TOKEN, false);
  if (wrongSlug.status !== 400) throw new Error('club_slug diferente do job deveria dar 400');
  const wp = await worker('PUT', `/api/jobs/${jobAId}/prefill`, sample);
  console.log('prefill pelo worker ->', wp.data.message, '| imported:', wp.data.imported, '| skipped:', wp.data.skipped.length);
  if (wp.data.imported !== 0 || wp.data.skipped.length !== 34) throw new Error('prefill via job nao pode sobrescrever campo decidido');
  const fichaAfterW = await call('GET', '/api/script/ficha', memberToken);
  if (fichaAfterW.data.data.ficha_status !== 'confirmada') throw new Error('ficha confirmada deveria continuar confirmada');

  step('12l. Worker: PATCH done (A) e needs_human (B); lista por status; phones');
  const pd = await worker('PATCH', `/api/jobs/${jobAId}`, { status: 'done', result: { imported: 0, skipped: 34 } });
  console.log('PATCH done ->', pd.data.job.status, '| finished_at:', pd.data.job.finished_at);
  if (pd.data.job.status !== 'done' || !pd.data.job.finished_at) throw new Error('done deveria gravar finished_at');
  const pnh = await worker('PATCH', `/api/jobs/${jobBId}`, { status: 'needs_human', error: 'B não enviou material' });
  if (pnh.data.job.status !== 'needs_human' || pnh.data.job.error !== 'B não enviou material') throw new Error('needs_human deveria guardar o erro');
  const ldone = await worker('GET', '/api/jobs?status=done');
  const lnh = await worker('GET', '/api/jobs?status=needs_human');
  console.log('done:', ldone.data.data.map((j) => j.email), '| needs_human:', lnh.data.data.map((j) => j.email));
  if (!ldone.data.data.some((j) => j.id === jobAId) || !lnh.data.data.some((j) => j.id === jobBId)) throw new Error('lista por status fora do esperado');
  const phones = await worker('GET', '/api/jobs/phones');
  console.log('phones ->', phones.data.phones);
  if (!phones.data.phones.includes(PHONE_A_NORM)) throw new Error('phones deveria trazer o telefone de A');
  const fichaDone = await call('GET', '/api/script/ficha', memberToken);
  if (fichaDone.data.data.job.status !== 'done') throw new Error('GET ficha deveria mostrar o job done');

  step('12m. Admin: fila (GET /api/admin/cohort/jobs) e Reprocessar (requeue de B) -> worker pega de novo e fecha');
  const aj = await call('GET', '/api/admin/cohort/jobs', adminToken);
  const ajA = aj.data.data.find((j) => j.id === jobAId);
  const ajB = aj.data.data.find((j) => j.id === jobBId);
  console.log('admin fila:', aj.data.data.length, 'jobs | fila_ligada:', aj.data.fila_ligada, '| A:', ajA && { status: ajA.status, club_nome: ajA.club_nome, pessoa_nome: ajA.pessoa_nome, notify_phone: ajA.notify_phone });
  if (!ajA || ajA.status !== 'done' || ajA.club_nome !== 'Clube Exemplo' || ajA.notify_phone !== PHONE_A_NORM) throw new Error('admin deveria listar o job de A como done com clube e telefone');
  if (!ajB || ajB.status !== 'needs_human') throw new Error('admin deveria listar o job de B como needs_human');
  if (aj.data.fila_ligada !== true) throw new Error('fila_ligada deveria ser true (COHORT_JOBS_TOKEN no servidor)');
  const memberAj = await call('GET', '/api/admin/cohort/jobs', memberToken, null, false);
  if (memberAj.status !== 403) throw new Error('membro nao ve a fila do admin');
  const rq = await call('POST', `/api/admin/cohort/jobs/${jobBId}/requeue`, adminToken, {});
  console.log('requeue B ->', rq.data.job.status, '| attempts:', rq.data.job.attempts, '| error:', rq.data.job.error);
  if (rq.data.job.status !== 'queued' || rq.data.job.error !== null) throw new Error('requeue deveria voltar para queued e limpar o erro');
  const n4 = await worker('POST', '/api/jobs/next', { tipo: 'prefill' });
  if (n4.data.job.id !== jobBId || n4.data.job.attempts !== 2) throw new Error('worker deveria pegar B de novo (tentativa 2)');
  const rqRunning = await call('POST', `/api/admin/cohort/jobs/${jobBId}/requeue`, adminToken, {}, false);
  if (rqRunning.status !== 409) throw new Error('requeue de job running deveria dar 409');
  await worker('PATCH', `/api/jobs/${jobBId}`, { status: 'done' });
  const detJobs = await call('GET', `/api/admin/clubs/${SLUG}/script-ficha`, adminToken);
  const detA = detJobs.data.data.pessoas.find((p) => p.email === EMAIL.toLowerCase());
  console.log('detalhe: jobs do clube =', detJobs.data.data.jobs.length, '| A.notify_phone =', detA.notify_phone, '| A.resposta_ia =', detA.resposta_ia && detA.resposta_ia.resumo);
  if (detJobs.data.data.jobs.length < 2 || detA.notify_phone !== PHONE_A_NORM || !detA.resposta_ia) throw new Error('detalhe do clube deveria trazer jobs, telefone e resposta da IA');

  step('12n. Depois de done, A confirma de novo -> job novo (existing: false); worker fecha (limpeza)');
  const subNew = await call('POST', '/api/script/ficha/materials/submit', memberToken, { notify_phone: PHONE_A });
  console.log('novo submit ->', subNew.data.job.id, subNew.data.job.status, '| existing:', subNew.data.job.existing);
  if (subNew.data.job.existing !== false || subNew.data.job.id === jobAId) throw new Error('depois de done deveria nascer um job novo');
  const n5 = await worker('POST', '/api/jobs/next', { tipo: 'prefill' });
  await worker('PATCH', `/api/jobs/${n5.data.job.id}`, { status: 'done' });
  const emptyQ = await worker('POST', '/api/jobs/next', { tipo: 'prefill' }, JOBS_TOKEN, false);
  if (emptyQ.status !== 204) throw new Error('fila deveria estar vazia no fim');

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

  step('16. Contexto por pergunta: A anexa nota e B anexa link em 3.3; imagem por multipart; validacoes; visivel para o clube');
  const badCtx = await contexto(memberToken, { field_key: '3.3', tipo: 'link', url: 'sem-protocolo' }, null, false);
  if (badCtx.status !== 400) throw new Error('link sem http deveria dar 400');
  const badKey = await contexto(memberToken, { field_key: '9.9', tipo: 'nota', texto: 'x' }, null, false);
  if (badKey.status !== 400) throw new Error('campo desconhecido deveria dar 400');
  const nota = await contexto(memberToken, { field_key: '3.3', tipo: 'nota', texto: 'Ele fala: "não consigo sair do operacional"' });
  const link = await contexto(memberBToken, { field_key: '3.3', tipo: 'link', url: 'https://instagram.com/p/depoimento', legenda: 'depoimento no Instagram' });
  const img = await contexto(memberToken, { field_key: '1.1', tipo: 'imagem', legenda: 'print do site' }, { name: 'print.png', type: 'image/png', content: 'PNG-FAKE' });
  console.log('nota:', nota.data.item.id, '| link:', link.data.item.id, '| imagem:', img.data.item.file_name, img.data.item.download_url);
  const ctx33 = await call('GET', '/api/script/context?field=3.3', memberBToken);
  console.log('B ve em 3.3:', ctx33.data.items.map((i) => `${i.tipo} por ${i.autor_nome || i.autor_email}`));
  if (ctx33.data.items.length !== 2 || !ctx33.data.items.some((i) => i.id === nota.data.item.id) || !ctx33.data.items.some((i) => i.id === link.data.item.id)) throw new Error('contexto de 3.3 deveria ter a nota de A e o link de B');
  const ctxAll = await call('GET', '/api/script/context', memberToken);
  if (!ctxAll.data.por_campo['3.3'] || !ctxAll.data.por_campo['1.1']) throw new Error('GET context sem field deveria agrupar por campo');
  const ctxDl = await raw('GET', img.data.item.download_url, memberBToken);
  if (ctxDl.status !== 200 || ctxDl.text !== 'PNG-FAKE') throw new Error('socio deveria baixar o anexo de contexto');
  const delB = await call('DELETE', `/api/script/context/${nota.data.item.id}`, memberBToken, null, false);
  if (delB.status !== 403) throw new Error('so o autor apaga o contexto');
  await call('DELETE', `/api/script/context/${img.data.item.id}`, memberToken);
  const matA = await call('GET', '/api/script/materials/files', memberToken);
  if (matA.data.data.some((f) => f.category === 'script_contexto')) throw new Error('anexo de contexto nao pode aparecer entre os materiais');
  const fichaCtx = await call('GET', '/api/script/ficha', memberToken);
  const c33 = fichaCtx.data.data.blocos.flatMap((b) => b.campos).find((c) => c.key === '3.3');
  console.log('ficha 3.3:', { contexto_count: c33.contexto_count, refinando: c33.refinando }, '| script:', fichaCtx.data.data.script);
  if (c33.contexto_count !== 2 || c33.refinando !== false) throw new Error('GET ficha deveria trazer contexto_count = 2 e refinando = false em 3.3');

  step('17. Ficha confirmada (passo 10) -> gerar-script enfileira job `script` (1 por clube); worker (next any) grava v1; membro le, comenta e aprova');
  const gs = await call('POST', '/api/script/ficha/gerar-script', memberToken, {});
  console.log('gerar-script ->', gs.data.job.id, gs.data.job.tipo, gs.data.job.status, '| existing:', gs.data.job.existing);
  if (gs.data.job.tipo !== 'script' || gs.data.job.status !== 'queued') throw new Error('gerar-script deveria enfileirar um job script');
  const gs2 = await call('POST', '/api/script/ficha/gerar-script', memberBToken, {});
  if (gs2.data.job.id !== gs.data.job.id || gs2.data.job.existing !== true) throw new Error('1 job script ativo por clube');
  const vs0 = await call('GET', '/api/script/versoes', memberToken);
  if (vs0.data.versoes.length !== 0 || !vs0.data.job || vs0.data.job.id !== gs.data.job.id) throw new Error('sem versao ainda; GET versoes deveria trazer o job');
  const wn = await worker('POST', '/api/jobs/next', {});
  console.log('worker next (any) ->', wn.data.job.tipo, wn.data.job.id, '| payload:', wn.data.job.payload);
  if (wn.data.job.id !== gs.data.job.id || wn.data.job.tipo !== 'script') throw new Error('worker deveria pegar o job script');
  const wfCtx = await worker('GET', `/api/jobs/${wn.data.job.id}/ficha`);
  console.log('ficha do job: contexto 3.3 =', (wfCtx.data.contexto['3.3'] || []).map((i) => i.tipo), '| valores[1.1] =', JSON.stringify(wfCtx.data.valores['1.1']).slice(0, 60));
  if (!wfCtx.data.contexto['3.3'] || wfCtx.data.contexto['3.3'].length !== 2 || !wfCtx.data.valores || !wfCtx.data.valores['1.1']) throw new Error('ficha do job deveria trazer contexto por campo e valores planos');
  const md = '# Script\n\nAbertura.\n\n## Passo 1: Entregar o controle\n\nTexto do passo 1.\n\n## Passo 2: Dor\n\nTexto do passo 2.';
  const put1 = await worker('PUT', `/api/jobs/${wn.data.job.id}/script`, { content_md: md, resumo: 'v1 de teste' });
  console.log('PUT script ->', put1.data.versao, put1.data.status, put1.data.url);
  if (put1.data.versao !== 1 || !/\/dashboard\/script$/.test(put1.data.url)) throw new Error('PUT script deveria criar a v1 com url');
  await worker('PATCH', `/api/jobs/${wn.data.job.id}`, { status: 'done', result: { versao: 1 } });
  const vs1 = await call('GET', '/api/script/versoes', memberToken);
  const v1 = await call('GET', '/api/script/versoes/1', memberToken);
  console.log('membro: versoes =', vs1.data.versoes.map((v) => `v${v.versao} ${v.status}`), '| v1 chars:', v1.data.versao.content_md.length);
  if (vs1.data.versoes.length !== 1 || v1.data.versao.content_md !== md) throw new Error('membro deveria ler a v1');
  const com = await call('POST', '/api/script/versoes/1/comentarios', memberBToken, { passo: 2, texto: 'A dor está genérica' });
  const coms = await call('GET', '/api/script/versoes/1/comentarios', memberToken);
  if (!coms.data.comentarios.some((c) => c.id === com.data.comentario.id && c.passo === 2)) throw new Error('comentario por passo deveria aparecer para o socio');
  const apr = await call('POST', '/api/script/versoes/1/aprovar', memberToken, {});
  console.log('aprovar ->', apr.data.versao.status, apr.data.versao.aprovado_por);
  if (apr.data.versao.status !== 'aprovado') throw new Error('aprovar deveria marcar a v1');
  const fichaScript = await call('GET', '/api/script/ficha', memberToken);
  if (fichaScript.data.data.script.versoes !== 1 || fichaScript.data.data.script.aprovada !== 1) throw new Error('GET ficha .script deveria refletir a v1 aprovada');

  step('18. Refinar 3.3 -> job refinar (1 por campo); ficha marca refinando; worker PUT campo volta para sugerido com "sua versão anterior"; "a definir" vira vazio');
  const rf = await call('POST', '/api/script/ficha/refinar', memberToken, { field_key: '3.3', pedido: 'usar as frases do áudio' });
  const rf2 = await call('POST', '/api/script/ficha/refinar', memberBToken, { field_key: '3.3' });
  console.log('refinar ->', rf.data.job.id, rf.data.job.status, '| de novo (B): existing =', rf2.data.job.existing);
  if (rf.data.job.tipo !== 'refinar' || rf2.data.job.id !== rf.data.job.id) throw new Error('1 job refinar ativo por clube + campo');
  const fichaRef = await call('GET', '/api/script/ficha', memberToken);
  const c33r = fichaRef.data.data.blocos.flatMap((b) => b.campos).find((c) => c.key === '3.3');
  if (c33r.refinando !== true) throw new Error('GET ficha deveria marcar 3.3 como refinando');
  const valorAntes = c33r.valor_efetivo;
  const wr = await worker('POST', '/api/jobs/next', { tipo: 'refinar' });
  if (wr.data.job.id !== rf.data.job.id || wr.data.job.payload.field_key !== '3.3') throw new Error('worker deveria pegar o refinar de 3.3');
  const pc = await worker('PUT', `/api/jobs/${wr.data.job.id}/campo`, {
    field_key: '3.3', sugerido: 'Não consigo sair do operacional\nA equipe não anda sem mim\nPerdi cliente por atraso', classe: 'DER', fonte: 'contexto: nota de A + link de B',
    alternativas: [{ sugerido: 'Alternativa do worker', fonte: 'link' }],
  });
  console.log('PUT campo ->', { reaberto: pc.data.reaberto, status: pc.data.campo.status, ficha_status: pc.data.ficha_status, alt0: pc.data.campo.alternativas[0] });
  if (!pc.data.reaberto || pc.data.campo.status !== 'sugerido' || pc.data.ficha_status !== 'em_revisao') throw new Error('PUT campo deveria reabrir o campo decidido e a ficha');
  if (pc.data.campo.alternativas[0].fonte !== 'sua versão anterior' || pc.data.campo.alternativas[0].sugerido !== valorAntes) throw new Error('valor anterior deveria estar em alternativas[0]');
  const pcBad = await worker('PUT', `/api/jobs/${wr.data.job.id}/campo`, { field_key: '3.5', sugerido: 'a definir com a gente', classe: 'Fato', fonte: 'x' });
  console.log('PUT campo "a definir" ->', { limpo: pcBad.data.limpo, status: pcBad.data.campo.status, classe: pcBad.data.campo.classe, warnings: pcBad.data.warnings });
  if (!pcBad.data.limpo || pcBad.data.campo.status !== 'vazio' || pcBad.data.campo.sugerido !== '') throw new Error('"a definir" nunca vira sugestao');
  await worker('PATCH', `/api/jobs/${wr.data.job.id}`, { status: 'done' });
  const fichaPos = await call('GET', '/api/script/ficha', memberToken);
  const c33p = fichaPos.data.data.blocos.flatMap((b) => b.campos).find((c) => c.key === '3.3');
  if (c33p.refinando !== false || c33p.status !== 'sugerido') throw new Error('depois do done, 3.3 sugerido e sem refinando');
  const volta = await call('PUT', '/api/script/ficha/fields', memberToken, { updates: { '3.3': { status: 'editado', valor: valorAntes }, '3.5': { status: 'editado', valor: 'Mais um ano igual: perde a equipe' } } });
  if (volta.data.applied.length !== 2) throw new Error('mentor deveria voltar para a versao anterior com 1 toque');
  const fecha2 = await call('POST', '/api/script/ficha/complete', memberToken, {});
  console.log('fecha de novo ->', fecha2.data.ficha_status, '| job script novo:', fecha2.data.job.id, fecha2.data.job.status, '| existing:', fecha2.data.job.existing);
  if (fecha2.data.job.tipo !== 'script' || fecha2.data.job.existing !== false) throw new Error('fechar de novo (depois do done) deveria nascer job script novo');
  const wn2 = await worker('POST', '/api/jobs/next', { tipo: 'script' });
  await worker('PATCH', `/api/jobs/${wn2.data.job.id}`, { status: 'done' });
  const adminDet2 = await call('GET', `/api/admin/clubs/${SLUG}/script-ficha`, adminToken);
  console.log('admin detalhe: versoes =', adminDet2.data.data.versoes.map((v) => `v${v.versao} ${v.status}`), '| comentarios =', adminDet2.data.data.comentarios.length, '| tipos de job =', [...new Set(adminDet2.data.data.jobs.map((j) => j.tipo))]);
  if (adminDet2.data.data.versoes.length !== 1 || adminDet2.data.data.comentarios.length !== 1) throw new Error('admin deveria ver a v1 e o comentario');
  const adminV1 = await call('GET', `/api/admin/clubs/${SLUG}/script-versoes/1`, adminToken);
  if (adminV1.data.versao.content_md !== md) throw new Error('admin deveria baixar o conteudo da v1');
  const emptyQ2 = await worker('POST', '/api/jobs/next', {}, JOBS_TOKEN, false);
  if (emptyQ2.status !== 204) throw new Error('fila deveria estar vazia depois do ship 2');

  step('19. scripts/limpar-a-definir.cjs (dry-run) contra o banco do servidor, se DB_PATH estiver no ambiente');
  if (process.env.DB_PATH) {
    const { run } = require('./limpar-a-definir.cjs');
    const rel = await run();
    console.log('limpar-a-definir (dry-run):', rel);
  } else {
    console.log('DB_PATH ausente neste processo: pulei (rode: DB_PATH=<mesmo do servidor> node scripts/limpar-a-definir.cjs)');
  }

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
