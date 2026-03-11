// ─── Brand Brain Types & Constants ──────────────────────────────────────────

export interface BrandBrainApiData {
  brandBrain: Record<string, any>;
  expertNotes: Record<string, string> | null;
  brandBrainStatus: 'pending' | 'generating' | 'ready';
}

export interface BrandBrainViewerProps {
  token: string;
  onPipelineRefresh?: () => void;
}

// ─── Section config ─────────────────────────────────────────────────────────

export const SECTIONS = [
  { id: 's1' as const, key: 'section1_offer', altKey: 'section2_offer', title: 'Arquitetura da Oferta',     icon: '📦', subtitle: 'Estrutura e posicionamento da sua oferta', pillar: 'O que é vendido', pillarDesc: 'Sua oferta, estrutura e proposta de valor' },
  { id: 's5' as const, key: 'section5_method', altKey: '',              title: 'Arquitetura do Método',      icon: '🔧', subtitle: 'Estrutura, pilares e jornada do método', pillar: 'O Método', pillarDesc: 'Como a transformação é entregue' },
  { id: 's2' as const, key: 'section2_icp',   altKey: 'section1_icp',   title: 'Perfil do ICP',             icon: '🎯', subtitle: 'Quem é seu cliente ideal', pillar: 'Para quem', pillarDesc: 'Perfil detalhado do seu cliente ideal' },
  { id: 's3' as const, key: 'section3_positioning', altKey: '',          title: 'Posicionamento & Mensagem', icon: '📌', subtitle: 'Como você se diferencia no mercado', pillar: 'Quem vende', pillarDesc: 'Seu posicionamento e diferenciação' },
  { id: 's4' as const, key: 'section4_copy',        altKey: '',          title: 'Fundamentos de Copy',       icon: '✍️', subtitle: 'Elementos de comunicação persuasiva', pillar: 'Como comunica', pillarDesc: 'Linguagem e argumentos de persuasão' },
];

export type SectionDef = typeof SECTIONS[number];

// Map internal IDs (s1, s5, s2...) → display number (§1, §2, §3...)
export const SECTION_DISPLAY_NUM: Record<string, string> = Object.fromEntries(
  SECTIONS.map((s, i) => [s.id, `§${i + 1}`])
);

// Resolve section content supporting both old and new key formats
export const getSectionContent = (brandBrain: Record<string, any>, section: SectionDef) => {
  return brandBrain?.[section.key] ?? (section.altKey ? brandBrain?.[section.altKey] : undefined);
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export const extractContentText = (content: any): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && typeof content.content === 'string') return content.content;
  return '';
};
