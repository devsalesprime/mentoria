/**
 * Aula de referência dos 7 passos da venda (Dani Martins), embutida no leitor "Seu script".
 * Vídeo na Bunny Stream (biblioteca 716048, reapontamento CursEduca -> Bunny, verificado com GET 200 em 04/09/2026).
 * O embed antigo da CursEduca fica só como registro: em 04/09/2026 ele respondia 404 e não é usado na tela.
 * O player da Bunny aceita `?t=<segundos>` para abrir num ponto da aula e `autoplay=true` para tocar ao carregar.
 * Os capítulos ainda não têm marcação de tempo: quando tiverem, basta preencher `inicioSegundos`.
 */
export interface CapituloAula {
  /** 1..7 */
  passo: number;
  rotulo: string;
  /** Segundo em que o passo começa na aula; sem marcação por enquanto. */
  inicioSegundos?: number;
}

export interface AulaReferencia {
  titulo: string;
  /** Embed principal (Bunny Stream). */
  embedUrl: string;
  /** Embed antigo (CursEduca); registro histórico, hoje fora do ar. */
  fallbackUrl: string;
  duracaoAprox?: string;
  capitulos: CapituloAula[];
}

export const AULA_7_PASSOS: AulaReferencia = {
  titulo: 'Os 7 passos da venda, com Dani Martins',
  embedUrl: 'https://iframe.mediadelivery.net/embed/716048/fd407b65-c9c3-4f9d-bb90-3d97d01c949b',
  fallbackUrl: 'https://player.curseduca.com/embed/aa26c9f4-cf7d-4246-acfd-0f991cf0c7ef?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  capitulos: [
    { passo: 1, rotulo: 'Conexão' },
    { passo: 2, rotulo: 'Investigação' },
    { passo: 3, rotulo: 'Apresentação' },
    { passo: 4, rotulo: 'Validação e antecipação de objeções' },
    { passo: 5, rotulo: 'Negociação e fechamento' },
    { passo: 6, rotulo: 'Compromisso' },
    { passo: 7, rotulo: 'Recomendação' },
  ],
};

export function capituloDoPasso(aula: AulaReferencia, passo?: number | null): CapituloAula | null {
  if (passo == null) return null;
  return aula.capitulos.find((c) => c.passo === passo) || null;
}

/**
 * URL do player: a base e, quando o capítulo do passo tem marcação, `t=<segundos>`; `autoplay=true` só quando o
 * usuário pediu para assistir. Sem passo marcado, devolve a URL base como está.
 */
export function urlDaAula(aula: AulaReferencia, opcoes: { passo?: number | null; autoplay?: boolean } = {}): string {
  const capitulo = capituloDoPasso(aula, opcoes.passo);
  const params: string[] = [];
  if (capitulo && Number.isFinite(capitulo.inicioSegundos) && (capitulo.inicioSegundos as number) > 0) {
    params.push(`t=${Math.floor(capitulo.inicioSegundos as number)}`);
  }
  if (opcoes.autoplay) params.push('autoplay=true');
  if (params.length === 0) return aula.embedUrl;
  return `${aula.embedUrl}${aula.embedUrl.includes('?') ? '&' : '?'}${params.join('&')}`;
}
