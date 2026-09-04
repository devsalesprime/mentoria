/**
 * Ancora dos grifos no texto renderizado.
 *  - `capturarSelecao`: da selecao nativa tira o trecho literal (espacos colapsados), 40 caracteres antes e depois,
 *    a tela e o documento (atributos data-tela / data-documento do container) e o retangulo para posicionar o balao.
 *  - `localizarGrifo`: reancora procurando o trecho literal no texto da tela (indice de caracteres -> nos de texto);
 *    com mais de uma ocorrencia, escolhe a que mais bate com prefixo e sufixo.
 *  - `pintarGrifos`: pinta com a CSS Custom Highlight API (sem mexer no DOM do React); sem suporte, a lista continua
 *    funcionando e "ir para" rola ate o trecho.
 */
import type { DocumentoId } from '../script/telas';
import { GRIFO_TEXTO_MAX, GRIFO_TEXTO_MIN, type GrifoCor } from './types';

export const CONTEXTO_CHARS = 40;

export interface Captura {
  texto: string;
  prefixo: string;
  sufixo: string;
  tela: number;
  documento: DocumentoId;
  rect: { top: number; left: number; bottom: number; right: number; width: number; height: number };
  curto: boolean;
  longo: boolean;
  /** Copia do Range lido na hora da selecao: pinta o grifo pendente mesmo depois de a selecao nativa sumir. */
  range?: Range | null;
}

export function normalizarTexto(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

interface Posicao { node: Text; offset: number; }
export interface Indice { texto: string; mapa: Posicao[]; }

/** Texto da raiz com espacos colapsados e, para cada caractere, o no de texto e o offset de origem. */
export function criarIndice(root: Node): Indice {
  const chars: string[] = [];
  const mapa: Posicao[] = [];
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const data = node.data;
    for (let i = 0; i < data.length; i += 1) {
      const ch = data[i];
      if (/\s/.test(ch)) {
        if (chars.length && chars[chars.length - 1] !== ' ') { chars.push(' '); mapa.push({ node, offset: i }); }
      } else {
        chars.push(ch);
        mapa.push({ node, offset: i });
      }
    }
    node = walker.nextNode() as Text | null;
  }
  if (chars.length && chars[chars.length - 1] === ' ') { chars.pop(); mapa.pop(); }
  return { texto: chars.join(''), mapa };
}

function comumFim(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
  return n;
}
function comumInicio(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

/** Posicao (indice no texto normalizado) do melhor encontro do trecho; -1 quando nao existe. */
export function encontrarNoTexto(texto: string, alvo: string, prefixo = '', sufixo = ''): number {
  const t = normalizarTexto(alvo);
  if (!t) return -1;
  const ocorrencias: number[] = [];
  let i = texto.indexOf(t);
  while (i >= 0 && ocorrencias.length < 200) { ocorrencias.push(i); i = texto.indexOf(t, i + 1); }
  if (!ocorrencias.length) return -1;
  if (ocorrencias.length === 1 || (!prefixo && !sufixo)) return ocorrencias[0];
  const p = normalizarTexto(prefixo);
  const s = normalizarTexto(sufixo);
  let melhor = ocorrencias[0];
  let melhorNota = -1;
  for (const o of ocorrencias) {
    const antes = texto.slice(Math.max(0, o - CONTEXTO_CHARS), o);
    const depois = texto.slice(o + t.length, o + t.length + CONTEXTO_CHARS);
    const nota = comumFim(antes, p) + comumInicio(depois, s);
    if (nota > melhorNota) { melhorNota = nota; melhor = o; }
  }
  return melhor;
}

/** Range do trecho no DOM da raiz (via indice), ou null. */
export function localizarNoIndice(indice: Indice, g: { texto: string; prefixo?: string; sufixo?: string }): Range | null {
  const alvo = normalizarTexto(g.texto);
  const ini = encontrarNoTexto(indice.texto, alvo, g.prefixo, g.sufixo);
  if (ini < 0 || !alvo) return null;
  const a = indice.mapa[ini];
  const b = indice.mapa[ini + alvo.length - 1];
  if (!a || !b) return null;
  const doc = a.node.ownerDocument || document;
  const range = doc.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset + 1);
  return range;
}

export function localizarGrifo(root: HTMLElement, g: { texto: string; prefixo?: string; sufixo?: string }): Range | null {
  return localizarNoIndice(criarIndice(root), g);
}

function containerDe(range: Range): Element | null {
  const c = range.commonAncestorContainer;
  return c.nodeType === 1 ? (c as Element) : c.parentElement;
}

/**
 * Le a selecao nativa dentro da raiz do leitor. null quando nao ha selecao, esta recolhida ou fora da raiz.
 * `curto`/`longo` marcam trecho fora de 20..600 (o balao explica em vez de salvar).
 */
export function capturarSelecao(root: HTMLElement, sel: Selection | null): Captura | null {
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const texto = normalizarTexto(range.toString());
  if (!texto) return null;
  const el = containerDe(range);
  const telaEl = el ? el.closest<HTMLElement>('[data-tela]') : null;
  const tela = telaEl ? Number(telaEl.dataset.tela) : NaN;
  const documento = ((telaEl && telaEl.dataset.documento) || 'treinamento') as DocumentoId;
  if (!Number.isInteger(tela)) return null;
  const doc = root.ownerDocument || document;
  const antes = doc.createRange();
  antes.setStart(root, 0);
  antes.setEnd(range.startContainer, range.startOffset);
  const depois = doc.createRange();
  depois.setStart(range.endContainer, range.endOffset);
  depois.setEnd(root, root.childNodes.length);
  const prefixo = normalizarTexto(antes.toString()).slice(-CONTEXTO_CHARS);
  const sufixo = normalizarTexto(depois.toString()).slice(0, CONTEXTO_CHARS);
  const r = typeof range.getBoundingClientRect === 'function'
    ? range.getBoundingClientRect()
    : (el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 });
  return {
    texto,
    prefixo,
    sufixo,
    tela,
    documento: documento === 'campo' ? 'campo' : 'treinamento',
    rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height },
    curto: texto.length < GRIFO_TEXTO_MIN,
    longo: texto.length > GRIFO_TEXTO_MAX,
    range: typeof range.cloneRange === 'function' ? range.cloneRange() : range,
  };
}

const NOME_POR_COR: Record<GrifoCor, string> = {
  dourado: 'script-grifo-dourado',
  verde: 'script-grifo-verde',
  vermelho: 'script-grifo-vermelho',
};
const NOME_FOCO = 'script-grifo-foco';
/** Selecao capturada e ainda nao salva (o balao "Grifar" esta aberto): dourado suave ate salvar ou cancelar. */
export const NOME_PENDENTE = 'script-grifo-pendente';

type HighlightCtor = new (...ranges: Range[]) => unknown;
interface Registro { set(nome: string, h: unknown): void; delete(nome: string): void; }

function registro(): { H: HighlightCtor; reg: Registro } | null {
  const g = globalThis as unknown as { Highlight?: HighlightCtor; CSS?: { highlights?: Registro } };
  if (typeof g.Highlight === 'function' && g.CSS && g.CSS.highlights) return { H: g.Highlight, reg: g.CSS.highlights };
  return null;
}

export function suportaPintura(): boolean {
  return registro() !== null;
}

/** Pinta os grifos encontrados na raiz; devolve id -> Range dos encontrados. `foco` ganha a marca mais forte. */
export function pintarGrifos(root: HTMLElement, grifos: { id: string; cor: GrifoCor; texto: string; prefixo?: string; sufixo?: string }[], foco: string | null = null): Map<string, Range> {
  const indice = criarIndice(root);
  const encontrados = new Map<string, Range>();
  const porCor: Record<GrifoCor, Range[]> = { dourado: [], verde: [], vermelho: [] };
  for (const g of grifos) {
    const r = localizarNoIndice(indice, g);
    if (!r) continue;
    encontrados.set(g.id, r);
    porCor[g.cor].push(r);
  }
  const api = registro();
  if (api) {
    for (const cor of Object.keys(porCor) as GrifoCor[]) api.reg.set(NOME_POR_COR[cor], new api.H(...porCor[cor]));
    const f = foco ? encontrados.get(foco) : null;
    api.reg.set(NOME_FOCO, new api.H(...(f ? [f] : [])));
  }
  return encontrados;
}

export function limparPintura(): void {
  const api = registro();
  if (!api) return;
  for (const nome of Object.values(NOME_POR_COR)) api.reg.delete(nome);
  api.reg.delete(NOME_FOCO);
}

/**
 * Pinta o trecho capturado (balao aberto) com `script-grifo-pendente`; a pintura nao depende da selecao nativa, entao
 * o trecho continua marcado quando o toque no balao (ou o foco na nota) recolhe a selecao. `null` apaga.
 * Sem a Highlight API nao pinta nada (o balao continua funcionando).
 */
export function pintarPendente(range: Range | null): void {
  const api = registro();
  if (!api) return;
  if (!range || range.collapsed) { api.reg.delete(NOME_PENDENTE); return; }
  api.reg.set(NOME_PENDENTE, new api.H(range));
}

export function limparPendente(): void {
  const api = registro();
  if (!api) return;
  api.reg.delete(NOME_PENDENTE);
}

/** Rola ate o trecho (o elemento pai do inicio do Range). */
export function rolarParaRange(range: Range): void {
  const el = range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement;
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
