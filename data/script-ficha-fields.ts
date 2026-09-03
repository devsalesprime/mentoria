/**
 * Ficha do Script (7 passos): definicoes dos 34 campos (SPEC-ficha-script-v0.1 secao 2).
 * Fonte unica: ./script-ficha-fields.json (o servidor le o mesmo arquivo em utils/script-ficha.cjs).
 * Este modulo so tipa e expoe helpers para o front.
 */
import raw from './script-ficha-fields.json';

export type ScriptFieldType = 'tc' | 'tx' | 'ls' | 'num' | 'esc';

export interface ScriptFieldDef {
  key: string;
  bloco: number;
  nome: string;
  pergunta: string;
  tipo: ScriptFieldType;
  tipoRaw: string;
  obrigatorio: boolean;
  passo: string;
  fontes: string;
  minutos: number;
  opcoes?: string[];
  /** Widget de preenchimento (components/script/widgets) e o template dele. */
  widget?: string;
  template?: Record<string, any>;
  /** Frase-modelo "No seu script" (components/script/widgets/previa.ts). Objeto = uma por opção. */
  previa?: string | Record<string, string>;
  /** Ajuda curta embaixo da pergunta. */
  ajuda?: string;
}

export interface ScriptBlockDef {
  numero: number;
  nome: string;
  descricao: string;
}

export interface ScriptDayDef {
  dia: number;
  titulo: string;
  blocos: number[];
  minutos: number;
}

export type ScriptFieldStatus = 'sugerido' | 'confirmado' | 'editado' | 'vazio' | 'aceito_vazio';
export type ScriptFieldClass = 'Fato' | 'DER' | 'VZ';
export type FichaStatus = 'vazia' | 'pre_preenchida' | 'em_revisao' | 'confirmada';
export type MaterialsStatus = 'pending' | 'submitted';

export interface ScriptAlternativa {
  sugerido: string;
  fonte: string;
}

/** Campo como vem do GET /api/script/ficha: definicao + estado. */
export interface ScriptFieldView {
  key: string;
  bloco: number;
  nome: string;
  pergunta: string;
  tipo: ScriptFieldType;
  tipoRaw: string;
  obrigatorio: boolean;
  minutos: number;
  opcoes: string[] | null;
  widget?: string | null;
  template?: Record<string, any> | null;
  /** Só no front (o GET não manda): cai no JSON local pela chave. */
  previa?: string | Record<string, string> | null;
  ajuda?: string | null;
  sugerido: string;
  classe: ScriptFieldClass;
  fonte: string;
  alternativas: ScriptAlternativa[];
  status: ScriptFieldStatus;
  valor: string;
  /** JSON do widget quando o mentor editou pelo widget (render(estrutura) === valor). */
  estrutura?: Record<string, any> | null;
  valor_efetivo: string;
  decidido: boolean;
  atualizado_por: string | null;
  atualizado_em: string | null;
  nota_interna?: string;
  passo?: string;
  fontes_precedencia?: string;
  /** Itens de contexto (audio/imagem/video/link/nota) que o clube anexou a este campo. */
  contexto_count?: number;
  /** true enquanto ha job `refinar` na fila para este campo. */
  refinando?: boolean;
}

export interface ScriptBlockView {
  numero: number;
  nome: string;
  descricao: string;
  total: number;
  decididos: number;
  obrigatorios: number;
  obrigatorios_decididos: number;
  minutos: number;
  minutos_pendentes: number;
  fechado: boolean;
  campos: ScriptFieldView[];
}

export interface ScriptHoje {
  dia: number;
  titulo: string;
  blocos: number[];
  blocos_abertos: number[];
  minutos: number;
  em_breve: boolean;
}

export interface ScriptProgresso {
  total: number;
  decididos: number;
  obrigatorios: number;
  obrigatorios_decididos: number;
  confirmados: number;
  editados: number;
  aceitos_vazios: number;
}

export const SCRIPT_FIELDS: ScriptFieldDef[] = raw.campos as ScriptFieldDef[];
export const SCRIPT_BLOCKS: ScriptBlockDef[] = raw.blocos as ScriptBlockDef[];
export const SCRIPT_DAYS: ScriptDayDef[] = raw.dias as ScriptDayDef[];
export const SCRIPT_FIELD_KEYS: string[] = SCRIPT_FIELDS.map((f) => f.key);
export const SCRIPT_REQUIRED_KEYS: string[] = SCRIPT_FIELDS.filter((f) => f.obrigatorio).map((f) => f.key);
export const SCRIPT_FIELD_BY_KEY: Record<string, ScriptFieldDef> = Object.fromEntries(SCRIPT_FIELDS.map((f) => [f.key, f]));

export const DECIDED_STATUSES: ScriptFieldStatus[] = ['confirmado', 'editado', 'aceito_vazio'];

export function isDecided(status: ScriptFieldStatus): boolean {
  return DECIDED_STATUSES.includes(status);
}

export function fieldsOfBlock(bloco: number): ScriptFieldDef[] {
  return SCRIPT_FIELDS.filter((f) => f.bloco === bloco);
}

export function blockMinutes(bloco: number): number {
  return Math.round(fieldsOfBlock(bloco).reduce((s, f) => s + f.minutos, 0));
}

/** Rotulo curto do tipo, para o editor. */
export const FIELD_TYPE_LABEL: Record<ScriptFieldType, string> = {
  tc: 'texto curto',
  tx: 'texto',
  ls: 'lista (um item por linha)',
  num: 'número',
  esc: 'escolha',
};

export const FICHA_STATUS_LABEL: Record<FichaStatus, string> = {
  vazia: 'Vazia',
  pre_preenchida: 'Pré-preenchida',
  em_revisao: 'Em revisão',
  confirmada: 'Confirmada',
};

export const MATERIALS_STATUS_LABEL: Record<MaterialsStatus, string> = {
  pending: 'Aguardando',
  submitted: 'Enviados',
};

export const SCRIPT_MATERIAL_CATEGORIES: { id: string; label: string; hint: string }[] = [
  { id: 'script_transcricao_venda', label: 'Transcrição de reunião de venda', hint: 'Texto de uma reunião de venda real (transcrição, resumo ou anotações). Áudio e vídeo vão pelo WhatsApp ao Caio.' },
  { id: 'script_crm', label: 'CRM ou lista de negociações', hint: 'Exportação do CRM, planilha de leads ou histórico de propostas.' },
  { id: 'script_apostila_slides', label: 'Apostila ou slides', hint: 'Material que você usa para apresentar a mentoria ou o método.' },
  { id: 'script_proposta_roteiro', label: 'Proposta ou roteiro atual', hint: 'A proposta que você envia hoje e qualquer roteiro que já use na venda.' },
  { id: 'script_outros', label: 'Outros', hint: 'Qualquer outro material que ajude a entender como você vende.' },
];
