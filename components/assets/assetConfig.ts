import type { AssetPack, GeneratedAsset } from '../../types/pipeline';

// ─── Phase definitions ────────────────────────────────────────────────────────

export type JourneyPhase = 'attract' | 'connect' | 'convert';

export interface PhaseConfig {
  id: JourneyPhase;
  label: string;
  description: string;
  icon: string;
  accentClass: string;
}

export const PHASES: PhaseConfig[] = [
  {
    id: 'attract',
    label: 'Atrair',
    description: 'Sua vitrine digital para gerar leads qualificados',
    icon: '🎯',
    accentClass: 'border-l-blue-400',
  },
  {
    id: 'connect',
    label: 'Conectar',
    description: 'Suas ferramentas para abordar e nutrir leads',
    icon: '📞',
    accentClass: 'border-l-amber-400',
  },
  {
    id: 'convert',
    label: 'Converter',
    description: 'Seu roteiro para transformar reuniões em clientes',
    icon: '💰',
    accentClass: 'border-l-green-400',
  },
];

// ─── Paradigm types ──────────────────────────────────────────────────────────

export type ParadigmType =
  | 'chat'
  | 'timeline'
  | 'landingPreview'
  | 'teleprompter'
  | 'outreachDual'
  | 'default';

// ─── Asset catalog ───────────────────────────────────────────────────────────

export interface AssetCatalogEntry {
  assetId: string;
  name: string;
  pack: 'readyToSell' | 'bonus';
  packKey: string;
  phase: JourneyPhase;
  paradigm: ParadigmType;
  icon: string;
  triggerSentence: string;
  /** Agency-equivalent value for arrival screen */
  agencyValue: number;
}

export const ASSET_CATALOG: AssetCatalogEntry[] = [
  // ─── Atrair ────────────────────────────────────────────────────────────────
  {
    assetId: 'landingPageCopy',
    name: 'MVP Landing Page',
    pack: 'bonus',
    packKey: 'landingPageCopy',
    phase: 'attract',
    paradigm: 'landingPreview',
    icon: '🌐',
    triggerSentence: 'Use para construir sua página de captura ou vendas',
    agencyValue: 6000,
  },
  {
    assetId: 'vslScript',
    name: 'Script de VSL',
    pack: 'bonus',
    packKey: 'vslScript',
    phase: 'attract',
    paradigm: 'teleprompter',
    icon: '🎬',
    triggerSentence: 'Use para gravar seu vídeo de vendas principal',
    agencyValue: 8000,
  },
  // ─── Conectar ─────────────────────────────────────────────────────────────
  {
    assetId: 'outreachScript',
    name: 'Script de Prospecção',
    pack: 'readyToSell',
    packKey: 'outreachScript',
    phase: 'connect',
    paradigm: 'outreachDual',
    icon: '📞',
    triggerSentence: 'Use para abordar prospects e agendar reuniões',
    agencyValue: 4000,
  },
  {
    assetId: 'followUpSequences',
    name: 'Sequência de Follow-up',
    pack: 'readyToSell',
    packKey: 'followUpSequences',
    phase: 'connect',
    paradigm: 'timeline',
    icon: '📧',
    triggerSentence: 'Use para retomar contato com leads e agendar reunião',
    agencyValue: 5000,
  },
  // ─── Converter ────────────────────────────────────────────────────────────
  {
    assetId: 'salesScript',
    name: 'Script de Vendas',
    pack: 'readyToSell',
    packKey: 'salesScript',
    phase: 'convert',
    paradigm: 'chat',
    icon: '💰',
    triggerSentence: 'Use quando estiver em uma reunião de vendas ao vivo',
    agencyValue: 3500,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getAssetsByPhase(phase: JourneyPhase): AssetCatalogEntry[] {
  return ASSET_CATALOG.filter((a) => a.phase === phase);
}

export function getAssetEntry(assetId: string): AssetCatalogEntry | undefined {
  return ASSET_CATALOG.find((a) => a.assetId === assetId);
}

export function getTotalAgencyValue(): number {
  return ASSET_CATALOG.reduce((sum, a) => sum + a.agencyValue, 0);
}

export function resolveAssetContent(
  assets: AssetPack | null,
  entry: AssetCatalogEntry
): GeneratedAsset | undefined {
  const packData = assets?.[entry.pack] as Record<string, GeneratedAsset | undefined> | undefined;
  return packData?.[entry.packKey];
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
