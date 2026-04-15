import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ASSET_CATALOG } from '../assets/assetConfig';
import type { PipelineDetail } from '../../types/admin';
import { StatusBadge } from './StatusBadge';
import { Button } from '../ui/Button';
import {
    PIPELINE_STAGES,
    getAdminStageState,
} from './helpers';

// Prose classes for BB section preview — compact admin variant (text-xs vs text-sm in brand-brain-parser.ts)
const PROSE_CLASSES = `text-xs text-white/70 leading-relaxed prose prose-invert prose-sm max-w-none
    [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-4 [&_h1]:mb-2
    [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-white/90 [&_h2]:mt-3 [&_h2]:mb-1.5
    [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-prosperus-gold-dark [&_h3]:mt-2 [&_h3]:mb-1
    [&_h4]:text-xs [&_h4]:font-bold [&_h4]:text-prosperus-gold-dark/80 [&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:uppercase [&_h4]:tracking-wide [&_h4]:border-b [&_h4]:border-white/5 [&_h4]:pb-1
    [&_ul]:space-y-1 [&_li]:text-white/60
    [&_strong]:text-white [&_em]:text-white/50
    [&_table]:w-full [&_table]:text-xs [&_th]:text-left [&_th]:text-white/50 [&_th]:pb-1 [&_th]:border-b [&_th]:border-white/10
    [&_td]:py-1 [&_td]:text-white/60 [&_td]:border-b [&_td]:border-white/5`;

// Display order for section iteration: s1 → s5 → s2 → s3 → s4
const BB_SECTION_ORDER = ['s1', 's5', 's2', 's3', 's4'];

// Map internal IDs to display numbers (user-facing) — derived from display order
const BB_DISPLAY_NUM: Record<string, string> = Object.fromEntries(
    BB_SECTION_ORDER.map((id, i) => [id, `S${i + 1}`])
);

// The 5 sections for admin input (display order: s1 → s5 → s2 → s3 → s4)
const BB_INPUT_SECTIONS = [
    { id: 's1', key: 'section1_offer', altKey: 'section2_offer', label: 'Seção 1: Arquitetura da Oferta',     icon: '📦', placeholder: 'Cole aqui o markdown da seção de Arquitetura da Oferta...' },
    { id: 's5', key: 'section5_method', altKey: '',              label: 'Seção 2: Arquitetura do Método',      icon: '🔧', placeholder: 'Cole aqui o markdown da seção de Arquitetura do Método...' },
    { id: 's2', key: 'section2_icp',   altKey: 'section1_icp',   label: 'Seção 3: ICP & Persona',             icon: '🎯', placeholder: 'Cole aqui o markdown da seção de ICP & Persona...' },
    { id: 's3', key: 'section3_positioning', altKey: '',          label: 'Seção 4: Posicionamento & Mensagem', icon: '📌', placeholder: 'Cole aqui o markdown da seção de Posicionamento & Mensagem...' },
    { id: 's4', key: 'section4_copy',        altKey: '',          label: 'Seção 5: Copy Fundamentals',         icon: '✍️', placeholder: 'Cole aqui o markdown da seção de Copy Fundamentals...' },
];

interface PipelineDetailViewProps {
    userId: string;
    token: string;
    onBack: () => void;
    showToast: (msg: string, type: 'success' | 'error') => void;
}

export const PipelineDetailView: React.FC<PipelineDetailViewProps> = ({ userId, token, onBack, showToast }) => {
    const [detail, setDetail] = useState<PipelineDetail | null>(null);
    const [loading, setLoading] = useState(true);

    const [researchLink, setResearchLink] = useState('');
    const [researchIsLegacyJson, setResearchIsLegacyJson] = useState(false);
    const [researchLinkError, setResearchLinkError] = useState('');

    // BB: per-section markdown strings instead of a single JSON blob
    const [bbSections, setBbSections] = useState<Record<string, string>>({ s1: '', s2: '', s3: '', s4: '', s5: '' });
    const [bbMetaName, setBbMetaName] = useState('');
    const [bbMetaProgram, setBbMetaProgram] = useState('');
    const [bbPreviewSection, setBbPreviewSection] = useState<string | null>(null);
    const [bbMetaExpanded, setBbMetaExpanded] = useState(false);

    const [assetContents, setAssetContents] = useState<Record<string, string>>({});

    // Feedback state (FIX-PV-002)
    const [feedbackText, setFeedbackText] = useState('');
    const [savingFeedback, setSavingFeedback] = useState(false);

    // Asset visibility toggle state (FIX-PV-005)
    const [togglingAssets, setTogglingAssets] = useState(false);

    const [savingResearch, setSavingResearch] = useState(false);
    const [savingBb, setSavingBb] = useState(false);
    const [savingAssets, setSavingAssets] = useState(false);
    const [delivering, setDelivering] = useState(false);

    const [expertNotes, setExpertNotes] = useState<Record<string, string>>({});
    const [bbExpandedNotes, setBbExpandedNotes] = useState<Record<string, boolean>>({});

    // Educational suggestions (Squad 2 output — 3 lenses JSON)
    const [suggestionsJson, setSuggestionsJson] = useState('');
    const [savingSuggestions, setSavingSuggestions] = useState(false);
    const [suggestionsError, setSuggestionsError] = useState('');
    const [suggestionsPreview, setSuggestionsPreview] = useState(false);

    // Landing page specific: Markdown vs HTML input mode (null = not yet detected)
    const [lpInputMode, setLpInputMode] = useState<'markdown' | 'html' | null>(null);

    const headers = { Authorization: `Bearer ${token}` };

    const fetchDetail = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/admin/pipeline/${userId}`, { headers });
            if (res.data.success) {
                const d = res.data.data;
                const mapped: PipelineDetail = {
                    name:                  d.name                  ?? '',
                    email:                 d.email                 ?? '',
                    diagnosticStatus:      d.diagnosticStatus      ?? d.diagnostic_status      ?? 'pending',
                    researchDossier:       d.researchDossier       ?? d.research_dossier       ?? null,
                    researchStatus:        d.researchStatus        ?? d.research_status        ?? 'pending',
                    researchCompletedAt:   d.researchCompletedAt   ?? d.research_completed_at  ?? null,
                    brandBrain:            d.brandBrain            ?? d.brand_brain            ?? null,
                    brandBrainStatus:      d.brandBrainStatus      ?? d.brand_brain_status     ?? 'pending',
                    brandBrainVersion:     d.brandBrainVersion     ?? d.brand_brain_version    ?? 0,
                    brandBrainCompletedAt: d.brandBrainCompletedAt ?? d.brand_brain_completed_at ?? null,
                    expertNotes:           d.expertNotes           ?? d.expert_notes           ?? null,
                    assets:                d.assets                ?? null,
                    assetsStatus:          d.assetsStatus          ?? d.assets_status          ?? 'pending',
                    assetsDeliveredAt:     d.assetsDeliveredAt     ?? d.assets_delivered_at    ?? null,
                    educationalSuggestions: d.educational_suggestions ?? d.educationalSuggestions ?? null,
                    personalizedFeedback:  d.personalized_feedback  ?? d.personalizedFeedback  ?? null,
                    feedbackStatus:        d.feedback_status        ?? d.feedbackStatus        ?? 'pending',
                    feedbackDeliveredAt:   d.feedback_delivered_at  ?? d.feedbackDeliveredAt   ?? null,
                    showAssetsToUser:      d.show_assets_to_user === 1 || d.showAssetsToUser === true,
                    priorities:            d.priorities             ?? null,
                };
                setDetail(mapped);
                // Detect research_dossier format: URL string vs legacy JSON object
                if (mapped.researchDossier) {
                    if (typeof mapped.researchDossier === 'string') {
                        // URL string (new format)
                        setResearchLink(mapped.researchDossier);
                        setResearchIsLegacyJson(false);
                    } else {
                        // Legacy JSON object
                        setResearchLink('');
                        setResearchIsLegacyJson(true);
                    }
                } else {
                    setResearchLink('');
                    setResearchIsLegacyJson(false);
                }
                // Load existing BB data into per-section textareas (dual-key support)
                if (mapped.brandBrain) {
                    const bb = mapped.brandBrain;
                    const extractSection = (key: string, altKey: string): string => {
                        const raw = bb[key] ?? (altKey ? bb[altKey] : undefined);
                        if (!raw) return '';
                        if (typeof raw === 'string') return raw;
                        if (typeof raw === 'object' && typeof raw.content === 'string') return raw.content;
                        return '';
                    };
                    setBbSections({
                        s1: extractSection('section1_offer', 'section2_offer'),
                        s2: extractSection('section2_icp', 'section1_icp'),
                        s3: extractSection('section3_positioning', ''),
                        s4: extractSection('section4_copy', ''),
                        s5: extractSection('section5_method', ''),
                    });
                    setBbMetaName(bb.mentorName || '');
                    setBbMetaProgram(bb.programName || '');
                } else {
                    setBbSections({ s1: '', s2: '', s3: '', s4: '', s5: '' });
                    setBbMetaName('');
                    setBbMetaProgram('');
                }
                if (mapped.assets) {
                    const contents: Record<string, string> = {};
                    for (const entry of ASSET_CATALOG) {
                        const packData = mapped.assets[entry.pack];
                        const asset = packData?.[entry.packKey];
                        if (asset?.content) contents[entry.assetId] = asset.content;
                    }
                    setAssetContents(contents);
                    // Auto-detect LP input mode based on existing content
                    const lpContent = contents['landingPageCopy'] || '';
                    if (/<(!DOCTYPE|html|head|body|div|section|header|footer|main|nav|article)\b/i.test(lpContent)) {
                        setLpInputMode('html');
                    } else {
                        setLpInputMode('markdown');
                    }
                } else {
                    setAssetContents({});
                }
                setExpertNotes(mapped.expertNotes ?? {});
                // Load existing feedback (FIX-PV-002)
                if (mapped.personalizedFeedback) {
                    setFeedbackText(typeof mapped.personalizedFeedback === 'string' ? mapped.personalizedFeedback : JSON.stringify(mapped.personalizedFeedback));
                } else {
                    setFeedbackText('');
                }
                // Load existing educational suggestions
                if (mapped.educationalSuggestions) {
                    setSuggestionsJson(JSON.stringify(mapped.educationalSuggestions, null, 2));
                } else {
                    setSuggestionsJson('');
                }
            }
        } catch (e: any) {
            showToast(e.response?.data?.message || 'Erro ao carregar pipeline', 'error');
        } finally {
            setLoading(false);
        }
    }, [userId, token]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchDetail(); }, [fetchDetail]);

    const isValidUrl = (value: string): boolean => {
        if (!value.trim()) return false;
        try {
            const url = new URL(value.trim());
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    };

    const saveResearch = async () => {
        const trimmedLink = researchLink.trim();
        if (!isValidUrl(trimmedLink)) {
            setResearchLinkError('URL inválida — use https://...');
            return;
        }
        setResearchLinkError('');
        setSavingResearch(true);
        try {
            await axios.post(`/api/pipeline/${userId}/research`, { researchLink: trimmedLink }, { headers });
            showToast('Pesquisa salva com sucesso', 'success');
            fetchDetail();
        } catch (e: any) {
            showToast(e.response?.data?.message || 'Erro ao salvar pesquisa', 'error');
        } finally { setSavingResearch(false); }
    };

    const bbAllFilled = BB_INPUT_SECTIONS.every(s => bbSections[s.id]?.trim());

    const saveBrandBrain = async () => {
        if (!bbAllFilled) {
            showToast('Preencha todas as 5 seções antes de salvar', 'error');
            return;
        }
        setSavingBb(true);
        try {
            await axios.post(`/api/pipeline/${userId}/brand-brain`, {
                section1_offer:      bbSections.s1,
                section2_icp:        bbSections.s2,
                section3_positioning: bbSections.s3,
                section4_copy:       bbSections.s4,
                section5_method:     bbSections.s5,
                mentorName:          bbMetaName,
                programName:         bbMetaProgram,
            }, { headers });
            // Also save expert notes in the same action
            const hasAnyNote = Object.values(expertNotes).some(v => v && v.trim());
            if (hasAnyNote) {
                await axios.post(
                    `/api/admin/pipeline/${userId}/expert-notes`,
                    { notes: expertNotes },
                    { headers }
                );
            }
            showToast('Brand Brain salvo com sucesso', 'success');
            fetchDetail();
        } catch (e: any) {
            showToast(e.response?.data?.message || 'Erro ao salvar Brand Brain', 'error');
        } finally { setSavingBb(false); }
    };

    const REQUIRED_LENSES = ['marketing', 'vendas', 'modelo_de_negocios'] as const;
    const LENS_LABELS: Record<string, string> = {
        marketing: 'Marketing',
        vendas: 'Vendas',
        modelo_de_negocios: 'Modelo de Negócios',
    };

    const validateSuggestionsJson = (raw: string): { valid: boolean; parsed?: Record<string, any[]>; error?: string } => {
        if (!raw.trim()) return { valid: false, error: 'JSON não pode estar vazio.' };
        let parsed: any;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return { valid: false, error: 'JSON inválido — verifique a formatação.' };
        }
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { valid: false, error: 'JSON deve ser um objeto com as 3 lentes.' };
        }
        // Auto-unwrap squad output format: { educational_suggestions: { ... } }
        if ('educational_suggestions' in parsed && typeof parsed.educational_suggestions === 'object' && !Array.isArray(parsed.educational_suggestions)) {
            parsed = parsed.educational_suggestions;
        }
        const missing = REQUIRED_LENSES.filter(k => !(k in parsed));
        if (missing.length > 0) {
            return { valid: false, error: `Lentes ausentes: ${missing.join(', ')}. Esperado: marketing, vendas, modelo_de_negocios.` };
        }
        for (const k of REQUIRED_LENSES) {
            if (!Array.isArray(parsed[k])) {
                return { valid: false, error: `Campo "${k}" deve ser um array.` };
            }
        }
        return { valid: true, parsed };
    };

    const saveEducationalSuggestions = async () => {
        const result = validateSuggestionsJson(suggestionsJson);
        if (!result.valid) {
            setSuggestionsError(result.error!);
            return;
        }
        setSuggestionsError('');
        setSavingSuggestions(true);
        try {
            await axios.post(`/api/admin/pipeline/${userId}/educational-suggestions`, result.parsed, { headers });
            showToast('Sugestões educacionais salvas com sucesso', 'success');
            fetchDetail();
        } catch (e: any) {
            showToast(e.response?.data?.message || 'Erro ao salvar sugestões educacionais', 'error');
        } finally { setSavingSuggestions(false); }
    };

    const saveAssets = async () => {
        const filled = ASSET_CATALOG.filter(e => assetContents[e.assetId]?.trim());
        if (filled.length === 0) { showToast('Preencha pelo menos um entregável', 'error'); return; }
        setSavingAssets(true);
        try {
            const assets: Record<string, Record<string, { content: string; generatedAt: string; version: number }>> = {};
            for (const entry of filled) {
                if (!assets[entry.pack]) assets[entry.pack] = {};
                const existingVersion = detail?.assets?.[entry.pack]?.[entry.packKey]?.version ?? 0;
                assets[entry.pack][entry.packKey] = {
                    content: assetContents[entry.assetId].trim(),
                    generatedAt: new Date().toISOString(),
                    version: existingVersion + 1,
                };
            }
            await axios.post(`/api/pipeline/${userId}/assets`, { assets }, { headers });
            showToast('Entregáveis salvos com sucesso', 'success');
            fetchDetail();
        } catch (e: any) {
            showToast(e.response?.data?.message || 'Erro ao salvar entregáveis', 'error');
        } finally { setSavingAssets(false); }
    };

    const deliver = async () => {
        if (!window.confirm('Tem certeza que deseja entregar os materiais? Esta ação não pode ser desfeita.')) return;
        setDelivering(true);
        try {
            await axios.post(`/api/pipeline/${userId}/deliver`, {}, { headers });
            showToast('Entregue com sucesso', 'success');
            fetchDetail();
        } catch (e: any) {
            showToast(e.response?.data?.message || 'Erro ao entregar', 'error');
        } finally { setDelivering(false); }
    };


    // FIX-PV-002: Save and deliver personalized feedback
    const saveFeedback = async () => {
        if (!feedbackText.trim()) {
            showToast('Escreva o feedback antes de salvar', 'error');
            return;
        }
        setSavingFeedback(true);
        try {
            await axios.post(`/api/admin/pipeline/${userId}/feedback`, { feedback: feedbackText.trim() }, { headers });
            showToast('Feedback salvo e entregue com sucesso', 'success');
            fetchDetail();
        } catch (e: any) {
            showToast(e.response?.data?.message || 'Erro ao salvar feedback', 'error');
        } finally { setSavingFeedback(false); }
    };

    // FIX-PV-005: Toggle asset visibility
    const toggleAssetsVisibility = async () => {
        if (!detail) return;
        const newValue = !detail.showAssetsToUser;
        // Optimistic update
        setDetail(prev => prev ? { ...prev, showAssetsToUser: newValue } : prev);
        setTogglingAssets(true);
        try {
            await axios.post(`/api/admin/pipeline/${userId}/toggle-assets-visibility`, { showAssetsToUser: newValue }, { headers });
            showToast(newValue ? 'Entregáveis visíveis para o usuário' : 'Entregáveis ocultos', 'success');
        } catch (e: any) {
            // Rollback
            setDetail(prev => prev ? { ...prev, showAssetsToUser: !newValue } : prev);
            showToast(e.response?.data?.message || 'Erro ao alterar visibilidade', 'error');
        } finally { setTogglingAssets(false); }
    };

    if (loading || !detail) {
        return (
            <div className="animate-pulse space-y-4 p-4">
                {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white/5 rounded-xl" />)}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button variant="link" size="sm" onClick={onBack}>
                    ← Voltar
                </Button>
                <div>
                    <h3 className="text-xl font-bold text-white">{detail.name}</h3>
                    <p className="text-sm text-white/50">{detail.email}</p>
                </div>
                <StatusBadge status={detail.diagnosticStatus} label={detail.diagnosticStatus === 'submitted' ? 'Enviado' : 'Em Progresso'} />
            </div>

            {/* Pipeline progress */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <h4 className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-4">Progresso do Pipeline</h4>
                <div className="flex flex-wrap gap-2">
                    {PIPELINE_STAGES.map((stage) => {
                        const state = getAdminStageState(stage.key, detail);
                        return (
                            <span key={stage.key} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                                state === 'completed' ? 'bg-green-600/20 text-green-400 border-green-600/30' :
                                state === 'active'    ? 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark border-prosperus-gold-dark/40 animate-pulse' :
                                'bg-white/5 text-white/50 border-white/10'
                            }`}>
                                {state === 'completed' ? '✓ ' : ''}{stage.label}
                            </span>
                        );
                    })}
                </div>
            </div>

            {/* FIX-PV-001: Priorities read-only section */}
            {detail.priorities && detail.priorities.selectedAreas?.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                    <h4 className="text-xs uppercase tracking-wider text-white/50 font-semibold">Prioridades do Usuário</h4>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-white/50">Nível:</span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                            detail.priorities.mentorLevel === 'starting' ? 'bg-blue-500/20 text-blue-400' :
                            detail.priorities.mentorLevel === 'scaling' ? 'bg-green-500/20 text-green-400' :
                            'bg-yellow-500/20 text-yellow-400'
                        }`}>
                            {detail.priorities.mentorLevel === 'starting' ? 'Iniciante' :
                             detail.priorities.mentorLevel === 'scaling' ? 'Escalando' : 'Crescimento'}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {detail.priorities.selectedAreas.map((area: any) => (
                            <span key={area.id} className={`text-xs px-3 py-1.5 rounded-lg border ${
                                area.isCustom
                                    ? 'bg-prosperus-gold-dark/10 border-prosperus-gold-dark/30 text-prosperus-gold-dark italic'
                                    : 'bg-white/5 border-white/10 text-white/70'
                            }`}>
                                {area.isCustom && '✨ '}{area.label}
                            </span>
                        ))}
                    </div>
                    {detail.priorities.freeformContext && (
                        <div className="bg-black/20 border border-white/5 rounded-lg px-3 py-2">
                            <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Contexto adicional</span>
                            <p className="text-xs text-white/60 mt-1">{detail.priorities.freeformContext}</p>
                        </div>
                    )}
                </div>
            )}

            {/* FIX-PV-002: Personalized Feedback section — always visible, always editable */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase tracking-wider text-white/50 font-semibold">Feedback Personalizado</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        detail.feedbackStatus === 'delivered'
                            ? 'bg-green-600/20 text-green-400'
                            : detail.feedbackStatus === 'in_analysis'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-white/10 text-white/40'
                    }`}>
                        {detail.feedbackStatus === 'delivered' ? 'Entregue' :
                         detail.feedbackStatus === 'in_analysis' ? 'Em análise' : 'Pendente'}
                    </span>
                </div>
                {detail.feedbackDeliveredAt && (
                    <p className="text-[10px] text-white/40">
                        Entregue em {new Date(detail.feedbackDeliveredAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
                <div className="space-y-2">
                    <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Escreva o feedback personalizado em markdown. Inclua: contextualização, pontos de melhoria, exemplos práticos, ferramentas sugeridas e próximos passos."
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 font-mono resize-none h-48 focus:outline-none focus:border-white/30"
                    />
                    <Button
                        variant="primary"
                        onClick={saveFeedback}
                        disabled={!feedbackText.trim() || savingFeedback}
                        loading={savingFeedback}
                    >
                        {savingFeedback ? 'Salvando...' : detail.feedbackStatus === 'delivered' ? 'Atualizar Feedback' : 'Salvar e Entregar Feedback'}
                    </Button>
                </div>
            </div>

            {/* Research */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase tracking-wider text-white/50 font-semibold">Etapa 2: Pesquisa de Mercado</h4>
                    <StatusBadge status={detail.researchStatus} />
                </div>
                {researchIsLegacyJson && (
                    <div className="bg-yellow-600/10 border border-yellow-600/30 rounded-lg px-4 py-3 text-sm text-yellow-400">
                        <p className="font-semibold mb-1">Pesquisa em formato legado (JSON)</p>
                        <p>Este usuário possui dados de pesquisa no formato JSON antigo. Para atualizar, cole um novo link abaixo e salve.</p>
                    </div>
                )}
                <div className="space-y-1">
                    <label className="text-xs text-white/50 font-semibold">Link da Pesquisa Aprofundada</label>
                    <input
                        type="url"
                        value={researchLink}
                        onChange={(e) => { setResearchLink(e.target.value); setResearchLinkError(''); }}
                        placeholder="https://docs.google.com/document/d/... ou link do Notion"
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-white/30"
                    />
                    {researchLinkError && (
                        <p className="text-red-400 text-xs">{researchLinkError}</p>
                    )}
                </div>
                <Button
                    variant="primary"
                    onClick={saveResearch}
                    disabled={!researchLink.trim() || savingResearch}
                    loading={savingResearch}
                >
                    {savingResearch ? 'Salvando...' : 'Salvar Link da Pesquisa'}
                </Button>
            </div>

            {/* Brand Brain */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase tracking-wider text-white/50 font-semibold">Etapa 3: Brand Brain</h4>
                    <StatusBadge status={detail.brandBrainStatus} />
                </div>

                <div className="bg-prosperus-gold-dark/10 border border-prosperus-gold-dark/30 rounded-lg px-4 py-3 text-sm text-prosperus-gold-dark">
                    <p className="font-semibold mb-1">Como usar esta seção:</p>
                    <p>Cole o markdown de cada seção diretamente nos 5 campos abaixo — sem precisar formatar como JSON. Use o toggle "Visualizar" para conferir a renderização antes de salvar.</p>
                </div>

                {/* 5 Markdown textareas — one per section */}
                <div className="space-y-4">
                    {BB_INPUT_SECTIONS.map((sec) => {
                        const isEmpty = !bbSections[sec.id]?.trim();
                        const isPreview = bbPreviewSection === sec.id;
                        const html = isPreview && bbSections[sec.id]
                            ? DOMPurify.sanitize(marked.parse(bbSections[sec.id]) as string)
                            : '';
                        const noteExpanded = bbExpandedNotes[sec.id] ?? false;
                        const hasNote = !!(expertNotes[sec.id]?.trim());
                        return (
                            <div key={sec.id} className={`border rounded-xl overflow-hidden transition ${isEmpty ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 bg-black/20'}`}>
                                {/* Section header row */}
                                <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm">{sec.icon}</span>
                                        <span className="text-xs font-semibold text-white/80">{sec.label}</span>
                                        {isEmpty && <span className="text-[10px] text-red-400 font-semibold">obrigatório</span>}
                                    </div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => setBbExpandedNotes(prev => ({ ...prev, [sec.id]: !prev[sec.id] }))}
                                            className={`px-2 py-1 rounded text-[10px] font-semibold transition ${
                                                hasNote
                                                    ? 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark'
                                                    : 'bg-white/5 text-white/40 hover:text-white/60'
                                            }`}
                                            title="Nota do especialista"
                                        >
                                            📋
                                        </button>
                                        <button
                                            onClick={() => setBbPreviewSection(isPreview ? null : sec.id)}
                                            disabled={!bbSections[sec.id]?.trim()}
                                            className={`px-2 py-1 rounded text-[10px] font-semibold transition disabled:opacity-30 disabled:cursor-not-allowed ${
                                                isPreview
                                                    ? 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark'
                                                    : 'bg-white/5 text-white/40 hover:text-white/60'
                                            }`}
                                        >
                                            {isPreview ? 'Editar' : 'Visualizar'}
                                        </button>
                                    </div>
                                </div>
                                {/* Textarea or preview */}
                                {isPreview ? (
                                    <div
                                        className={`px-4 py-3 min-h-[12rem] ${PROSE_CLASSES}`}
                                        dangerouslySetInnerHTML={{ __html: html }}
                                    />
                                ) : (
                                    <textarea
                                        value={bbSections[sec.id]}
                                        onChange={(e) => setBbSections(prev => ({ ...prev, [sec.id]: e.target.value }))}
                                        placeholder={sec.placeholder}
                                        className={`w-full bg-transparent px-3 py-2 text-xs text-white/70 font-mono resize-none h-48 focus:outline-none focus:bg-white/5 transition ${isEmpty ? 'placeholder:text-red-400/40' : 'placeholder:text-white/20'}`}
                                    />
                                )}
                                {/* Inline expert note (collapsible) */}
                                {noteExpanded && (
                                    <div className="border-t border-white/5 px-3 py-2 bg-prosperus-gold-dark/[0.03]">
                                        <label className="text-[10px] text-prosperus-gold-dark/70 font-semibold uppercase tracking-wider">Nota do Especialista</label>
                                        <textarea
                                            value={expertNotes[sec.id] || ''}
                                            onChange={(e) => setExpertNotes(prev => ({ ...prev, [sec.id]: e.target.value }))}
                                            placeholder="Ex: Ajustei esta seção com base nas respostas do diagnóstico..."
                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 mt-1 text-xs text-white/70 resize-none h-16 focus:outline-none focus:border-prosperus-gold-dark/30"
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Metadata (collapsible) */}
                <div className="border border-white/10 rounded-xl overflow-hidden">
                    <button
                        onClick={() => setBbMetaExpanded(v => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition text-left"
                    >
                        <span className="text-xs font-semibold text-white/50">Metadados (opcional)</span>
                        <span className="text-white/30 text-xs">{bbMetaExpanded ? '▲' : '▼'}</span>
                    </button>
                    {bbMetaExpanded && (
                        <div className="px-3 pb-3 space-y-2 border-t border-white/5">
                            <div className="space-y-1 mt-2">
                                <label className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Nome do Mentor</label>
                                <input
                                    type="text"
                                    value={bbMetaName}
                                    onChange={(e) => setBbMetaName(e.target.value)}
                                    placeholder="Nome do mentor"
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-white/30"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Nome do Programa</label>
                                <input
                                    type="text"
                                    value={bbMetaProgram}
                                    onChange={(e) => setBbMetaProgram(e.target.value)}
                                    placeholder="Nome do programa de mentoria"
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-white/30"
                                />
                            </div>
                            <p className="text-[10px] text-white/30">generatedAt e version são preenchidos automaticamente no save.</p>
                        </div>
                    )}
                </div>

                {!bbAllFilled && (
                    <p className="text-red-400 text-xs">Preencha todas as 5 seções para habilitar o save.</p>
                )}

                <Button
                    variant="primary"
                    onClick={saveBrandBrain}
                    disabled={!bbAllFilled || savingBb}
                    loading={savingBb}
                >
                    {savingBb ? 'Salvando...' : 'Salvar Brand Brain'}
                </Button>
            </div>

            {/* Educational Suggestions */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase tracking-wider text-white/50 font-semibold">Etapa 4: Sugestões Educacionais</h4>
                    {detail.educationalSuggestions && (
                        <span className="text-[10px] text-green-400 bg-green-600/20 px-2 py-0.5 rounded-full font-semibold">
                            salvo
                        </span>
                    )}
                </div>

                <div className="bg-prosperus-gold-dark/10 border border-prosperus-gold-dark/30 rounded-lg px-4 py-3 text-sm text-prosperus-gold-dark">
                    <p className="font-semibold mb-1">JSON de sugestões educacionais (Squad 2)</p>
                    <p>Cole o JSON com as 3 lentes: <code className="bg-black/20 px-1 rounded">marketing</code>, <code className="bg-black/20 px-1 rounded">vendas</code>, <code className="bg-black/20 px-1 rounded">modelo_de_negocios</code>. Cada lente deve ser um array de sugestões.</p>
                </div>

                <div className={`border rounded-xl overflow-hidden transition ${suggestionsError ? 'border-red-500/30 bg-red-500/5' : !suggestionsJson.trim() ? 'border-white/10 bg-black/20' : 'border-green-600/30 bg-green-900/5'}`}>
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">📚</span>
                            <span className="text-xs font-semibold text-white/80">Sugestões Educacionais JSON</span>
                        </div>
                        <button
                            onClick={() => {
                                const result = validateSuggestionsJson(suggestionsJson);
                                if (!result.valid) {
                                    setSuggestionsError(result.error!);
                                    setSuggestionsPreview(false);
                                } else {
                                    setSuggestionsError('');
                                    setSuggestionsPreview(v => !v);
                                }
                            }}
                            disabled={!suggestionsJson.trim()}
                            className={`px-2 py-1 rounded text-[10px] font-semibold transition disabled:opacity-30 disabled:cursor-not-allowed ${
                                suggestionsPreview
                                    ? 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark'
                                    : 'bg-white/5 text-white/40 hover:text-white/60'
                            }`}
                        >
                            {suggestionsPreview ? 'Editar' : 'Preview'}
                        </button>
                    </div>
                    {suggestionsPreview ? (
                        <div className="px-4 py-3 space-y-4">
                            {REQUIRED_LENSES.map((lens) => {
                                const parsed = JSON.parse(suggestionsJson);
                                const items: any[] = parsed[lens] || [];
                                return (
                                    <div key={lens} className="space-y-2">
                                        <h5 className="text-xs font-bold text-prosperus-gold-dark uppercase tracking-wider">{LENS_LABELS[lens]}</h5>
                                        {items.length === 0 ? (
                                            <p className="text-xs text-white/30 italic">Nenhuma sugestão nesta lente.</p>
                                        ) : (
                                            <ul className="space-y-1.5">
                                                {items.map((item, i) => (
                                                    <li key={i} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                                                        {typeof item === 'string' ? (
                                                            <p className="text-xs text-white/70">{item}</p>
                                                        ) : (
                                                            <div className="space-y-1">
                                                                {item.titulo && <p className="text-xs font-semibold text-white/90">{item.titulo}</p>}
                                                                {item.title && <p className="text-xs font-semibold text-white/90">{item.title}</p>}
                                                                {item.descricao && <p className="text-xs text-white/60">{item.descricao}</p>}
                                                                {item.description && <p className="text-xs text-white/60">{item.description}</p>}
                                                                {item.sugestao && <p className="text-xs text-white/60">{item.sugestao}</p>}
                                                            </div>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <textarea
                            value={suggestionsJson}
                            onChange={(e) => { setSuggestionsJson(e.target.value); setSuggestionsError(''); setSuggestionsPreview(false); }}
                            placeholder={'{\n  "marketing": [\n    { "titulo": "...", "descricao": "..." }\n  ],\n  "vendas": [...],\n  "modelo_de_negocios": [...]\n}'}
                            className="w-full bg-transparent px-3 py-2 text-xs text-white/70 font-mono resize-none h-48 focus:outline-none focus:bg-white/5 transition placeholder:text-white/20"
                        />
                    )}
                </div>

                {suggestionsError && (
                    <p className="text-red-400 text-xs">{suggestionsError}</p>
                )}

                <Button
                    variant="primary"
                    onClick={saveEducationalSuggestions}
                    disabled={!suggestionsJson.trim() || savingSuggestions}
                    loading={savingSuggestions}
                >
                    {savingSuggestions ? 'Salvando...' : 'Salvar Sugestões Educacionais'}
                </Button>
            </div>

            {/* FIX-PV-005: Asset visibility toggle */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase tracking-wider text-white/50 font-semibold">Visibilidade de Entregáveis</h4>
                    <button
                        onClick={toggleAssetsVisibility}
                        disabled={togglingAssets}
                        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50"
                        style={{ backgroundColor: detail.showAssetsToUser ? 'rgb(34 197 94 / 0.4)' : 'rgb(255 255 255 / 0.1)' }}
                    >
                        <span
                            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                                detail.showAssetsToUser ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
                <p className="text-xs text-white/50">
                    {detail.showAssetsToUser
                        ? 'Entregáveis visíveis para este usuário no menu lateral.'
                        : 'Entregáveis ocultos. Ative para que o usuário veja a seção "Meus Ativos".'}
                </p>
            </div>

            {/* Assets */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h4 className="text-xs uppercase tracking-wider text-white/50 font-semibold">Etapa 5: Entregáveis</h4>
                        <span className="text-xs text-white/50">
                            {ASSET_CATALOG.filter(e => assetContents[e.assetId]?.trim()).length}/{ASSET_CATALOG.length} preenchidos
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <StatusBadge status={detail.assetsStatus} />
                        {detail.assetsDeliveredAt && (
                            <span className="text-xs text-white/50">
                                Entregue em {new Date(detail.assetsDeliveredAt).toLocaleDateString('pt-BR')}
                            </span>
                        )}
                    </div>
                </div>

                <p className="text-sm text-white/50">Cole a saída em markdown de cada prompt diretamente no campo correspondente. O sistema empacota no formato JSON automaticamente.</p>

                <div className="space-y-3">
                    {ASSET_CATALOG.map((entry) => {
                        const content = assetContents[entry.assetId] || '';
                        const isFilled = content.trim().length > 0;
                        const isLandingPage = entry.assetId === 'landingPageCopy';
                        const effectiveMode = lpInputMode ?? 'markdown';
                        const isHtmlMode = isLandingPage && effectiveMode === 'html';
                        return (
                            <div key={entry.assetId} className={`border rounded-lg overflow-hidden transition ${isFilled ? 'border-green-600/30 bg-green-900/5' : 'border-white/10 bg-black/20'}`}>
                                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
                                    <span className="text-sm">{entry.icon}</span>
                                    <span className="text-xs font-semibold text-white/70">{entry.name}</span>
                                    <span className="text-[10px] text-white/50 bg-white/5 px-1.5 py-0.5 rounded">{entry.paradigm}</span>
                                    {/* LP-specific: Markdown/HTML toggle */}
                                    {isLandingPage && (
                                        <div className="flex gap-0.5 ml-2 bg-white/5 rounded p-0.5 border border-white/10">
                                            <button
                                                onClick={() => setLpInputMode('markdown')}
                                                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                                                    effectiveMode === 'markdown'
                                                        ? 'bg-emerald-500/20 text-emerald-400'
                                                        : 'text-white/40 hover:text-white/60'
                                                }`}
                                            >
                                                Markdown
                                            </button>
                                            <button
                                                onClick={() => setLpInputMode('html')}
                                                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                                                    effectiveMode === 'html'
                                                        ? 'bg-blue-500/20 text-blue-400'
                                                        : 'text-white/40 hover:text-white/60'
                                                }`}
                                            >
                                                HTML
                                            </button>
                                        </div>
                                    )}
                                    {isFilled && <span className="ml-auto text-[10px] text-green-400">preenchido</span>}
                                </div>
                                {/* HTML mode hint for landing page */}
                                {isHtmlMode && (
                                    <div className="px-3 py-1.5 bg-blue-500/5 border-b border-blue-500/10 text-[10px] text-blue-400/80">
                                        Modo HTML ativo — cole o codigo HTML completo da landing page. O viewer renderiza em iframe sandbox com DOMPurify.
                                    </div>
                                )}
                                <textarea
                                    value={content}
                                    onChange={(e) => setAssetContents(prev => ({ ...prev, [entry.assetId]: e.target.value }))}
                                    placeholder={isHtmlMode
                                        ? '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>...</head>\n<body>\n  <!-- Cole aqui o HTML completo da landing page -->\n</body>\n</html>'
                                        : `Cole aqui a saída markdown do prompt "${entry.name}"...`
                                    }
                                    className={`w-full bg-transparent px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:bg-white/5 ${
                                        isHtmlMode
                                            ? 'text-blue-300/70 h-48'
                                            : 'text-white/70 h-28'
                                    }`}
                                />
                            </div>
                        );
                    })}
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="primary"
                        onClick={saveAssets}
                        disabled={ASSET_CATALOG.filter(e => assetContents[e.assetId]?.trim()).length === 0 || savingAssets}
                        loading={savingAssets}
                    >
                        {savingAssets ? 'Salvando...' : 'Salvar Entregáveis'}
                    </Button>
                    {(detail.assetsStatus === 'ready' || detail.assetsStatus === 'delivered') && (
                        <Button
                            variant="outline"
                            onClick={deliver}
                            disabled={delivering}
                            loading={delivering}
                            className="!bg-green-600/20 !text-green-400 !border-green-600/30 hover:!bg-green-600/30"
                        >
                            {delivering ? 'Entregando...' : detail.assetsStatus === 'delivered' ? 'Re-entregar ao Mentor' : 'Entregar ao Mentor'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
