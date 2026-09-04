/**
 * Ficha do Script (7 passos): definicoes dos 34 campos + regras de estado.
 * Fonte unica das definicoes: data/script-ficha-fields.json (o front importa o mesmo JSON).
 *
 * Estado de cada campo em script_fichas.fields[key]:
 *   { sugerido, classe, fonte, alternativas[], nota_interna,
 *     status: 'sugerido'|'confirmado'|'editado'|'vazio'|'aceito_vazio',
 *     valor, estrutura (JSON do widget, so com status editado; null nos demais),
 *     atualizado_por, atualizado_em }
 */
const DEFS = require('../data/script-ficha-fields.json');

const FIELDS = DEFS.campos;
const FIELD_KEYS = FIELDS.map((f) => f.key);
const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
const REQUIRED_KEYS = FIELDS.filter((f) => f.obrigatorio).map((f) => f.key);
const BLOCKS = DEFS.blocos;
const DAYS = DEFS.dias;

const FIELD_STATUSES = ['sugerido', 'confirmado', 'editado', 'vazio', 'aceito_vazio'];
const DECIDED_STATUSES = ['confirmado', 'editado', 'aceito_vazio'];
const CLASSES = ['Fato', 'DER', 'VZ'];
/** `autor` do campo quando o worker decidiu em nome do mentor a partir da resposta dele no WhatsApp (PUT :id/campo { decidir }). */
const AUTOR_WHATSAPP = 'WhatsApp do mentor';
const MAX_ALTERNATIVAS = 3; // contrato de prefill aceita 2; a 3a vaga e "sua versao anterior" (PUT /api/jobs/:id/campo)

/**
 * Regra "sem a definir" (feedback do dono): um campo nunca carrega sugestao do tipo "a definir",
 * "a definir com a gente", "a confirmar", "nao encontramos", "nao sei", "???". Quem gerou a sugestao
 * nao sabia; entao o campo e VZ (vazio) e o texto vai para nota_interna.
 * Vale no import do prefill, no PUT /api/jobs/:id/campo e no scripts/limpar-a-definir.cjs.
 * (O "???" nao tem \b ao redor: "?" nao e caractere de palavra, entao \b nunca casaria.)
 */
const PLACEHOLDER_RE = /(\b(a definir|a confirmar|n[a\u00e3]o (sei|encontramos|localizado))\b|\?\?\?)/i;

function isPlaceholder(text) {
  return PLACEHOLDER_RE.test(String(text || ''));
}

/**
 * Aplica a regra a uma sugestao vinda de fora (worker ou JSON). Devolve { sugerido, classe, fonte, nota_interna, limpo }.
 * limpo = true quando a sugestao foi descartada (virou VZ) e o texto original foi guardado em nota_interna.
 */
function sanitizeSugestao({ sugerido, classe, fonte, nota_interna }) {
  const s = String(sugerido == null ? '' : sugerido).trim();
  const nota = String(nota_interna == null ? '' : nota_interna);
  if (classe !== 'VZ' && s && isPlaceholder(s)) {
    const marca = `[sugestão descartada: "${s}"]`;
    return { sugerido: '', classe: 'VZ', fonte: '', nota_interna: nota ? `${nota}\n${marca}` : marca, limpo: true };
  }
  if (classe === 'VZ') return { sugerido: '', classe: 'VZ', fonte: '', nota_interna: nota, limpo: false };
  return { sugerido: s, classe, fonte: String(fonte == null ? '' : fonte).trim(), nota_interna: nota, limpo: false };
}

function nowIso() {
  return new Date().toISOString();
}

function emptyFieldState() {
  return {
    sugerido: '',
    classe: 'VZ',
    fonte: '',
    alternativas: [],
    nota_interna: '',
    status: 'vazio',
    valor: '',
    estrutura: null,
    // Achado do worker em cima de um campo JA decidido (o texto do mentor pesa mais; isto e aprofundamento):
    // { sugerido, fonte, classe, alternativas, recebido_em } | null. Some ao incorporar/dispensar.
    complemento: null,
    atualizado_por: null,
    atualizado_em: null,
  };
}

/** Estrutura valida = objeto simples (nao array); qualquer outra coisa vira null. */
function normalizeEstrutura(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}

/** Complemento valido = objeto com `sugerido` nao vazio; classe nunca VZ; ate 2 alternativas limpas. O resto vira null. */
function normalizeComplemento(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const sugerido = typeof raw.sugerido === 'string' ? raw.sugerido.trim() : '';
  if (!sugerido) return null;
  return {
    sugerido,
    fonte: typeof raw.fonte === 'string' ? raw.fonte : '',
    classe: CLASSES.includes(raw.classe) && raw.classe !== 'VZ' ? raw.classe : 'Fato',
    alternativas: cleanAlternativas(raw.alternativas, 2),
    recebido_em: typeof raw.recebido_em === 'string' ? raw.recebido_em : null,
  };
}

function normalizeFieldState(raw) {
  const base = emptyFieldState();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...raw };
  out.complemento = normalizeComplemento(out.complemento);
  if (typeof out.sugerido !== 'string') out.sugerido = out.sugerido == null ? '' : String(out.sugerido);
  if (!CLASSES.includes(out.classe)) out.classe = out.sugerido ? 'Fato' : 'VZ';
  if (typeof out.fonte !== 'string') out.fonte = '';
  if (!Array.isArray(out.alternativas)) out.alternativas = [];
  out.alternativas = out.alternativas
    .filter((a) => a && typeof a === 'object' && typeof a.sugerido === 'string' && a.sugerido.trim())
    .slice(0, MAX_ALTERNATIVAS)
    .map((a) => ({ sugerido: a.sugerido, fonte: typeof a.fonte === 'string' ? a.fonte : '' }));
  if (typeof out.nota_interna !== 'string') out.nota_interna = '';
  if (!FIELD_STATUSES.includes(out.status)) out.status = out.sugerido ? 'sugerido' : 'vazio';
  if (typeof out.valor !== 'string') out.valor = out.valor == null ? '' : String(out.valor);
  out.estrutura = out.status === 'editado' ? normalizeEstrutura(out.estrutura) : null;
  return out;
}

/** Garante os 34 campos, normalizados. */
function normalizeFields(fields) {
  const src = fields && typeof fields === 'object' ? fields : {};
  const out = {};
  for (const key of FIELD_KEYS) out[key] = normalizeFieldState(src[key]);
  return out;
}

function isDecided(state) {
  return DECIDED_STATUSES.includes(state.status);
}

/** Valor efetivo do campo (o que vai para o script). */
function effectiveValue(state) {
  if (state.status === 'confirmado') return state.valor || state.sugerido;
  if (state.status === 'editado') return state.valor;
  return '';
}

/**
 * Aplica decisoes do mentor. updates = { "3.3": { valor?, status, estrutura? } }.
 * Transicoes:
 *   confirmado   : exige sugerido nao vazio; valor = sugerido; estrutura = null
 *   editado      : exige valor nao vazio; guarda estrutura (JSON do widget) se vier
 *   aceito_vazio : sempre permitido; valor = ''; estrutura = null
 *   sugerido|vazio : desfaz a decisao (volta ao original)
 */
function applyUpdates(fields, updates, email) {
  const next = normalizeFields(fields);
  const applied = [];
  const rejected = [];
  const ts = nowIso();

  for (const [key, upd] of Object.entries(updates || {})) {
    if (!FIELD_BY_KEY[key]) { rejected.push({ key, motivo: 'campo desconhecido' }); continue; }
    if (!upd || typeof upd !== 'object') { rejected.push({ key, motivo: 'formato invalido' }); continue; }
    const cur = next[key];
    const status = upd.status;
    const valor = typeof upd.valor === 'string' ? upd.valor : '';

    if (status === 'confirmado') {
      if (!cur.sugerido.trim()) { rejected.push({ key, motivo: 'sem sugestao para confirmar' }); continue; }
      next[key] = { ...cur, status: 'confirmado', valor: cur.sugerido, estrutura: null, atualizado_por: email, atualizado_em: ts };
    } else if (status === 'editado') {
      if (!valor.trim()) { rejected.push({ key, motivo: 'valor vazio' }); continue; }
      next[key] = { ...cur, status: 'editado', valor: valor.trim(), estrutura: normalizeEstrutura(upd.estrutura), atualizado_por: email, atualizado_em: ts };
    } else if (status === 'aceito_vazio') {
      next[key] = { ...cur, status: 'aceito_vazio', valor: '', estrutura: null, atualizado_por: email, atualizado_em: ts };
    } else if (status === 'sugerido' || status === 'vazio') {
      next[key] = {
        ...cur,
        status: cur.sugerido.trim() ? 'sugerido' : 'vazio',
        valor: '',
        estrutura: null,
        atualizado_por: email,
        atualizado_em: ts,
      };
    } else {
      rejected.push({ key, motivo: 'status invalido' });
      continue;
    }
    // Decisao no app: o campo passa a ser do mentor (um `decidir` do WhatsApp nao sobrescreve mais)
    if (next[key].autor) next[key] = { ...next[key], autor: null };
    applied.push(key);
  }

  return { fields: next, applied, rejected };
}

/**
 * Importa o JSON de pre-preenchimento (contrato). Nao sobrescreve campo ja decidido.
 * campos = { "1.1": { sugerido, classe, fonte, alternativas, nota_interna } }
 * parcial: so as chaves presentes em `campos` (subconjunto das 34, na ordem da ficha); as demais ficam como estao.
 */
function applyPrefill(fields, campos, { parcial = false } = {}) {
  const next = normalizeFields(fields);
  const imported = [];
  const skipped = [];
  const complementos = [];
  const limpos = [];
  const keys = parcial ? FIELD_KEYS.filter((k) => campos[k]) : FIELD_KEYS;

  for (const key of keys) {
    const cur = next[key];
    const inc = campos[key];
    const san = sanitizeSugestao(inc);
    if (isDecided(cur)) {
      // Campo decidido: o texto do mentor pesa mais e fica intacto; o achado do worker vira `complemento`
      // (aprofundamento que ele incorpora ou dispensa). Nada a acrescentar (VZ ou o mesmo texto) = mantido.
      if (san.sugerido && san.sugerido !== effectiveValue(cur).trim()) {
        next[key] = {
          ...cur,
          complemento: normalizeComplemento({ sugerido: san.sugerido, fonte: san.fonte, classe: san.classe, alternativas: inc.alternativas, recebido_em: nowIso() }),
        };
        complementos.push(key);
      } else {
        skipped.push(key);
      }
      continue;
    }
    if (san.limpo) limpos.push(key);
    next[key] = {
      ...cur,
      sugerido: san.sugerido,
      classe: san.classe,
      fonte: san.fonte,
      alternativas: cleanAlternativas(inc.alternativas, 2),
      nota_interna: san.nota_interna,
      status: san.sugerido ? 'sugerido' : 'vazio',
      valor: '',
      estrutura: null,
      complemento: null,
    };
    imported.push(key);
  }

  return { fields: next, imported, skipped, complementos, limpos };
}

/**
 * Complemento de um campo decidido (achado do worker em cima do que o mentor ja escreveu).
 * incorporar: valor = valor atual + linha em branco + texto do complemento; status `editado`; complemento some.
 * dispensar : so apaga o complemento. Sem complemento -> { ok: false, motivo: 'sem complemento' }.
 * @returns {{ ok: boolean, motivo?: string, fields?: object, field?: object, decidiu?: boolean }}
 */
function applyComplemento(fields, key, acao, email) {
  if (!FIELD_BY_KEY[key]) return { ok: false, motivo: 'campo desconhecido' };
  const next = normalizeFields(fields);
  const cur = next[key];
  if (!cur.complemento) return { ok: false, motivo: 'sem complemento' };
  if (acao === 'dispensar') {
    next[key] = { ...cur, complemento: null };
    return { ok: true, fields: next, field: next[key], decidiu: false };
  }
  if (acao !== 'incorporar') return { ok: false, motivo: 'acao invalida' };
  const atual = effectiveValue(cur).trim();
  const valor = atual ? `${atual}\n\n${cur.complemento.sugerido}` : cur.complemento.sugerido;
  next[key] = { ...cur, status: 'editado', valor, estrutura: null, complemento: null, autor: null, atualizado_por: email, atualizado_em: nowIso() };
  return { ok: true, fields: next, field: next[key], decidiu: true };
}

/** Alternativas limpas (sem placeholder, sem vazias), no maximo `max`. */
function cleanAlternativas(list, max = 2) {
  return (Array.isArray(list) ? list : [])
    .map((a) => ({ sugerido: String((a && a.sugerido) || '').trim(), fonte: String((a && a.fonte) || '').trim() }))
    .filter((a) => a.sugerido && !isPlaceholder(a.sugerido))
    .slice(0, max);
}

/**
 * Nova sugestao vinda do worker para UM campo (PUT /api/jobs/:id/campo, job `refinar`).
 * Volta o campo para `sugerido` MESMO se ja estava decidido: o valor anterior do mentor vai para
 * alternativas[0] com fonte "sua versão anterior" (ele pode voltar atras com 1 toque). Se o campo nao
 * estava decidido mas tinha sugestao diferente, ela fica como "sugestão anterior".
 * Aplica a regra "sem a definir": placeholder vira vazio e o texto vai para nota_interna.
 * @returns {{ fields, field, reaberto: boolean, limpo: boolean }}
 */
function applyWorkerSuggestion(fields, key, inc, { job_id = null, decidir = false } = {}) {
  if (!FIELD_BY_KEY[key]) throw new Error(`campo desconhecido: ${key}`);
  const next = normalizeFields(fields);
  const cur = next[key];
  const san = sanitizeSugestao(inc);

  // decidir: o mentor respondeu pelo WhatsApp e o worker decide em nome dele (editado, autor "WhatsApp do mentor").
  // Campo decidido NO APP nunca e sobrescrito: a resposta vira complemento. Decidido antes pelo WhatsApp pode ser trocado.
  if (decidir) {
    // Nada para decidir (VZ ou "a definir"): o campo fica exatamente como esta
    if (!san.sugerido) return { fields: next, field: cur, reaberto: false, limpo: san.limpo, decidido: false, complemento: false };
    const ts = nowIso();
    if (isDecided(cur) && cur.autor !== AUTOR_WHATSAPP) {
      const igual = san.sugerido === effectiveValue(cur).trim();
      if (!igual) {
        next[key] = {
          ...cur,
          complemento: normalizeComplemento({ sugerido: san.sugerido, fonte: san.fonte, classe: san.classe, alternativas: inc.alternativas, recebido_em: ts }),
        };
      }
      return { fields: next, field: next[key], reaberto: false, limpo: false, decidido: false, complemento: !igual };
    }
    next[key] = {
      ...cur,
      sugerido: san.sugerido,
      classe: san.classe,
      fonte: san.fonte,
      alternativas: cleanAlternativas(inc.alternativas, 2),
      nota_interna: san.nota_interna,
      status: 'editado',
      valor: san.sugerido,
      estrutura: null,
      complemento: null,
      autor: AUTOR_WHATSAPP,
      atualizado_por: job_id ? `worker:${job_id}` : 'worker',
      atualizado_em: ts,
    };
    return { fields: next, field: next[key], reaberto: false, limpo: false, decidido: true, complemento: false };
  }

  const reaberto = isDecided(cur);
  const anterior = reaberto ? effectiveValue(cur) : '';
  const alts = [];
  if (anterior && anterior !== san.sugerido) alts.push({ sugerido: anterior, fonte: 'sua versão anterior' });
  else if (!reaberto && cur.sugerido && cur.sugerido !== san.sugerido) alts.push({ sugerido: cur.sugerido, fonte: 'sugestão anterior' });
  for (const a of cleanAlternativas(inc.alternativas, 2)) {
    if (alts.length >= MAX_ALTERNATIVAS) break;
    if (a.sugerido === san.sugerido || alts.some((x) => x.sugerido === a.sugerido)) continue;
    alts.push(a);
  }
  const ts = nowIso();
  next[key] = {
    ...cur,
    sugerido: san.sugerido,
    classe: san.classe,
    fonte: san.fonte,
    alternativas: alts,
    nota_interna: san.nota_interna,
    status: san.sugerido ? 'sugerido' : 'vazio',
    valor: '',
    estrutura: null,
    atualizado_por: job_id ? `worker:${job_id}` : 'worker',
    atualizado_em: ts,
  };
  return { fields: next, field: next[key], reaberto, limpo: san.limpo, decidido: false, complemento: false };
}

/**
 * Limpa placeholders ("a definir" etc.) de campos NAO decididos: viram `vazio` (classe VZ, sugerido '',
 * texto em nota_interna); alternativas com placeholder somem. Campo decidido nunca e tocado.
 * Usado por scripts/limpar-a-definir.cjs.
 * @returns {{ fields, alterados: [{ key, antes, alternativas_removidas }] }}
 */
function limparADefinir(fields) {
  const next = normalizeFields(fields);
  const alterados = [];
  for (const key of FIELD_KEYS) {
    const cur = next[key];
    if (isDecided(cur)) continue;
    const altsAntes = cur.alternativas.length;
    const alts = cur.alternativas.filter((a) => !isPlaceholder(a.sugerido));
    const sugPlaceholder = !!cur.sugerido && isPlaceholder(cur.sugerido);
    if (!sugPlaceholder && alts.length === altsAntes) continue;
    const san = sugPlaceholder ? sanitizeSugestao({ ...cur, classe: cur.classe === 'VZ' ? 'Fato' : cur.classe }) : null;
    next[key] = {
      ...cur,
      ...(san ? { sugerido: '', classe: 'VZ', fonte: '', nota_interna: san.nota_interna, status: 'vazio', valor: '' } : {}),
      alternativas: alts,
    };
    alterados.push({ key, antes: cur.sugerido, alternativas_removidas: altsAntes - alts.length });
  }
  return { fields: next, alterados };
}

/**
 * Valida o JSON do contrato de pre-preenchimento (CONTRATO-prefill-json.md) alem do schema zod:
 * 34 chaves exatas, fonte/sugerido obrigatorios fora de VZ, max. 2 alternativas, club_slug igual ao alvo.
 * Travessao so avisa. Compartilhado por PUT /api/admin/clubs/:slug/script-ficha e PUT /api/jobs/:id/prefill.
 */
function validatePrefillBody(body, slug) {
  const errors = [];
  const warnings = [];
  const campos = (body && body.campos) || {};
  // parcial: subconjunto das 34 chaves (prefill em marcos); cada campo presente segue as mesmas regras
  const parcial = !!(body && body.parcial);

  if (body && body.club_slug && slug && body.club_slug !== slug) {
    errors.push(`club_slug do JSON ("${body.club_slug}") difere do clube alvo ("${slug}").`);
  }

  const keys = Object.keys(campos);
  const missing = FIELD_KEYS.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !FIELD_BY_KEY[k]);
  if (parcial) {
    if (!keys.length) errors.push('parcial sem campos: envie ao menos 1 campo.');
  } else if (missing.length) {
    errors.push(`Faltam ${missing.length} campos: ${missing.join(', ')}.`);
  }
  if (extra.length) errors.push(`Chaves desconhecidas: ${extra.join(', ')}.`);

  for (const k of keys) {
    const c = campos[k];
    if (!FIELD_BY_KEY[k] || !c) continue;
    if (c.classe !== 'VZ') {
      if (!String(c.fonte || '').trim()) errors.push(`${k}: fonte obrigatória quando classe é ${c.classe}.`);
      if (!String(c.sugerido || '').trim()) errors.push(`${k}: sugerido vazio com classe ${c.classe} (use classe VZ).`);
    } else if (String(c.sugerido || '').trim()) {
      warnings.push(`${k}: classe VZ com sugerido preenchido; o texto será ignorado.`);
    }
    if ((c.alternativas || []).length > 2) errors.push(`${k}: no máximo 2 alternativas.`);
    const textos = [c.sugerido, ...(c.alternativas || []).map((a) => a.sugerido)].filter(Boolean);
    if (textos.some((t) => String(t).includes('—'))) warnings.push(`${k}: contém travessão.`);
  }

  return { errors, warnings };
}

/** Garante a linha de script_fichas do clube (1 por clube) e a devolve. */
async function ensureFichaRow({ dbGet, dbRun, uuidv4 }, clubSlug) {
  await dbRun(
    `INSERT OR IGNORE INTO script_fichas (id, club_slug, fields, materials, materials_status, ficha_status)
     VALUES (?, ?, '{}', '{"por_pessoa":{}}', 'pending', 'vazia')`,
    [`ficha-${uuidv4()}`, clubSlug]
  );
  return dbGet(`SELECT * FROM script_fichas WHERE club_slug = ?`, [clubSlug]);
}

/**
 * Importa o JSON de pre-preenchimento ja validado (schema + validatePrefillBody) na ficha do clube.
 * Nunca sobrescreve campo decidido (confirmado / editado / aceito_vazio). vazia -> pre_preenchida.
 * @returns {{ imported: string[], skipped: string[], ficha_status: string, resumo: object, fields: object }}
 */
async function importPrefill({ dbGet, dbRun, uuidv4, safeJsonParse }, slug, body, extraMeta = {}) {
  const parse = safeJsonParse || ((s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } });
  const parcial = !!body.parcial;
  const ficha = await ensureFichaRow({ dbGet, dbRun, uuidv4 }, slug);
  const { fields, imported, skipped, complementos, limpos } = applyPrefill(parse(ficha.fields, {}), body.campos, { parcial });
  // vazia -> pre_preenchida; em_revisao / confirmada nunca rebaixam (o mentor ja mexeu)
  const nextStatus = ficha.ficha_status === 'vazia' ? 'pre_preenchida' : ficha.ficha_status;
  // Parcial acumula sobre o meta anterior (mesmo job em marcos): blocos_importados cresce a cada bloco
  const prevMeta = parcial ? (parse(ficha.prefill_meta, null) || {}) : {};
  const blocosAntes = Array.isArray(prevMeta.blocos_importados) ? prevMeta.blocos_importados : [];
  const blocosAgora = [...imported, ...skipped, ...complementos].map((k) => FIELD_BY_KEY[k].bloco);
  const blocos_importados = [...new Set([...blocosAntes, ...blocosAgora].map(Number).filter((n) => Number.isInteger(n)))].sort((a, b) => a - b);
  const meta = {
    ...prevMeta,
    club_nome: body.club_nome || prevMeta.club_nome || null,
    membros: (body.membros && body.membros.length ? body.membros : prevMeta.membros) || [],
    gerado_em: body.gerado_em || prevMeta.gerado_em || null,
    gerado_por: body.gerado_por || prevMeta.gerado_por || null,
    fontes_lidas: (body.fontes_lidas && body.fontes_lidas.length ? body.fontes_lidas : prevMeta.fontes_lidas) || [],
    importado_em: new Date().toISOString(),
    parcial,
    blocos_importados,
    ...extraMeta,
  };
  await dbRun(
    `UPDATE script_fichas
        SET fields = ?, ficha_status = ?, prefill_meta = ?, prefilled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE club_slug = ?`,
    [JSON.stringify(fields), nextStatus, JSON.stringify(meta), slug]
  );
  return { fields, imported, skipped, complementos, limpos, parcial, blocos_importados, ficha_status: nextStatus, resumo: summarize(fields), meta };
}

/** Chaves obrigatorias ainda sem decisao. */
function missingRequired(fields) {
  const f = normalizeFields(fields);
  return REQUIRED_KEYS.filter((k) => !isDecided(f[k]));
}

function roundMinutes(m) {
  return Math.max(1, Math.round(m));
}

/**
 * Monta a visao da ficha para o front: blocos com campos (definicao + estado),
 * progresso e o "hoje" (SPEC secao 4: dia 1 = blocos 1 a 3, dia 2 = 4 a 6, dia 3 = revisar).
 * includeInternal: inclui nota_interna e passo (so admin).
 */
function buildFichaView(fieldsRaw, { includeInternal = false } = {}) {
  const fields = normalizeFields(fieldsRaw);

  const blocos = BLOCKS.map((b) => {
    const campos = FIELDS.filter((f) => f.bloco === b.numero).map((def) => {
      const st = fields[def.key];
      const campo = {
        key: def.key,
        bloco: def.bloco,
        nome: def.nome,
        pergunta: def.pergunta,
        tipo: def.tipo,
        tipoRaw: def.tipoRaw,
        obrigatorio: def.obrigatorio,
        minutos: def.minutos,
        opcoes: def.opcoes || null,
        widget: def.widget || null,
        template: def.template || null,
        sugerido: st.sugerido,
        classe: st.classe,
        fonte: st.fonte,
        alternativas: st.alternativas,
        status: st.status,
        valor: st.valor,
        estrutura: st.estrutura || null,
        valor_efetivo: effectiveValue(st),
        decidido: isDecided(st),
        // Achado do worker em cima de um campo decidido (o mentor incorpora ou dispensa)
        complemento: st.complemento || null,
        // "WhatsApp do mentor" quando o worker decidiu em nome dele; null quando foi o app
        autor: st.autor || null,
        atualizado_por: st.atualizado_por,
        atualizado_em: st.atualizado_em,
      };
      if (includeInternal) {
        campo.nota_interna = st.nota_interna;
        campo.passo = def.passo;
        campo.fontes_precedencia = def.fontes;
      }
      return campo;
    });
    const obrig = campos.filter((c) => c.obrigatorio);
    const pendentesMin = campos.filter((c) => !c.decidido).reduce((s, c) => s + c.minutos, 0);
    return {
      numero: b.numero,
      nome: b.nome,
      descricao: b.descricao,
      total: campos.length,
      decididos: campos.filter((c) => c.decidido).length,
      obrigatorios: obrig.length,
      obrigatorios_decididos: obrig.filter((c) => c.decidido).length,
      minutos: roundMinutes(campos.reduce((s, c) => s + c.minutos, 0)),
      minutos_pendentes: pendentesMin > 0 ? roundMinutes(pendentesMin) : 0,
      fechado: obrig.every((c) => c.decidido),
      campos,
    };
  });

  // Hoje: primeiro dia cujos blocos ainda tem obrigatorio sem decisao.
  let hoje = null;
  for (const d of DAYS) {
    if (!d.blocos.length) continue;
    const abertos = blocos.filter((b) => d.blocos.includes(b.numero) && !b.fechado);
    if (abertos.length) {
      const min = blocos.filter((b) => d.blocos.includes(b.numero)).reduce((s, b) => s + b.minutos_pendentes, 0);
      hoje = {
        dia: d.dia,
        titulo: d.titulo,
        blocos: d.blocos,
        blocos_abertos: abertos.map((b) => b.numero),
        minutos: min > 0 ? roundMinutes(min) : d.minutos,
        em_breve: false,
      };
      break;
    }
  }
  if (!hoje) {
    const d3 = DAYS.find((d) => d.dia === 3);
    hoje = { dia: 3, titulo: d3.titulo, blocos: [], blocos_abertos: [], minutos: d3.minutos, em_breve: true };
  }

  const all = blocos.flatMap((b) => b.campos);
  const progresso = {
    total: all.length,
    decididos: all.filter((c) => c.decidido).length,
    obrigatorios: REQUIRED_KEYS.length,
    obrigatorios_decididos: all.filter((c) => c.obrigatorio && c.decidido).length,
    confirmados: all.filter((c) => c.status === 'confirmado').length,
    editados: all.filter((c) => c.status === 'editado').length,
    aceitos_vazios: all.filter((c) => c.status === 'aceito_vazio').length,
  };

  return { blocos, hoje, progresso, dias: DAYS };
}

/** Resumo curto (admin overview). */
function summarize(fieldsRaw) {
  const fields = normalizeFields(fieldsRaw);
  const all = Object.values(fields);
  return {
    total: all.length,
    decididos: all.filter(isDecided).length,
    obrigatorios: REQUIRED_KEYS.length,
    obrigatorios_decididos: REQUIRED_KEYS.filter((k) => isDecided(fields[k])).length,
    sugeridos: all.filter((s) => s.status === 'sugerido').length,
    vazios: all.filter((s) => s.status === 'vazio').length,
  };
}

module.exports = {
  DEFS,
  FIELDS,
  FIELD_KEYS,
  FIELD_BY_KEY,
  REQUIRED_KEYS,
  BLOCKS,
  DAYS,
  FIELD_STATUSES,
  DECIDED_STATUSES,
  CLASSES,
  MAX_ALTERNATIVAS,
  AUTOR_WHATSAPP,
  PLACEHOLDER_RE,
  isPlaceholder,
  sanitizeSugestao,
  cleanAlternativas,
  applyWorkerSuggestion,
  limparADefinir,
  emptyFieldState,
  normalizeEstrutura,
  normalizeComplemento,
  normalizeFieldState,
  normalizeFields,
  isDecided,
  effectiveValue,
  applyUpdates,
  applyPrefill,
  applyComplemento,
  validatePrefillBody,
  ensureFichaRow,
  importPrefill,
  missingRequired,
  buildFichaView,
  summarize,
};
