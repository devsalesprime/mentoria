/**
 * Prévia do script: a frase-modelo de cada campo ("No seu script": mentor em 1ª pessoa, cliente em 2ª)
 * e os passos rascunhados que cada bloco revela. Puro (sem React).
 *
 * O template `previa` vem do JSON do campo (data/script-ficha-fields.json). Sintaxe:
 *   "[caminho]"                valor da estrutura: a.b, lista.0, lista.length; "[valor]" = texto do campo
 *   "[lista|e]" / "[lista|ou]" lista unida em "a, b e c" / "a, b ou c"
 *   "[n|dia|dias]"             número com singular / plural
 *   "[@3.3.citacoes.0]"        caminho dentro de outro campo da ficha
 *   "{ trecho com [x] }"       trecho opcional: some inteiro se algum placeholder dele estiver vazio
 * Palavras logo antes do placeholder que já abrem o valor não se repetem ("Eu faço isso porque [frase]").
 * Template em objeto = uma frase por opção escolhida ("*" é o padrão).
 */
import type { ScriptBlockView, ScriptFieldView, ScriptProgresso } from '../../../data/script-ficha-fields';
import { SCRIPT_BLOCKS, SCRIPT_FIELD_BY_KEY } from '../../../data/script-ficha-fields';
import { CANAIS, QUEM_VENDE, norm, type Estrutura } from './estrutura';
import { buildContext, resolveWidget } from './index';
import { textoLimpo } from './vazio';

export type PreviaTemplate = string | Record<string, string>;

export interface ParteDaPrevia {
  tipo: 'texto' | 'valor' | 'lacuna';
  texto: string;
}

export interface PreviaResolvida {
  partes: ParteDaPrevia[];
  /** A frase inteira; lacunas viram "…". */
  texto: string;
  /** Nenhuma lacuna sobrou. */
  preenchida: boolean;
  /** Pelo menos um valor entrou na frase. */
  algum: boolean;
}

type CampoPrevia = Pick<ScriptFieldView, 'key'> & Partial<Pick<ScriptFieldView, 'previa' | 'widget' | 'template' | 'status' | 'estrutura' | 'valor' | 'valor_efetivo' | 'sugerido' | 'opcoes' | 'decidido'>>;

const MAX_VALOR = 180;

// ── tokens ───────────────────────────────────────────────────────────────────

type Token =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'ph'; caminho: string; mods: string[] }
  | { tipo: 'opcional'; tokens: Token[] };

const PH_RE = /\[(@?[\w.]+)((?:\|[^\]|]*)*)\]/g;

function tokenizar(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const abre = src.indexOf('{', i);
    if (abre < 0) { out.push(...tokensPlanos(src.slice(i))); break; }
    const fecha = src.indexOf('}', abre);
    if (fecha < 0) { out.push(...tokensPlanos(src.slice(i))); break; }
    if (abre > i) out.push(...tokensPlanos(src.slice(i, abre)));
    out.push({ tipo: 'opcional', tokens: tokensPlanos(src.slice(abre + 1, fecha)) });
    i = fecha + 1;
  }
  return out;
}

function tokensPlanos(src: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of src.matchAll(PH_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ tipo: 'texto', texto: src.slice(last, idx) });
    const mods = (m[2] || '').split('|').slice(1);
    out.push({ tipo: 'ph', caminho: m[1], mods });
    last = idx + m[0].length;
  }
  if (last < src.length) out.push({ tipo: 'texto', texto: src.slice(last) });
  return out;
}

// ── leitura de valores ───────────────────────────────────────────────────────

export type LeitorDeCaminho = (caminho: string) => unknown;

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : typeof v === 'number' ? String(v) : Array.isArray(v) ? v.map(str).filter(Boolean).join(', ') : typeof v === 'object' ? '' : String(v);
}

function juntar(itens: string[], palavra: string): string {
  const xs = itens.map((x) => x.trim()).filter(Boolean);
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} ${palavra} ${xs[xs.length - 1]}`;
}

function textoDoValor(raw: unknown, mods: string[]): string {
  if (mods.length >= 2) {
    const n = str(raw).trim();
    if (!n) return '';
    const num = Number(n.replace(',', '.'));
    if (Number.isFinite(num)) return `${n} ${num === 1 ? mods[0] : mods[1]}`;
    return `${n} ${mods[1]}`;
  }
  if (mods.length === 1 && Array.isArray(raw)) return juntar(raw.map(str), mods[0].trim() || 'e');
  if (Array.isArray(raw)) return raw.map(str).filter(Boolean).join(', ');
  const s = textoLimpo(str(raw)).replace(/\s*\n+\s*/g, '; ').replace(/\s+/g, ' ').trim();
  return s.length > MAX_VALOR ? `${s.slice(0, MAX_VALOR).trimEnd()}…` : s;
}

/** Lê "a.b", "lista.0", "lista.length" numa estrutura. */
export function lerCaminho(e: Estrutura | null | undefined, caminho: string): unknown {
  let cur: any = e;
  for (const seg of caminho.split('.')) {
    if (cur == null) return undefined;
    if (seg === 'length') return Array.isArray(cur) ? cur.length : typeof cur === 'string' ? cur.length : undefined;
    cur = cur[seg];
  }
  return cur;
}

/** Trecho de texto que antecede um placeholder e que o valor pode já repetir ("Eu faço isso porque"). */
function prefixoRepetido(texto: string, valor: string): string {
  const m = texto.match(/([\p{L}\d][\p{L}\d\s]*)\s*$/u);
  if (!m) return valor;
  const palavras = m[1].trim().split(/\s+/).filter(Boolean);
  const nv = norm(valor);
  for (let k = 0; k < palavras.length; k++) {
    const sufixo = palavras.slice(k);
    if (k > 0 && sufixo.length < 2) break;
    const cand = norm(sufixo.join(' '));
    if (cand && (nv === cand || nv.startsWith(`${cand} `))) return valor.slice(sufixo.join(' ').length).replace(/^[\s,:]+/, '');
  }
  return valor;
}

function resolverTokens(tokens: Token[], ler: LeitorDeCaminho, partes: ParteDaPrevia[]): { vazio: boolean; algum: boolean } {
  let vazio = false;
  let algum = false;
  let anterior = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.tipo === 'texto') {
      let texto = t.texto;
      const prev = partes[partes.length - 1];
      if (prev && prev.tipo === 'valor' && /[.!?]$/.test(prev.texto) && /^\./.test(texto)) texto = texto.slice(1);
      partes.push({ tipo: 'texto', texto });
      anterior = t.texto;
      continue;
    }
    if (t.tipo === 'opcional') {
      const sub: ParteDaPrevia[] = [];
      const r = resolverTokens(t.tokens, ler, sub);
      if (!r.vazio) { partes.push(...sub); algum = algum || r.algum; anterior = sub.length ? sub[sub.length - 1].texto : anterior; }
      continue;
    }
    let valor = textoDoValor(ler(t.caminho), t.mods);
    if (valor) valor = prefixoRepetido(anterior, valor);
    if (valor && /[^.]\.$/.test(valor) && i < tokens.length - 1) valor = valor.slice(0, -1);
    if (valor) { partes.push({ tipo: 'valor', texto: valor }); algum = true; }
    else { partes.push({ tipo: 'lacuna', texto: '' }); vazio = true; }
    anterior = '';
  }
  return { vazio, algum };
}

/** Resolve um template contra um leitor de caminhos. */
export function resolverPrevia(template: string, ler: LeitorDeCaminho): PreviaResolvida {
  const partes: ParteDaPrevia[] = [];
  const r = resolverTokens(tokenizar(template), ler, partes);
  // junta textos vizinhos e limpa "R$ R$"
  const juntas: ParteDaPrevia[] = [];
  for (const p of partes) {
    const last = juntas[juntas.length - 1];
    if (last && last.tipo === 'texto' && p.tipo === 'texto') last.texto += p.texto;
    else juntas.push({ ...p });
  }
  for (const p of juntas) if (p.tipo === 'texto') p.texto = p.texto.replace(/\s{2,}/g, ' ');
  for (let i = 0; i < juntas.length - 1; i++) {
    if (juntas[i].tipo === 'texto' && /R\$\s*$/.test(juntas[i].texto) && juntas[i + 1].tipo === 'valor') juntas[i + 1].texto = juntas[i + 1].texto.replace(/^R\$\s*/i, '');
  }
  const texto = juntas.map((p) => (p.tipo === 'lacuna' ? '…' : p.texto)).join('').replace(/\s{2,}/g, ' ').trim();
  return { partes: juntas, texto, preenchida: !r.vazio, algum: r.algum };
}

// ── por campo ────────────────────────────────────────────────────────────────

/** Texto que vale hoje para um campo (efetivo > valor > sugerido). */
function textoAtual(c?: CampoPrevia | null): string {
  if (!c) return '';
  return c.valor_efetivo || c.valor || c.sugerido || '';
}

/** Template de prévia do campo: vem do GET ou, na falta, do JSON local. Objeto = por opção escolhida. */
export function templateDaPrevia(campo: CampoPrevia, est: Estrutura | null | undefined, texto: string): string {
  const t: PreviaTemplate | undefined = (campo.previa as PreviaTemplate | undefined) ?? (SCRIPT_FIELD_BY_KEY[campo.key]?.previa as PreviaTemplate | undefined);
  if (!t) return '';
  if (typeof t === 'string') return t;
  const escolha = str(est?.opcao || est?.escolhido || est?.quem || '').trim() || texto.trim();
  const hit = Object.keys(t).find((k) => k !== '*' && norm(k) === norm(escolha));
  return hit ? t[hit] : (t['*'] || '');
}

export interface OpcoesPrevia {
  /** Estrutura já em mãos (editor ao vivo). */
  estrutura?: Estrutura | null;
  /** Texto do campo em vez da estrutura (parse pelo widget). */
  texto?: string;
  /** 'sugerido' lê a sugestão; 'atual' o que vale hoje (padrão). Ignorado quando `texto` ou `estrutura` vêm. */
  modo?: 'sugerido' | 'atual';
  /** Todos os campos da ficha, para "[@3.3.citacoes.0]" e para o contexto de parse (pilares do 4.2). */
  contexto?: Record<string, ScriptFieldView>;
}

/** Estrutura do campo para a prévia: a salva (editado), ou o parse do texto pelo widget. */
export function estruturaParaPrevia(campo: CampoPrevia, opts: OpcoesPrevia = {}): { estrutura: Estrutura | null; texto: string } {
  const texto = opts.texto != null ? opts.texto : opts.modo === 'sugerido' ? (campo.sugerido || '') : textoAtual(campo);
  if (opts.estrutura) return { estrutura: opts.estrutura, texto: texto || '' };
  const w = resolveWidget({ widget: campo.widget, template: campo.template });
  if (!w) return { estrutura: null, texto };
  const base = SCRIPT_FIELD_BY_KEY[campo.key];
  const view = { ...(base || {}), ...campo, opcoes: campo.opcoes ?? base?.opcoes ?? null, alternativas: (campo as any).alternativas || [] } as unknown as ScriptFieldView;
  const ctx = buildContext(view, opts.contexto);
  if (opts.texto == null && opts.modo !== 'sugerido' && campo.status === 'editado' && campo.estrutura && typeof campo.estrutura === 'object' && !Array.isArray(campo.estrutura)) {
    return { estrutura: campo.estrutura, texto };
  }
  if (!textoLimpo(texto)) return { estrutura: w.vazio(ctx), texto: '' };
  return { estrutura: w.parse(texto, ctx).estrutura, texto };
}

function leitorDoCampo(campo: CampoPrevia, est: Estrutura | null, texto: string, contexto?: Record<string, ScriptFieldView>): LeitorDeCaminho {
  return (caminho) => {
    if (caminho.startsWith('@')) {
      const [key, ...resto] = caminho.slice(1).split('.');
      const outro = contexto?.[key];
      if (!outro) return undefined;
      const r = estruturaParaPrevia(outro, { contexto });
      return resto.length ? lerCaminho(r.estrutura, resto.join('.')) : textoLimpo(r.texto);
    }
    if (caminho === 'valor') return textoLimpo(texto);
    if (campo.widget === 'canal' && caminho === 'canal') {
      const id = str(est?.canal);
      return CANAIS.find((c) => c.id === id)?.label || '';
    }
    if (campo.widget === 'quem_vende' && caminho === 'quem') {
      const id = str(est?.quem);
      return QUEM_VENDE.find((q) => q.id === id)?.label || '';
    }
    return lerCaminho(est, caminho);
  };
}

/** A frase "No seu script" do campo com o valor atual; null quando o campo não tem template. */
export function previaDoCampo(campo: CampoPrevia, opts: OpcoesPrevia = {}): PreviaResolvida | null {
  const { estrutura, texto } = estruturaParaPrevia(campo, opts);
  const template = templateDaPrevia(campo, estrutura, texto);
  if (!template) return null;
  return resolverPrevia(template, leitorDoCampo(campo, estrutura, texto, opts.contexto));
}

// ── passos do script ─────────────────────────────────────────────────────────

export interface PassoScript {
  n: number;
  nome: string;
  /** Bloco que revela o passo ao fechar. */
  bloco: number;
  /** Campos, na ordem em que entram no rascunho. */
  campos: string[];
}

export const PASSOS_SCRIPT: PassoScript[] = [
  { n: 1, nome: 'Conexão', bloco: 2, campos: ['2.1', '2.5', '2.2', '2.3'] },
  { n: 2, nome: 'Investigação', bloco: 3, campos: ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', '3.9'] },
  { n: 3, nome: 'Apresentação', bloco: 4, campos: ['4.1', '4.2', '4.3', '4.4'] },
  { n: 4, nome: 'Objeções', bloco: 6, campos: ['6.3', '6.4'] },
  { n: 5, nome: 'Negociação', bloco: 5, campos: ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7'] },
  { n: 6, nome: 'Próximo passo', bloco: 6, campos: ['6.5', '6.7', '6.1'] },
  { n: 7, nome: 'Indicação', bloco: 6, campos: ['6.2', '2.4', '3.1'] },
];

/** A meta (bloco 1) não é passo: vai como linha no alto da prévia. */
export const META_SCRIPT = { bloco: 1, campos: ['1.1', '1.2'] };

export function passosDoBloco(bloco: number): PassoScript[] {
  return PASSOS_SCRIPT.filter((p) => p.bloco === bloco);
}

/** "O Passo 1 já tem a sua voz." · "Os Passos 4, 6 e 7 já têm a sua voz." · bloco 1: a meta. */
export function fraseDosPassos(bloco: number): string {
  if (bloco === META_SCRIPT.bloco) return 'A meta já está no alto do seu script.';
  const ns = passosDoBloco(bloco).map((p) => p.n);
  if (!ns.length) return '';
  if (ns.length === 1) return `O Passo ${ns[0]} já tem a sua voz.`;
  return `Os Passos ${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]} já têm a sua voz.`;
}

export interface LinhaDaPrevia {
  key: string;
  nome: string;
  previa: PreviaResolvida;
}

export interface OpcoesLinhas {
  /** Só campos decididos (padrão). false = usa também o sugerido. */
  soDecididos?: boolean;
  max?: number;
}

/** Linhas rascunhadas de um conjunto de campos (o passo, ou a meta). */
export function linhasDaPrevia(campos: string[], contexto: Record<string, ScriptFieldView>, opts: OpcoesLinhas = {}): LinhaDaPrevia[] {
  const { soDecididos = true, max = 5 } = opts;
  const out: LinhaDaPrevia[] = [];
  for (const key of campos) {
    const c = contexto[key];
    if (!c) continue;
    if (c.status === 'aceito_vazio') continue;
    if (soDecididos && !c.decidido) continue;
    const previa = previaDoCampo(c, { contexto, modo: soDecididos ? 'atual' : 'atual' });
    if (!previa || !previa.algum) continue;
    out.push({ key, nome: c.nome, previa });
    if (out.length >= max) break;
  }
  return out;
}

/** Quantas respostas obrigatórias faltam para o script. */
export function faltamParaScript(p: Pick<ScriptProgresso, 'obrigatorios' | 'obrigatorios_decididos'>): number {
  return Math.max(0, (p.obrigatorios || 0) - (p.obrigatorios_decididos || 0));
}

/** Fim da ficha com tudo decidido: o script v1 só nasce quando a ficha fecha. */
export const COPY_SCRIPT_PRONTO = 'Você decidiu tudo. Feche a ficha e a gente monta o script v1.';
/** Contador do cabeçalho em zero. */
export const COPY_TUDO_DECIDIDO = 'tudo decidido para o seu script';

/** "faltam 12 para o seu script" · "falta 1 para o seu script" · tudo decidido. */
export function textoFaltam(n: number): string {
  if (n <= 0) return COPY_TUDO_DECIDIDO;
  return n === 1 ? 'falta 1 para o seu script' : `faltam ${n} para o seu script`;
}

export interface CapituloScript extends PassoScript {
  revelado: boolean;
  blocoNome: string;
}

/** Os 7 capítulos com o estado de revelação (bloco fechado) para o mapa da prévia; o nome do bloco vem da ficha ou da definição. */
export function capitulosDoScript(blocos: ScriptBlockView[]): CapituloScript[] {
  return PASSOS_SCRIPT.map((p) => {
    const b = blocos.find((x) => x.numero === p.bloco);
    const def = SCRIPT_BLOCKS.find((x) => x.numero === p.bloco);
    return { ...p, revelado: !!b?.fechado, blocoNome: b?.nome || def?.nome || `Bloco ${p.bloco}` };
  });
}

// ── a prévia inteira (capítulos revelados × trancados) ───────────────────────

export interface CapituloComLinhas extends CapituloScript {
  /** Frases já rascunhadas (só campos decididos); vazio num capítulo trancado. */
  linhas: LinhaDaPrevia[];
}

export interface PreviaDoScript {
  /** A meta (bloco 1), no alto. */
  meta: LinhaDaPrevia[];
  capitulos: CapituloComLinhas[];
  revelados: number;
  total: number;
}

/** A prévia do script inteira: meta no alto, 7 capítulos; os trancados só mostram o nome e o bloco que os abre. */
export function previaDoScript(blocos: ScriptBlockView[], contexto: Record<string, ScriptFieldView>, max = 5): PreviaDoScript {
  const caps = capitulosDoScript(blocos).map((c) => ({ ...c, linhas: c.revelado ? linhasDaPrevia(c.campos, contexto, { max }) : [] }));
  return {
    meta: linhasDaPrevia(META_SCRIPT.campos, contexto, { max: 2 }),
    capitulos: caps,
    revelados: caps.filter((c) => c.revelado).length,
    total: caps.length,
  };
}

/** "abre com o bloco 3 · Mentorado" (capítulo trancado). */
export function textoTrancado(c: Pick<CapituloScript, 'bloco' | 'blocoNome'>): string {
  return `abre com o bloco ${c.bloco} · ${c.blocoNome}`;
}

/** "nenhum capítulo aberto ainda" · "1 de 7 capítulos aberto" · "3 de 7 capítulos abertos" · "os 7 capítulos abertos". */
export function textoCapitulos(revelados: number, total = PASSOS_SCRIPT.length): string {
  if (revelados <= 0) return 'nenhum capítulo aberto ainda';
  if (revelados >= total) return `os ${total} capítulos abertos`;
  return `${revelados} de ${total} capítulos ${revelados === 1 ? 'aberto' : 'abertos'}`;
}
