/**
 * As telas do leitor "Seu script": 0 Cartao de bolso · 1 Sumario · 2..8 Passo 1..7 · 9 Preparacao e metricas.
 * Comentarios e grifos convertidos usam o "passo": 0 (cartao e sumario), 1..7 (o passo) e 9 (preparacao).
 */
export const TOTAL_TELAS = 10;
export const TELA_CARTAO = 0;
export const TELA_SUMARIO = 1;
export const TELA_PREPARACAO = 9;

export type DocumentoId = 'treinamento' | 'campo';

export function ehTelaDePasso(tela: number): boolean {
  return tela >= 2 && tela <= 8;
}

/** Numero do passo (1..7) de uma tela de passo; 0 nas outras. */
export function passoNaTela(tela: number): number {
  return ehTelaDePasso(tela) ? tela - 1 : 0;
}

/** Tela -> passo do comentario: 0 (cartao e sumario), 1..7, 9 (preparacao). Igual ao servidor (utils/script-grifos.cjs). */
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

/** Rotulo curto para o mapa: Cartao · Sumario · 1..7 · Preparacao. */
export function rotuloCurto(tela: number): string {
  if (tela === TELA_CARTAO) return 'Cartão';
  if (tela === TELA_SUMARIO) return 'Sumário';
  if (tela === TELA_PREPARACAO) return 'Preparação';
  return String(passoNaTela(tela));
}

/** Nome completo da tela (com o nome do passo quando houver). */
export function nomeTela(tela: number, nomePasso?: string): string {
  if (tela === TELA_CARTAO) return 'Cartão de bolso';
  if (tela === TELA_SUMARIO) return 'Sumário';
  if (tela === TELA_PREPARACAO) return 'Preparação e métricas';
  const n = passoNaTela(tela);
  return nomePasso ? `Passo ${n} · ${nomePasso}` : `Passo ${n}`;
}

export function clampTela(tela: number): number {
  if (!Number.isFinite(tela)) return TELA_CARTAO;
  return Math.max(0, Math.min(TOTAL_TELAS - 1, Math.round(tela)));
}

function chave(club: string, versao: number): string {
  return `script-tela:${club || 'clube'}:v${versao}`;
}

/** Tela lembrada para a versao (localStorage); null quando o script nunca foi aberto nesta versao. */
export function lerTelaLembrada(club: string, versao: number): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(chave(club, versao));
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n < TOTAL_TELAS ? n : null;
  } catch {
    return null;
  }
}

export function guardarTela(club: string, versao: number, tela: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(chave(club, versao), String(clampTela(tela)));
  } catch {
    // sem armazenamento: segue sem lembrar
  }
}
