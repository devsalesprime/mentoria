/**
 * Parser do script dos 7 passos para a leitura no app.
 *
 * Entende os dois moldes que ja existem no banco:
 *  - v1 (um documento, "Como conduzir", marcas `[ficha X.Y]`, secao "Rastreabilidade dos numeros");
 *  - doutrina 03/09 (`# Documento 1 · Script completo para treinamento` + `# Documento 2 · Script de campo`,
 *    rotulos em negrito por passo, marcadores de voz `[FALA DO VENDEDOR]` / `[FALA DA MENTORA]`).
 *
 * Limpeza defensiva (`cleanScriptMarkdown`): tira marcas de fonte, "(fonte: ...)", "a definir", front matter,
 * blockquote editorial da abertura e a secao "Rastreabilidade dos numeros" de qualquer versao ja publicada.
 * A partir da doutrina, o runner nao escreve mais nada disso no corpo; a limpeza fica so como rede.
 */
import { markdownToPlainText, renderMarkdown } from '../../../utils/markdown';

export type BlocoTipo =
  | 'objetivo' | 'estado' | 'principio' | 'dizer' | 'perguntas' | 'observar' | 'avancar' | 'silencio'
  | 'objecoes' | 'erro' | 'sucesso' | 'transicao' | 'alerta' | 'proximo' | 'outro';

export interface Fala {
  kind: 'fala';
  /** Numero da fala como escrito no markdown; null para nota solta. */
  n: number | null;
  /** O que se diz (sem as aspas, sem o marcador de voz). */
  texto: string;
  /** Direcao ao redor da fala: quando usar, o que anotar, instrucoes entre colchetes. */
  direcao: string;
  voz: 'vendedor' | 'mentor' | null;
  /** Rotulo do marcador como veio (Vendedor, Mentora, Mentor, nome). */
  vozRotulo: string;
}
export interface SubBloco { kind: 'sub'; titulo: string; }
export type DizerNode = Fala | SubBloco;

export interface Bloco {
  tipo: BlocoTipo;
  rotulo: string;
  /** Texto corrido (blocos de uma linha: objetivo, erro a evitar, transicao...). */
  inline: string;
  /** Itens (perguntas, sinais, objecoes) ou linhas extras de um bloco curto. */
  itens: string[];
  /** Falas e sub-blocos (so em `dizer`). */
  dizer: DizerNode[];
  /** Markdown bruto do bloco (fallback e blocos `outro`). */
  md: string;
}

export interface PassoDoc { n: number; nome: string; titulo: string; blocos: Bloco[]; }
export interface SecaoExtra { titulo: string; slug: string; md: string; html: string; }
export interface Documento {
  /** d1 = treinamento, d2 = campo, d0 = script sem a divisao (v1). */
  id: string;
  titulo: string;
  /** Rotulo curto para o seletor: Treinamento | Campo | ''. */
  rotulo: string;
  passos: PassoDoc[];
  extras: SecaoExtra[];
}
export interface ScriptDoc {
  titulo: string;
  oferta: string;
  cabecalho: { rotulo: string; valor: string }[];
  comoUsar: string[];
  documentos: Documento[];
  mapa: SecaoExtra | null;
  cartao: { md: string; html: string; texto: string } | null;
  /** Conteudo da abertura que nao coube em nada acima (renderizado como markdown). */
  extras: SecaoExtra[];
}

/** Secao por "## " (compatibilidade com a primeira versao da tela). */
export interface Section { passo: number; titulo: string; md: string; html: string; }

const PASSO_RE = /^##\s+Passo\s+(\d)\b[^\n]*$/im;
const PASSO_TITULO_RE = /^Passo\s+(\d)\s*(?:[·:.\-]|·)?\s*(.*)$/i;
const DOC_RE = /^#\s+Documento\s+(\d)\b\s*(?:[·:\-]|·)?\s*(.*)$/i;
const LABEL_RE = /^\*\*([^*\n]{1,60}?)\*\*\s*:?\s*(.*)$/;
const ITEM_RE = /^\s*(\d+)[.)]\s+(.*)$/;
const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const H3_RE = /^###\s+(.+?)\s*#*\s*$/;
const H2_RE = /^##\s+(.+?)\s*$/;
const H1_RE = /^#\s+(.+?)\s*$/;
const FRONT_MATTER_RE = /^---\n[\s\S]*?\n---\n/;
const EDITORIAL_RE = /ficha|playbook|\bKB\b|gerad[oa]|travess|placeholder|valida(?:dor|cao|ção)/i;

const SINGLE_LINE = new Set<BlocoTipo>(['objetivo', 'estado', 'principio', 'avancar', 'silencio', 'erro', 'sucesso', 'transicao', 'alerta', 'proximo']);
const LISTA = new Set<BlocoTipo>(['perguntas', 'observar', 'objecoes']);

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'x';
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[:\s]+$/, '').trim();
}

/** Limpeza defensiva: nada de marca de fonte, nota editorial ou placeholder chega ao leitor. */
export function cleanScriptMarkdown(md: string): string {
  let t = (md || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  t = t.replace(FRONT_MATTER_RE, '');
  // secoes editoriais inteiras (ate o proximo heading de nivel 1 ou 2, ou o fim)
  t = t.replace(/^##\s*(?:Rastreabilidade|Adapta[cç][aã]o por perfil)[^\n]*\n[\s\S]*?(?=^#{1,2}\s|(?![\s\S]))/gim, '');
  // marcas de fonte e placeholders
  t = t.replace(/`?\[ficha[^\]]*\]`?/gi, '');
  t = t.replace(/\((?:fonte|ficha)\s*:?[^)]*\)/gi, '');
  t = t.replace(/\ba definir(?: com a gente(?: na mentoria)?)?\b/gi, '');
  // blockquote editorial da abertura (antes do primeiro passo ou documento)
  const lines = t.split('\n');
  const out: string[] = [];
  let dentro = false;
  for (const line of lines) {
    if (!dentro && (PASSO_RE.test(line) || DOC_RE.test(line))) dentro = true;
    if (!dentro && /^>/.test(line) && EDITORIAL_RE.test(line)) continue;
    out.push(line);
  }
  t = out.join('\n');
  // pontuacao orfa deixada pelas remocoes
  t = t.replace(/[ \t]+([.,;:!?])/g, '$1').replace(/:\s*\./g, '.').replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '');
  return t;
}

/** Divide o markdown por "## Passo N" (e outros "## "), mantendo o cabecalho dentro da secao. */
export function splitScript(md: string): Section[] {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n');
  const out: { passo: number; titulo: string; lines: string[] }[] = [];
  let cur: { passo: number; titulo: string; lines: string[] } = { passo: 0, titulo: 'Abertura', lines: [] };
  for (const line of lines) {
    const h2 = H2_RE.exec(line);
    if (h2 && !/^#/.test(h2[1])) {
      if (cur.lines.some((l) => l.trim())) out.push(cur);
      const m = PASSO_RE.exec(line);
      cur = { passo: m ? Number(m[1]) : 0, titulo: h2[1].replace(/#+$/, '').trim(), lines: [line] };
      continue;
    }
    cur.lines.push(line);
  }
  if (cur.lines.some((l) => l.trim())) out.push(cur);
  return out.map((s) => {
    const body = s.lines.join('\n').trim();
    return { passo: s.passo, titulo: s.titulo, md: body, html: renderMarkdown(body) };
  });
}

function tipoDoRotulo(rotulo: string): BlocoTipo {
  const n = norm(rotulo);
  if (n.startsWith('objetivo')) return 'objetivo';
  if (n.startsWith('estado')) return 'estado';
  if (n.startsWith('principio')) return 'principio';
  if (n.startsWith('fala') || n.startsWith('o que dizer') || n.startsWith('como conduzir')) return 'dizer';
  if (n.startsWith('pergunta')) return 'perguntas';
  if (n.startsWith('o que observar') || n.startsWith('observar') || n.startsWith('sinais')) return 'observar';
  if (n.startsWith('avancar')) return 'avancar';
  if (n.startsWith('silencio')) return 'silencio';
  if (n.startsWith('objec')) return 'objecoes';
  if (n.startsWith('erro')) return 'erro';
  if (n.startsWith('criterio')) return 'sucesso';
  if (n.startsWith('transic')) return 'transicao';
  if (n.startsWith('alerta')) return 'alerta';
  if (n.startsWith('proximo')) return 'proximo';
  return 'outro';
}

function stripMarker(line: string): string {
  const b = BULLET_RE.exec(line);
  if (b) return b[1].trim();
  const i = ITEM_RE.exec(line);
  if (i) return i[2].trim();
  return line.trim();
}

function collectItems(lines: string[], inline: string): string[] {
  const itens: string[] = [];
  if (inline.trim()) itens.push(inline.trim());
  for (const line of lines) {
    if (!line.trim()) continue;
    if (BULLET_RE.test(line) || ITEM_RE.test(line) || !itens.length) itens.push(stripMarker(line));
    else itens[itens.length - 1] += ' ' + line.trim();
  }
  return itens;
}

function parseFala(n: number | null, raw: string): Fala {
  let t = raw.trim();
  let voz: Fala['voz'] = null;
  let vozRotulo = '';
  const vozRe = /\[FALA D[AO] ([^\]]+)\]/i;
  const vm = vozRe.exec(t);
  if (vm) {
    voz = /^VENDEDOR/i.test(vm[1].trim()) ? 'vendedor' : 'mentor';
    const r = vm[1].trim().toLowerCase();
    vozRotulo = r.charAt(0).toUpperCase() + r.slice(1);
    t = t.replace(vozRe, '').replace(/["“]\s+/, '"').trim();
  }
  const abre = t.search(/["“]/);
  if (abre < 0) return { kind: 'fala', n, texto: t, direcao: '', voz, vozRotulo };
  const resto = t.slice(abre + 1);
  const fechaRel = Math.max(resto.lastIndexOf('"'), resto.lastIndexOf('”'));
  const texto = (fechaRel < 0 ? resto : resto.slice(0, fechaRel)).trim();
  const antes = t.slice(0, abre).trim();
  const depois = fechaRel < 0 ? '' : resto.slice(fechaRel + 1).trim();
  const direcao = [antes, depois].filter(Boolean).join(' ').replace(/^[\s:;,.\-]+|[\s:;,]+$/g, '').trim();
  return { kind: 'fala', n, texto, direcao, voz, vozRotulo };
}

function parseDizer(lines: string[], inline: string): DizerNode[] {
  const nodes: DizerNode[] = [];
  let cur: { n: number | null; raw: string } | null = null;
  const flush = () => { if (cur && cur.raw.trim()) nodes.push(parseFala(cur.n, cur.raw)); cur = null; };
  if (inline.trim()) cur = { n: null, raw: inline };
  for (const line of lines) {
    const h3 = H3_RE.exec(line);
    if (h3) { flush(); nodes.push({ kind: 'sub', titulo: h3[1].trim() }); continue; }
    const item = ITEM_RE.exec(line);
    if (item) { flush(); cur = { n: Number(item[1]), raw: item[2] }; continue; }
    const bullet = BULLET_RE.exec(line);
    if (bullet) { flush(); cur = { n: null, raw: bullet[1] }; continue; }
    if (!line.trim()) continue;
    if (cur) cur.raw += ' ' + line.trim();
    else cur = { n: null, raw: line.trim() };
  }
  flush();
  return nodes;
}

interface BlocoBruto { tipo: BlocoTipo; rotulo: string; inline: string; lines: string[]; }

function finalizaBloco(b: BlocoBruto): Bloco {
  const md = [b.inline, ...b.lines].filter((l) => l && l.trim()).join('\n').trim();
  const bloco: Bloco = { tipo: b.tipo, rotulo: b.rotulo, inline: '', itens: [], dizer: [], md };
  if (SINGLE_LINE.has(b.tipo)) {
    const marcados = b.lines.filter((l) => BULLET_RE.test(l) || ITEM_RE.test(l));
    if (marcados.length) {
      bloco.inline = b.inline.trim();
      bloco.itens = collectItems(b.lines, '');
    } else {
      bloco.inline = [b.inline, ...b.lines.map((l) => l.trim())].filter(Boolean).join(' ').trim();
    }
  } else if (LISTA.has(b.tipo)) {
    bloco.itens = collectItems(b.lines, b.inline);
  } else if (b.tipo === 'dizer') {
    bloco.dizer = parseDizer(b.lines, b.inline);
  }
  return bloco;
}

function parsePasso(titulo: string, bodyLines: string[]): PassoDoc {
  const m = PASSO_TITULO_RE.exec(titulo);
  const n = m ? Number(m[1]) : 0;
  const nome = (m ? m[2] : titulo).replace(/^[\s·:\-]+/, '').trim() || titulo;
  const brutos: BlocoBruto[] = [];
  const abre = (tipo: BlocoTipo, rotulo: string, inline: string): BlocoBruto => {
    const b: BlocoBruto = { tipo, rotulo, inline, lines: [] };
    brutos.push(b);
    return b;
  };
  let cur: BlocoBruto | undefined;
  for (const line of bodyLines) {
    const lm = LABEL_RE.exec(line);
    if (lm) { cur = abre(tipoDoRotulo(lm[1]), lm[1].replace(/:\s*$/, '').trim(), lm[2].trim()); continue; }
    if ((H3_RE.test(line) || ITEM_RE.test(line)) && (!cur || SINGLE_LINE.has(cur.tipo))) {
      cur = abre('dizer', 'O que dizer', '');
    }
    if (!cur) {
      if (!line.trim()) continue;
      cur = abre('outro', '', '');
    }
    cur.lines.push(line);
  }
  return { n, nome, titulo, blocos: brutos.map(finalizaBloco).filter((b) => b.md || b.inline) };
}

function secaoExtra(titulo: string, bodyLines: string[]): SecaoExtra {
  const md = bodyLines.join('\n').trim();
  return { titulo, slug: slugify(titulo), md, html: renderMarkdown(md) };
}

/** Cabecalho (titulo H1, linhas em negrito "**Rotulo:** valor") de um trecho antes do primeiro "## ". */
function parseCabecalho(lines: string[], doc: ScriptDoc): string[] {
  const sobra: string[] = [];
  for (const line of lines) {
    const h1 = H1_RE.exec(line);
    if (h1 && !DOC_RE.test(line)) {
      if (!doc.titulo) {
        doc.titulo = h1[1].trim();
        const partes = doc.titulo.split(/\s*[·•]\s*/);
        if (partes.length >= 3) doc.oferta = partes[partes.length - 1].trim();
      }
      continue;
    }
    const lm = LABEL_RE.exec(line);
    if (lm && lm[2].trim()) { doc.cabecalho.push({ rotulo: lm[1].replace(/:\s*$/, '').trim(), valor: lm[2].trim() }); continue; }
    sobra.push(line);
  }
  return sobra;
}

/** Separa por "## " dentro de um trecho; devolve o pre-secao e as secoes. */
function secoesDe(text: string): { pre: string[]; secoes: { titulo: string; lines: string[] }[] } {
  const pre: string[] = [];
  const secoes: { titulo: string; lines: string[] }[] = [];
  let cur: { titulo: string; lines: string[] } | null = null;
  for (const line of text.split('\n')) {
    const h2 = H2_RE.exec(line);
    if (h2 && !/^#/.test(h2[1])) { cur = { titulo: h2[1].replace(/#+$/, '').trim(), lines: [] }; secoes.push(cur); continue; }
    if (cur) cur.lines.push(line); else pre.push(line);
  }
  return { pre, secoes };
}

function rotuloDoc(n: string, titulo: string): string {
  if (n === '1' || /treinamento/i.test(titulo)) return 'Treinamento';
  if (n === '2' || /campo/i.test(titulo)) return 'Campo';
  return titulo;
}

export function parseScript(mdBruto: string): ScriptDoc {
  const md = cleanScriptMarkdown(mdBruto);
  const doc: ScriptDoc = { titulo: '', oferta: '', cabecalho: [], comoUsar: [], documentos: [], mapa: null, cartao: null, extras: [] };
  // 1. documentos
  const trechos: { id: string; titulo: string; lines: string[] }[] = [];
  let pre: string[] = [];
  let curDoc: { id: string; titulo: string; lines: string[] } | null = null;
  for (const line of md.split('\n')) {
    const dm = DOC_RE.exec(line);
    if (dm) { curDoc = { id: `d${dm[1]}`, titulo: line.replace(/^#\s+/, '').trim(), lines: [] }; trechos.push(curDoc); continue; }
    if (curDoc) curDoc.lines.push(line); else pre.push(line);
  }
  if (!trechos.length) { trechos.push({ id: 'd0', titulo: '', lines: pre }); pre = []; }
  // 2. abertura antes do primeiro documento
  const sobraPre = parseCabecalho(pre, doc);
  const preSecoes = secoesDe(sobraPre.join('\n'));
  if (preSecoes.pre.join('\n').trim()) doc.extras.push(secaoExtra('Abertura', preSecoes.pre));
  const secoesSoltas = preSecoes.secoes;
  // 3. cada documento
  for (const t of trechos) {
    const { pre: preDoc, secoes } = secoesDe(t.lines.join('\n'));
    const sobra = parseCabecalho(preDoc, doc);
    const d: Documento = { id: t.id, titulo: t.titulo, rotulo: t.id === 'd0' ? '' : rotuloDoc(t.id.slice(1), t.titulo), passos: [], extras: [] };
    if (sobra.join('\n').trim()) d.extras.push(secaoExtra('Abertura', sobra));
    for (const s of [...(t === trechos[0] ? secoesSoltas : []), ...secoes]) {
      const n = norm(s.titulo);
      if (PASSO_TITULO_RE.test(s.titulo)) { d.passos.push(parsePasso(s.titulo, s.lines)); continue; }
      if (n.startsWith('como usar')) { doc.comoUsar = collectItems(s.lines, ''); continue; }
      if (n.startsWith('mapa de prepara')) { doc.mapa = secaoExtra(s.titulo, s.lines); continue; }
      if (n.startsWith('cartao de bolso')) {
        const body = s.lines.join('\n').trim();
        doc.cartao = { md: body, html: renderMarkdown(body), texto: markdownToTexto(body) };
        continue;
      }
      d.extras.push(secaoExtra(s.titulo, s.lines));
    }
    doc.documentos.push(d);
  }
  return doc;
}

/** Texto simples a partir de markdown (para copiar o cartao de bolso). */
export const markdownToTexto = markdownToPlainText;

/** Texto de uma fala para copiar: a fala entre aspas e a direcao numa segunda linha. */
export function falaParaCopiar(f: Fala): string {
  return f.direcao ? `"${f.texto}"\n${f.direcao}` : f.texto;
}
