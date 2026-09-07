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
/** Quanto de cada anexo cabe no comentário da revisão. Espelha ANEXO_TEXTO_MAX de utils/script-grifos.cjs. */
export const GRIFO_ANEXO_TEXTO_MAX = 800;

export type AnexoTipo = 'audio' | 'imagem' | 'video' | 'link' | 'nota';
export const ANEXO_TIPOS: AnexoTipo[] = ['audio', 'imagem', 'video', 'link', 'nota'];
export const ANEXO_ROTULO: Record<AnexoTipo, string> = { audio: 'Áudio', imagem: 'Imagem', video: 'Vídeo', link: 'Link', nota: 'Nota' };
/** Verbo + objeto, igual ao contexto por pergunta da Ficha. */
export const ANEXO_ACAO: Record<AnexoTipo, string> = {
  audio: 'Gravar áudio',
  imagem: 'Enviar foto',
  video: 'Enviar vídeo',
  link: 'Colar link',
  nota: 'Escrever nota',
};

/** Material anexado a um grifo (mesma forma do contexto por pergunta da Ficha). */
export interface GrifoAnexo {
  id: string;
  grifo_id?: string | null;
  tipo: AnexoTipo;
  file_id?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  url?: string | null;
  texto?: string | null;
  legenda?: string | null;
  transcricao?: string | null;
  erro_transcricao?: string | null;
  autor_email?: string | null;
  autor_nome?: string | null;
  created_at?: string | null;
  download_url?: string | null;
}

/** O que o balão guarda antes de o grifo existir: vai para o servidor logo depois do POST do grifo. */
export interface AnexoPendente {
  tipo: AnexoTipo;
  file?: File | Blob | null;
  fileName?: string;
  url?: string;
  texto?: string;
  legenda?: string;
}

/** Chip do anexo: o que importa em uma linha. */
export function resumoAnexo(a: GrifoAnexo | AnexoPendente, max = 60): string {
  const bruto = (a as GrifoAnexo).transcricao || a.texto || a.legenda || a.url || (a as GrifoAnexo).file_name || (a as AnexoPendente).fileName || '';
  const s = String(bruto).replace(/\s+/g, ' ').trim();
  if (!s) return ANEXO_ROTULO[a.tipo];
  return s.length > max ? `${s.slice(0, max).trimEnd()}...` : s;
}

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
  /** Materiais anexados ao grifo (o GET das versões já traz). */
  contexto?: GrifoAnexo[];
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

/** Um anexo -> o texto dele no comentário da revisão. Espelha `anexoParaTexto` de utils/script-grifos.cjs. */
export function anexoParaTexto(a: GrifoAnexo): string {
  const corta = (s: unknown) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > GRIFO_ANEXO_TEXTO_MAX ? `${t.slice(0, GRIFO_ANEXO_TEXTO_MAX).trimEnd()}...` : t;
  };
  const nome = corta(a.legenda || a.file_name || '');
  if (a.tipo === 'audio') {
    const t = corta(a.transcricao);
    return t ? `áudio (transcrição: "${t}")` : `áudio (${corta(a.erro_transcricao) ? 'sem transcrição' : 'transcrição a caminho'})`;
  }
  if (a.tipo === 'link') return `link (${corta(a.url) || 'sem endereço'})`;
  if (a.tipo === 'nota') return `nota ("${corta(a.texto)}")`;
  if (a.tipo === 'video') return a.url ? `vídeo (${corta(a.url)})` : `vídeo (${nome || 'arquivo enviado'})`;
  return `imagem (${nome || 'arquivo enviado'})`;
}

/** " · anexos: áudio (transcrição: "..."), link (url)"; vazio quando o grifo não tem anexo. */
export function anexosParaTexto(itens: GrifoAnexo[] | undefined | null): string {
  const partes = (itens || []).map(anexoParaTexto).filter(Boolean);
  return partes.length ? ` · anexos: ${partes.join(', ')}` : '';
}

/**
 * Um grifo -> um comentario da revisao: "[GRIFO ajustar] «trecho» → nota" (passo 0, 1..7 ou 9). Igual ao servidor.
 * Com anexos, ganha " · anexos: ..." no fim; sem anexos, o texto é o mesmo de sempre.
 */
export function grifoParaComentario(g: Pick<Grifo, 'cor' | 'texto' | 'nota' | 'passo'> & { contexto?: GrifoAnexo[] }): { passo: number; texto: string } {
  const acao = COR_ACAO[g.cor] || 'ajustar';
  const nota = (g.nota || '').trim();
  const base = `[GRIFO ${acao}] «${(g.texto || '').trim()}»${nota ? ` → ${nota}` : ''}`;
  return { passo: passoDaTela(g.passo), texto: `${base}${anexosParaTexto(g.contexto)}` };
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
