/**
 * As telas do leitor "Seu script", em DUAS coordenadas.
 *
 * 1. NAVEGACAO (o que a pessoa ve, o que a barra mostra e o que fica lembrado):
 *      0 Inicio (introducao + sumario, na mesma tela) · 1..7 Passo 1..7 · 8 Preparacao e metricas.
 *    Onda J (SPEC-workflow-v4-decisoes-08-09, item 9): o Cartao de bolso deixou de ser tela e o Sumario
 *    entrou na tela de Inicio. A navegacao encurtou de 11 para 9 telas.
 * 2. CONTEUDO (o que o banco guarda e o servidor entende; nada aqui mudou de numero):
 *      0 (antigo cartao, sem tela propria) · 1 sumario · 2..8 passos · 9 preparacao.
 *    E a coordenada do `passo` dos grifos (script_grifos, CHECK 0..9), dos comentarios convertidos e do parseScript.
 *    O grifo do Inicio continua nascendo como 1 (sumario) e o grifo antigo de passo 0 continua sendo lido.
 *
 * `conteudoDaNav` e `navDoConteudo` convertem entre as duas. Comentarios e grifos convertidos usam o "passo":
 * 0 (o Inicio), 1..7 (o passo) e 9 (preparacao).
 */

// ─── Coordenada de CONTEUDO (0..9) ───────────────────────────────────────────
export const TOTAL_TELAS = 10;
export const TELA_SUMARIO = 1;
export const TELA_PREPARACAO = 9;

// ─── Coordenada de NAVEGACAO (0..8) ──────────────────────────────────────────
export const TOTAL_NAV = 9;
export const NAV_INICIO = 0;
export const NAV_PASSO_1 = 1;
export const NAV_PREPARACAO = TOTAL_NAV - 1;

export type DocumentoId = 'treinamento' | 'campo';

export function ehTelaDePasso(tela: number): boolean {
  return tela >= 2 && tela <= 8;
}

/** Numero do passo (1..7) de uma tela de passo; 0 nas outras. */
export function passoNaTela(tela: number): number {
  return ehTelaDePasso(tela) ? tela - 1 : 0;
}

/** Tela -> passo do comentario: 0 (o Inicio), 1..7, 9 (preparacao). Igual ao servidor (utils/script-grifos.cjs). */
export function passoDaTela(tela: number): number {
  if (!Number.isInteger(tela) || tela <= 1) return 0;
  if (tela >= 9) return 9;
  return tela - 1;
}

/** Passo do comentario -> tela: 0 vai para o sumario (1); 1..7 -> 2..8; 9 -> 9. */
export function telaDoPasso(passo: number): number {
  if (!Number.isInteger(passo) || passo <= 0) return TELA_SUMARIO;
  if (passo >= 9) return TELA_PREPARACAO;
  return Math.min(passo, 7) + 1;
}

/** Rotulo curto para o mapa: Início · 1..7 · Preparação. */
export function rotuloCurto(tela: number): string {
  if (tela <= TELA_SUMARIO) return 'Início';
  if (tela >= TELA_PREPARACAO) return 'Preparação';
  return String(passoNaTela(tela));
}

/** Nome completo da tela (com o nome do passo quando houver). */
export function nomeTela(tela: number, nomePasso?: string): string {
  if (tela <= TELA_SUMARIO) return 'Início';
  if (tela >= TELA_PREPARACAO) return 'Preparação e métricas';
  const n = passoNaTela(tela);
  return nomePasso ? `Passo ${n} · ${nomePasso}` : `Passo ${n}`;
}

export function clampTela(tela: number): number {
  if (!Number.isFinite(tela)) return TELA_SUMARIO;
  return Math.max(0, Math.min(TOTAL_TELAS - 1, Math.round(tela)));
}

// ─── Navegacao <-> conteudo ──────────────────────────────────────────────────

export function clampNav(tela: number): number {
  if (!Number.isFinite(tela)) return NAV_INICIO;
  return Math.max(0, Math.min(TOTAL_NAV - 1, Math.round(tela)));
}

/** Tela de navegacao -> coordenada de conteudo. O Inicio carrega o sumario. */
export function conteudoDaNav(tela: number): number {
  const t = clampNav(tela);
  return t === NAV_INICIO ? TELA_SUMARIO : t + 1;
}

/** Coordenada de conteudo -> tela de navegacao (o antigo cartao cai no Inicio). */
export function navDoConteudo(conteudo: number): number {
  const c = clampTela(conteudo);
  if (c <= TELA_SUMARIO) return NAV_INICIO;
  return clampNav(c - 1);
}

export function ehTelaDeInicio(tela: number): boolean {
  return clampNav(tela) === NAV_INICIO;
}

/** Rotulo curto do mapa, na coordenada de navegacao. */
export function rotuloNav(tela: number): string {
  return ehTelaDeInicio(tela) ? 'Início' : rotuloCurto(conteudoDaNav(tela));
}

/** Nome completo da tela, na coordenada de navegacao. */
export function nomeNav(tela: number, nomePasso?: string): string {
  return ehTelaDeInicio(tela) ? 'Início' : nomeTela(conteudoDaNav(tela), nomePasso);
}

// ─── Tela lembrada (localStorage) ────────────────────────────────────────────

/** Chave da onda J: guarda o indice de NAVEGACAO das 9 telas. */
function chaveNav(club: string, versao: number): string {
  return `script-tela-nav2:${club || 'clube'}:v${versao}`;
}

/** Chave da onda E4: guardava o indice de NAVEGACAO das 11 telas (com Cartao e Sumario separados). */
function chaveNavE4(club: string, versao: number): string {
  return `script-tela-nav:${club || 'clube'}:v${versao}`;
}

/** Chave de antes da onda E4: guardava o indice de CONTEUDO. */
function chaveAntiga(club: string, versao: number): string {
  return `script-tela:${club || 'clube'}:v${versao}`;
}

function numeroDe(raw: string | null, total: number): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < total ? n : null;
}

/**
 * Tela lembrada para a versao; null quando o script nunca foi aberto nesta versao.
 * Duas migracoes, cada uma feita uma vez so (a chave antiga sai do armazenamento junto):
 * - onda J: o indice das 11 telas (0 Inicio, 1 Cartao, 2 Sumario, 3..9 Passos, 10 Preparacao) vira o das 9
 *   (Inicio, Cartao e Sumario caem no Inicio; o resto anda duas casas para tras);
 * - antes da onda E4: o indice de CONTEUDO vira o de navegacao.
 * Valor fora do intervalo cai na tela valida mais proxima, nunca em erro.
 */
export function lerTelaLembrada(club: string, versao: number): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const nova = numeroDe(localStorage.getItem(chaveNav(club, versao)), TOTAL_NAV);
    if (nova != null) return nova;

    const e4 = numeroDe(localStorage.getItem(chaveNavE4(club, versao)), 11);
    if (e4 != null) {
      const tela = clampNav(e4 <= 2 ? NAV_INICIO : e4 - 2);
      localStorage.setItem(chaveNav(club, versao), String(tela));
      localStorage.removeItem(chaveNavE4(club, versao));
      localStorage.removeItem(chaveAntiga(club, versao));
      return tela;
    }

    const antiga = numeroDe(localStorage.getItem(chaveAntiga(club, versao)), TOTAL_TELAS);
    if (antiga == null) return null;
    const tela = navDoConteudo(antiga);
    localStorage.setItem(chaveNav(club, versao), String(tela));
    localStorage.removeItem(chaveAntiga(club, versao));
    return tela;
  } catch {
    return null;
  }
}

export function guardarTela(club: string, versao: number, tela: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(chaveNav(club, versao), String(clampNav(tela)));
  } catch {
    // sem armazenamento: segue sem lembrar
  }
}
