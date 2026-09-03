/**
 * Ficha do Script (7 passos): definicoes dos 34 campos + regras de estado.
 * Fonte unica das definicoes: data/script-ficha-fields.json (o front importa o mesmo JSON).
 *
 * Estado de cada campo em script_fichas.fields[key]:
 *   { sugerido, classe, fonte, alternativas[], nota_interna,
 *     status: 'sugerido'|'confirmado'|'editado'|'vazio'|'aceito_vazio',
 *     valor, atualizado_por, atualizado_em }
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
    atualizado_por: null,
    atualizado_em: null,
  };
}

function normalizeFieldState(raw) {
  const base = emptyFieldState();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...raw };
  if (typeof out.sugerido !== 'string') out.sugerido = out.sugerido == null ? '' : String(out.sugerido);
  if (!CLASSES.includes(out.classe)) out.classe = out.sugerido ? 'Fato' : 'VZ';
  if (typeof out.fonte !== 'string') out.fonte = '';
  if (!Array.isArray(out.alternativas)) out.alternativas = [];
  out.alternativas = out.alternativas
    .filter((a) => a && typeof a === 'object' && typeof a.sugerido === 'string' && a.sugerido.trim())
    .slice(0, 2)
    .map((a) => ({ sugerido: a.sugerido, fonte: typeof a.fonte === 'string' ? a.fonte : '' }));
  if (typeof out.nota_interna !== 'string') out.nota_interna = '';
  if (!FIELD_STATUSES.includes(out.status)) out.status = out.sugerido ? 'sugerido' : 'vazio';
  if (typeof out.valor !== 'string') out.valor = out.valor == null ? '' : String(out.valor);
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
 * Aplica decisoes do mentor. updates = { "3.3": { valor?, status } }.
 * Transicoes:
 *   confirmado   : exige sugerido nao vazio; valor = sugerido
 *   editado      : exige valor nao vazio
 *   aceito_vazio : sempre permitido; valor = ''
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
      next[key] = { ...cur, status: 'confirmado', valor: cur.sugerido, atualizado_por: email, atualizado_em: ts };
    } else if (status === 'editado') {
      if (!valor.trim()) { rejected.push({ key, motivo: 'valor vazio' }); continue; }
      next[key] = { ...cur, status: 'editado', valor: valor.trim(), atualizado_por: email, atualizado_em: ts };
    } else if (status === 'aceito_vazio') {
      next[key] = { ...cur, status: 'aceito_vazio', valor: '', atualizado_por: email, atualizado_em: ts };
    } else if (status === 'sugerido' || status === 'vazio') {
      next[key] = {
        ...cur,
        status: cur.sugerido.trim() ? 'sugerido' : 'vazio',
        valor: '',
        atualizado_por: email,
        atualizado_em: ts,
      };
    } else {
      rejected.push({ key, motivo: 'status invalido' });
      continue;
    }
    applied.push(key);
  }

  return { fields: next, applied, rejected };
}

/**
 * Importa o JSON de pre-preenchimento (contrato). Nao sobrescreve campo ja decidido.
 * campos = { "1.1": { sugerido, classe, fonte, alternativas, nota_interna } }
 */
function applyPrefill(fields, campos) {
  const next = normalizeFields(fields);
  const imported = [];
  const skipped = [];

  for (const key of FIELD_KEYS) {
    const cur = next[key];
    const inc = campos[key];
    if (isDecided(cur)) { skipped.push(key); continue; }
    const sugerido = (inc.classe === 'VZ') ? '' : String(inc.sugerido || '').trim();
    next[key] = {
      ...cur,
      sugerido,
      classe: inc.classe,
      fonte: inc.classe === 'VZ' ? '' : String(inc.fonte || '').trim(),
      alternativas: (inc.alternativas || []).slice(0, 2).map((a) => ({
        sugerido: String(a.sugerido || '').trim(),
        fonte: String(a.fonte || '').trim(),
      })).filter((a) => a.sugerido),
      nota_interna: String(inc.nota_interna || ''),
      status: sugerido ? 'sugerido' : 'vazio',
      valor: '',
    };
    imported.push(key);
  }

  return { fields: next, imported, skipped };
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
        sugerido: st.sugerido,
        classe: st.classe,
        fonte: st.fonte,
        alternativas: st.alternativas,
        status: st.status,
        valor: st.valor,
        valor_efetivo: effectiveValue(st),
        decidido: isDecided(st),
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
  emptyFieldState,
  normalizeFieldState,
  normalizeFields,
  isDecided,
  effectiveValue,
  applyUpdates,
  applyPrefill,
  missingRequired,
  buildFichaView,
  summarize,
};
