import type { Bloco, Fala, GrupoLista, PassoDoc } from '../parseScript';

/**
 * Onda E2 (SPEC-workflow-v3-decisoes-07-09 §2, itens 11, 13 e 14): cada rotulo do markdown vira uma secao
 * com template proprio no leitor. Este modulo NAO muda o texto gerado: so separa o que o passo trouxe em
 * objetos que os componentes de `secoes/` sabem desenhar. O que nao se encaixa em nenhum molde cai em
 * `outros` e continua sendo desenhado como antes.
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

export interface PassoSecoesModelo {
  /** Objetivo estrategico, em uma linha, no cabecalho do passo. */
  objetivo: string;
  estado: string;
  principio: string;
  falas: Bloco | null;
  perguntas: SecaoPerguntas | null;
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

const VOLTE_RE = /(^|[.;!?])\s+(volt[ea])\b/i;
const OBJECAO_RE = /^(?:obje[cç][aã]o\s*:?\s*)?(.*?)\s*(?:resposta\s*:\s*)(.*)$/i;
const COMO_USAR_RE = /^como usar/;
const PREFIXO_GRUPO_RE = /^\s*[A-Za-z]\s*[·•\-:]\s*/;
const PARENTESE_FINAL_RE = /\s*\([^)]*\)\s*$/;

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function semAspas(s: string): string {
  return (s || '').trim().replace(/^["“«]/, '').replace(/["”»]$/, '').trim();
}

/**
 * "Avançar ou voltar" em duas colunas: o corte e a primeira frase que comeca em "volte" (ou "volta").
 * Sem esse gancho, devolve null e a secao fica num cartao so, com o texto inteiro.
 */
export function separarDecisao(texto: string): Decisao | null {
  const t = (texto || '').trim();
  if (!t) return null;
  const m = VOLTE_RE.exec(t);
  if (!m || m.index <= 0) return null;
  const corte = m.index + m[1].length;
  const avance = t.slice(0, corte).trim().replace(/[;,]$/, '');
  const volte = t.slice(corte).trim();
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

function grupoDeLista(g: GrupoLista): GrupoPerguntas {
  return { titulo: g.titulo, curto: rotuloCurtoGrupo(g.titulo), itens: g.itens, deFalas: false };
}

/** Subsecoes das falas (`### C · Contexto`) com as falas de cada uma: os tipos de pergunta do Passo 2. */
export function gruposDasFalas(dizer: Bloco | null): GrupoPerguntas[] {
  if (!dizer) return [];
  const grupos: GrupoPerguntas[] = [];
  let atual: GrupoPerguntas | null = null;
  for (const no of dizer.dizer) {
    if (no.kind === 'sub') {
      atual = { titulo: no.titulo, curto: rotuloCurtoGrupo(no.titulo), itens: [], deFalas: true };
      grupos.push(atual);
      continue;
    }
    if (!atual) continue;
    const fala = no as Fala;
    if (fala.texto.trim()) atual.itens.push(fala.texto.trim());
  }
  return grupos.filter((g) => g.itens.length > 0);
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

/** Texto de um bloco de uma linha (objetivo, princípio, erro): o inline ou os itens colados. */
export function textoDoBloco(b: Bloco | null | undefined): string {
  if (!b) return '';
  return (b.inline || b.itens.join(' ')).trim();
}

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
  return {
    objetivo: textoDoBloco(um('objetivo')) || objetivoAlternativo,
    estado: textoDoBloco(um('estado')),
    principio: textoDoBloco(um('principio')),
    falas: dizer,
    perguntas: montarPerguntas(um('perguntas'), dizer),
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
