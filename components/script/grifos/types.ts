/**
 * Grifos do script (front). Espelha utils/script-grifos.cjs: cores, limites e a conversao grifo -> comentario da revisao.
 */
import { passoDaTela } from '../script/telas';
import type { DocumentoId } from '../script/telas';

export type GrifoCor = 'dourado' | 'verde' | 'vermelho';
export const CORES: GrifoCor[] = ['dourado', 'verde', 'vermelho'];
export const COR_ACAO: Record<GrifoCor, 'ajustar' | 'manter' | 'tirar'> = { dourado: 'ajustar', verde: 'manter', vermelho: 'tirar' };
export const COR_ROTULO: Record<GrifoCor, string> = { dourado: 'Ajustar', verde: 'Manter', vermelho: 'Tirar' };
export const COR_DESCRICAO: Record<GrifoCor, string> = {
  dourado: 'reescrever este trecho na próxima versão',
  verde: 'manter este trecho exatamente assim',
  vermelho: 'tirar este trecho na próxima versão',
};

export const GRIFO_TEXTO_MIN = 20;
export const GRIFO_TEXTO_MAX = 600;
export const GRIFO_NOTA_MAX = 300;

export interface Grifo {
  id: string;
  versao: number;
  /** A tela: 0 cartao, 1 sumario, 2..8 Passo 1..7, 9 preparacao. */
  passo: number;
  documento: DocumentoId;
  texto: string;
  prefixo: string;
  sufixo: string;
  cor: GrifoCor;
  nota: string;
  autor_email: string | null;
  autor_nome: string | null;
  created_at: string;
  resolvido_em: string | null;
}

export interface GrifoNovo {
  passo: number;
  documento: DocumentoId;
  texto: string;
  prefixo: string;
  sufixo: string;
  cor: GrifoCor;
  nota: string;
}

/** Um grifo -> um comentario da revisao: "[GRIFO ajustar] «trecho» → nota" (passo 0, 1..7 ou 9). Igual ao servidor. */
export function grifoParaComentario(g: Pick<Grifo, 'cor' | 'texto' | 'nota' | 'passo'>): { passo: number; texto: string } {
  const acao = COR_ACAO[g.cor] || 'ajustar';
  const nota = (g.nota || '').trim();
  return { passo: passoDaTela(g.passo), texto: `[GRIFO ${acao}] «${(g.texto || '').trim()}»${nota ? ` → ${nota}` : ''}` };
}

export interface ResumoGrifos { total: number; ajustar: number; manter: number; tirar: number; }

export function resumoGrifos(lista: Pick<Grifo, 'cor'>[]): ResumoGrifos {
  const r: ResumoGrifos = { total: 0, ajustar: 0, manter: 0, tirar: 0 };
  for (const g of lista) { r.total += 1; r[COR_ACAO[g.cor] || 'ajustar'] += 1; }
  return r;
}

/** "N grifos: x para ajustar, y para manter, z para tirar". */
export function fraseResumo(r: ResumoGrifos): string {
  const partes: string[] = [];
  if (r.ajustar) partes.push(`${r.ajustar} para ajustar`);
  if (r.manter) partes.push(`${r.manter} para manter`);
  if (r.tirar) partes.push(`${r.tirar} para tirar`);
  return `${r.total} ${r.total === 1 ? 'grifo' : 'grifos'}${partes.length ? `: ${partes.join(', ')}` : ''}`;
}

export function primeiroNome(nome: string | null | undefined, email?: string | null): string {
  const n = (nome || '').trim();
  if (n) return n.split(/\s+/)[0];
  const e = (email || '').trim();
  return e ? e.split('@')[0] : 'Você';
}

export function mesmoEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}
