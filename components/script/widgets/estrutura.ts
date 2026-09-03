/**
 * Ficha do Script: parse (texto -> estrutura) e render (estrutura -> texto) de cada widget.
 * Puro (sem React) para ser testavel. O `valor` salvo e SEMPRE o render(estrutura):
 * formato estavel, 1 item por linha ou pares "Rotulo: valor"; o gerador do script pode
 * usar tanto `valor` (texto) quanto `estrutura` (JSON).
 *
 * Heuristica do parse (sugestao em texto corrido):
 *   - linhas = quebra de linha; celulas = " · ", " | " ou ";"
 *   - pares "Rotulo: valor" reconhecidos sem acento e sem caixa
 *   - R$ por regex; numeros com a palavra ao lado (12x, 6 meses, 60 min, 3 reunioes)
 *   - quando nada estrutura, o texto vai para o primeiro slot livre e `bruto = true`
 *     (o FichaField mostra "sugestao em texto corrido, ajuste nos campos")
 */

export type Estrutura = Record<string, any>;
export type WidgetTemplate = Record<string, any>;

export interface ParseContext {
  /** Opcoes de escolha (chips/radio): sugerido + alternativas ou `opcoes` do campo. */
  opcoes?: string[];
  /** Nomes dos pilares do 4.2 (para 4.3 e 4.4). */
  pilares?: string[];
  /** A dor principal do 3.3 (primeira citação), para a linha dor -> pilar do 4.3. */
  dor?: string;
  /** Objeções do 6.3 (linhas + clássicas do template), para o bônus -> objeção do 5.7. */
  objecoes?: string[];
}

export interface ParseResult {
  estrutura: Estrutura;
  bruto: boolean;
}

export interface EstruturaSpec {
  vazio: (t: WidgetTemplate, ctx: ParseContext) => Estrutura;
  parse: (text: string, t: WidgetTemplate, ctx: ParseContext) => ParseResult;
  render: (e: Estrutura, t: WidgetTemplate) => string;
  /** Pode salvar? Sem esta funcao vale "render nao vazio". Lacunas: todas preenchidas ou texto livre. */
  valido?: (e: Estrutura, t: WidgetTemplate) => boolean;
}

export type WidgetType =
  | 'escolha' | 'meta' | 'frase' | 'texto' | 'antes_depois' | 'historia_podio' | 'vs' | 'icp'
  | 'chips_texto' | 'citacoes' | 'lista_numerada' | 'tabela' | 'pilares' | 'escolha_de_lista'
  | 'escada' | 'checklist_condicoes' | 'dois_numeros' | 'dois_campos' | 'dois_textos' | 'canal' | 'casos'
  | 'lacunas' | 'baralho' | 'quem_vende'
  // metáforas da onda 2 e 3: mesma estrutura (e mesmo valor) do widget base, só o visual muda
  | 'prateleira' | 'chave_fechadura' | 'retorno' | 'radar' | 'dois_caminhos' | 'capa_livro';

// ── helpers ──────────────────────────────────────────────────────────────────

// " · ", " | " ou ";" (espacos opcionais: uma celula do meio vazia vira "a ·  · c")
const CELL_SEP = /\s*[·|]\s*|\s*;\s*/;
const MOEDA_RE = /R\$\s?(\d[\d.]*(?:,\d{1,2})?)/i;

export function norm(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function str(v: any): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function clean(s: any): string {
  return str(s).replace(/\r/g, '').trim();
}

/** Celula segura: separadores viram virgula para nao quebrar o parse depois. */
function cell(s: any): string {
  return clean(s).replace(/\s*;\s*/g, ', ').replace(/\s*[·|]\s*/g, ', ').replace(/\n+/g, ' ');
}

export function splitLines(text: string): string[] {
  return str(text).replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
}

export function splitCells(line: string): string[] {
  return str(line).split(CELL_SEP).map((c) => c.trim());
}

/** Lista: linhas; se so tem 1 linha com separadores, divide nas celulas. */
function splitItems(text: string): string[] {
  const lines = splitLines(text);
  if (lines.length === 1) {
    const cells = splitCells(lines[0]).filter(Boolean);
    if (cells.length > 1) return cells;
  }
  return lines;
}

export function stripBullet(s: string): string {
  return str(s).replace(/^\s*(?:\d+\s*[.)-]\s*|[-*•]\s+)/, '').trim();
}

export function stripQuotes(s: string): string {
  return str(s).trim().replace(/^["“”«'‘’]+/, '').replace(/["“”»'‘’]+$/, '').trim();
}

export function extractMoeda(s: string): { valor: string; resto: string } {
  const m = str(s).match(MOEDA_RE);
  if (!m) return { valor: '', resto: str(s).trim() };
  const resto = str(s).replace(m[0], ' ').replace(/\s{2,}/g, ' ').replace(/^[\s,·|-]+|[\s,·|-]+$/g, '').trim();
  return { valor: m[1], resto };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type Labels = Record<string, string[]>;

/**
 * Reconhece linhas "Rotulo: valor". Rotulos sem acento/caixa. Com `continuar`, linhas sem
 * rotulo logo apos uma rotulada continuam o valor dela (valores multilinha).
 */
export function findLabeled(lines: string[], labels: Labels, continuar = false): { found: Record<string, string>; rest: string[]; any: boolean } {
  const entries = Object.entries(labels)
    .flatMap(([key, als]) => als.map((a) => ({ key, re: new RegExp(`^(?:${escapeRe(norm(a))})\\s*:\\s*(.*)$`, 'i'), len: a.length })))
    .sort((a, b) => b.len - a.len); // rotulo mais longo primeiro (Condicao de entrada > Entrada)
  const found: Record<string, string> = {};
  const rest: string[] = [];
  let last: string | null = null;
  for (const line of lines) {
    const n = norm(line);
    let hit = false;
    for (const { key, re } of entries) {
      const m = n.match(re);
      if (m) {
        // recupera o valor original (com acentos) cortando no primeiro ':' apos o rotulo
        const idx = line.indexOf(':');
        const val = idx >= 0 ? line.slice(idx + 1).trim() : m[1];
        found[key] = found[key] ? `${found[key]}\n${val}` : val;
        last = key;
        hit = true;
        break;
      }
    }
    if (hit) continue;
    if (continuar && last) { found[last] = `${found[last]}\n${line}`.trim(); continue; }
    rest.push(line);
  }
  return { found, rest, any: Object.keys(found).length > 0 };
}

function lines(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map((p) => p.trim()).join('\n');
}

function pair(label: string, value: any): string | false {
  const v = clean(value);
  return v ? `${label}: ${v}` : false;
}

function matchOption(text: string, options: string[]): string | null {
  const n = norm(text);
  if (!n) return null;
  const exact = options.find((o) => norm(o) === n);
  if (exact) return exact;
  const starts = options.find((o) => norm(o) && (n.startsWith(norm(o)) || norm(o).startsWith(n)));
  return starts || null;
}

// ── specs ────────────────────────────────────────────────────────────────────

/** escolha: `{ opcao, texto }`. valor = opcao, ou o texto quando opcao = "Outra". */
const escolha: EstruturaSpec = {
  vazio: () => ({ opcao: '', texto: '' }),
  parse: (text, _t, ctx) => {
    const s = clean(text);
    if (!s) return { estrutura: { opcao: '', texto: '' }, bruto: false };
    const m = matchOption(s, ctx.opcoes || []);
    if (m && norm(m) === norm(s)) return { estrutura: { opcao: m, texto: '' }, bruto: false };
    return { estrutura: { opcao: 'Outra', texto: s }, bruto: false };
  },
  render: (e) => (e.opcao === 'Outra' ? clean(e.texto) : clean(e.opcao) || clean(e.texto)),
};

/** meta: `{ clientes, ate, reunioes, obs }`. valor = "N clientes até X · N reuniões por semana" + obs. */
const meta: EstruturaSpec = {
  vazio: () => ({ clientes: '', ate: '', reunioes: '', obs: '' }),
  parse: (text) => {
    const s = clean(text).replace(/\n+/g, ' · ');
    const e = { clientes: '', ate: '', reunioes: '', obs: '' };
    if (!s) return { estrutura: e, bruto: false };
    const c = s.match(/(\d+)\s*clientes?/i);
    const a = s.match(/at[eé]\s+(.+?)(?=\s*(?:[·|;]|\d+\s*reuni|$))/i);
    const r = s.match(/(\d+)\s*reuni/i);
    if (!c && !a && !r) return { estrutura: { ...e, obs: clean(text) }, bruto: true };
    e.clientes = c ? c[1] : '';
    e.ate = a ? a[1].trim() : '';
    e.reunioes = r ? r[1] : '';
    return { estrutura: e, bruto: false };
  },
  render: (e) => {
    const a = [clean(e.clientes) && `${clean(e.clientes)} clientes`, clean(e.ate) && `até ${cell(e.ate)}`].filter(Boolean).join(' ');
    const b = clean(e.reunioes) && `${clean(e.reunioes)} reuniões por semana`;
    return lines([a, b].filter(Boolean).join(' · '), e.obs);
  },
};

/** frase: `{ frase }`. valor = a frase (1 linha). */
const frase: EstruturaSpec = {
  vazio: () => ({ frase: '' }),
  parse: (text) => ({ estrutura: { frase: clean(text).replace(/\s*\n\s*/g, ' ') }, bruto: false }),
  render: (e) => clean(e.frase),
};


/**
 * lacunas: frase-modelo com lacunas. template.modelo = "Eu sou [sou] e ajudo [ajudo] a [a]."; template.lacunas =
 * [{ key, rotulo, placeholder, chips? }]; template.padrao = regex opcional (grupos nomeados) para ler a sugestao.
 * estrutura `{ lacunas: { [key]: texto }, livre }`. valor = a frase composta (lacuna vazia vira "…") ou o texto livre.
 * Sugestao que nao casa com o modelo vai inteira para `livre` (nao e "bruto": escrever livre e um modo legitimo).
 */
export function lacunaKeys(modelo: string): string[] {
  return Array.from(str(modelo).matchAll(/\[(\w+)\]/g)).map((m) => m[1]);
}
function lacunasRe(t: WidgetTemplate): RegExp | null {
  if (typeof t.padrao === 'string' && t.padrao) {
    try { return new RegExp(t.padrao, 'i'); } catch { /* padrao invalido: cai no modelo */ }
  }
  const modelo = str(t.modelo);
  if (!modelo) return null;
  const src = modelo.split(/(\[\w+\])/).map((part) => {
    const m = part.match(/^\[(\w+)\]$/);
    if (m) return `(?<${m[1]}>.+?)`;
    return escapeRe(part.trim()).replace(/\\\.$/, '').replace(/,/g, ',?').replace(/\s+/g, '\\s+');
  }).filter(Boolean).join('\\s*');
  return new RegExp(`^${src}\\s*\\.?$`, 'i');
}
const lacunas: EstruturaSpec = {
  vazio: (t) => ({ lacunas: Object.fromEntries(lacunaKeys(str(t.modelo)).map((k) => [k, ''])), livre: '' }),
  parse: (text, t) => {
    const e: Estrutura = lacunas.vazio(t, {});
    const s = clean(text).replace(/\s*\n\s*/g, ' ');
    if (!s) return { estrutura: e, bruto: false };
    const re = lacunasRe(t);
    const m = re ? s.match(re) : null;
    if (m && m.groups) {
      for (const k of Object.keys(e.lacunas)) {
        const v = clean(m.groups[k]);
        e.lacunas[k] = v === '…' || v === '...' ? '' : v;
      }
      return { estrutura: e, bruto: false };
    }
    return { estrutura: { ...e, livre: s }, bruto: false };
  },
  render: (e, t) => {
    const livre = clean(e.livre);
    if (livre) return livre;
    const l: Record<string, any> = e.lacunas && typeof e.lacunas === 'object' ? e.lacunas : {};
    const modelo = str(t.modelo);
    if (!lacunaKeys(modelo).some((k) => clean(l[k]))) return '';
    return modelo.replace(/\[(\w+)\]/g, (_, k) => cell(l[k]) || '…');
  },
  valido: (e, t) => !!clean(e.livre) || lacunaKeys(str(t.modelo)).every((k) => !!clean(e?.lacunas?.[k])),
};

/** texto / antes_depois: `{ texto }`. valor = o proprio texto. */
const texto: EstruturaSpec = {
  vazio: () => ({ texto: '' }),
  parse: (text) => ({ estrutura: { texto: clean(text) }, bruto: false }),
  render: (e) => clean(e.texto),
};

/** historia_podio: `{ historia, ouro, prata, bronze }`. valor = historia + "Ouro: …", "Prata: …", "Bronze: …". */
const historia_podio: EstruturaSpec = {
  vazio: () => ({ historia: '', ouro: '', prata: '', bronze: '' }),
  parse: (text) => {
    const ls = splitLines(text);
    const e = { historia: '', ouro: '', prata: '', bronze: '' };
    if (!ls.length) return { estrutura: e, bruto: false };
    const { found, rest, any } = findLabeled(ls, { ouro: ['ouro', '1', '1a', 'primeira'], prata: ['prata', '2', '2a', 'segunda'], bronze: ['bronze', '3', '3a', 'terceira'] });
    if (any) {
      return { estrutura: { historia: rest.join('\n'), ouro: found.ouro || '', prata: found.prata || '', bronze: found.bronze || '' }, bruto: false };
    }
    const items = rest.map(stripBullet);
    if (items.length >= 3) {
      const [ouro, prata, bronze] = items.slice(-3);
      return { estrutura: { historia: items.slice(0, -3).join('\n'), ouro, prata, bronze }, bruto: false };
    }
    return { estrutura: { ...e, historia: items.join('\n') }, bruto: true };
  },
  render: (e) => lines(e.historia, pair('Ouro', cell(e.ouro)), pair('Prata', cell(e.prata)), pair('Bronze', cell(e.bronze))),
};

/** vs: `{ mercado, eu }`. valor = "O mercado faz: …" + "Eu faço: …". */
const vs: EstruturaSpec = {
  vazio: () => ({ mercado: '', eu: '' }),
  parse: (text) => {
    const ls = splitLines(text);
    const e = { mercado: '', eu: '' };
    if (!ls.length) return { estrutura: e, bruto: false };
    const { found, any } = findLabeled(ls, { mercado: ['o mercado faz', 'mercado', 'eles fazem', 'eles', 'o mercado'], eu: ['eu faco', 'eu faço', 'eu', 'minha diferenca', 'minha diferença'] }, true);
    if (any) return { estrutura: { mercado: found.mercado || '', eu: found.eu || '' }, bruto: false };
    if (ls.length >= 2) return { estrutura: { mercado: ls[0], eu: ls.slice(1).join('\n') }, bruto: false };
    const one = ls[0];
    const m = one.match(/^(.*?[.;!])\s+(eu\b.*)$/i);
    if (m) return { estrutura: { mercado: m[1].trim(), eu: m[2].trim() }, bruto: false };
    const cells = splitCells(one).filter(Boolean);
    if (cells.length === 2) return { estrutura: { mercado: cells[0], eu: cells[1] }, bruto: false };
    return { estrutura: { mercado: one, eu: '' }, bruto: true };
  },
  render: (e) => lines(pair('O mercado faz', e.mercado), pair('Eu faço', e.eu)),
};

/** icp: `{ setor, papel, tamanho, territorio, obs }`. valor = pares "Setor: …" etc. + obs. */
const ICP_LABELS: Labels = {
  setor: ['setor', 'segmento', 'nicho'],
  papel: ['papel', 'cargo', 'quem'],
  tamanho: ['tamanho ou bolso', 'tamanho', 'bolso', 'faturamento', 'porte'],
  territorio: ['territorio', 'território', 'regiao', 'região', 'onde'],
};
const icp: EstruturaSpec = {
  vazio: () => ({ setor: '', papel: '', tamanho: '', territorio: '', obs: '' }),
  parse: (text) => {
    const ls = splitLines(text);
    const { found, rest, any } = findLabeled(ls, ICP_LABELS);
    const e = { setor: found.setor || '', papel: found.papel || '', tamanho: found.tamanho || '', territorio: found.territorio || '', obs: rest.join('\n') };
    return { estrutura: e, bruto: !any && !!e.obs };
  },
  render: (e) => lines(pair('Setor', cell(e.setor)), pair('Papel', cell(e.papel)), pair('Tamanho ou bolso', cell(e.tamanho)), pair('Território', cell(e.territorio)), e.obs),
};

/** chips_texto: `{ chips[], texto }`. valor = chips separados por virgula na 1a linha + texto. */
const chips_texto: EstruturaSpec = {
  vazio: () => ({ chips: [], texto: '' }),
  parse: (text, t) => {
    const all: string[] = Array.isArray(t.chips) ? t.chips : [];
    const ls = splitLines(text);
    const chips: string[] = [];
    const add = (c: string) => { if (!chips.includes(c)) chips.push(c); };
    const textoLines: string[] = [];
    for (const line of ls) {
      const items = line.split(/\s*,\s*|\s+[·|]\s+|\s*;\s*/).map((i) => i.trim()).filter(Boolean);
      const matches = items.map((i) => all.find((c) => norm(c) === norm(i)) || null);
      if (items.length && matches.every(Boolean)) { matches.forEach((m) => add(m as string)); continue; }
      textoLines.push(line);
      const n = norm(line);
      for (const c of all) if (new RegExp(`(^|[^a-z0-9])${escapeRe(norm(c))}([^a-z0-9]|$)`).test(n)) add(c);
    }
    const e = { chips, texto: textoLines.join('\n') };
    return { estrutura: e, bruto: chips.length === 0 && !!e.texto };
  },
  render: (e) => lines((Array.isArray(e.chips) ? e.chips : []).map(clean).filter(Boolean).join(', '), e.texto),
};

/** citacoes: `{ citacoes[] }`. valor = uma frase por linha, entre aspas. */
const citacoes: EstruturaSpec = {
  vazio: () => ({ citacoes: [] }),
  parse: (text) => ({ estrutura: { citacoes: splitItems(text).map(stripBullet).map(stripQuotes).filter(Boolean) }, bruto: false }),
  render: (e) => (Array.isArray(e.citacoes) ? e.citacoes : []).map((c: any) => cell(stripQuotes(str(c)))).filter(Boolean).map((c: string) => `"${c}"`).join('\n'),
};

/**
 * lista_numerada: `{ itens[], usos[] }` (usos[i] = o que o mentor faz com a resposta do item i; opcional).
 * valor = "1. item" por linha; com o uso, "1. item · para: o que faço com a resposta".
 */
const USO_SEP = /\s*·\s*para:\s*/i;
const lista_numerada: EstruturaSpec = {
  vazio: () => ({ itens: [], usos: [] }),
  parse: (text) => {
    const ls = splitLines(text);
    // uma linha só com " · para: " é UM item com uso, não células
    const raws = ls.length === 1 && USO_SEP.test(ls[0]) ? ls : splitItems(text);
    const itens: string[] = [];
    const usos: string[] = [];
    for (const raw of raws.map(stripBullet).filter(Boolean)) {
      const [item, ...resto] = raw.split(USO_SEP);
      itens.push(item.trim());
      usos.push(resto.join(' ').trim());
    }
    return { estrutura: { itens, usos }, bruto: false };
  },
  render: (e) => {
    const itens: any[] = Array.isArray(e.itens) ? e.itens : [];
    const usos: any[] = Array.isArray(e.usos) ? e.usos : [];
    return itens
      .map((i, n) => ({ item: cell(str(i)), uso: cell(str(usos[n])) }))
      .filter((x) => x.item)
      .map((x, n) => `${n + 1}. ${x.item}${x.uso ? ` · para: ${x.uso}` : ''}`)
      .join('\n');
  },
};

/** tabela: `{ linhas: [{ colKey: valor }] }`. valor = uma linha por item, celulas com " · " (coluna moeda com "R$"). */
const tabela: EstruturaSpec = {
  vazio: (t, ctx) => ({ linhas: prefillRows(t, ctx) }),
  parse: (text, t, ctx) => {
    const cols: { key: string; tipo?: string }[] = Array.isArray(t.colunas) ? t.colunas : [];
    const moedaIdx = cols.findIndex((c) => c.tipo === 'moeda');
    const linhas = splitLines(text).map(stripBullet).filter(Boolean).map((line) => {
      let cells = splitCells(line);
      if (cells.length === 1 && moedaIdx > 0) {
        const { valor, resto } = extractMoeda(line);
        if (valor) { cells = []; cells[0] = resto; cells[moedaIdx] = valor; }
      }
      const row: Record<string, string> = {};
      cols.forEach((c, i) => { row[c.key] = c.tipo === 'moeda' ? extractMoeda(cells[i] || '').valor || (cells[i] || '') : (cells[i] || ''); });
      return row;
    });
    return { estrutura: { linhas: linhas.length ? linhas : prefillRows(t, ctx) }, bruto: false };
  },
  render: (e, t) => {
    const cols: { key: string; tipo?: string }[] = Array.isArray(t.colunas) ? t.colunas : [];
    const rows: any[] = Array.isArray(e.linhas) ? e.linhas : [];
    return rows.map((r) => {
      const cells = cols.map((c) => {
        const v = cell(str(r?.[c.key]));
        return v && c.tipo === 'moeda' && !/R\$/i.test(v) ? `R$ ${v}` : v;
      });
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      return cells.join(' · ');
    }).filter((l) => l.replace(/[\s·]/g, '').length > 0).join('\n');
  },
};

function prefillRows(t: WidgetTemplate, ctx: ParseContext): Record<string, string>[] {
  const cols: { key: string }[] = Array.isArray(t.colunas) ? t.colunas : [];
  if (!t.prefill || !ctx.pilares?.length || !cols.length) return [];
  return ctx.pilares.map((p) => {
    const row: Record<string, string> = {};
    cols.forEach((c, i) => { row[c.key] = i === 0 ? p : ''; });
    return row;
  });
}

/** pilares: `{ pilares: [{ nome, resolve }] }`. valor = "Nome: o que resolve" por linha. */
const pilares: EstruturaSpec = {
  vazio: () => ({ pilares: [] }),
  parse: (text) => {
    const ps = splitLines(text).map(stripBullet).filter(Boolean).map((line) => {
      const idx = line.indexOf(':');
      if (idx > 0) return { nome: line.slice(0, idx).trim(), resolve: line.slice(idx + 1).trim() };
      const cells = splitCells(line);
      return { nome: cells[0] || '', resolve: cells.slice(1).join(', ') };
    });
    return { estrutura: { pilares: ps }, bruto: false };
  },
  render: (e) => (Array.isArray(e.pilares) ? e.pilares : [])
    .map((p: any) => ({ nome: cell(str(p?.nome)).replace(/:/g, ' '), resolve: cell(str(p?.resolve)) }))
    .filter((p: any) => p.nome || p.resolve)
    .map((p: any) => (p.resolve ? `${p.nome || 'Etapa'}: ${p.resolve}` : p.nome)).join('\n'),
};

/** Nomes dos pilares a partir da estrutura do 4.2 ou, na falta, do texto (valor efetivo ou sugerido). */
export function pilarNames(e: Estrutura | null | undefined, valorTexto: string): string[] {
  const fromE = Array.isArray(e?.pilares) ? (e as Estrutura).pilares.map((p: any) => clean(str(p?.nome))).filter(Boolean) : [];
  if (fromE.length) return fromE;
  return (pilares.parse(valorTexto || '', {}, {}).estrutura.pilares as any[]).map((p) => clean(p.nome)).filter(Boolean);
}

/** escolha_de_lista: `{ escolhido, texto }`. valor = escolhido, ou o texto livre. */
const escolha_de_lista: EstruturaSpec = {
  vazio: () => ({ escolhido: '', texto: '' }),
  parse: (text, _t, ctx) => {
    const s = clean(text);
    if (!s) return { estrutura: { escolhido: '', texto: '' }, bruto: false };
    const m = matchOption(s, ctx.pilares || []);
    if (m) return { estrutura: { escolhido: m, texto: '' }, bruto: false };
    return { estrutura: { escolhido: '', texto: s }, bruto: false };
  },
  render: (e) => clean(e.escolhido) || clean(e.texto),
};

/**
 * escada: `{ alta: {nome, valor, muda}, media: {…}, entrada: {…}, condicao, obs }`.
 * valor = "Mais alta: nome · R$ valor · o que muda" (3 niveis) + "Condição de entrada: …" + obs.
 */
const NIVEIS = ['alta', 'media', 'entrada'] as const;
export const NIVEL_LABEL: Record<string, string> = { alta: 'Mais alta', media: 'Intermediária', entrada: 'Entrada' };
function nivelVazio() { return { nome: '', valor: '', muda: '' }; }
function parseNivel(value: string) {
  const cells = splitCells(value).filter(Boolean);
  let valor = '';
  const resto: string[] = [];
  for (const c of cells) {
    const m = extractMoeda(c);
    if (m.valor && !valor) { valor = m.valor; if (m.resto) resto.push(m.resto); } else resto.push(c);
  }
  return { nome: resto[0] || '', valor, muda: resto.slice(1).join(', ') };
}
const escada: EstruturaSpec = {
  vazio: () => ({ alta: nivelVazio(), media: nivelVazio(), entrada: nivelVazio(), condicao: '', obs: '' }),
  parse: (text) => {
    const e: Estrutura = escada.vazio({}, {});
    const ls = splitLines(text);
    if (!ls.length) return { estrutura: e, bruto: false };
    const { found, rest, any } = findLabeled(ls, {
      condicao: ['condicao de entrada', 'condição de entrada', 'condicao', 'condição'],
      alta: ['mais alta', 'alta', 'opcao 1', 'opção 1', 'premium', 'completa'],
      media: ['intermediaria', 'intermediária', 'media', 'média', 'opcao 2', 'opção 2'],
      entrada: ['entrada', 'mais baixa', 'baixa', 'opcao 3', 'opção 3', 'basica', 'básica'],
    });
    for (const n of NIVEIS) if (found[n]) e[n] = parseNivel(found[n]);
    e.condicao = found.condicao || '';
    const obs: string[] = [];
    let next = 0;
    for (const line of rest.map(stripBullet)) {
      if (MOEDA_RE.test(line) && next < NIVEIS.length) {
        const slot = NIVEIS.slice(next).find((n) => !e[n].nome && !e[n].valor);
        if (slot) { e[slot] = parseNivel(line); next = NIVEIS.indexOf(slot) + 1; continue; }
      }
      obs.push(line);
    }
    e.obs = obs.join('\n');
    const filled = NIVEIS.some((n) => e[n].nome || e[n].valor);
    return { estrutura: e, bruto: !any && !filled && !!e.obs };
  },
  render: (e) => lines(
    ...NIVEIS.map((n) => {
      const nv = e[n] || {};
      const cells = [cell(nv.nome), clean(nv.valor) && `R$ ${clean(nv.valor)}`, cell(nv.muda)].filter(Boolean);
      return cells.length ? `${NIVEL_LABEL[n]}: ${cells.join(' · ')}` : false;
    }),
    pair('Condição de entrada', cell(e.condicao)),
    e.obs,
  ),
};

/**
 * checklist_condicoes: `{ avista:{ativo,desconto}, parcelado:{ativo,vezes}, contrato:{ativo,meses},
 * contrapartida:{ativo,texto}, garantia:{ativo,texto}, obs }`.
 * valor = "À vista: …", "Parcelado: 12x", "Contrato: 6 meses", "Contrapartida para desconto: …", "Garantia: …" + obs.
 */
const checklist_condicoes: EstruturaSpec = {
  vazio: () => ({
    avista: { ativo: false, desconto: '' }, parcelado: { ativo: false, vezes: '' }, contrato: { ativo: false, meses: '' },
    contrapartida: { ativo: false, texto: '' }, garantia: { ativo: false, texto: '' }, obs: '',
  }),
  parse: (text) => {
    const e: Estrutura = checklist_condicoes.vazio({}, {});
    const ls = splitLines(text);
    if (!ls.length) return { estrutura: e, bruto: false };
    const { found, rest, any } = findLabeled(ls, {
      avista: ['a vista', 'à vista', 'avista'],
      parcelado: ['parcelado', 'parcelamento', 'parcelas'],
      contrato: ['contrato', 'tempo de contrato'],
      contrapartida: ['contrapartida para desconto', 'contrapartida', 'em troca de desconto', 'em troca'],
      garantia: ['garantia'],
    });
    const detail = (v: string) => (norm(v) === 'sim' ? '' : v.trim());
    if (found.avista !== undefined) e.avista = { ativo: true, desconto: detail(found.avista) };
    if (found.parcelado !== undefined) e.parcelado = { ativo: true, vezes: (found.parcelado.match(/(\d+)/) || [])[1] || '' };
    if (found.contrato !== undefined) e.contrato = { ativo: true, meses: (found.contrato.match(/(\d+)/) || [])[1] || '' };
    if (found.contrapartida !== undefined) e.contrapartida = { ativo: true, texto: detail(found.contrapartida) };
    if (found.garantia !== undefined) e.garantia = { ativo: true, texto: detail(found.garantia) };
    let matched = any;
    const obs: string[] = [];
    for (const line of rest) {
      const n = norm(line);
      let hit = false;
      const x = n.match(/(\d+)\s*x\b/); if (x) { e.parcelado = { ativo: true, vezes: x[1] }; hit = true; }
      const m = n.match(/(\d+)\s*(?:meses|mes)\b/); if (m) { e.contrato = { ativo: true, meses: m[1] }; hit = true; }
      if (/\ba vista\b/.test(n)) { const p = line.match(/(\d+\s*%)/); e.avista = { ativo: true, desconto: p ? `${p[1]} de desconto` : e.avista.desconto }; hit = true; }
      if (/garantia/.test(n)) { e.garantia = { ativo: true, texto: line }; hit = true; }
      if (/contrapartida|em troca/.test(n)) { e.contrapartida = { ativo: true, texto: line }; hit = true; }
      if (hit) matched = true; else obs.push(line);
    }
    e.obs = obs.join('\n');
    return { estrutura: e, bruto: !matched && !!e.obs };
  },
  render: (e) => {
    const on = (k: string) => !!e?.[k]?.ativo;
    const sim = (v: any) => cell(v) || 'sim';
    return lines(
      on('avista') && `À vista: ${sim(e.avista.desconto)}`,
      on('parcelado') && `Parcelado: ${clean(e.parcelado.vezes) ? `${clean(e.parcelado.vezes)}x` : 'sim'}`,
      on('contrato') && `Contrato: ${clean(e.contrato.meses) ? `${clean(e.contrato.meses)} meses` : 'sim'}`,
      on('contrapartida') && `Contrapartida para desconto: ${sim(e.contrapartida.texto)}`,
      on('garantia') && `Garantia: ${sim(e.garantia.texto)}`,
      e.obs,
    );
  },
};

/**
 * dois_numeros: template.campos = [{ key, label, tipo: 'moeda'|'num'|'prazo', palavras?[], aliases?[] }].
 * estrutura `{ [key]: valor, obs }`. valor = "Label: R$ x · Label: y" numa linha + obs.
 */
const dois_numeros: EstruturaSpec = {
  vazio: (t) => Object.fromEntries([...(Array.isArray(t.campos) ? t.campos : []).map((c: any) => [c.key, '']), ['obs', '']]),
  parse: (text, t) => {
    const campos: any[] = Array.isArray(t.campos) ? t.campos : [];
    const e: Estrutura = dois_numeros.vazio(t, {});
    const s = clean(text);
    if (!s) return { estrutura: e, bruto: false };
    const parts = s.split(/\n|\s+[·|]\s+|\s*;\s*/).map((p) => p.trim()).filter(Boolean);
    const labels: Labels = Object.fromEntries(campos.map((c) => [c.key, [c.label, ...(c.aliases || [])]]));
    const { found, rest, any } = findLabeled(parts, labels);
    let matched = any;
    for (const c of campos) if (found[c.key] !== undefined) e[c.key] = c.tipo === 'moeda' ? extractMoeda(found[c.key]).valor || found[c.key] : found[c.key];
    const moedas = rest.flatMap((p) => Array.from(p.matchAll(new RegExp(MOEDA_RE.source, 'gi'))).map((m) => m[1]));
    for (const c of campos) {
      if (e[c.key]) continue;
      if (c.tipo === 'moeda' && moedas.length) { e[c.key] = moedas.shift(); matched = true; continue; }
      if (c.tipo === 'num') {
        const words = (c.palavras || [c.label]).map((w: string) => escapeRe(norm(w))).join('|');
        for (const p of rest) { const m = norm(p).match(new RegExp(`(\\d+)\\s*(?:${words})`)); if (m) { e[c.key] = m[1]; matched = true; break; } }
      }
      if (c.tipo === 'prazo') {
        for (const p of rest) { const m = p.match(/(\d+\s*(?:meses|mês|mes|semanas?|dias?|anos?))/i); if (m) { e[c.key] = m[1]; matched = true; break; } }
      }
    }
    const leftovers: string[] = [];
    for (const p of rest) {
      const n = norm(p);
      const consumed = campos.some((c) => e[c.key] && n.includes(norm(String(e[c.key]))));
      if (!consumed) leftovers.push(p);
    }
    e.obs = leftovers.join('\n');
    return { estrutura: e, bruto: !matched && !!e.obs };
  },
  render: (e, t) => {
    const campos: any[] = Array.isArray(t.campos) ? t.campos : [];
    const parts = campos.map((c) => {
      const v = cell(str(e[c.key]));
      if (!v) return '';
      return `${c.label}: ${c.tipo === 'moeda' && !/R\$/i.test(v) ? `R$ ${v}` : v}`;
    }).filter(Boolean);
    return lines(parts.join(' · '), e.obs);
  },
};

/**
 * dois_campos / dois_textos: template.campos = [{ key, label, aliases?[] }]; template.dividir = 'dois_pontos'.
 * estrutura `{ [key]: texto }`. valor = "Label: texto" por campo (texto multilinha continua nas linhas seguintes).
 */
const campos_rotulados: EstruturaSpec = {
  vazio: (t) => Object.fromEntries((Array.isArray(t.campos) ? t.campos : []).map((c: any) => [c.key, ''])),
  parse: (text, t) => {
    const campos: any[] = Array.isArray(t.campos) ? t.campos : [];
    const e: Estrutura = campos_rotulados.vazio(t, {});
    const ls = splitLines(text);
    if (!ls.length || campos.length < 2) return { estrutura: e, bruto: false };
    const labels: Labels = Object.fromEntries(campos.map((c) => [c.key, [c.label, ...(c.aliases || [])]]));
    const { found, any } = findLabeled(ls, labels, true);
    const [a, b] = campos;
    if (any) { for (const c of campos) e[c.key] = found[c.key] || ''; return { estrutura: e, bruto: false }; }
    if (ls.length >= 2) { e[a.key] = ls[0]; e[b.key] = ls.slice(1).join('\n'); return { estrutura: e, bruto: false }; }
    const one = ls[0];
    const cells = splitCells(one).filter(Boolean);
    if (cells.length >= 2) { e[a.key] = cells[0]; e[b.key] = cells.slice(1).join(', '); return { estrutura: e, bruto: false }; }
    if (t.dividir === 'dois_pontos' && one.indexOf(':') > 0) {
      const i = one.indexOf(':');
      e[a.key] = one.slice(0, i).trim(); e[b.key] = one.slice(i + 1).trim();
      return { estrutura: e, bruto: false };
    }
    e[a.key] = one;
    return { estrutura: e, bruto: true };
  },
  render: (e, t) => lines(...(Array.isArray(t.campos) ? t.campos : []).map((c: any) => pair(c.label, clean(str(e[c.key])).replace(/:/g, ' ')))),
};

/** canal: `{ canal, duracao, reunioes, obs }`. valor = "Canal: Vídeo · Duração: 60 min · Reuniões: 2" + obs. */
export const CANAIS: { id: string; label: string }[] = [
  { id: 'presencial', label: 'Presencial' },
  { id: 'video', label: 'Vídeo' },
  { id: 'ligacao', label: 'Ligação' },
  { id: 'misto', label: 'Misto' },
];
function detectCanal(n: string): string {
  if (!n) return '';
  if (/misto|mistura|combina/.test(n)) return 'misto';
  const hits = [/presencial/.test(n), /video|zoom|meet|online|chamada de video/.test(n), /ligacao|telefone|\bcall\b|chamada de voz/.test(n)];
  if (hits.filter(Boolean).length > 1) return 'misto';
  if (hits[0]) return 'presencial';
  if (hits[1]) return 'video';
  if (hits[2]) return 'ligacao';
  return '';
}
const canal: EstruturaSpec = {
  vazio: () => ({ canal: '', duracao: '', reunioes: '', obs: '' }),
  parse: (text) => {
    const e = { canal: '', duracao: '', reunioes: '', obs: '' };
    const s = clean(text);
    if (!s) return { estrutura: e, bruto: false };
    const parts = s.split(/\n|\s+[·|]\s+|\s*;\s*/).map((p) => p.trim()).filter(Boolean);
    const { found, rest, any } = findLabeled(parts, { canal: ['canal', 'formato'], duracao: ['duracao', 'duração', 'dura'], reunioes: ['reunioes', 'reuniões', 'encontros', 'numero de reunioes', 'nº de reuniões'] });
    const n = norm(s);
    e.canal = detectCanal(norm(found.canal || '')) || detectCanal(n);
    const dur = norm(found.duracao || s);
    const min = dur.match(/(\d+)\s*(?:min|minutos)/);
    const h = dur.match(/(\d+(?:[.,]\d)?)\s*h(?:ora)?s?\b/);
    e.duracao = min ? min[1] : h ? String(Math.round(parseFloat(h[1].replace(',', '.')) * 60)) : '';
    const reu = norm(found.reunioes || s).match(/(\d+)\s*(?:reuni|encontro|conversa|sess)/);
    e.reunioes = reu ? reu[1] : /\b(uma|1) (reuniao|conversa|sessao|encontro)\b/.test(n) ? '1' : found.reunioes ? (found.reunioes.match(/\d+/) || [''])[0] : '';
    const matched = !!(e.canal || e.duracao || e.reunioes);
    e.obs = any ? rest.join('\n') : matched ? '' : s;
    return { estrutura: e, bruto: !matched && !!e.obs };
  },
  render: (e) => {
    const c = CANAIS.find((x) => x.id === e.canal);
    return lines([c && `Canal: ${c.label}`, clean(e.duracao) && `Duração: ${clean(e.duracao)} min`, clean(e.reunioes) && `Reuniões: ${clean(e.reunioes)}`].filter(Boolean).join(' · '), e.obs);
  },
};

/**
 * casos: `{ casos: [{ nome, antes, depois, citar: 'sim'|'nao'|'' }] }`.
 * valor = blocos "Nome: … / Antes: … / Depois: … / Pode citar: sim" separados por linha em branco.
 */
const CASO_LABELS: Labels = {
  nome: ['nome', 'perfil', 'nome ou perfil', 'quem'],
  antes: ['antes'],
  depois: ['depois'],
  citar: ['pode citar', 'citar', 'pode citar?', 'autorizado'],
};
function casoVazio() { return { nome: '', antes: '', depois: '', citar: '' }; }
function normCitar(v: string): string {
  const n = norm(v);
  if (!n) return '';
  return /^(sim|s|yes|pode|ok|autoriz)/.test(n) ? 'sim' : 'nao';
}
const casos: EstruturaSpec = {
  vazio: () => ({ casos: [] }),
  parse: (text) => {
    const blocks = str(text).replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const out: any[] = [];
    let anyLabel = false;
    for (const block of blocks) {
      const ls = splitLines(block);
      let cur: any = null;
      for (const line of ls) {
        const { found, any } = findLabeled([line], CASO_LABELS);
        if (any) {
          anyLabel = true;
          const key = Object.keys(found)[0];
          if (!cur || (key === 'nome' && cur.nome)) { if (cur) out.push(cur); cur = casoVazio(); }
          cur[key] = key === 'citar' ? normCitar(found[key]) : found[key];
          continue;
        }
        const cells = splitCells(stripBullet(line)).filter(Boolean);
        if (!cells.length) continue;
        const c = casoVazio();
        c.nome = cells[0] || '';
        c.antes = cells[1] || '';
        c.depois = cells[2] || '';
        c.citar = cells[3] ? normCitar(cells[3]) : '';
        if (cur) out.push(cur);
        cur = c;
      }
      if (cur) out.push(cur);
    }
    return { estrutura: { casos: out }, bruto: !anyLabel && out.length > 0 };
  },
  render: (e) => (Array.isArray(e.casos) ? e.casos : [])
    .map((c: any) => lines(pair('Nome', cell(str(c?.nome))), pair('Antes', cell(str(c?.antes))), pair('Depois', cell(str(c?.depois))), c?.citar ? `Pode citar: ${c.citar === 'sim' ? 'sim' : 'não'}` : false))
    .filter(Boolean).join('\n\n'),
};

/**
 * quem_vende: quem conduz a reunião de venda (define a VOZ do script: o mentor vende = 1ª pessoa;
 * closer, consultor ou sócio vende = a história do mentor em 3ª pessoa) + de onde vem o lead.
 * estrutura `{ quem: 'mentor'|'closer'|'socio'|'outro'|'', nome, origem_lead }`.
 * valor = "Quem conduz: <opção>[ (<nome>)] / Lead: <texto>".
 */
export const QUEM_VENDE: { id: string; label: string }[] = [
  { id: 'mentor', label: 'Eu mesmo(a)' },
  { id: 'closer', label: 'Um closer ou consultor do meu time' },
  { id: 'socio', label: 'Meu sócio ou sócia' },
  { id: 'outro', label: 'Outro' },
];
const LEAD_RE = /\b(leads?|indica\w*|instagram|anunci\w*|trafego|eventos?|palestras?|site|whatsapp|linkedin|youtube|parceir\w*|prospec\w*|networking|conteudo|lista|indicacoes)\b|\bvem de\b|\bvem por\b|\bchega por\b|\bchegam por\b|\bvia\b/;
const NOME_RE = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}'-]+(?:\s+[\p{L}'-]+){0,3}$/u;
const STOP_NOME = new Set(['eu', 'mesma', 'mesmo', 'propria', 'proprio', 'mentor', 'mentora', 'closer', 'sdr', 'consultor', 'consultora', 'vendedor', 'vendedora', 'socio', 'socia', 'time', 'equipe', 'um', 'uma', 'meu', 'minha', 'nosso', 'nossa', 'quem', 'conduz', 'vende', 'reuniao', 'conversa', 'venda', 'com', 'apoio', 'do', 'da', 'de', 'o', 'a', 'os', 'as', 'e', 'ou', 'voce', 'comercial', 'fundador', 'fundadora', 'sim', 'nao', 'depende']);

/** Quem conduz, pelo texto normalizado: eu / próprio / mentor -> mentor; closer, SDR, consultor, time -> closer; sócio -> socio. */
function detectQuem(n: string): string {
  if (!n) return '';
  if (/^eu\b|\beu mesm[oa]\b|\bpropri[oa]\b|\bmentor[a]?\b|\bfundador[a]?\b|\bvoce\b/.test(n)) return 'mentor';
  if (/\b(closers?|sdrs?|consultor(?:a|es|as)?|vendedor(?:a|es|as)?|comercial|time|equipe)\b/.test(n)) return 'closer';
  if (/\bsoci[oa]s?\b/.test(n)) return 'socio';
  return '';
}

/** Primeiro nome próprio no texto ("Eu mesma, Paloma" -> "Paloma"; "closer Pedro" -> "Pedro"). */
function nomeNoTexto(t: string): string {
  const tokens = t.split(/[\s,:;()]+/).filter(Boolean);
  const out: string[] = [];
  for (const w of tokens) {
    const ok = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}'-]{1,}$/u.test(w) && !STOP_NOME.has(norm(w));
    if (ok) out.push(w);
    else if (out.length) break;
    if (out.length >= 3) break;
  }
  return out.join(' ');
}

/** "Eu mesmo(a) (Paloma)" -> { quem: 'mentor', nome: 'Paloma' }; texto livre -> heurística por palavras; só um nome próprio -> o mentor. */
function lerQuem(texto: string): { quem: string; nome: string } {
  const t = clean(texto);
  if (!t) return { quem: '', nome: '' };
  const n = norm(t);
  for (const q of QUEM_VENDE) {
    const ln = norm(q.label);
    if (n === ln || n.startsWith(`${ln} `) || n.startsWith(`${ln}(`) || n.startsWith(`${ln},`)) {
      const resto = t.slice(q.label.length).trim().replace(/^[,:-]\s*/, '');
      const m = resto.match(/^\((.+)\)$/);
      return { quem: q.id, nome: m ? m[1].trim() : resto };
    }
  }
  const par = t.match(/\(([^)]+)\)\s*$/);
  const nomeDoParentese = par ? par[1].trim() : '';
  const semPar = par ? t.replace(par[0], '').trim() : t;
  const quem = detectQuem(norm(semPar));
  if (quem) return { quem, nome: nomeDoParentese || nomeNoTexto(semPar) };
  if (NOME_RE.test(semPar) && !STOP_NOME.has(norm(semPar.split(/\s+/)[0]))) return { quem: 'mentor', nome: semPar };
  return { quem: '', nome: nomeDoParentese };
}

/** "os leads vêm de indicação." -> "indicação". */
function limparLead(t: string): string {
  return clean(t)
    .replace(/^(?:o|os|a|as)?\s*leads?\s+(?:vem|vêm|chega|chegam|surge|surgem|entra|entram|aparece|aparecem)\s+(?:principalmente\s+)?(?:de|por|via|do|da|dos|das|pelo|pela|pelos|pelas)\s+/i, '')
    .replace(/^(?:o|os)?\s*leads?\s*:\s*/i, '')
    .replace(/^(?:por|via|de)\s+/i, '')
    .replace(/[.]+$/, '')
    .trim();
}

const quem_vende: EstruturaSpec = {
  vazio: () => ({ quem: '', nome: '', origem_lead: '' }),
  parse: (text) => {
    const e = { quem: '', nome: '', origem_lead: '' };
    const s = clean(text);
    if (!s) return { estrutura: e, bruto: false };
    const parts = s.split(/\n|\s+\/\s+|\s+[·|]\s+|\s*;\s*/).map((p) => p.trim()).filter(Boolean);
    const { found, rest, any } = findLabeled(parts, {
      quem: ['quem conduz', 'conduz', 'quem vende', 'quem', 'vendedor', 'quem fala', 'quem conduz a reuniao', 'quem conduz a reunião'],
      nome: ['nome', 'nome de quem vende'],
      origem_lead: ['lead', 'leads', 'de onde vem o lead', 'origem do lead', 'origem', 'de onde vem', 'como o lead chega', 'canal do lead'],
    });
    if (any) {
      const q = lerQuem(found.quem || '');
      e.quem = q.quem;
      e.nome = clean(found.nome) || q.nome;
      e.origem_lead = limparLead(found.origem_lead || rest.find((r) => LEAD_RE.test(norm(r))) || '');
      return { estrutura: e, bruto: false };
    }
    // Texto corrido: a parte que fala do lead vira a origem; o resto diz quem conduz
    const frases = s
      .split(/(?<=[.!?])\s+|\s+[·|]\s+|\s*;\s*|\n/)
      .flatMap((f) => f.split(/\s+e\s+(?=(?:o|os)?\s*leads?\b)|,\s*(?=(?:o|os)?\s*leads?\b)/i))
      .map((f) => f.trim()).filter(Boolean);
    const deLead = frases.filter((f) => LEAD_RE.test(norm(f)));
    const deQuem = frases.filter((f) => !deLead.includes(f));
    const q = lerQuem(deQuem.join(' '));
    e.quem = q.quem;
    e.nome = q.nome;
    e.origem_lead = limparLead(deLead.join(' '));
    if (!e.quem && !e.origem_lead) { e.origem_lead = s; return { estrutura: e, bruto: true }; }
    return { estrutura: e, bruto: !e.quem };
  },
  render: (e) => {
    const q = QUEM_VENDE.find((x) => x.id === e.quem);
    const nome = cell(e.nome).replace(/\s+\/\s+/g, ', ').replace(/[()]/g, '').trim();
    const lead = cell(e.origem_lead).replace(/\s+\/\s+/g, ', ').trim();
    const conduz = q ? `${q.label}${nome ? ` (${nome})` : ''}` : nome;
    return [conduz && `Quem conduz: ${conduz}`, lead && `Lead: ${lead}`].filter(Boolean).join(' / ');
  },
  valido: (e) => !!QUEM_VENDE.find((x) => x.id === e.quem),
};

// ── registro ─────────────────────────────────────────────────────────────────

export const ESTRUTURA: Record<WidgetType, EstruturaSpec> = {
  escolha,
  meta,
  frase,
  texto,
  antes_depois: texto,
  historia_podio,
  vs,
  icp,
  chips_texto,
  citacoes,
  lista_numerada,
  tabela,
  pilares,
  escolha_de_lista,
  escada,
  checklist_condicoes,
  dois_numeros,
  dois_campos: campos_rotulados,
  dois_textos: campos_rotulados,
  canal,
  casos,
  lacunas,
  // baralho de objecoes: mesma estrutura e mesmo valor da tabela (linhas objecao · resposta)
  baralho: tabela,
  quem_vende,
  // metáforas (onda 2 e 3) sobre a estrutura do widget base
  prateleira: tabela,
  chave_fechadura: tabela,
  retorno: dois_numeros,
  radar: chips_texto,
  dois_caminhos: campos_rotulados,
  capa_livro: campos_rotulados,
};

export function isWidgetType(w: any): w is WidgetType {
  return typeof w === 'string' && Object.prototype.hasOwnProperty.call(ESTRUTURA, w);
}

export function parseEstrutura(w: WidgetType, text: string, t: WidgetTemplate = {}, ctx: ParseContext = {}): ParseResult {
  return ESTRUTURA[w].parse(text || '', t || {}, ctx || {});
}

export function renderEstrutura(w: WidgetType, e: Estrutura | null | undefined, t: WidgetTemplate = {}): string {
  if (!e || typeof e !== 'object') return '';
  return ESTRUTURA[w].render(e, t || {}).trim();
}

export function vaziaEstrutura(w: WidgetType, t: WidgetTemplate = {}, ctx: ParseContext = {}): Estrutura {
  return ESTRUTURA[w].vazio(t || {}, ctx || {});
}
