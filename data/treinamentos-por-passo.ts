/**
 * Treinamentos recomendados em cada um dos 7 passos, embutidos no leitor "Seu script" (onda C).
 *
 * Fonte única: `MAPA-aulas-por-passo.md` (06/09/2026), §1 (recomendados por passo) e §3.2 (id do catálogo,
 * GUID da library 716048 e duração medida). Títulos, palestrantes, GUIDs e durações estão copiados de lá
 * palavra por palavra; nada aqui foi inventado nem arredondado para caber na regra.
 *
 * Regras do Danilo (SPEC-workflow-v2-decisoes-06-09, §1 decisão 4 e §3):
 * - vale gravação de qualquer palestrante, não só da Dani;
 * - só gravação acima de 60 minutos, e só do tipo treinamento (nunca aula de curso);
 * - no máximo 2 por passo, na ordem de prioridade (Imersão presencial, Corporate, Sócios, Formação de
 *   Mentoria, evento);
 * - no Passo 1 a ordem é o perfil do vendedor primeiro e o perfil do cliente depois;
 * - a aula "Os 7 Passos da Venda" (data/aula-7-passos.ts) continua como introdução macro, fora daqui.
 *
 * Quem ficou de fora, e por quê:
 * - Passo 7, segundo recomendado do MAPA ("Recomendação", com Luã Paiva, GUID
 *   `da4cdba9-7c55-49ad-8df7-d85bb208c32f`): a medição deu 57,2 min, abaixo do corte de 1 hora. O MAPA
 *   deixa a promoção da alternativa de 74,6 min como decisão em aberto do Danilo, então o Passo 7 segue
 *   com um recomendado só até ele decidir.
 * - Passo 6 tem um recomendado só: é o único acima de 1 hora no tema (60,6 min medidos).
 *
 * O único travessão desta base está dentro do título do treinamento do Passo 1, que é o nome literal da
 * gravação no catálogo. Nenhum texto escrito por nós usa travessão.
 *
 * O player é o mesmo da aula da Dani (iframe da Bunny Stream, library 716048), já liberado no
 * `frame-src` do `server.cjs`. `inicioSegundos` fica vazio: nenhuma gravação tem marca de tempo
 * documentada (MAPA §3.3).
 *
 * Os dados vivem em `treinamentos-por-passo.json` (mesmo padrão de `script-ficha-fields.json`): o servidor
 * lê o MESMO arquivo em `utils/script-tarefas.cjs` para saber quais tarefas ainda existem no catálogo na
 * hora de herdar as marcações de uma versão para a outra. Este módulo só tipa e expõe os helpers do front.
 * Os dois arquivos precisam de `git add -f` (o `.gitignore` ignora `data/`).
 */
import catalogo from './treinamentos-por-passo.json';

/** De onde a gravação veio. Manda na prioridade quando há mais de um treinamento no mesmo tema. */
export type TreinamentoTipo = 'Imersão presencial' | 'Corporate' | 'Sócios' | 'Formação de Mentoria' | 'Evento';

export interface Treinamento {
  /** Id do catálogo da KB; estável, é o que a tarefa "assistir" usa (`assistir-<id>`). */
  id: string;
  /** Título como está no catálogo, com a pontuação dele. */
  titulo: string;
  palestrante: string;
  tipo: TreinamentoTipo;
  /** Duração medida em minutos (`duracao_seg` do videos-manifest.json). Sempre acima de 60. */
  duracaoMin: number;
  /** GUID na library 716048 da Bunny Stream. */
  bunnyGuid: string;
  /** Player embutido: https://iframe.mediadelivery.net/embed/716048/<guid> */
  embedUrl: string;
  /** Uma linha: por que ver esta gravação neste passo, agora. */
  porQueAgora: string;
  /** Segundo em que o trecho começa; nenhuma gravação tem marca de tempo documentada até aqui. */
  inicioSegundos?: number;
}

export const BUNNY_LIBRARY: string = catalogo.bunny_library;

export function embedDoGuid(guid: string): string {
  return `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY}/${guid}`;
}

/** Passo (1 a 7) -> até 2 treinamentos recomendados, na ordem em que aparecem na tela. */
export const TREINAMENTOS_POR_PASSO: Record<number, Treinamento[]> = catalogo.passos as unknown as Record<number, Treinamento[]>;

/** Os treinamentos recomendados de um passo (lista vazia quando o passo não tem nenhum). */
export function treinamentosDoPasso(passo: number | null | undefined): Treinamento[] {
  if (!Number.isInteger(passo as number)) return [];
  return TREINAMENTOS_POR_PASSO[passo as number] || [];
}

/** Todos os treinamentos, na ordem dos passos (o mesmo pode aparecer em mais de um passo). */
export function todosOsTreinamentos(): Treinamento[] {
  return Object.keys(TREINAMENTOS_POR_PASSO)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((n) => TREINAMENTOS_POR_PASSO[n]);
}

/**
 * URL do player: a base, `t=<segundos>` quando o trecho tem marca de tempo e `autoplay=true` só quando a
 * pessoa pediu para assistir. Mesma mecânica de `urlDaAula` (data/aula-7-passos.ts).
 */
export function urlDoTreinamento(t: Treinamento, opcoes: { autoplay?: boolean } = {}): string {
  const params: string[] = [];
  if (Number.isFinite(t.inicioSegundos) && (t.inicioSegundos as number) > 0) params.push(`t=${Math.floor(t.inicioSegundos as number)}`);
  if (opcoes.autoplay) params.push('autoplay=true');
  if (!params.length) return t.embedUrl;
  return `${t.embedUrl}${t.embedUrl.includes('?') ? '&' : '?'}${params.join('&')}`;
}

/** "2 h 49 min" / "1 h 1 min"; minutos arredondados. */
export function duracaoLegivel(min: number): string {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
