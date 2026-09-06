/**
 * Gates de suficiencia da ficha (business/.../GATES-suficiencia.md, regra do dono de 04/09):
 * quando o pre-preenchimento termina, o servidor decide se o mentor pula a ficha (`suficiente`),
 * completa so o que faltou (`parcial`) ou precisa de mais material (`insuficiente`).
 *
 * avaliarSuficiencia(fields, jobInfo) -> { resultado, faltam: [keys], motivos: [pt-BR, sem codigo],
 *   criticos_ok, fontes_distintas, obrigatorios_faltando, modo, avaliado_em, job_id }
 *
 * DOIS PERFIS (SPEC-workflow-v2-decisoes-06-09 §1, decisao 2). `jobInfo.modo` e opcional e vale
 * 'completo' por padrao (compatibilidade com quem ja chamava com dois argumentos):
 *   'completo'  -> escopo = os 34 campos; obrigatorios = os 27; criticos = a lista inteira (regra atual)
 *   'essencial' -> escopo = as 12 perguntas essenciais (SF.ESSENCIAL_KEYS); obrigatorios = so elas;
 *                  criticos = os criticos que estao dentro do essencial. O que esta fora do essencial
 *                  nao entra em `faltam`, nao conta como obrigatorio e nunca segura o script.
 *
 * Criterios (secao 2 do doc), sempre dentro do escopo do modo:
 *   2.1 criticos precisam ser Fato com fonte ou decididos pelo mentor (nunca vazios) -> senao no maximo parcial
 *   2.2 obrigatorios decididos ou Fato: ate 3 em DER/VZ = suficiente; 4 a 9 = parcial; 10+ = insuficiente
 *   2.3 numero so com fonte; campo numerico em DER nunca conta; 5.3 com precos divergentes = parcial
 *   2.4 6.2 identifica o condutor; 4.3 aponta para um item de 4.2; 5.5 nunca bloqueia; confianca baixa/needs_human rebaixa 1 nivel
 *   2.5 placeholder ("a definir"), palavra vetada ("diagnostico") e travessao na sugestao = campo para o mentor olhar
 *   2.6 suficiente exige 2 fontes distintas entre os criticos
 */
const SF = require('./script-ficha.cjs');

const CRITICOS = ['1.1', '2.1', '3.1', '3.3', '4.1', '4.2', '5.1', '5.2', '5.3', '6.2'];
/** Criticos que continuam criticos na ficha essencial (1.1 fica de fora: nao esta entre as 12). */
const CRITICOS_ESSENCIAL = CRITICOS.filter((k) => SF.ESSENCIAL_SET.has(k));
/** Campos numericos (tipoRaw com "nº" ou tipo num): 5.3, 5.5, 6.7. Em DER nunca contam como preenchidos. */
const NUMERICOS = SF.FIELDS.filter((f) => /n[º°]/.test(String(f.tipoRaw || '')) || f.tipo === 'num').map((f) => f.key);
/** 5.5 (retorno financeiro) so entra como Fato com fonte; sem fonte fica vazio e nao bloqueia. */
const NAO_BLOQUEIA = ['5.5'];
const TOLERANCIA_SUFICIENTE = 3;
const LIMITE_PARCIAL = 4;
const LIMITE_INSUFICIENTE = 10;
const NIVEIS = ['insuficiente', 'parcial', 'suficiente'];
const PALAVRA_VETADA_RE = /diagn[oó]stico/i;
const TRAVESSAO = '—';
const CONDUTOR_RE = /(^|\b)(eu\b|eu mesm[oa]|pr[oó]pri[oa]|mentor(a|es)?|closers?|sdrs?|consultor(a|es|as)?|vendedor(a|es|as)?|s[oó]ci[oa]s?|fundador(a|es)?|comercial|time|equipe)\b/i;
const NUMERO_RE = /(R\$\s?\d|\d+\s?%|\b\d+\s?(dias?|semanas?|meses|m[eê]s|anos?|horas?|h)\b|\bmil\b|\bk\b)/i;
const MOEDA_RE = /R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*(mil|k)?/gi;

/** Base das rotas do membro no app (mesma de PUT /api/jobs/:id/script). */
const BASE_APP = '/prosperus-mentor-diagnosis/dashboard';
const ORIGEM_AUTOMATICA = 'automatica';

function nowIso() {
  return new Date().toISOString();
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function nomeDoCampo(key) {
  const def = SF.FIELD_BY_KEY[key];
  return def ? def.nome : key;
}

/** Texto que o script leria hoje: o decidido ou, sem decisao, a sugestao. */
function textoDoCampo(st) {
  return SF.isDecided(st) ? String(SF.effectiveValue(st) || '') : String(st.sugerido || '');
}

/** Fato com fonte e sem placeholder (o que os materiais entregaram de verdade). */
function fatoComFonte(st) {
  return !SF.isDecided(st) && st.classe === 'Fato' && !!String(st.sugerido || '').trim() && !!String(st.fonte || '').trim() && !SF.isPlaceholder(st.sugerido);
}

/** Documento por tras da fonte ("Exclusive Book · P2 · Oferta" -> "exclusive book"); null sem fonte. */
function documentoDaFonte(fonte) {
  const s = String(fonte || '').replace(/[[\]]/g, '').trim();
  if (!s) return null;
  const doc = s.split(/\s[·|]\s|\s-\s|,|;|\(|:/)[0].trim();
  return norm(doc) || null;
}

/** Valores em reais no texto ("R$ 14 mil", "R$ 4.500,00") como numeros. */
function moedas(text) {
  const out = [];
  const re = new RegExp(MOEDA_RE.source, 'gi');
  let m;
  while ((m = re.exec(String(text || '')))) {
    const inteiro = Number(m[1].replace(/\./g, ''));
    const dec = m[2] ? Number(`0.${m[2]}`) : 0;
    let v = inteiro + dec;
    if (m[3]) v *= 1000;
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function mesmoConjunto(a, b) {
  const sa = [...new Set(a)].sort((x, y) => x - y);
  const sb = [...new Set(b)].sort((x, y) => x - y);
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/** Nomes dos pilares/etapas do 4.2: estrutura.pilares (editado pelo widget) ou as linhas do texto ("Nome: o que resolve"). */
function pilaresDe(st) {
  const e = st.estrutura;
  if (e && Array.isArray(e.pilares)) {
    const nomes = e.pilares.map((p) => String((p && p.nome) || '').trim()).filter(Boolean);
    if (nomes.length) return nomes;
  }
  return textoDoCampo(st)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      return (i > 0 ? l.slice(0, i) : l.split(/\s[·|]\s|\s-\s/)[0]).trim();
    })
    .filter(Boolean);
}

/** 4.3 aponta para um item de 4.2 quando o texto cita o nome (ou o numero) de um pilar. */
function apontaParaPilar(texto43, st43, pilares) {
  const e = st43.estrutura;
  const escolhido = e && typeof e.escolhido === 'string' ? e.escolhido : '';
  const alvo = norm(escolhido || texto43);
  if (!alvo) return false;
  const numero = alvo.match(/^(?:pilar|etapa)?\s*(\d+)\b/);
  if (numero && Number(numero[1]) >= 1 && Number(numero[1]) <= pilares.length) return true;
  return pilares.some((p) => {
    const n = norm(p);
    return !!n && (alvo === n || alvo.includes(n) || (n.length >= 6 && n.includes(alvo)));
  });
}

/** 6.2: quem conduz a venda (mentor, closer, consultor, socio); "outro" sem nome nao vale. */
function condutorDe(st) {
  const e = st.estrutura;
  if (e && typeof e.quem === 'string') {
    if (['mentor', 'closer', 'socio', 'consultor'].includes(e.quem)) return { ok: true };
    if (e.quem === 'outro') return String(e.nome || '').trim() ? { ok: true } : { ok: false, motivo: 'outro sem nome' };
    if (!e.quem) return { ok: false, motivo: 'sem condutor' };
  }
  const texto = textoDoCampo(st);
  if (!texto.trim()) return { ok: false, motivo: 'vazio' };
  const n = norm(texto);
  if (/\boutro\b/.test(n)) {
    // "Outro (Pedro)" / "Outro: Pedro" / "Outro - Pedro" = tem nome; "Outro; lead..." = sem nome
    const comNome = /outro\s*(?:\(([^)]+)\)|[:-]\s*([^;,/\n]+))/i.exec(texto);
    const nome = comNome ? String(comNome[1] || comNome[2] || '').trim() : '';
    if (nome && !/^(lead|leads?)\b/i.test(nome)) return { ok: true };
    if (!CONDUTOR_RE.test(texto)) return { ok: false, motivo: 'outro sem nome' };
  }
  if (CONDUTOR_RE.test(texto)) return { ok: true };
  // "Quem conduz: Paloma / Lead: indicação" (nome proprio sem rotulo)
  if (/quem conduz\s*:\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}'-]+/u.test(texto)) return { ok: true };
  return { ok: false, motivo: 'sem condutor' };
}

/**
 * Avalia a ficha. jobInfo = { status?: 'done'|'needs_human', result?: { confianca? }, confianca?, needs_human?,
 * job_id?, modo?: 'essencial'|'completo' (default 'completo') }.
 * Nunca muda os campos: so le.
 */
function avaliarSuficiencia(fieldsRaw, jobInfo = {}) {
  const fields = SF.normalizeFields(fieldsRaw);
  const modo = SF.normalizeModo((jobInfo || {}).modo);
  const essencial = modo === 'essencial';
  /** Campos que o gate olha neste modo (fora do escopo nao entra em `faltam` nem rebaixa nada). */
  const escopo = essencial ? SF.ESSENCIAL_KEYS : SF.FIELD_KEYS;
  const criticos = essencial ? CRITICOS_ESSENCIAL : CRITICOS;
  const obrigatorios = essencial ? SF.ESSENCIAL_KEYS : SF.REQUIRED_KEYS;
  const faltam = new Set();
  const motivos = [];
  const sinalizados = new Set(); // sugestoes com placeholder, palavra vetada ou travessao (viram "para o mentor olhar")
  let teto = 'suficiente';
  const rebaixa = (nivel) => { if (NIVEIS.indexOf(nivel) < NIVEIS.indexOf(teto)) teto = nivel; };

  // 2.5 placeholders e vocabulario (so em campos sem decisao do mentor)
  for (const key of escopo) {
    const st = fields[key];
    if (SF.isDecided(st)) continue;
    const sug = String(st.sugerido || '');
    if (!sug.trim()) continue;
    if (SF.isPlaceholder(sug)) {
      sinalizados.add(key);
      faltam.add(key);
      motivos.push(`${nomeDoCampo(key)}: a sugestão era um "a definir"; precisa da sua resposta.`);
    } else if (PALAVRA_VETADA_RE.test(sug)) {
      sinalizados.add(key);
      faltam.add(key);
      motivos.push(`${nomeDoCampo(key)}: a sugestão usa uma palavra que não entra no script; confira.`);
    } else if (sug.includes(TRAVESSAO)) {
      sinalizados.add(key);
      faltam.add(key);
      motivos.push(`${nomeDoCampo(key)}: a sugestão precisa de um ajuste de texto; confira.`);
    }
  }
  if (sinalizados.size) rebaixa('parcial');

  /** Conta como preenchido: decidido com valor, aceito em branco pelo mentor (nao critico), ou Fato com fonte. */
  const preenchido = (key) => {
    const st = fields[key];
    if (SF.isDecided(st)) {
      if (st.status === 'aceito_vazio') return !criticos.includes(key);
      return !!String(SF.effectiveValue(st) || '').trim();
    }
    if (sinalizados.has(key)) return false;
    if (NUMERICOS.includes(key) && st.classe === 'DER') return false;
    return fatoComFonte(st);
  };

  // 2.1 criticos
  const criticosFaltando = [];
  for (const key of criticos) {
    if (preenchido(key)) continue;
    criticosFaltando.push(key);
    faltam.add(key);
    if (sinalizados.has(key)) continue;
    const st = fields[key];
    if (SF.isDecided(st)) motivos.push(`${nomeDoCampo(key)}: não pode ficar em branco.`);
    else if (st.classe === 'DER' && String(st.sugerido || '').trim()) motivos.push(`${nomeDoCampo(key)}: encontramos só uma dedução, não um fato; confirme ou corrija.`);
    else motivos.push(`${nomeDoCampo(key)}: não encontramos nos seus materiais.`);
  }
  const criticos_ok = criticosFaltando.length === 0;
  if (!criticos_ok) rebaixa('parcial');

  // 2.2 cobertura dos obrigatorios do modo (5.5 nunca bloqueia)
  const obrigFaltando = obrigatorios.filter((k) => !NAO_BLOQUEIA.includes(k) && !preenchido(k));
  const naoCriticos = obrigFaltando.filter((k) => !criticos.includes(k) && !sinalizados.has(k));
  for (const k of naoCriticos) faltam.add(k);
  if (naoCriticos.length) {
    motivos.push(`${naoCriticos.length === 1 ? 'Falta 1 resposta obrigatória' : `Faltam ${naoCriticos.length} respostas obrigatórias`} que não estavam nos materiais: ${naoCriticos.map(nomeDoCampo).join('; ')}.`);
  }
  if (obrigFaltando.length >= LIMITE_INSUFICIENTE) rebaixa('insuficiente');
  else if (obrigFaltando.length >= LIMITE_PARCIAL) rebaixa('parcial');

  // 2.3 numeros so com fonte; 5.3 com precos divergentes
  for (const key of escopo) {
    const st = fields[key];
    if (SF.isDecided(st) || NAO_BLOQUEIA.includes(key) || sinalizados.has(key)) continue;
    const sug = String(st.sugerido || '');
    if (!sug.trim()) continue;
    if (st.classe === 'Fato' && NUMERO_RE.test(sug) && !String(st.fonte || '').trim()) {
      faltam.add(key);
      motivos.push(`${nomeDoCampo(key)}: traz um número sem fonte; confirme.`);
      rebaixa('parcial');
    } else if (NUMERICOS.includes(key) && st.classe === 'DER' && obrigatorios.includes(key)) {
      faltam.add(key);
      if (!criticos.includes(key)) motivos.push(`${nomeDoCampo(key)}: o valor é uma dedução, não um fato; confirme.`);
      rebaixa('parcial');
    }
  }
  {
    const st = fields['5.3'];
    if (!SF.isDecided(st) && String(st.sugerido || '').trim()) {
      const base = moedas(st.sugerido);
      const divergente = (st.alternativas || []).some((a) => {
        const alt = moedas(a.sugerido);
        return base.length && alt.length && !mesmoConjunto(base, alt);
      });
      if (divergente) {
        faltam.add('5.3');
        motivos.push('Preço e opções: preço não fechado (os materiais trazem valores diferentes).');
        rebaixa('parcial');
      }
    }
  }

  // 2.4 coerencia minima
  {
    const st = fields['6.2'];
    const texto = textoDoCampo(st);
    if (texto.trim() && !sinalizados.has('6.2')) {
      const c = condutorDe(st);
      if (!c.ok) {
        faltam.add('6.2');
        motivos.push(c.motivo === 'outro sem nome'
          ? 'Quem vende e de onde vem o lead: "outro" precisa do nome de quem conduz a venda.'
          : 'Quem vende e de onde vem o lead: precisa dizer quem conduz a venda (você, um closer, um consultor ou um sócio).');
        rebaixa('parcial');
      }
    }
  }
  if (escopo.includes('4.3')) {
    const st43 = fields['4.3'];
    const texto43 = textoDoCampo(st43);
    if (texto43.trim() && !sinalizados.has('4.3')) {
      const pilares = pilaresDe(fields['4.2']);
      if (pilares.length && !apontaParaPilar(texto43, st43, pilares)) {
        faltam.add('4.3');
        motivos.push('Pilar que resolve a dor principal: precisa ser um dos pilares ou etapas do seu método.');
        rebaixa('parcial');
      }
    }
  }

  // 2.6 fontes distintas entre os criticos (o texto do mentor conta como uma fonte)
  const docs = new Set();
  for (const key of criticos) {
    const st = fields[key];
    if (SF.isDecided(st)) {
      if (st.status === 'editado') docs.add('mentor');
      else if (st.status === 'confirmado') docs.add(documentoDaFonte(st.fonte) || 'mentor');
    } else if (fatoComFonte(st)) {
      const d = documentoDaFonte(st.fonte);
      if (d) docs.add(d);
    }
  }
  const fontes_distintas = docs.size;
  if (teto === 'suficiente' && fontes_distintas < 2) {
    motivos.push('Os campos principais vêm de uma fonte só; precisamos de pelo menos duas (por exemplo, um documento da mentoria e uma transcrição).');
    rebaixa('parcial');
  }

  // Rebaixamento: needs_human ou confianca baixa do worker
  const info = jobInfo || {};
  const confianca = String(info.confianca || (info.result && info.result.confianca) || '');
  const needsHuman = info.status === 'needs_human' || info.needs_human === true || (info.result && info.result.needs_human === true);
  let resultado = teto;
  if (needsHuman || /baixa/i.test(confianca)) {
    resultado = NIVEIS[Math.max(0, NIVEIS.indexOf(teto) - 1)];
    motivos.push(needsHuman
      ? 'A leitura dos seus materiais pediu uma conferência sua antes do script.'
      : 'A leitura dos seus materiais saiu com confiança baixa; confira a ficha.');
  }

  return {
    resultado,
    faltam: SF.FIELD_KEYS.filter((k) => faltam.has(k)),
    motivos,
    criticos_ok,
    fontes_distintas,
    obrigatorios_faltando: obrigFaltando.length,
    modo,
    avaliado_em: nowIso(),
    job_id: info.job_id || null,
  };
}

/**
 * Confirma em nome do mentor o que os materiais trouxeram: sugestao -> `confirmado` (atualizado_por 'automatica');
 * campo sem sugestao e nao critico -> `aceito_vazio`. Campo decidido nunca muda; critico vazio fica pendente.
 * No modo `essencial` so as 12 perguntas sao tocadas: o resto continua em aberto para quando a pessoa aprofundar.
 * @returns {{ fields, confirmados: string[], vazios: string[], pendentes: string[] }}
 */
function autoConfirmar(fieldsRaw, { por = ORIGEM_AUTOMATICA, modo = 'completo' } = {}) {
  const next = SF.normalizeFields(fieldsRaw);
  const essencial = SF.normalizeModo(modo) === 'essencial';
  const escopo = essencial ? SF.ESSENCIAL_KEYS : SF.FIELD_KEYS;
  const criticos = essencial ? CRITICOS_ESSENCIAL : CRITICOS;
  const confirmados = [];
  const vazios = [];
  const pendentes = [];
  const ts = nowIso();
  for (const key of escopo) {
    const cur = next[key];
    if (SF.isDecided(cur)) continue;
    const sug = String(cur.sugerido || '').trim();
    // Numero deduzido (DER em campo numerico) nunca vira valor do script: fica em branco para o mentor
    const numeroDeduzido = NUMERICOS.includes(key) && cur.classe === 'DER';
    if (sug && !SF.isPlaceholder(sug) && !numeroDeduzido) {
      next[key] = { ...cur, status: 'confirmado', valor: cur.sugerido, estrutura: null, autor: null, rev: SF.proximaRev(cur), atualizado_por: por, atualizado_em: ts };
      confirmados.push(key);
    } else if (!criticos.includes(key)) {
      next[key] = { ...cur, status: 'aceito_vazio', valor: '', estrutura: null, autor: null, rev: SF.proximaRev(cur), atualizado_por: por, atualizado_em: ts };
      vazios.push(key);
    } else {
      pendentes.push(key);
    }
  }
  return { fields: next, confirmados, vazios, pendentes };
}

/** Link do membro no app (APP_URL + base). */
function linkMembro(appUrl, rota) {
  const base = String(appUrl || '').trim().replace(/\/+$/, '');
  return `${base}${BASE_APP}/${rota}`;
}

/**
 * Mensagem para o WhatsApp do mentor (o runner envia). Sem jargao, <= 500 chars.
 * suficiente -> "seu script está sendo gerado"; parcial -> "faltam N respostas suas: <link ficha>";
 * insuficiente -> "precisamos de mais material: <link materiais>".
 */
function mensagemMentor(resultado, { faltam_n = 0, appUrl = '', nome = '' } = {}) {
  const oi = nome ? `${String(nome).split(/\s+/)[0]}, ` : '';
  let msg;
  if (resultado === 'suficiente') {
    msg = `${oi}lemos os seus materiais e já temos o que precisamos. Seu script está sendo gerado, chega em alguns minutos.`;
  } else if (resultado === 'parcial') {
    const n = Math.max(1, Number(faltam_n) || 0);
    msg = `${oi}lemos os seus materiais. ${n === 1 ? 'Falta 1 resposta sua' : `Faltam ${n} respostas suas`} para o seu script: ${linkMembro(appUrl, 'ficha')}`;
  } else {
    msg = `${oi}lemos os seus materiais, mas ainda não dá para escrever o seu script. Precisamos de mais material ou das suas respostas: ${linkMembro(appUrl, 'materiais')}`;
  }
  msg = msg.charAt(0).toUpperCase() + msg.slice(1);
  return msg.length > 500 ? `${msg.slice(0, 497)}...` : msg;
}

// ─── Persistencia ────────────────────────────────────────────────────────────

/** Colunas novas em script_fichas. ALTER idempotente ("duplicate column" ignorado). Registro: migrations/020_script_fichas_suficiencia.sql */
const SCRIPT_FICHAS_DDL = [
  `ALTER TABLE script_fichas ADD COLUMN suficiencia TEXT`,
  `ALTER TABLE script_fichas ADD COLUMN confirmada_por TEXT`,
];

async function ensureSuficienciaColumns(dbRun) {
  for (const ddl of SCRIPT_FICHAS_DDL) {
    try {
      await dbRun(ddl);
    } catch (e) {
      if (!/duplicate column/i.test(String(e && e.message))) throw e;
    }
  }
}

function parseJson(s, fb = null) {
  if (s == null || s === '') return fb;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return fb; }
}

/** Resumo que vai no result do job e na linha do admin. */
function resumoSuficiencia(suf) {
  if (!suf) return null;
  return {
    resultado: suf.resultado,
    faltam: suf.faltam || [],
    faltam_n: (suf.faltam || []).length,
    criticos_ok: !!suf.criticos_ok,
    fontes_distintas: suf.fontes_distintas || 0,
    modo: suf.modo || 'completo',
    forcado_por: suf.forcado_por || null,
    avaliado_em: suf.avaliado_em || null,
  };
}

/**
 * Avalia a ficha do clube do job e, quando `aplicar`, executa a decisao:
 *   suficiente  -> auto-confirma os campos (origem automatica), ficha `confirmada` (confirmada_por 'automatica'),
 *                  enfileira o job `script` do clube (1 ativo por clube, junto com `revisar`)
 *   parcial / insuficiente -> ficha fica como esta (pre_preenchida / em_revisao); `faltam` gravado
 * Sempre grava script_fichas.suficiencia. Ficha ja `confirmada` nunca e tocada (so o registro).
 * @returns {{ suficiencia, ficha_status, confirmada_por, script_job, script_existing, mensagem_mentor }}
 */
async function aplicarResultadoPrefill({ dbGet, dbRun, uuidv4, safeJsonParse, JOBS }, { job, status, result, appUrl = '', aplicar = true }) {
  const parse = safeJsonParse || parseJson;
  const slug = job.club_slug;
  await SF.ensureModoColumn(dbRun);
  const ficha = await SF.ensureFichaRow({ dbGet, dbRun, uuidv4 }, slug);
  const fields = parse(ficha.fields, {});
  // Modo escolhido na entrada: no essencial o gate olha so as 12 perguntas (SPEC-workflow-v2 §1, decisao 2)
  const modo = SF.normalizeModo(ficha.modo);
  // Ficha sem escolha: o pre-preenchimento chegou antes da tela "Como você quer construir o seu script?"
  const semEscolha = !SF.MODOS.includes(ficha.modo);
  const suf = avaliarSuficiencia(fields, { status, result, job_id: job.id, modo });
  let fichaStatus = ficha.ficha_status;
  let confirmadaPor = ficha.confirmada_por || null;
  let modoGravado = SF.MODOS.includes(ficha.modo) ? ficha.modo : null;
  let scriptJob = null;
  let scriptExisting = false;
  const registro = { ...suf, aplicado: !!aplicar };

  const podeConfirmar = aplicar && suf.resultado === 'suficiente' && ficha.ficha_status !== 'confirmada' && suf.criticos_ok;
  if (podeConfirmar) {
    const ac = autoConfirmar(fields, { modo });
    // Doutrina de papeis: 6.2 vazio nunca gera script (o critico ja garante, mas o guardrail fica explicito)
    const quemVende = ac.fields['6.2'];
    if (ac.pendentes.length || !String(SF.effectiveValue(quemVende) || '').trim()) {
      registro.resultado = 'parcial';
      registro.faltam = SF.FIELD_KEYS.filter((k) => ac.pendentes.includes(k) || k === '6.2');
      registro.motivos = [...suf.motivos, 'Quem vende e de onde vem o lead: precisa ser respondido antes do script.'];
      await dbRun(`UPDATE script_fichas SET suficiencia = ?, updated_at = CURRENT_TIMESTAMP WHERE club_slug = ?`, [JSON.stringify(registro), slug]);
    } else {
      fichaStatus = 'confirmada';
      confirmadaPor = ORIGEM_AUTOMATICA;
      registro.auto_confirmada_em = nowIso();
      registro.campos_automaticos = ac.confirmados.length;
      registro.vazios_automaticos = ac.vazios.length;
      // Sem escolha na entrada, o app fecha a ficha no caminho COMPLETO (o material bastou, entao vale o
      // caminho mais fundo) e registra que quem escolheu foi ele: a tela oferece o essencial uma vez.
      modoGravado = semEscolha ? 'completo' : ficha.modo;
      registro.modo = modoGravado;
      if (semEscolha) registro.modo_origem = SF.MODO_ORIGEM_AUTOMATICO;
      const meta = semEscolha
        ? JSON.stringify({
          ...(parse(ficha.prefill_meta, null) || {}),
          modo_origem: SF.MODO_ORIGEM_AUTOMATICO,
          modo_definido_em: nowIso(),
        })
        : null;
      await dbRun(
        `UPDATE script_fichas
            SET fields = ?, ficha_status = 'confirmada', confirmada_por = ?, suficiencia = ?, modo = ?,
                prefill_meta = COALESCE(?, prefill_meta),
                reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE club_slug = ?`,
        [JSON.stringify(ac.fields), ORIGEM_AUTOMATICA, JSON.stringify(registro), modoGravado, meta, slug]
      );
      const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
      const r = await JOBS.enqueueJob({ dbGet, dbRun, uuidv4 }, {
        tipo: 'script',
        club_slug: slug,
        email: job.email,
        notify_phone: job.notify_phone || null,
        payload: { nome: payload.nome || null, motivo: 'automatico', origem: 'suficiencia', prefill_job_id: job.id, pedido_em: nowIso() },
      });
      scriptJob = r.job;
      scriptExisting = r.existing;
      registro.script_job_id = r.job ? r.job.id : null;
      await dbRun(`UPDATE script_fichas SET suficiencia = ? WHERE club_slug = ?`, [JSON.stringify(registro), slug]);
    }
  } else {
    await dbRun(`UPDATE script_fichas SET suficiencia = ?, updated_at = CURRENT_TIMESTAMP WHERE club_slug = ?`, [JSON.stringify(registro), slug]);
  }

  const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
  const mensagem_mentor = mensagemMentor(registro.resultado, { faltam_n: registro.faltam.length, appUrl, nome: payload.nome || '' });
  return {
    suficiencia: registro,
    ficha_status: fichaStatus,
    confirmada_por: confirmadaPor,
    modo: modoGravado,
    modo_origem: registro.modo_origem || null,
    script_job: scriptJob,
    script_existing: scriptExisting,
    mensagem_mentor,
  };
}

module.exports = {
  CRITICOS,
  CRITICOS_ESSENCIAL,
  NUMERICOS,
  NAO_BLOQUEIA,
  TOLERANCIA_SUFICIENTE,
  LIMITE_PARCIAL,
  LIMITE_INSUFICIENTE,
  NIVEIS,
  ORIGEM_AUTOMATICA,
  BASE_APP,
  avaliarSuficiencia,
  autoConfirmar,
  mensagemMentor,
  linkMembro,
  resumoSuficiencia,
  ensureSuficienciaColumns,
  aplicarResultadoPrefill,
  // expostos para teste
  moedas,
  pilaresDe,
  condutorDe,
  documentoDaFonte,
  nomeDoCampo,
};
