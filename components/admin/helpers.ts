import type { PipelineDetail } from '../../types/admin';

export const isValidJson = (str: string): boolean => {
    if (!str.trim()) return false;
    try { JSON.parse(str); return true; } catch { return false; }
};

export const BB_EXPECTED_SECTIONS = ['section1_icp', 'section2_offer', 'section1_offer', 'section2_icp', 'section3_positioning', 'section4_copy', 'section5_method'];

export const hasBbSections = (str: string): boolean => {
    try {
        const parsed = JSON.parse(str);
        return BB_EXPECTED_SECTIONS.some((s) => s in parsed);
    } catch { return true; }
};

export const BB_STATUS_ORDER = ['pending', 'generated', 'danilo_review', 'mentor_review', 'approved'];

export const PIPELINE_STAGES = [
    { key: 'diagnostic',  label: 'Diagnóstico' },
    { key: 'research',    label: 'Pesquisa' },
    { key: 'brand_brain', label: 'Brand Brain' },
    { key: 'review',      label: 'Revisão' },
    { key: 'assets',      label: 'Entregáveis' },
    { key: 'delivered',   label: 'Entregue' },
];

const PIPELINE_STAGE_ORDER = ['diagnostic', 'research', 'brand_brain', 'review', 'assets', 'delivered'];

export function getAdminStageState(stageKey: string, detail: PipelineDetail): 'completed' | 'active' | 'pending' {
    const completed: Record<string, boolean> = {
        diagnostic:  detail.diagnosticStatus === 'submitted',
        research:    detail.researchStatus === 'complete',
        brand_brain: ['mentor_review', 'approved'].includes(detail.brandBrainStatus),
        review:      detail.brandBrainStatus === 'approved',
        assets:      detail.assetsStatus === 'delivered',
        delivered:   detail.assetsStatus === 'delivered',
    };
    if (completed[stageKey]) return 'completed';
    let lastCompleted = -1;
    for (let i = 0; i < PIPELINE_STAGE_ORDER.length; i++) {
        if (completed[PIPELINE_STAGE_ORDER[i]]) lastCompleted = i;
        else break;
    }
    if (PIPELINE_STAGE_ORDER.indexOf(stageKey) === lastCompleted + 1) return 'active';
    return 'pending';
}

export const SECTION_KEY_MAP: Record<string, string> = {
    s1: 'section1_offer',
    s2: 'section2_icp',
    s3: 'section3_positioning',
    s4: 'section4_copy',
    s5: 'section5_method',
};

export const SECTION_ALT_KEY_MAP: Record<string, string> = {
    s1: 'section2_offer',
    s2: 'section1_icp',
    s3: '',
    s4: '',
    s5: '',
};

export const SECTION_LABELS: Record<string, string> = {
    s1: 'Seção 1: Arquitetura da Oferta',
    s5: 'Seção 2: Arquitetura do Método',
    s2: 'Seção 3: Perfil do ICP',
    s3: 'Seção 4: Posicionamento & Mensagem',
    s4: 'Seção 5: Fundamentos de Copy',
};

export const MODULE_NAME_MAP: Record<string, string> = {
    pre_module: 'Materiais Existentes',
    mentor: 'O Mentor',
    mentee: 'O Mentorado',
    method: 'O Método',
    offer: 'A Oferta',
};

export const QUESTION_LABELS: Record<string, string> = {
    '1.1': '1.1 O que você faz',
    '1.2': '1.2 Linha do Tempo de Autoridade',
    '1.5a': '1.5a Padrão do Mercado',
    '1.5b': '1.5b Minha Diferença',
    '2.2a': '2.2a Antes — Dor interna',
    '2.2b': '2.2b Antes — Situação externa',
    '2.3a': '2.3a Decisão — Medos',
    '2.3b': '2.3b Decisão — Gatilho',
    '2.4a': '2.4a Depois — Resultados',
    '2.4b': '2.4b Depois — Estado emocional',
    '2.5': '2.5 Cliente ideal',
    '2.6': '2.6 Anti-avatar',
    '4.2': '4.2 Descrição da oferta',
};

export const questionIdLabel = (questionId: string): string => {
    if (QUESTION_LABELS[questionId]) return QUESTION_LABELS[questionId];
    if (questionId.startsWith('method-step-')) return `3.x Etapa do Método (${questionId.replace('method-step-', '#')})`;
    return questionId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

export const getProgressColor = (percentage: number): string => {
    if (percentage >= 75) return '#10b981';
    if (percentage >= 50) return '#f59e0b';
    if (percentage >= 25) return '#ef4444';
    return '#6b7280';
};

export const getModuleStatus = (diagnosticData: any, module: string): 'complete' | 'partial' | 'empty' => {
    const data = diagnosticData[module];
    if (!data || Object.keys(data).length === 0) return 'empty';
    switch (module) {
        case 'preModule':
        case 'pre_module': {
            const hasContent =
                (data.materials?.length > 0) ||
                (data.contentLinks?.length > 0) ||
                Object.values(data.profiles || {}).some((v: any) => v && String(v).trim());
            return hasContent ? 'complete' : 'partial';
        }
        case 'mentor': {
            const step1 = data.step1 || {};
            const step3 = data.step3 || {};
            const hasStep1 = !!(step1.explanation && String(step1.explanation).trim());
            const hasStep3 = !!(
                (step3.gold && String(step3.gold).trim()) ||
                (step3.silver && String(step3.silver).trim()) ||
                (step3.bronze && String(step3.bronze).trim())
            );
            if (hasStep1 && hasStep3) return 'complete';
            if (hasStep1 || hasStep3) return 'partial';
            return 'empty';
        }
        case 'mentee': {
            const hasClients = data.hasClients !== undefined;
            const hasBefore = data.beforeInternal && String(data.beforeInternal).trim();
            if (hasClients && hasBefore) return 'complete';
            if (hasClients || hasBefore) return 'partial';
            return 'empty';
        }
        case 'method': {
            const hasMaturity = data.maturity !== undefined;
            const hasSteps = (data.steps || []).some((s: any) => s.title && String(s.title).trim());
            const hasPillars = (data.pillars || []).length > 0;
            if (hasMaturity && (hasSteps || hasPillars)) return 'complete';
            if (hasMaturity) return 'partial';
            return 'empty';
        }
        case 'offer': {
            const hasGoal = data.goal !== undefined;
            const hasDesc = data.description && String(data.description).trim();
            if (hasGoal && hasDesc) return 'complete';
            if (hasGoal || hasDesc) return 'partial';
            return 'empty';
        }
        default:
            return Object.keys(data).length > 0 ? 'complete' : 'empty';
    }
};

export const formatBytes = (bytes: number | null): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
