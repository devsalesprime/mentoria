/**
 * Treinamentos recomendados em cada um dos 7 passos, embutidos no leitor "Seu script" (onda C).
 *
 * Fonte única: `MAPA-aulas-por-passo.md` (§1 recomendados por passo, §3.2 id do catálogo, GUID da library
 * 716048 e duração medida), com as trocas decididas pelo Danilo em 07/09/2026 já aplicadas. Títulos,
 * palestrantes, GUIDs e durações estão copiados de lá palavra por palavra; nada aqui foi inventado nem
 * arredondado para caber na regra.
 *
 * Regras do Danilo (SPEC-workflow-v2-decisoes-06-09, §1 decisão 4 e §3):
 * - vale gravação de qualquer palestrante, não só da Dani;
 * - só gravação acima de 60 minutos, e só do tipo treinamento (nunca aula de curso);
 * - no máximo 2 por passo, na ordem de prioridade (Imersão presencial, Corporate, Sócios, Formação de
 *   Mentoria, evento);
 * - no Passo 1 a ordem é o perfil do vendedor primeiro e o perfil do cliente depois;
 * - a aula "Os 7 Passos da Venda" (data/aula-7-passos.ts) continua como introdução macro, fora daqui.
 *
 * Decisões do Danilo em 07/09/2026 (é o que este arquivo reflete hoje):
 * - Passo 1: "Perfil do Cliente - Com Thiago Chiovatto" (`b5f9555c-...`) saiu e entrou "Perfil
 *   Comportamental do Cliente", com Pâmela Ferrari (Encontros Corporate, 86,8 min medidos, GUID
 *   `dc85b666-5282-42dc-b495-bded3345f416`), que no MAPA era a primeira alternativa do passo. A ordem
 *   continua a mesma: perfil de quem vende primeiro, perfil do cliente depois.
 * - Passo 2: "Spin Selling", com Luã Paiva, saiu. O passo fica com um recomendado só.
 * - Passo 7: "Palestra Dani Martins · Técnicas avançadas de venda" saiu. Fica só "Recomendação", com
 *   Pâmela Ferrari. A outra "Recomendação", com Luã Paiva (`da4cdba9-...`, 57,2 min medidos), segue fora
 *   pelo corte de 1 hora.
 * - Passo 6 tinha um recomendado só: era o único acima de 1 hora no tema (60,6 min medidos).
 *
 * Decisões do Danilo em 08/09/2026:
 * - Passo 4: "Objeções - Com Pâmela Ferrari" (`6690f16c-...`) saiu da tela e o passo fica só com "Use o
 *   Não e Melhore a Conversão", do Luã Paiva. A gravação da Pâmela continua nas alternativas do MAPA.
 * - Passo 5: fica só com "Os Seis Porquês da Decisão", da Dani Martins.
 * - Passo 6: "Fechamento - Com Pâmela Ferrari" (`b58ceaf3-...`) saiu do Passo 5 e entrou aqui, depois do
 *   "Follow Up", com o "por que ver agora" reescrito para o compromisso. O passo passa a ter dois.
 * - Contagem no ar por passo: 2, 1, 2, 1, 1, 2, 1 (10 gravações).
 *
 * Nenhum texto desta base usa travessão, nem os escritos por nós nem os títulos literais do catálogo.
 *
 * O player é o mesmo da aula da Dani (iframe da Bunny Stream, library 716048), já liberado no
 * `frame-src` do `server.cjs`. `inicioSegundos` fica vazio: nenhuma gravação tem marca de tempo
 * documentada (MAPA §3.3).
 *
 * `thumbUrl` e `hlsUrl` vieram do `videos-manifest.json` da KB (campos `thumb` e `hls_master`, casados
 * pelo GUID da library 716048), e cada thumb foi conferida uma a uma em 07/09/2026 com requisição real
 * ao CDN: as 11 responderam 200 com imagem. O `hlsUrl` ainda não é usado na tela; fica guardado para o
 * player nativo. Nenhuma capa precisou do `preview.webp` como reserva.
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
  /** HLS da Bunny: https://vz-6999111b-a97.b-cdn.net/<guid>/playlist.m3u8. Reservado ao player nativo. */
  hlsUrl: string;
  /** Capa da gravação no CDN da Bunny; `null` só se o manifesto e o `preview.webp` falharem. */
  thumbUrl: string | null;
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
