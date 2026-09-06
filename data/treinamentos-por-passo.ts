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
 */

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

export const BUNNY_LIBRARY = '716048';

export function embedDoGuid(guid: string): string {
  return `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY}/${guid}`;
}

/** Passo (1 a 7) -> até 2 treinamentos recomendados, na ordem em que aparecem na tela. */
export const TREINAMENTOS_POR_PASSO: Record<number, Treinamento[]> = {
  1: [
    {
      id: 'imersao.2026-06.dani-martins-mentalidade-ceo',
      titulo: 'Palestra Dani Martins · Mentalidade de CEO com Foco em Receita: o dono como o melhor vendedor do negócio',
      palestrante: 'Dani Martins',
      tipo: 'Imersão presencial',
      duracaoMin: 169.3,
      bunnyGuid: '22741290-9d9e-407b-8512-226c91d4ba47',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/22741290-9d9e-407b-8512-226c91d4ba47',
      porQueAgora: 'O perfil comportamental do lado de quem vende: as cinco inteligências, os quatro perfis e as crenças de identidade, capacidade e merecimento.',
    },
    {
      id: 'corporate.perfil-do-cliente-com-thiago-chiovatto',
      titulo: 'Perfil do Cliente - Com Thiago Chiovatto',
      palestrante: 'Thiago Chiovatto',
      tipo: 'Corporate',
      duracaoMin: 88.6,
      bunnyGuid: 'b5f9555c-0e88-43b4-8834-b18aec327076',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/b5f9555c-0e88-43b4-8834-b18aec327076',
      porQueAgora: 'Ler o perfil do cliente nos cinco primeiros minutos e abrir a reunião no ritmo dele, que é a decisão deste passo.',
    },
  ],
  2: [
    {
      id: 'corporate.a-arte-de-fazer-perguntas-com-pamela-ferrari',
      titulo: 'A Arte de Fazer Perguntas - Com Pâmela Ferrari',
      palestrante: 'Pâmela Ferrari',
      tipo: 'Corporate',
      duracaoMin: 81.0,
      bunnyGuid: '3fe9dfe7-a992-471b-afec-58f198ad547b',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/3fe9dfe7-a992-471b-afec-58f198ad547b',
      porQueAgora: 'É a gravação do próprio CNCS (Contexto, Necessidade, Consequência, Solução) e dos cinco níveis de consciência.',
    },
    {
      id: 'corporate.spin-selling-com-lua-paiva',
      titulo: 'Spin Selling',
      palestrante: 'Luã Paiva',
      tipo: 'Corporate',
      duracaoMin: 84.0,
      bunnyGuid: '0d4089d0-3d20-46cd-8345-ee4566f8492b',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/0d4089d0-3d20-46cd-8345-ee4566f8492b',
      porQueAgora: 'Percorre a trilha inteira de perguntas até a consequência, que é a origem do CNCS que você usa aqui.',
    },
  ],
  3: [
    {
      id: 'corporate.apresentacao-cirurgica-com-thiago-chiovatto',
      titulo: 'Apresentação Cirúrgica - Com Thiago Chiovatto',
      palestrante: 'Thiago Chiovatto',
      tipo: 'Corporate',
      duracaoMin: 80.0,
      bunnyGuid: 'b0f2fcdd-1673-45cc-8874-ae9a3247c5d7',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/b0f2fcdd-1673-45cc-8874-ae9a3247c5d7',
      porQueAgora: 'As quatro fases da apresentação e a regra de vender o benefício, nunca a característica.',
    },
    {
      id: 'corporate.storytelling-com-juliana-medeiros',
      titulo: 'Storytelling',
      palestrante: 'Juliana Medeiros',
      tipo: 'Corporate',
      duracaoMin: 74.2,
      bunnyGuid: '4bded213-9729-48d4-bdf0-ec5bde22e187',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/4bded213-9729-48d4-bdf0-ec5bde22e187',
      porQueAgora: 'Dá os quatro elementos da história de bolso (herói, desafio, caminho, transformação) que sustentam a prova social.',
    },
  ],
  4: [
    {
      id: 'corporate.objecoes-com-pamela-ferrari',
      titulo: 'Objeções - Com Pâmela Ferrari',
      palestrante: 'Pâmela Ferrari',
      tipo: 'Corporate',
      duracaoMin: 71.1,
      bunnyGuid: '6690f16c-da9d-4f36-9400-3cfae11d9f77',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/6690f16c-da9d-4f36-9400-3cfae11d9f77',
      porQueAgora: 'A tese da gravação é a deste passo: objeção se antecipa ao longo da venda e nunca chega de surpresa no fechamento.',
    },
    {
      id: 'corporate.use-o-nao-e-melhore-a-conversao-com-lua-paiva',
      titulo: 'Use o Não e Melhore a Conversão',
      palestrante: 'Luã Paiva',
      tipo: 'Corporate',
      duracaoMin: 62.9,
      bunnyGuid: '76c8ab9d-104c-47be-bed5-d948317d4fd2',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/76c8ab9d-104c-47be-bed5-d948317d4fd2',
      porQueAgora: 'Entrega o método ACA (Acolher, Clarificar, Avançar) e separa a objeção que se antecipa da que se responde na hora.',
    },
  ],
  5: [
    {
      id: 'corporate.fechamento-com-pamela-ferrari',
      titulo: 'Fechamento - Com Pâmela Ferrari',
      palestrante: 'Pâmela Ferrari',
      tipo: 'Corporate',
      duracaoMin: 72.3,
      bunnyGuid: 'b58ceaf3-0ab4-4bb1-9288-d961e5e0c3fd',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/b58ceaf3-0ab4-4bb1-9288-d961e5e0c3fd',
      porQueAgora: 'Sinais de compra, microcompromissos, equação de valor e a pergunta que abre o fechamento.',
    },
    {
      id: 'corporate.os-seis-porques-da-decisao-com-dani-martins',
      titulo: 'Os Seis Porquês da Decisão - Com Dani Martins',
      palestrante: 'Dani Martins',
      tipo: 'Corporate',
      duracaoMin: 61.2,
      bunnyGuid: '351d4990-e6ae-4a22-be99-e37cf9daec30',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/351d4990-e6ae-4a22-be99-e37cf9daec30',
      porQueAgora: 'É a gravação de quando o cliente não decide: indecisão, reatância e os seis porquês que ele responde por dentro.',
    },
  ],
  6: [
    {
      id: 'corporate.follow-up-com-claudio-rosa',
      titulo: 'Follow Up - Com Cláudio Rosa',
      palestrante: 'Cláudio Rosa',
      tipo: 'Corporate',
      duracaoMin: 60.6,
      bunnyGuid: '2b21162d-5d92-4bb1-91e9-08d1fe344c38',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/2b21162d-5d92-4bb1-91e9-08d1fe344c38',
      porQueAgora: 'Ciclo de reforço em cinco etapas e sequências de sete contatos, que é o movimento do compromisso.',
    },
  ],
  7: [
    {
      id: 'corporate.recomendacao-com-pamela-ferrari',
      titulo: 'Recomendação',
      palestrante: 'Pâmela Ferrari',
      tipo: 'Corporate',
      duracaoMin: 63.9,
      bunnyGuid: '8a8cc7d2-7b67-4d09-8352-13df7625bf4e',
      embedUrl: 'https://iframe.mediadelivery.net/embed/716048/8a8cc7d2-7b67-4d09-8352-13df7625bf4e',
      porQueAgora: 'Ensina o EVPC (Encantar, Validar, Propósito, Compromisso) e o momento certo de pedir, por segmento.',
    },
  ],
};

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
