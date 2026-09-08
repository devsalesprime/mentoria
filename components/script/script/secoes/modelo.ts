import type { Bloco, Fala, GrupoLista, PassoDoc } from '../parseScript';
import { tituloDaFala } from '../parseScript';

/**
 * Onda E2 (SPEC-workflow-v3-decisoes-07-09 §2, itens 11, 13 e 14): cada rotulo do markdown vira uma secao
 * com template proprio no leitor. Este modulo NAO muda o texto gerado: so separa o que o passo trouxe em
 * objetos que os componentes de `secoes/` sabem desenhar. O que nao se encaixa em nenhum molde cai em
 * `outros` e continua sendo desenhado como antes.
 *
 * Onda F (SPEC-workflow-v4-decisoes-08-09 §2, itens 12 a 22):
 * - as falas de um passo tem dois modos: `sequencia` (encadeadas, ligadas por um trilho) e `grupos`
 *   (alternativas por tipo, o CNCS do Passo 2); a regra esta em `modoDasFalas`;
 * - "Perguntas recomendadas" sai da tela em todos os passos (`ehPerguntasRecomendadas`); a nota
 *   "Como usar estas perguntas" continua, dentro dos grupos;
 * - "Avancar ou voltar" e "Criterio de sucesso" viram um molde so, de duas colunas.
 */

/** Um tipo de pergunta (os quatro do CNCS no Passo 2) com as perguntas dele. */
export interface GrupoPerguntas {
  /** Titulo como veio no markdown ("C · Contexto"). */
  titulo: string;
  /** O que cabe num botao ("Contexto"). */
  curto: string;
  itens: string[];
  /** Cada item e uma fala inteira (grupo vindo das subsecoes das falas), nao uma pergunta solta. */
  deFalas: boolean;
}

/** O mesmo grupo, com as falas inteiras: e o que o modal do Passo 2 precisa (titulo, fala e anatomia). */
export interface GrupoFalas {
  titulo: string;
  curto: string;
  falas: Fala[];
}

export interface SecaoPerguntas {
  rotulo: string;
  /** Dois ou mais grupos viram botoes que abrem a lista daquele tipo. */
  grupos: GrupoPerguntas[];
  /** Perguntas fora de qualquer grupo: viram o cartao de checklist. */
  itens: string[];
  /** Nota "Como usar estas perguntas". */
  nota: string[];
}

/** "Avançar ou voltar" partido em duas colunas. */
export interface Decisao { avance: string; volte: string; }

export interface ObjecaoItem { objecao: string; resposta: string; }

/** Como as falas de um passo aparecem: encadeadas ou como alternativas por tipo. */
export type ModoFalas = 'sequencia' | 'grupos';

export interface PassoSecoesModelo {
  /** Objetivo estrategico, em uma linha, no cabecalho do passo. */
  objetivo: string;
  estado: string;
  principio: string;
  falas: Bloco | null;
  /** `sequencia` em todo passo, menos os tipos de pergunta do Passo 2. */
  modoFalas: ModoFalas;
  /** Os grupos de falas por tipo (Passo 2); vazio quando o modo e `sequencia`. */
  gruposFalas: GrupoFalas[];
  /** Nota "Como usar estas perguntas", que acompanha os grupos. */
  notaPerguntas: string[];
  /** So o que continua na tela: `**Perguntas:**` do Documento 2. "Perguntas recomendadas" nao e desenhado. */
  perguntas: SecaoPerguntas | null;
  /** A secao de perguntas como ela veio, mesmo quando nao e desenhada (a nota sai daqui). */
  perguntasBrutas: SecaoPerguntas | null;
  observar: Bloco | null;
  avancar: Bloco | null;
  decisao: Decisao | null;
  silencio: Bloco | null;
  objecoes: Bloco | null;
  objecoesItens: ObjecaoItem[];
  erro: Bloco | null;
  sucesso: Bloco | null;
  transicao: Bloco | null;
  alerta: Bloco | null;
  proximo: Bloco | null;
  /** Blocos sem molde: seguem no desenho antigo. */
  outros: Bloco[];
}

/**
 * O corte entre "quando avancar" e "quando voltar" e a primeira frase que fala em voltar. Os scripts
 * escrevem isso de varios jeitos ("Volte, e refaça...", "significa voltar", "continue aqui", "Sem isso"),
 * entao o gancho e uma lista de marcas, e o corte acontece no comeco da frase que traz a marca.
 */
const VOLTA_RE = /\b(volte|volta|voltar|voltando|continue aqui|continua aqui|permane[cç]a aqui|fique aqui|sem isso|refa[cç]a)\b/i;
const OBJECAO_RE = /^(?:obje[cç][aã]o\s*:?\s*)?(.*?)\s*(?:resposta\s*:\s*)(.*)$/i;
const COMO_USAR_RE = /^como usar/;
const PERGUNTAS_RECOMENDADAS_RE = /^perguntas recomendadas/;
const PREFIXO_GRUPO_RE = /^\s*[A-Za-z]\s*[·•\-:]\s*/;
const PARENTESE_FINAL_RE = /\s*\([^)]*\)\s*$/;

/** O passo em que os tipos de pergunta viram botoes: o CNCS da investigacao. */
export const PASSO_DOS_GRUPOS = 2;

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function semAspas(s: string): string {
  return (s || '').trim().replace(/^["“«]/, '').replace(/["”»]$/, '').trim();
}

/** Frases de um texto corrido, com a pontuacao que fecha cada uma. */
function frases(texto: string): string[] {
  const partes = (texto || '').split(/(?<=[.;!?])\s+/);
  return partes.map((p) => p.trim()).filter(Boolean);
}

/**
 * "Avançar ou voltar" em duas colunas: o corte e a primeira frase que fala em voltar.
 * Sem esse gancho, devolve null e a secao fica com a coluna de avancar apenas.
 */
export function separarDecisao(texto: string): Decisao | null {
  const t = (texto || '').trim();
  if (!t) return null;
  const partes = frases(t);
  const i = partes.findIndex((f) => VOLTA_RE.test(f));
  if (i <= 0) return null;
  const avance = partes.slice(0, i).join(' ').trim().replace(/[;,]$/, '');
  const volte = partes.slice(i).join(' ').trim();
  if (!avance || !volte) return null;
  return { avance, volte };
}

/** "Objeção: «...» Resposta: «...»" em duas partes; sem o formato, a objecao fica sozinha. */
export function separarObjecao(item: string): ObjecaoItem {
  const m = OBJECAO_RE.exec((item || '').trim());
  if (!m || !m[1].trim()) return { objecao: semAspas(item), resposta: '' };
  return { objecao: semAspas(m[1]), resposta: semAspas(m[2]) };
}

/** "N · Necessidade (desejo antes da dor)" -> "Necessidade": o que cabe no botao, sem inventar palavra. */
export function rotuloCurtoGrupo(titulo: string): string {
  const t = (titulo || '').trim().replace(PREFIXO_GRUPO_RE, '').replace(PARENTESE_FINAL_RE, '').trim();
  return t || (titulo || '').trim();
}

/** "Perguntas recomendadas" sai da tela (item 14); "Perguntas" do Documento 2 continua. */
export function ehPerguntasRecomendadas(rotulo: string): boolean {
  return PERGUNTAS_RECOMENDADAS_RE.test(norm(rotulo));
}

function grupoDeLista(g: GrupoLista): GrupoPerguntas {
  return { titulo: g.titulo, curto: rotuloCurtoGrupo(g.titulo), itens: g.itens, deFalas: false };
}

/** Subsecoes das falas (`### C · Contexto`) com as falas inteiras de cada uma. */
export function gruposDeFalas(dizer: Bloco | null): GrupoFalas[] {
  if (!dizer) return [];
  const grupos: GrupoFalas[] = [];
  let atual: GrupoFalas | null = null;
  for (const no of dizer.dizer) {
    if (no.kind === 'sub') {
      atual = { titulo: no.titulo, curto: rotuloCurtoGrupo(no.titulo), falas: [] };
      grupos.push(atual);
      continue;
    }
    if (!atual) continue;
    if (no.texto.trim()) atual.falas.push(no);
  }
  return grupos.filter((g) => g.falas.length > 0);
}

/** Os mesmos grupos como listas de texto (o molde antigo de perguntas por tipo). */
export function gruposDasFalas(dizer: Bloco | null): GrupoPerguntas[] {
  return gruposDeFalas(dizer).map((g) => ({
    titulo: g.titulo,
    curto: g.curto,
    itens: g.falas.map((f) => f.texto.trim()),
    deFalas: true,
  }));
}

/**
 * A secao de perguntas: os grupos saem do proprio bloco (`### ` dentro de "Perguntas recomendadas") e,
 * quando ele nao os traz, das subsecoes das falas (Passo 2: Contexto, Necessidade, Consequencia, Solucoes).
 * "Como usar estas perguntas" sai da lista e vira nota.
 */
export function montarPerguntas(bloco: Bloco | null, dizer: Bloco | null): SecaoPerguntas | null {
  if (!bloco) return null;
  const nota: string[] = [];
  const doBloco: GrupoPerguntas[] = [];
  for (const g of bloco.grupos) {
    if (COMO_USAR_RE.test(norm(g.titulo))) { nota.push(...g.itens); continue; }
    doBloco.push(grupoDeLista(g));
  }
  const grupos = doBloco.length >= 2 ? doBloco : [...doBloco, ...gruposDasFalas(dizer)];
  return { rotulo: bloco.rotulo || 'Perguntas recomendadas', grupos, itens: bloco.itens, nota };
}

/**
 * Como desenhar as falas do passo. Padrao: sequencia, porque as falas dos passos sao encadeadas, uma
 * puxando a outra. Excecao: os tipos de pergunta do Passo 2, que sao alternativas (o vendedor escolhe as
 * que cabem) e por isso viram grupos. Passos 5, 6 e 7 tem subtitulos e continuam em sequencia (item 21).
 */
export function modoDasFalas(passo: PassoDoc | null | undefined, dizer: Bloco | null): ModoFalas {
  if (!passo || passo.n !== PASSO_DOS_GRUPOS) return 'sequencia';
  return gruposDeFalas(dizer).length >= 2 ? 'grupos' : 'sequencia';
}

/** Texto de um bloco de uma linha (objetivo, princípio, erro): o inline ou os itens colados. */
export function textoDoBloco(b: Bloco | null | undefined): string {
  if (!b) return '';
  return (b.inline || b.itens.join(' ')).trim();
}

/** O titulo que aparece na frente de cada fala (escrito no markdown ou deduzido). */
export { tituloDaFala };

const COM_MOLDE = new Set<Bloco['tipo']>([
  'objetivo', 'estado', 'principio', 'dizer', 'perguntas', 'observar', 'avancar', 'silencio',
  'objecoes', 'erro', 'sucesso', 'transicao', 'alerta', 'proximo',
]);

/**
 * Os blocos de um passo separados por molde. `objetivoAlternativo` cobre o Documento 2, que nao repete o
 * objetivo estrategico: nesse caso o cabecalho usa o do Documento 1.
 */
export function montarSecoes(passo: PassoDoc | null | undefined, objetivoAlternativo = ''): PassoSecoesModelo {
  const blocos = passo?.blocos || [];
  const um = (tipo: Bloco['tipo']) => blocos.find((b) => b.tipo === tipo) || null;
  const dizer = um('dizer');
  const avancar = um('avancar');
  const objecoes = um('objecoes');
  const perguntasBloco = um('perguntas');
  const perguntasBrutas = montarPerguntas(perguntasBloco, dizer);
  const escondePerguntas = !!perguntasBloco && ehPerguntasRecomendadas(perguntasBloco.rotulo);
  const modoFalas = modoDasFalas(passo, dizer);
  return {
    objetivo: textoDoBloco(um('objetivo')) || objetivoAlternativo,
    estado: textoDoBloco(um('estado')),
    principio: textoDoBloco(um('principio')),
    falas: dizer,
    modoFalas,
    gruposFalas: modoFalas === 'grupos' ? gruposDeFalas(dizer) : [],
    notaPerguntas: perguntasBrutas?.nota || [],
    // quando os tipos ja aparecem como grupos das falas, a secao de perguntas nao os repete
    perguntas: escondePerguntas ? null : (perguntasBrutas && modoFalas === 'grupos'
      ? { ...perguntasBrutas, grupos: perguntasBrutas.grupos.filter((g) => !g.deFalas) }
      : perguntasBrutas),
    perguntasBrutas,
    observar: um('observar'),
    avancar,
    decisao: separarDecisao(textoDoBloco(avancar)),
    silencio: um('silencio'),
    objecoes,
    objecoesItens: (objecoes?.itens || []).map(separarObjecao),
    erro: um('erro'),
    sucesso: um('sucesso'),
    transicao: um('transicao'),
    alerta: um('alerta'),
    proximo: um('proximo'),
    outros: blocos.filter((b) => !COM_MOLDE.has(b.tipo)),
  };
}
