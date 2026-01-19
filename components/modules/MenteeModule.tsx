

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';

// --- TYPES ---

export interface DemographicProfile {
    detailedProfile: string;
    gender: 'male' | 'female' | 'mixed' | 'irrelevant' | '';
    ageRange: { min: number; max: number };
    locations: string[];
    digitalPresence: {
        platforms: string[];
        hoursPerDay: number;
        behavior: string;
    };
    maritalStatus: 'single' | 'married' | 'divorced' | 'irrelevant' | '';
    role: {
        category: string;
        area: string;
    };
}

export interface TransformationData {
    before: {
        metrics: string;
        context: string;
    };
    after: {
        metrics: string;
        context: string;
    };
}

export interface DecisionLayer {
    motivation: string;
    barriers: string;
    overcoming: string;
}

export interface JourneyStep {
    id: string;
    title: string;
    description: string;
}

export interface ConsumptionJourneyData {
    discoveryChannel: string; // Como conhece a marca (First Step)
    finalResult: string; // Resultado final / Recomendação (Last Step)
    steps: JourneyStep[];
}

export interface ArrowItem {
    id: string;
    text: string;
    x: number; // percentage relative to center (-50 to 50)
    y: number; // percentage relative to center (-50 to 50)
}

export interface ICPTarget {
    centerPhrase: string;
    arrows: ArrowItem[];
}

export interface Persona {
    id: string;
    name: string;
    description: string;
    currentSituation: string;
    problem: string;
    objective: string;
    differential: string;
    confidence: number; // 1-5
    x: number; // percentage relative to center
    y: number; // percentage relative to center
}

export interface EmpathyMap {
    whoIs: string;
    feelings: string;
    saysDoes: string;
    sees: string;
    hears: string;
    thinks: string;
    weaknesses: string;
    gains: string;
}

export interface FanHaterMap {
    fan: EmpathyMap | null;
    hater: EmpathyMap | null;
}

export interface CommunityImpactSection {
    positive: string; // Who In / Feelings
    definition: string; // Deprecated in UI but kept for type compatibility
    negative: string; // Who Out / Avoid Feelings
}

export interface CommunityImpactData {
    community: CommunityImpactSection;
    impact: CommunityImpactSection;
}

export interface ICPSynthesisData {
    phrase: string;
}

export interface MenteeData {
    hasClients: 'yes' | 'no' | null;
    demographics: DemographicProfile;
    transformation: TransformationData;
    decisionMountain: DecisionLayer;
    consumptionJourney: ConsumptionJourneyData;
    icpTarget: ICPTarget;
    personas: Persona[];
    fanHaterMap: FanHaterMap;
    communityImpact: CommunityImpactData;
    icpSynthesis: ICPSynthesisData;
}

export const INITIAL_MENTEE_DATA: MenteeData = {
    hasClients: null,
    demographics: {
        detailedProfile: '',
        gender: '',
        ageRange: { min: 25, max: 45 },
        locations: [],
        digitalPresence: {
            platforms: [],
            hoursPerDay: 2,
            behavior: ''
        },
        maritalStatus: '',
        role: { category: '', area: '' }
    },
    transformation: {
        before: { metrics: '', context: '' },
        after: { metrics: '', context: '' }
    },
    decisionMountain: {
        motivation: '',
        barriers: '',
        overcoming: ''
    },
    consumptionJourney: {
        discoveryChannel: '',
        finalResult: '',
        steps: []
    },
    icpTarget: {
        centerPhrase: '',
        arrows: []
    },
    personas: [],
    fanHaterMap: { fan: null, hater: null },
    communityImpact: {
        community: { positive: '', definition: '', negative: '' },
        impact: { positive: '', definition: '', negative: '' }
    },
    icpSynthesis: {
        phrase: ''
    }
};

interface MenteeModuleProps {
    data: MenteeData;
    onUpdate: (newData: MenteeData) => void;
    onSaveAndExit: () => void;
    onComplete?: () => void;
    isReadOnly?: boolean;
    savedStep?: number; // Etapa salva anteriormente
    onStepChange?: (step: number) => void; // Callback quando a etapa muda
}

// --- UTILS ---
const useAutoSave = (value: any, delay: number = 2000) => {
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [lastValue, setLastValue] = useState(JSON.stringify(value));

    useEffect(() => {
        const currentValue = JSON.stringify(value);
        if (currentValue !== lastValue) {
            setSaveStatus('saving');
            const handler = setTimeout(() => {
                setSaveStatus('saved');
                setLastValue(currentValue);
                setTimeout(() => setSaveStatus('idle'), 2000);
            }, delay);
            return () => clearTimeout(handler);
        }
    }, [value, delay, lastValue]);

    return saveStatus;
};

// --- STYLES ---
const verticalScrollbarStyles = "overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[#031A2B] [&::-webkit-scrollbar-thumb]:bg-[#CA9A43]/50 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#CA9A43]";
const horizontalScrollbarStyles = "overflow-x-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-[#031A2B] [&::-webkit-scrollbar-thumb]:bg-[#CA9A43]/50 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#CA9A43]";

const getInitialStep = (data: MenteeData): number => {
    if (!data.hasClients) return 1;

    if (data.hasClients === 'no') {
        if (!data.demographics.detailedProfile) return 2;
        if (!data.transformation.before.metrics) return 3;
        if (!data.decisionMountain.motivation) return 4;
        if (data.consumptionJourney.steps.length === 0) return 5;
        if (!data.icpTarget.centerPhrase) return 6;
        return 7; // Complete
    } else {
        if (data.personas.length === 0) return 2;
        if (!data.fanHaterMap.fan) return 3;
        if (!data.communityImpact.community.positive) return 4;
        if (!data.icpSynthesis.phrase) return 5;
        return 6; // Complete
    }
};

// --- SUB-COMPONENTS ---

const MenteeIntro: React.FC<{ onStart: () => void }> = ({ onStart }) => {
    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="min-h-full flex flex-col items-center justify-center text-center p-4 sm:p-6 md:p-16 animate-fadeIn">
                <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-[#CA9A43]/10 rounded-full flex items-center justify-center mb-4 sm:mb-6 md:mb-8 border border-[#CA9A43]/30 flex-shrink-0">
                    <i className="bi bi-people text-2xl sm:text-3xl md:text-4xl text-[#CA9A43]"></i>
                </div>

                <h2 className="font-serif text-2xl sm:text-3xl md:text-5xl text-white mb-4 sm:mb-6 md:mb-8">
                    O Mentorado
                </h2>

                <div className="max-w-2xl space-y-3 sm:space-y-4 md:space-y-6 text-gray-300 font-sans text-sm sm:text-base md:text-lg leading-relaxed mb-6 sm:mb-8 md:mb-10">
                    <p>
                        Este módulo é sobre quem está do outro lado: <strong className="text-white">o mentorado</strong>. As perguntas serão sobre se você já tem clientes, o quanto conhece esses clientes e, quando ainda não existe clareza, vamos desenhar juntos um primeiro cliente ideal para testar.
                    </p>
                    <p className="hidden sm:block">
                        O objetivo é descobrir quem é a pessoa que mais ganha com o que você faz, para alinhar método, comunicação e oferta com ela.
                    </p>
                    <p className="italic text-[#CA9A43] text-xs sm:text-sm md:text-base">
                        Quanto mais claro você for aqui, mais certeiro será o plano que vamos construir juntos depois.
                    </p>
                </div>

                <button
                    onClick={onStart}
                    className="bg-[#CA9A43] hover:bg-[#FFE39B] text-[#031A2B] font-bold py-2 px-6 sm:py-3 sm:px-8 md:py-4 md:px-10 rounded-sm uppercase tracking-widest transition-all shadow-lg hover:shadow-[#CA9A43]/20 flex-shrink-0 text-xs sm:text-sm md:text-base w-full sm:w-auto max-w-xs"
                >
                    Começar Diagnóstico
                </button>
            </div>
        </div>
    );
};


const SaveStatusIndicator = ({ status, lightMode }: { status: 'idle' | 'saving' | 'saved', lightMode?: boolean }) => {
    if (status === 'idle') return null;
    return (
        <div className={`flex items-center gap-2 text-[10px] sm:text-xs font-sans uppercase tracking-widest absolute top-3 right-3 sm:top-6 sm:right-6 px-2 sm:px-3 py-1 rounded-full border backdrop-blur-sm z-20 pointer-events-none transition-all duration-300
            ${lightMode ? 'bg-white/80 border-gray-200 text-gray-500' : 'bg-[#031A2B]/80 border-white/10'}
        `}>
            {status === 'saving' && (
                <>
                    <div className="w-2 h-2 rounded-full bg-[#CA9A43] animate-pulse"></div>
                    <span className="text-[#CA9A43] hidden sm:inline">Salvando...</span>
                    <span className="text-[#CA9A43] sm:hidden">...</span>
                </>
            )}
            {status === 'saved' && (
                <>
                    <span className="text-green-400 text-sm">✓</span>
                    <span className={`${lightMode ? 'text-gray-500' : 'text-gray-400'} hidden sm:inline`}>Salvo</span>
                </>
            )}
        </div>
    );
};

// Completion View (Tela de Sucesso/Envio)
const CompletionView: React.FC<{ onReview: () => void; onSend?: () => void; readOnly?: boolean }> = ({ onReview, onSend, readOnly }) => {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-4 sm:p-8">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, type: "spring" }}
                className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full border flex items-center justify-center mb-4 sm:mb-6 shadow-[0_0_30px_rgba(0,0,0,0.2)]
                    ${readOnly
                        ? 'bg-blue-500/10 border-blue-500 shadow-blue-500/20'
                        : 'bg-green-500/10 border-green-500 shadow-green-500/20'
                    }`}
            >
                {readOnly ? (
                    <i className="bi bi-file-earmark-lock text-4xl sm:text-5xl text-blue-500"></i>
                ) : (
                    <i className="bi bi-check-lg text-4xl sm:text-5xl text-green-500"></i>
                )}
            </motion.div>

            <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="font-serif text-2xl sm:text-3xl md:text-4xl text-white mb-3 sm:mb-4"
            >
                {readOnly ? 'Módulo em Análise' : 'Módulo Concluído!'}
            </motion.h2>

            <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-gray-400 max-w-md font-sans text-sm sm:text-base md:text-lg mb-6 sm:mb-8 leading-relaxed px-4"
            >
                {readOnly
                    ? 'Suas respostas foram enviadas e estão sendo analisadas pela nossa equipe.'
                    : 'Parabéns! Você definiu seu cliente ideal. Deseja enviar agora para avaliação ou apenas salvar?'
                }
            </motion.p>

            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto px-4"
            >
                <button
                    onClick={onReview}
                    className="px-4 sm:px-6 py-2 sm:py-3 border border-white/10 hover:bg-white/5 text-gray-300 rounded-sm font-bold text-xs sm:text-sm uppercase tracking-wider transition-colors"
                >
                    {readOnly ? 'Visualizar Respostas' : 'Revisar Respostas'}
                </button>

                {!readOnly && onSend && (
                    <button
                        onClick={onSend}
                        className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-green-600 to-green-500 text-white font-bold rounded-sm text-xs sm:text-sm uppercase tracking-wider shadow-lg hover:shadow-green-500/30 transition-all flex items-center justify-center gap-2"
                    >
                        Enviar para Avaliação <i className="bi bi-send-fill"></i>
                    </button>
                )}
            </motion.div>
        </div>
    );
};

// ... (ClientStatusSelection code remains same - omitted for brevity)
const ClientStatusSelection: React.FC<{
    data: MenteeData;
    onUpdate: (d: MenteeData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    const handleSelect = (status: 'yes' | 'no') => {
        if (readOnly) return;
        onUpdate({ ...data, hasClients: status });
    };

    return (
        <div className="max-w-5xl mx-auto h-full flex flex-col items-center justify-center pb-8 sm:pb-12 pt-6 sm:pt-8 overflow-y-auto custom-scrollbar">
            <div className="text-center mb-8 sm:mb-12 relative flex-shrink-0 px-4">
                <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl text-white font-bold leading-tight mb-3 sm:mb-4">
                    Você já tem clientes para o produto,<br className="hidden sm:block" /> serviço ou mentoria que oferece hoje?
                </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 w-full max-w-4xl mb-8 sm:mb-12 px-4">
                {/* Opção NÃO */}
                <motion.button
                    whileHover={!readOnly ? { y: -4, scale: 1.02 } : {}}
                    whileTap={!readOnly ? { scale: 0.98 } : {}}
                    onClick={() => handleSelect('no')}
                    disabled={readOnly}
                    className={`relative p-6 sm:p-8 rounded-2xl border-2 flex flex-col items-center justify-center text-center h-[200px] sm:h-[240px] transition-all duration-300 group
                        ${data.hasClients === 'no'
                            ? 'bg-red-500/10 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
                            : 'bg-[#081e30] border-white/5 hover:border-red-500/50'
                        }
                        ${readOnly && data.hasClients !== 'no' ? 'opacity-30 grayscale' : 'opacity-100'}
                    `}
                >
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-2xl sm:text-3xl mb-4 sm:mb-6 transition-colors
                        ${data.hasClients === 'no' ? 'bg-red-500 text-white' : 'bg-white/5 text-gray-500 group-hover:bg-red-500/20 group-hover:text-red-500'}
                    `}>
                        <i className="bi bi-people"></i>
                    </div>
                    <span className={`text-lg sm:text-xl font-bold transition-colors ${data.hasClients === 'no' ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}>
                        Não, ainda não tenho clientes
                    </span>
                    {data.hasClients === 'no' && (
                        <motion.div layoutId="check" className="absolute top-3 right-3 sm:top-4 sm:right-4 text-red-500">
                            <i className="bi bi-check-circle-fill text-xl sm:text-2xl"></i>
                        </motion.div>
                    )}
                </motion.button>

                {/* Opção SIM */}
                <motion.button
                    whileHover={!readOnly ? { y: -4, scale: 1.02 } : {}}
                    whileTap={!readOnly ? { scale: 0.98 } : {}}
                    onClick={() => handleSelect('yes')}
                    disabled={readOnly}
                    className={`relative p-6 sm:p-8 rounded-2xl border-2 flex flex-col items-center justify-center text-center h-[200px] sm:h-[240px] transition-all duration-300 group
                        ${data.hasClients === 'yes'
                            ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.2)]'
                            : 'bg-[#081e30] border-white/5 hover:border-emerald-500/50'
                        }
                        ${readOnly && data.hasClients !== 'yes' ? 'opacity-30 grayscale' : 'opacity-100'}
                    `}
                >
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-2xl sm:text-3xl mb-4 sm:mb-6 transition-colors
                        ${data.hasClients === 'yes' ? 'bg-emerald-500 text-white' : 'bg-white/5 text-gray-500 group-hover:bg-emerald-500/20 group-hover:text-emerald-500'}
                    `}>
                        <i className="bi bi-people-fill"></i>
                    </div>
                    <span className={`text-lg sm:text-xl font-bold transition-colors ${data.hasClients === 'yes' ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}>
                        Sim, já tenho clientes
                    </span>
                    {data.hasClients === 'yes' && (
                        <motion.div layoutId="check" className="absolute top-3 right-3 sm:top-4 sm:right-4 text-emerald-500">
                            <i className="bi bi-check-circle-fill text-xl sm:text-2xl"></i>
                        </motion.div>
                    )}
                </motion.button>
            </div>

            <AnimatePresence mode="wait">
                {data.hasClients && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center mb-6 sm:mb-8 px-4"
                    >
                        <p className={`text-base sm:text-lg font-medium ${data.hasClients === 'yes' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {data.hasClients === 'yes'
                                ? 'Ótimo! Vamos direcionar o conteúdo para escala e otimização.'
                                : 'Ótimo! Vamos direcionar o conteúdo para validação e primeiras vendas.'}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="bg-[#031A2B] border border-[#CA9A43]/20 rounded-lg p-3 sm:p-4 max-w-2xl flex items-start gap-3 sm:gap-4 mx-4">
                <div className="text-[#CA9A43] text-lg sm:text-xl mt-1 flex-shrink-0">
                    <i className="bi bi-info-circle"></i>
                </div>
                <div>
                    <h4 className="text-[#CA9A43] text-xs sm:text-sm font-bold uppercase tracking-widest mb-1">Por que isso importa?</h4>
                    <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
                        Essa resposta define sua jornada de aprendizado. Quem não tem clientes precisa construir o avatar do zero. Quem já tem clientes deve expandir seu radar para novas oportunidades.
                    </p>
                </div>
            </div>
        </div>
    );
};

// ... (DemographicWizard code remains same - omitted for brevity)
const DemographicWizard: React.FC<{
    data: MenteeData;
    onUpdate: (d: MenteeData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    const [wizardStep, setWizardStep] = useState(0); // 0 = Intro, 1-7 = Questions, 8 = Review
    const [locationInput, setLocationInput] = useState('');
    const [showExamples, setShowExamples] = useState(false);
    const saveStatus = useAutoSave(data.demographics);
    const totalQuestions = 7;

    const updateDemo = <K extends keyof DemographicProfile>(key: K, value: DemographicProfile[K]) => {
        if (readOnly) return;
        onUpdate({
            ...data,
            demographics: {
                ...data.demographics,
                [key]: value
            }
        });
    };

    const addLocation = () => {
        if (locationInput && !data.demographics.locations.includes(locationInput)) {
            updateDemo('locations', [...data.demographics.locations, locationInput]);
            setLocationInput('');
        }
    };

    const togglePlatform = (p: string) => {
        if (readOnly) return;
        const current = data.demographics.digitalPresence.platforms;
        const updated = current.includes(p) ? current.filter(x => x !== p) : [...current, p];
        updateDemo('digitalPresence', { ...data.demographics.digitalPresence, platforms: updated });
    };

    const handleNext = () => {
        if (wizardStep < 8) setWizardStep(wizardStep + 1);
    };

    const handlePrev = () => {
        if (wizardStep > 0) setWizardStep(wizardStep - 1);
    };

    const validateStep = (step: number) => {
        if (readOnly) return true;
        switch (step) {
            case 1: return data.demographics.detailedProfile.length > 20;
            case 2: return !!data.demographics.gender;
            case 3: return true; // Slider always has a value
            case 4: return data.demographics.locations.length > 0;
            case 5: return data.demographics.digitalPresence.platforms.length > 0;
            case 6: return !!data.demographics.maritalStatus;
            case 7: return !!data.demographics.role.category;
            default: return true;
        }
    };

    // INTRO SCREEN
    if (wizardStep === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 text-center animate-fadeIn">
                <div className="max-w-3xl">
                    <h2 className="font-serif text-2xl sm:text-3xl md:text-5xl text-white mb-3 sm:mb-4">Dados Demográficos</h2>
                    <p className="text-lg sm:text-xl md:text-2xl text-gray-400 mb-6 sm:mb-8 font-serif italic">"Quem são essas pessoas? Como vivem? O que têm em comum?"</p>

                    <div className="bg-[#031A2B] border border-[#CA9A43] p-4 sm:p-6 md:p-8 rounded-xl mb-6 sm:mb-8 md:mb-10 shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-[#CA9A43]"></div>
                        <p className="text-white text-sm sm:text-base md:text-lg leading-relaxed">
                            <span className="text-[#CA9A43] font-bold block mb-2 text-xs sm:text-sm uppercase tracking-widest">Missão</span>
                            Pense nos seus melhores clientes, aqueles que deram certo com você. Vamos descrever quem são essas pessoas em detalhes para que você possa encontrar mais delas.
                        </p>
                    </div>

                    <button
                        onClick={handleNext}
                        className="bg-[#CA9A43] text-[#031A2B] font-bold py-3 px-6 sm:py-4 sm:px-10 rounded-full text-sm sm:text-base md:text-lg uppercase tracking-widest hover:bg-[#FFE39B] hover:scale-105 transition-all shadow-[0_0_30px_rgba(202,154,67,0.3)] w-full sm:w-auto"
                    >
                        Iniciar Mapeamento <i className="bi bi-arrow-right ml-2"></i>
                    </button>
                </div>
            </div>
        );
    }

    // REVIEW SCREEN
    if (wizardStep === 8) {
        return (
            <div className={`h-full flex flex-col max-w-4xl mx-auto w-full px-4 pt-4 pb-8 ${verticalScrollbarStyles}`}>
                <div className="text-center mb-8">
                    <h2 className="font-serif text-3xl text-white mb-2">Resumo do Perfil Demográfico</h2>
                    <p className="text-gray-400 text-sm">Confira os dados mapeados antes de prosseguir.</p>
                </div>

                <div className="space-y-4 flex-1">
                    {[
                        { title: '1. Perfil Detalhado', value: data.demographics.detailedProfile, step: 1 },
                        { title: '2. Gênero', value: data.demographics.gender === 'male' ? 'Masculino' : data.demographics.gender === 'female' ? 'Feminino' : data.demographics.gender === 'mixed' ? 'Misto' : 'Não importa', step: 2 },
                        { title: '3. Faixa Etária', value: `${data.demographics.ageRange.min} - ${data.demographics.ageRange.max} anos`, step: 3 },
                        { title: '4. Localização', value: data.demographics.locations.join(', '), step: 4 },
                        { title: '5. Presença Digital', value: `${data.demographics.digitalPresence.platforms.join(', ')} (${data.demographics.digitalPresence.hoursPerDay}h/dia)`, step: 5 },
                        { title: '6. Estado Civil', value: data.demographics.maritalStatus === 'single' ? 'Solteiro(a)' : data.demographics.maritalStatus === 'married' ? 'Casado(a)' : 'Outro', step: 6 },
                        { title: '7. Cargo/Função', value: `${data.demographics.role.category} - ${data.demographics.role.area}`, step: 7 },
                    ].map((item, i) => (
                        <div key={i} className="bg-[#081e30] border border-white/5 p-6 rounded-lg flex justify-between items-start group hover:border-white/20 transition-colors">
                            <div>
                                <h4 className="text-[#CA9A43] text-xs font-bold uppercase tracking-widest mb-2">{item.title}</h4>
                                <p className="text-gray-300 text-sm line-clamp-2">{item.value || 'Não preenchido'}</p>
                            </div>
                            <button onClick={() => setWizardStep(item.step)} className="text-gray-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                                <i className="bi bi-pencil"></i>
                            </button>
                        </div>
                    ))}
                </div>

                <div className="mt-8 flex justify-center">
                    <div className="flex gap-4">
                        <button onClick={() => setWizardStep(7)} className="px-6 py-3 border border-white/10 text-gray-400 hover:text-white rounded-lg font-bold text-sm uppercase tracking-wider">
                            Voltar
                        </button>
                        <button className="bg-[#10B981] text-white font-bold py-3 px-8 rounded-lg text-sm uppercase tracking-widest hover:bg-[#059669] shadow-lg flex items-center gap-2 cursor-default">
                            <i className="bi bi-check-circle-fill"></i> Perfil Confirmado
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // QUESTIONS WIZARD
    return (
        <div className="h-full flex flex-col max-w-4xl mx-auto w-full relative">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}

            {/* Progress Bar */}
            <div className="w-full h-1 bg-white/5 mb-8 mt-2 relative">
                <div
                    className="absolute top-0 left-0 h-full bg-[#CA9A43] transition-all duration-500 ease-out"
                    style={{ width: `${(wizardStep / 7) * 100}%` }}
                ></div>
                <div className="absolute right-0 -top-6 text-xs text-[#CA9A43] font-bold">
                    Pergunta {wizardStep} de 7
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 flex flex-col justify-center">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={wizardStep}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="w-full bg-[#081e30] border border-white/5 rounded-2xl p-8 md:p-10 shadow-lg relative min-h-[400px] flex flex-col justify-center"
                    >
                        <div className="absolute top-6 left-6 w-8 h-8 rounded-full bg-[#3B82F6] text-white flex items-center justify-center font-bold text-sm">
                            {wizardStep}
                        </div>

                        {/* QUESTION 1: DETAILED PROFILE */}
                        {wizardStep === 1 && (
                            <div className="mt-8">
                                <label className="block text-xl md:text-2xl font-serif text-white mb-2 font-semibold">Descreva com o máximo de detalhes quem é o seu cliente ideal</label>
                                <p className="text-gray-400 text-sm mb-6 leading-relaxed">O que ele fala, o que faz no dia a dia, com quem anda, seus medos, fraquezas e frustrações.</p>

                                <div className="mb-4">
                                    <button onClick={() => setShowExamples(!showExamples)} className="text-[#CA9A43] text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:text-white transition-colors mb-2">
                                        <i className="bi bi-lightbulb-fill"></i> {showExamples ? 'Ocultar Dicas' : 'Ver Dicas & Exemplos'}
                                    </button>
                                    <AnimatePresence>
                                        {showExamples && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-[#031A2B] border border-white/10 p-4 rounded-lg text-sm text-gray-300 overflow-hidden">
                                                <p className="mb-2"><strong>💡 Pense em:</strong> Rotina matinal, pressões no trabalho, o que tira o sono dele, o que ele sonha em comprar/conquistar.</p>
                                                <p className="italic">Ex: "João, 40 anos, empresário. Sente culpa por não ver os filhos crescerem. No trabalho, finge ter controle, mas vive apagando incêndio..."</p>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <textarea
                                    value={data.demographics.detailedProfile}
                                    onChange={(e) => updateDemo('detailedProfile', e.target.value)}
                                    placeholder="Comece descrevendo um dia típico na vida dele..."
                                    className={`w-full h-64 bg-[#051522] border p-6 text-white text-base rounded-lg resize-none outline-none transition-all
                                        ${readOnly ? 'border-transparent cursor-not-allowed opacity-70' : 'border-white/10 focus:border-[#CA9A43] focus:ring-1 focus:ring-[#CA9A43]'}
                                    `}
                                />
                                <div className={`text-right text-xs mt-2 font-bold ${data.demographics.detailedProfile.length < 100 ? 'text-red-400' : 'text-[#10B981]'}`}>
                                    {data.demographics.detailedProfile.length} caracteres (Mín. 100)
                                </div>
                            </div>
                        )}

                        {/* QUESTION 2: GENDER */}
                        {wizardStep === 2 && (
                            <div className="mt-4 text-center">
                                <label className="block text-2xl font-serif text-white mb-10 font-semibold">Qual é o gênero mais comum?</label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {[
                                        { id: 'male', label: 'Masculino', icon: 'bi-gender-male' },
                                        { id: 'female', label: 'Feminino', icon: 'bi-gender-female' },
                                        { id: 'mixed', label: 'Misto', icon: 'bi-gender-ambiguous' },
                                        { id: 'irrelevant', label: 'Não importa', icon: 'bi-dash-circle' }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => updateDemo('gender', opt.id as any)}
                                            disabled={readOnly}
                                            className={`p-6 rounded-xl border-2 flex flex-col items-center gap-4 transition-all duration-200 h-40 justify-center
                                                ${data.demographics.gender === opt.id
                                                    ? 'border-[#10B981] bg-[#10B981]/10 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)] scale-105'
                                                    : 'border-white/5 bg-[#051522] text-gray-500 hover:border-white/20 hover:text-gray-300'
                                                }
                                            `}
                                        >
                                            <i className={`bi ${opt.icon} text-4xl`}></i>
                                            <span className="font-bold text-sm uppercase tracking-wider">{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* QUESTION 3: AGE RANGE */}
                        {wizardStep === 3 && (
                            <div className="mt-4 text-center w-full max-w-2xl mx-auto">
                                <label className="block text-2xl font-serif text-white mb-2 font-semibold">Qual faixa de idade?</label>
                                <p className="text-gray-400 text-sm mb-12">Arraste os controles para definir a mínima e a máxima.</p>

                                <div className="bg-[#051522] border border-white/10 p-10 rounded-xl shadow-inner relative">
                                    <div className="text-[#CA9A43] font-bold text-3xl mb-12 flex items-center justify-center gap-4">
                                        <span>{data.demographics.ageRange.min}</span>
                                        <span className="text-gray-600 text-xl">até</span>
                                        <span>{data.demographics.ageRange.max} anos</span>
                                    </div>

                                    <div className="relative h-2 bg-gray-700 rounded-full mb-8">
                                        {/* Range Track Visual */}
                                        <div
                                            className="absolute h-full bg-gradient-to-r from-[#3B82F6] to-[#10B981] rounded-full opacity-80"
                                            style={{
                                                left: `${((data.demographics.ageRange.min - 18) / (80 - 18)) * 100}%`,
                                                right: `${100 - ((data.demographics.ageRange.max - 18) / (80 - 18)) * 100}%`
                                            }}
                                        ></div>

                                        {/* Inputs overlaid */}
                                        <input
                                            type="range"
                                            min="18" max="80"
                                            value={data.demographics.ageRange.min}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (val < data.demographics.ageRange.max) updateDemo('ageRange', { ...data.demographics.ageRange, min: val });
                                            }}
                                            className="absolute w-full h-full opacity-0 cursor-pointer z-20 top-0 left-0"
                                        />
                                        <input
                                            type="range"
                                            min="18" max="80"
                                            value={data.demographics.ageRange.max}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (val > data.demographics.ageRange.min) updateDemo('ageRange', { ...data.demographics.ageRange, max: val });
                                            }}
                                            className="absolute w-full h-full opacity-0 cursor-pointer z-20 top-0 left-0"
                                        />

                                        {/* Custom Thumbs (Visual Only, positioned by percentages) */}
                                        <div
                                            className="absolute w-6 h-6 bg-white border-2 border-[#3B82F6] rounded-full shadow-lg top-1/2 -translate-y-1/2 pointer-events-none z-10"
                                            style={{ left: `calc(${((data.demographics.ageRange.min - 18) / (80 - 18)) * 100}% - 12px)` }}
                                        ></div>
                                        <div
                                            className="absolute w-6 h-6 bg-white border-2 border-[#10B981] rounded-full shadow-lg top-1/2 -translate-y-1/2 pointer-events-none z-10"
                                            style={{ left: `calc(${((data.demographics.ageRange.max - 18) / (80 - 18)) * 100}% - 12px)` }}
                                        ></div>
                                    </div>

                                    <div className="flex justify-between text-xs text-gray-500 font-bold uppercase tracking-widest px-1">
                                        <span>18 Anos</span>
                                        <span>80+ Anos</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* QUESTION 4: LOCATION */}
                        {wizardStep === 4 && (
                            <div className="mt-8">
                                <label className="block text-2xl font-serif text-white mb-2 font-semibold">Onde esses clientes vivem ou atuam?</label>
                                <p className="text-gray-400 text-sm mb-6">Cidade, Região ou País. Digite e pressione Enter.</p>

                                <div className="flex gap-4 mb-6">
                                    <div className="relative flex-1">
                                        <i className="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"></i>
                                        <input
                                            value={locationInput}
                                            onChange={(e) => setLocationInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addLocation()}
                                            placeholder="Ex: São Paulo, Brasil..."
                                            disabled={readOnly}
                                            className="w-full bg-[#051522] border border-white/10 p-4 pl-12 text-white rounded-lg outline-none focus:border-[#CA9A43] transition-all"
                                        />
                                    </div>
                                    <button
                                        onClick={addLocation}
                                        disabled={readOnly || !locationInput}
                                        className="bg-[#051522] text-[#CA9A43] border border-[#CA9A43] font-bold px-6 rounded-lg hover:bg-[#CA9A43] hover:text-[#031A2B] transition-all disabled:opacity-50"
                                    >
                                        Adicionar
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-3 min-h-[100px] p-4 bg-[#051522]/50 rounded-lg border border-white/5">
                                    {data.demographics.locations.length === 0 && <span className="text-gray-600 text-sm italic">Nenhuma localização adicionada ainda.</span>}
                                    {data.demographics.locations.map((loc, i) => (
                                        <motion.span
                                            key={i}
                                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                                            className="bg-[#3B82F6]/20 border border-[#3B82F6]/50 px-4 py-2 rounded-full text-white text-sm flex items-center gap-2 group"
                                        >
                                            <i className="bi bi-geo-alt-fill text-[#3B82F6]"></i> {loc}
                                            {!readOnly && (
                                                <button onClick={() => updateDemo('locations', data.demographics.locations.filter(l => l !== loc))} className="hover:text-red-400 ml-1">
                                                    <i className="bi bi-x-circle-fill"></i>
                                                </button>
                                            )}
                                        </motion.span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* QUESTION 5: DIGITAL PRESENCE */}
                        {wizardStep === 5 && (
                            <div className="mt-4">
                                <label className="block text-2xl font-serif text-white mb-8 text-center font-semibold">Como é a presença digital deles?</label>

                                <div className="grid gap-6">
                                    {/* Platforms */}
                                    <div className="bg-[#051522] border border-white/10 p-6 rounded-xl">
                                        <label className="text-gray-400 text-xs font-bold uppercase mb-4 block">Plataformas Principais</label>
                                        <div className="flex flex-wrap gap-3">
                                            {['Instagram', 'LinkedIn', 'Facebook', 'TikTok', 'YouTube', 'Twitter', 'WhatsApp'].map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => togglePlatform(p)}
                                                    disabled={readOnly}
                                                    className={`px-4 py-2 rounded-full border text-sm transition-all flex items-center gap-2
                                                        ${data.demographics.digitalPresence.platforms.includes(p)
                                                            ? 'bg-[#CA9A43] border-[#CA9A43] text-[#031A2B] font-bold'
                                                            : 'bg-transparent border-white/10 text-gray-400 hover:border-white/30'
                                                        }`}
                                                >
                                                    {data.demographics.digitalPresence.platforms.includes(p) && <i className="bi bi-check-circle-fill"></i>}
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-6">
                                        {/* Hours */}
                                        <div className="bg-[#051522] border border-white/10 p-6 rounded-xl flex flex-col justify-center">
                                            <label className="text-gray-400 text-xs font-bold uppercase mb-4 block flex justify-between">
                                                <span>Tempo Online (h/dia)</span>
                                                <span className="text-white text-lg">{data.demographics.digitalPresence.hoursPerDay}h</span>
                                            </label>
                                            <input
                                                type="range" min="0" max="12"
                                                value={data.demographics.digitalPresence.hoursPerDay}
                                                onChange={(e) => updateDemo('digitalPresence', { ...data.demographics.digitalPresence, hoursPerDay: parseInt(e.target.value) })}
                                                disabled={readOnly}
                                                className="w-full accent-[#CA9A43] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <div className="flex justify-between text-[10px] text-gray-600 mt-2 font-bold uppercase">
                                                <span>Offline</span>
                                                <span>Viciado</span>
                                            </div>
                                        </div>

                                        {/* Behavior */}
                                        <div className="bg-[#051522] border border-white/10 p-6 rounded-xl">
                                            <label className="text-gray-400 text-xs font-bold uppercase mb-2 block">Comportamento Específico</label>
                                            <textarea
                                                value={data.demographics.digitalPresence.behavior}
                                                onChange={(e) => updateDemo('digitalPresence', { ...data.demographics.digitalPresence, behavior: e.target.value })}
                                                placeholder="Ex: Só vê stories, não posta nada..."
                                                disabled={readOnly}
                                                className="w-full bg-transparent border-b border-white/10 p-2 text-white text-sm h-20 resize-none outline-none focus:border-[#CA9A43] placeholder:text-gray-700"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* QUESTION 6: MARITAL STATUS */}
                        {wizardStep === 6 && (
                            <div className="mt-8 text-center max-w-xl mx-auto">
                                <label className="block text-2xl font-serif text-white mb-10 font-semibold">Qual o estado civil mais comum?</label>
                                <div className="flex flex-col gap-3">
                                    {[
                                        { id: 'single', label: 'Solteiro(a)' },
                                        { id: 'married', label: 'Casado(a)' },
                                        { id: 'divorced', label: 'Divorciado(a)' },
                                        { id: 'irrelevant', label: 'Não Relevante' }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => updateDemo('maritalStatus', opt.id as any)}
                                            disabled={readOnly}
                                            className={`w-full p-4 rounded-full border text-left flex justify-between items-center transition-all px-8
                                                ${data.demographics.maritalStatus === opt.id
                                                    ? 'bg-[#3B82F6]/20 border-[#3B82F6] text-white shadow-lg'
                                                    : 'bg-[#051522] border-white/10 text-gray-400 hover:bg-white/5 hover:border-white/30'
                                                }`}
                                        >
                                            <span className="font-bold tracking-wide">{opt.label}</span>
                                            {data.demographics.maritalStatus === opt.id && <i className="bi bi-check-circle-fill text-[#3B82F6]"></i>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* QUESTION 7: ROLE */}
                        {wizardStep === 7 && (
                            <div className="mt-8 text-center max-w-2xl mx-auto">
                                <label className="block text-2xl font-serif text-white mb-2 font-semibold">Qual cargo, função ou papel eles ocupam?</label>
                                <p className="text-gray-400 text-sm mb-10">Selecione a categoria e especifique a área.</p>

                                <div className="bg-[#051522] border border-white/10 p-8 rounded-xl space-y-6 shadow-inner">
                                    <div>
                                        <label className="block text-left text-gray-500 text-xs font-bold uppercase mb-2 ml-1">Categoria Principal</label>
                                        <select
                                            value={data.demographics.role.category}
                                            onChange={(e) => updateDemo('role', { ...data.demographics.role, category: e.target.value })}
                                            disabled={readOnly}
                                            className="w-full bg-[#081e30] border border-white/10 p-4 text-white rounded-lg outline-none focus:border-[#CA9A43] appearance-none"
                                        >
                                            <option value="">Selecione...</option>
                                            <option value="Dono/Empresário">👔 Dono/Empresário</option>
                                            <option value="Gestor/Líder">📊 Gestor/Líder</option>
                                            <option value="Autônomo">💼 Autônomo/Freelancer</option>
                                            <option value="Especialista">🎓 Especialista/Consultor</option>
                                            <option value="CLT">📋 CLT/Funcionário</option>
                                            <option value="Outro">🎯 Outro</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-left text-gray-500 text-xs font-bold uppercase mb-2 ml-1">Área de Atuação</label>
                                        <input
                                            value={data.demographics.role.area}
                                            onChange={(e) => updateDemo('role', { ...data.demographics.role, area: e.target.value })}
                                            disabled={readOnly}
                                            placeholder="Ex: Marketing, TI, Vendas, Saúde..."
                                            className="w-full bg-[#081e30] border border-white/10 p-4 text-white rounded-lg outline-none focus:border-[#CA9A43]"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Navigation Footer */}
            <div className="p-4 flex justify-between items-center border-t border-white/5 bg-[#031A2B]">
                <button
                    onClick={handlePrev}
                    className={`text-gray-400 hover:text-white px-4 py-2 font-bold uppercase text-sm tracking-wider flex items-center gap-2 ${wizardStep === 1 ? 'invisible' : ''}`}
                >
                    <i className="bi bi-arrow-left"></i> Anterior
                </button>
                <button
                    onClick={handleNext}
                    disabled={!validateStep(wizardStep)}
                    className="bg-[#CA9A43] text-[#031A2B] font-bold py-3 px-8 rounded-full uppercase tracking-widest text-sm hover:bg-[#FFE39B] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                    {wizardStep === 7 ? 'Revisar' : 'Próximo'} <i className="bi bi-arrow-right"></i>
                </button>
            </div>
        </div>
    );
};

// ... (TransformationComparison code remains same - omitted for brevity)
const TransformationComparison: React.FC<{
    data: MenteeData;
    onUpdate: (d: MenteeData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    const saveStatus = useAutoSave(data.transformation);

    const updateTrans = <K extends keyof TransformationData, F extends keyof TransformationData[K]>(side: K, field: F, value: string) => {
        if (readOnly) return;
        onUpdate({
            ...data,
            transformation: { ...data.transformation, [side]: { ...data.transformation[side], [field]: value } }
        });
    };

    return (
        <div className="h-full flex flex-col max-w-7xl mx-auto w-full px-4">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="text-center mb-8 flex-shrink-0"><h2 className="font-serif text-3xl text-white font-bold mb-2">A Transformação do Cliente</h2><p className="text-gray-400 text-sm">Descreva o ponto de partida e o ponto de chegada.</p></div>
            <div className="flex-1 grid lg:grid-cols-2 gap-8 overflow-y-auto custom-scrollbar pb-8">
                <div className="flex flex-col gap-6">
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-t-2xl p-6 border-b border-white/5 relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-1 bg-slate-500"></div><h3 className="text-3xl font-bold text-slate-400 text-center mb-2">ANTES</h3><p className="text-slate-300 text-center text-sm">Como estão antes de te contratar</p></div>
                    <div className="bg-[#081e30] border border-slate-700/30 p-6 rounded-lg flex-1 flex flex-col gap-6">
                        <div className="flex-1 flex flex-col">
                            <label className="text-slate-400 text-xs font-bold uppercase mb-2 flex justify-between"><span>Métricas (Situação Real)</span><i className="bi bi-bar-chart"></i></label>
                            <textarea value={data.transformation.before.metrics} onChange={e => updateTrans('before', 'metrics', e.target.value)} disabled={readOnly} placeholder="Números que mostram a situação real naquele momento." className={`flex-1 w-full bg-[#051522] border border-slate-800 p-4 text-white text-sm rounded outline-none resize-none focus:border-slate-500 transition-colors ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`} />
                            <div className={`text-right text-[10px] mt-1 ${data.transformation.before.metrics.length >= 10 ? 'text-green-500' : 'text-slate-500'}`}>{data.transformation.before.metrics.length}/10</div>
                        </div>
                        <div className="flex-1 flex flex-col">
                            <label className="text-slate-400 text-xs font-bold uppercase mb-2 flex justify-between"><span>Contexto (Sentimentos/Dores)</span><i className="bi bi-chat-quote"></i></label>
                            <textarea value={data.transformation.before.context} onChange={e => updateTrans('before', 'context', e.target.value)} disabled={readOnly} placeholder="Ex: Sentia-se sobrecarregado, inseguro..." className={`flex-1 w-full bg-[#051522] border border-slate-800 p-4 text-white text-sm rounded outline-none resize-none focus:border-slate-500 transition-colors ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`} />
                            <div className={`text-right text-[10px] mt-1 ${data.transformation.before.context.length >= 10 ? 'text-green-500' : 'text-slate-500'}`}>{data.transformation.before.context.length}/10</div>
                        </div>
                    </div>
                </div>
                <div className="hidden lg:flex absolute left-1/2 top-[180px] bottom-[100px] -translate-x-1/2 w-[2px] bg-gradient-to-b from-transparent via-white/10 to-transparent items-center justify-center z-10 pointer-events-none"><div className="w-10 h-10 rounded-full bg-[#031A2B] border border-white/20 flex items-center justify-center text-white/50 font-bold text-xs">VS</div></div>
                <div className="flex flex-col gap-6">
                    <div className="bg-gradient-to-br from-emerald-900 to-emerald-950 rounded-t-2xl p-6 border-b border-white/5 relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div><h3 className="text-3xl font-bold text-emerald-500 text-center mb-2">DEPOIS</h3><p className="text-emerald-200/70 text-center text-sm">A transformação após sua mentoria</p></div>
                    <div className="bg-[#081e30] border border-emerald-900/30 p-6 rounded-lg flex-1 flex flex-col gap-6 shadow-[0_0_50px_rgba(16,185,129,0.05)]">
                        <div className="flex-1 flex flex-col">
                            <label className="text-emerald-500 text-xs font-bold uppercase mb-2 flex justify-between"><span>Novas Métricas (Resultados)</span><i className="bi bi-graph-up-arrow"></i></label>
                            <textarea value={data.transformation.after.metrics} onChange={e => updateTrans('after', 'metrics', e.target.value)} disabled={readOnly} placeholder="Números ou indicadores que mostram a evolução." className={`flex-1 w-full bg-[#051522] border border-emerald-900/50 p-4 text-white text-sm rounded outline-none resize-none focus:border-emerald-500 transition-colors ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`} />
                            <div className={`text-right text-[10px] mt-1 ${data.transformation.after.metrics.length >= 10 ? 'text-green-500' : 'text-emerald-800'}`}>{data.transformation.after.metrics.length}/10</div>
                        </div>
                        <div className="flex-1 flex flex-col">
                            <label className="text-emerald-500 text-xs font-bold uppercase mb-2 flex justify-between"><span>Novo Contexto (Benefícios)</span><i className="bi bi-stars"></i></label>
                            <textarea value={data.transformation.after.context} onChange={e => updateTrans('after', 'context', e.target.value)} disabled={readOnly} placeholder="Ex: Confiança para liderar, paz mental..." className={`flex-1 w-full bg-[#051522] border border-emerald-900/50 p-4 text-white text-sm rounded outline-none resize-none focus:border-emerald-500 transition-colors ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`} />
                            <div className={`text-right text-[10px] mt-1 ${data.transformation.after.context.length >= 10 ? 'text-green-500' : 'text-emerald-800'}`}>{data.transformation.after.context.length}/10</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- CONSUMPTION JOURNEY (STEP 8.1.c) ---
const ConsumptionJourney: React.FC<{
    data: MenteeData;
    onUpdate: (d: MenteeData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    const steps = Array.isArray(data.consumptionJourney.steps) ? data.consumptionJourney.steps : [];

    // Auto-save logic
    const saveStatus = useAutoSave(data.consumptionJourney);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Update Discovery Channel
    const updateDiscovery = (val: string) => {
        if (readOnly) return;
        onUpdate({
            ...data,
            consumptionJourney: {
                ...data.consumptionJourney,
                discoveryChannel: val
            }
        });
    };

    const updateFinalResult = (val: string) => {
        if (readOnly) return;
        onUpdate({
            ...data,
            consumptionJourney: {
                ...data.consumptionJourney,
                finalResult: val
            }
        });
    };

    const addStep = () => {
        if (readOnly) return;
        const newStep: JourneyStep = {
            id: Date.now().toString(),
            title: '',
            description: ''
        };
        const updatedSteps = [...steps, newStep];
        onUpdate({
            ...data,
            consumptionJourney: { ...data.consumptionJourney, steps: updatedSteps }
        });

        // Scroll to the new card
        setTimeout(() => {
            if (scrollRef.current) {
                const scrollWidth = scrollRef.current.scrollWidth;
                scrollRef.current.scrollTo({ left: scrollWidth, behavior: 'smooth' });
            }
        }, 100);
    };

    const updateStep = (id: string, field: keyof JourneyStep, value: string) => {
        if (readOnly) return;
        const updatedSteps = steps.map(s => s.id === id ? { ...s, [field]: value } : s);
        onUpdate({
            ...data,
            consumptionJourney: { ...data.consumptionJourney, steps: updatedSteps }
        });
    };

    const removeStep = (id: string, e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (readOnly) return;
        const updatedSteps = steps.filter(s => s.id !== id);
        onUpdate({
            ...data,
            consumptionJourney: { ...data.consumptionJourney, steps: updatedSteps }
        });
    };

    const moveStep = (index: number, direction: 'left' | 'right') => {
        if (readOnly) return;
        const newIndex = direction === 'left' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= steps.length) return;

        const newSteps = [...steps];
        [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];

        onUpdate({
            ...data,
            consumptionJourney: { ...data.consumptionJourney, steps: newSteps }
        });
    };

    // Validation: Start + Middle Steps + End >= 5 (so Middle >= 3)
    const middleStepCount = steps.length;
    const totalCount = middleStepCount + 2; // + Start + End
    const progressColor = totalCount < 5 ? 'text-red-500' : 'text-green-500';
    const progressBorder = totalCount < 5 ? 'border-red-500' : 'border-green-500';

    return (
        <div className="flex flex-col w-full">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="text-center mb-6 flex-shrink-0 px-4 pt-4">
                <h2 className="font-serif text-3xl text-white font-bold mb-2">Jornada de Consumo dos Seus Melhores Clientes</h2>
                <div className="bg-[#EEF2FF]/5 border border-[#EEF2FF]/20 rounded-lg p-3 max-w-3xl mx-auto mb-4">
                    <p className="text-gray-300 text-sm italic">
                        "Pense nos seus melhores clientes. Do momento em que eles descobrem sua marca até indicarem seu nome, eles passam por uma sequência.
                        <strong className="text-white block mt-1">Sua missão aqui é desenhar esse caminho.</strong>"
                    </p>
                </div>
                <div className="bg-[#FEF3C7]/10 border border-[#FEF3C7]/30 rounded px-4 py-2 inline-block">
                    <p className="text-[#FEF3C7] text-xs font-bold uppercase tracking-widest">
                        Mínimo de 5 etapas ao todo (incluindo início e fim)
                    </p>
                </div>
            </div>

            <div
                ref={scrollRef}
                className={`w-full flex items-center gap-6 px-12 overflow-x-auto snap-x snap-mandatory py-8 ${horizontalScrollbarStyles}`}
            >
                {/* CARD 1: INÍCIO (EDITABLE) */}
                <div className="snap-center flex-shrink-0 w-[320px] h-[450px] bg-gradient-to-b from-blue-900/20 to-blue-900/5 rounded-2xl shadow-xl border border-blue-500/30 border-l-4 border-l-blue-500 flex flex-col p-6 relative">
                    <div className="absolute top-6 left-6 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold shadow-md"><i className="bi bi-search"></i></div>
                    <div className="mt-12 mb-6">
                        <h3 className="text-blue-300 font-bold text-lg uppercase tracking-wide">Início</h3>
                        <p className="text-blue-100 font-bold text-xl">Conhece a Marca</p>
                    </div>
                    <div className="flex-1 flex flex-col">
                        <label className="text-blue-200/50 text-xs font-bold uppercase mb-2">Como/Onde acontece? <span className="text-red-500">*</span></label>
                        <textarea
                            value={data.consumptionJourney.discoveryChannel || ''}
                            onChange={(e) => updateDiscovery(e.target.value)}
                            disabled={readOnly}
                            placeholder="Ex: Anúncio no Instagram, Indicação de amigo, Busca no Google..."
                            className="w-full h-full bg-blue-900/20 border border-blue-500/20 rounded p-3 text-blue-100 text-sm resize-none outline-none focus:border-blue-400 placeholder:text-blue-200/30"
                        />
                    </div>
                </div>

                <div className="flex-shrink-0 text-white/20 text-2xl h-[450px] flex items-center justify-center"><i className="bi bi-arrow-right-short"></i></div>

                {/* DYNAMIC STEPS */}
                {steps.map((step, index) => (
                    <React.Fragment key={step.id}>
                        <motion.div className="snap-center flex-shrink-0 w-[320px] h-[450px] min-w-[300px] bg-[#081e30] border border-white/10 rounded-2xl shadow-xl flex flex-col p-6 relative group">
                            <div className="flex justify-between items-center mb-6 relative z-10">
                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-md">{index + 1}</div>
                                {!readOnly && (
                                    <div className="flex items-center gap-2">
                                        <div className="flex bg-[#051522] border border-white/10 rounded-lg mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => moveStep(index, 'left')} disabled={index === 0} className="px-2 py-1 text-gray-400 hover:text-white disabled:opacity-30"><i className="bi bi-chevron-left"></i></button>
                                            <button onClick={() => moveStep(index, 'right')} disabled={index === steps.length - 1} className="px-2 py-1 text-gray-400 hover:text-white disabled:opacity-30"><i className="bi bi-chevron-right"></i></button>
                                        </div>
                                        {/* Improved Delete Button */}
                                        <button
                                            type="button"
                                            onClick={(e) => removeStep(step.id, e)}
                                            className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white transition-all z-20 cursor-pointer shadow-lg"
                                            title="Excluir Etapa"
                                        >
                                            <i className="bi bi-trash-fill text-sm"></i>
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-4 flex-1 flex flex-col relative z-0">
                                <div><label className="block text-gray-400 text-sm font-bold mb-1">Nome da Etapa <span className="text-red-500">*</span></label><input value={step.title} onChange={(e) => updateStep(step.id, 'title', e.target.value)} disabled={readOnly} placeholder="Ex: Assiste aula no YouTube" maxLength={60} className="w-full bg-[#051522] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-blue-500 transition-all placeholder:text-gray-400" /></div>
                                <div className="flex-1 flex flex-col"><label className="block text-gray-400 text-sm font-bold mb-1">O que acontece ali? <span className="text-red-500">*</span></label><p className="text-xs text-gray-500 mb-2 italic">Ação, pensamento ou sentimento.</p><textarea value={step.description} onChange={(e) => updateStep(step.id, 'description', e.target.value)} disabled={readOnly} placeholder="Descreva o momento..." className="w-full flex-1 bg-[#051522] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-blue-500 transition-all resize-none placeholder:text-gray-400" /></div>
                            </div>
                        </motion.div>
                        <div className="flex-shrink-0 text-white/20 text-2xl h-[450px] flex items-center justify-center"><i className="bi bi-arrow-right-short"></i></div>
                    </React.Fragment>
                ))}

                {!readOnly && (
                    <>
                        <button type="button" onClick={addStep} className="snap-center flex-shrink-0 w-[200px] h-[450px] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-gray-500 hover:text-blue-400 hover:border-blue-400/50 hover:bg-white/5 transition-all gap-4 group">
                            <div className="w-16 h-16 rounded-full bg-white/5 group-hover:bg-blue-500/10 flex items-center justify-center transition-colors"><i className="bi bi-plus-lg text-4xl"></i></div><span className="font-bold text-sm uppercase tracking-widest">Adicionar Etapa</span>
                        </button>
                        <div className="flex-shrink-0 text-white/20 text-2xl h-[450px] flex items-center justify-center"><i className="bi bi-arrow-right-short"></i></div>
                    </>
                )}

                {/* CARD END: FIM */}
                {/* CARD END: FIM (EDITABLE) */}
                <div className="snap-center flex-shrink-0 w-[320px] h-[450px] bg-gradient-to-b from-green-900/20 to-green-900/5 rounded-2xl shadow-xl border border-green-500/30 border-l-4 border-l-green-500 flex flex-col p-6 relative">
                    <div className="absolute top-6 left-6 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold shadow-md"><i className="bi bi-star-fill"></i></div>
                    <div className="mt-12 mb-6">
                        <h3 className="text-green-300 font-bold text-lg uppercase tracking-wide">Fim</h3>
                        <p className="text-green-100 font-bold text-xl">Recomenda Você</p>
                    </div>
                    <div className="flex-1 flex flex-col">
                        <label className="text-green-200/50 text-xs font-bold uppercase mb-2">Resultado Final / Ação <span className="text-red-500">*</span></label>
                        <textarea
                            value={data.consumptionJourney.finalResult || ''}
                            onChange={(e) => updateFinalResult(e.target.value)}
                            disabled={readOnly}
                            placeholder="Ex: Recomenda para amigos, compra novamente, faz depoimento..."
                            className="w-full h-full bg-green-900/20 border border-green-500/20 rounded p-3 text-green-100 text-sm resize-none outline-none focus:border-green-400 placeholder:text-green-200/30"
                        />
                    </div>
                </div>
            </div>

            <div className="mt-4 flex flex-col items-center justify-center pb-2 flex-shrink-0">
                <div className={`px-4 py-1 rounded-full border ${progressBorder} bg-[#031A2B] ${progressColor} text-xs font-bold uppercase tracking-widest flex items-center gap-2`}>
                    {totalCount >= 5 ? <i className="bi bi-check-circle-fill"></i> : <i className="bi bi-exclamation-circle"></i>}
                    {totalCount} Etapas Totais (Mínimo 5)
                </div>
                {middleStepCount > 0 && <div className="flex gap-1 mt-2">{steps.map((_, i) => (<div key={i} className={`w-2 h-2 rounded-full ${progressColor} bg-current opacity-50`}></div>))}</div>}
            </div>
        </div>
    );
}

// ... (DecisionMountain code remains same - omitted for brevity)
const DecisionMountain: React.FC<{
    data: MenteeData;
    onUpdate: (d: MenteeData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    const saveStatus = useAutoSave(data.decisionMountain);
    const updateLayer = (layer: keyof DecisionLayer, value: string) => { if (readOnly) return; onUpdate({ ...data, decisionMountain: { ...data.decisionMountain, [layer]: value } }); };

    return (
        <div className="h-full flex flex-col max-w-7xl mx-auto w-full px-4 overflow-y-auto custom-scrollbar">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="text-center mb-8 flex-shrink-0"><h2 className="font-serif text-3xl text-white font-bold mb-2">A Montanha da Decisão</h2><p className="text-gray-400 text-sm max-w-2xl mx-auto">Mapeie a jornada emocional do seu cliente: o que ele queria (Topo), o que quase o travou (Muro) e o que o fez decidir (Martelo).</p></div>
            <div className="flex-1 flex flex-col items-center justify-center py-4 relative">
                <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-white/5 -z-10"></div>
                {/* Layer 1: Motivation */}
                <div className="w-full max-w-4xl grid md:grid-cols-[1fr_auto_1fr] gap-8 items-center mb-8">
                    <div className="order-2 md:order-1 flex justify-end"><div className="bg-[#081e30] border border-green-500/30 p-6 rounded-lg w-full md:w-[350px] relative"><label className="text-green-500 text-xs font-bold uppercase mb-2 block">Motivação (Topo)</label><p className="text-gray-400 text-xs mb-2 italic">"O que eles queriam conquistar?"</p><textarea value={data.decisionMountain.motivation} onChange={e => updateLayer('motivation', e.target.value)} disabled={readOnly} placeholder="Ex: Queria dobrar o faturamento..." className="w-full bg-[#051522] border border-white/5 p-3 text-white text-sm rounded outline-none h-20 resize-none focus:border-green-500" /></div></div>
                    <div className="order-1 md:order-2 flex justify-center z-10"><div className="w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(34,197,94,0.3)] relative">🏁<div className="absolute -bottom-8 w-[2px] h-8 bg-green-500/50"></div></div></div>
                    <div className="order-3 hidden md:block text-gray-500 text-sm italic w-[350px]">O desejo ardente que faz ele começar a escalada.</div>
                </div>
                {/* Layer 2: Barriers */}
                <div className="w-full max-w-4xl grid md:grid-cols-[1fr_auto_1fr] gap-8 items-center mb-8">
                    <div className="order-3 md:order-1 hidden md:block text-gray-500 text-sm italic w-[350px] text-right">As objeções e medos que quase o fizeram desistir.</div>
                    <div className="order-1 md:order-2 flex justify-center z-10"><div className="w-24 h-24 rounded-lg bg-orange-500/10 border-2 border-orange-500 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(249,115,22,0.3)] relative">🧱<div className="absolute -top-8 w-[2px] h-8 bg-orange-500/50"></div><div className="absolute -bottom-8 w-[2px] h-8 bg-orange-500/50"></div></div></div>
                    <div className="order-2 md:order-3"><div className="bg-[#081e30] border border-orange-500/30 p-6 rounded-lg w-full md:w-[350px] relative"><label className="text-orange-500 text-xs font-bold uppercase mb-2 block">Ceticismo (O Muro)</label><p className="text-gray-400 text-xs mb-2 italic">"Que medos quase travaram a decisão?"</p><textarea value={data.decisionMountain.barriers} onChange={e => updateLayer('barriers', e.target.value)} disabled={readOnly} placeholder="Ex: Medo de ser só mais um curso..." className="w-full bg-[#051522] border border-white/5 p-3 text-white text-sm rounded outline-none h-20 resize-none focus:border-orange-500" /></div></div>
                </div>
                {/* Layer 3: Overcoming */}
                <div className="w-full max-w-4xl grid md:grid-cols-[1fr_auto_1fr] gap-8 items-center">
                    <div className="order-2 md:order-1 flex justify-end"><div className="bg-[#081e30] border border-blue-500/30 p-6 rounded-lg w-full md:w-[350px] relative"><label className="text-blue-500 text-xs font-bold uppercase mb-2 block">Superação (Martelo)</label><p className="text-gray-400 text-xs mb-2 italic">"O que fez ele decidir mesmo assim?"</p><textarea value={data.decisionMountain.overcoming} onChange={e => updateLayer('overcoming', e.target.value)} disabled={readOnly} placeholder="Ex: A garantia, os depoimentos..." className="w-full bg-[#051522] border border-white/5 p-3 text-white text-sm rounded outline-none h-20 resize-none focus:border-blue-500" /></div></div>
                    <div className="order-1 md:order-2 flex justify-center z-10"><div className="w-24 h-24 rounded-b-xl bg-blue-500/10 border-2 border-blue-500 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(59,130,246,0.3)] relative">🔨<div className="absolute -top-8 w-[2px] h-8 bg-blue-500/50"></div></div></div>
                    <div className="order-3 hidden md:block text-gray-500 text-sm italic w-[350px]">O argumento ou prova que quebrou o muro.</div>
                </div>
            </div>
        </div>
    );
};

// ... (ICPBullseye, RadarChart, FanHaterMapComponent, EmpathyMapModal, CommunityImpact, ICPSynthesis code remains same - omitted for brevity)
const ICPBullseye: React.FC<{
    data: MenteeData;
    onUpdate: (d: MenteeData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    // ... ICPBullseye implementation ...
    const saveStatus = useAutoSave(data.icpTarget);
    const containerRef = useRef<HTMLDivElement>(null);
    const [editArrowIndex, setEditArrowIndex] = useState<number | null>(null);
    const [isEditingCenter, setIsEditingCenter] = useState(false);
    const [arrowInput, setArrowInput] = useState('');
    const [centerInput, setCenterInput] = useState('');
    const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);
    const arrowsRef = useRef(data.icpTarget.arrows);
    arrowsRef.current = data.icpTarget.arrows;
    const dataRef = useRef(data);
    dataRef.current = data;
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    useEffect(() => {
        if (activeDragIndex === null) return;
        const handleMove = (e: PointerEvent) => {
            if (!containerRef.current) return;
            e.preventDefault();
            const rect = containerRef.current.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = e.clientX - centerX;
            const dy = e.clientY - centerY;
            let x = (dx / rect.width) * 100;
            let y = (dy / rect.height) * 100;
            const dist = Math.sqrt(x * x + y * y);
            if (dist > 48) { const angle = Math.atan2(y, x); x = Math.cos(angle) * 48; y = Math.sin(angle) * 48; }
            const currentArrows = [...arrowsRef.current];
            if (currentArrows[activeDragIndex]) { const newArrows = currentArrows.map((a, i) => i === activeDragIndex ? { ...a, x, y } : a); onUpdateRef.current({ ...dataRef.current, icpTarget: { ...dataRef.current.icpTarget, arrows: newArrows } }); }
        };
        const handleUp = () => { setActiveDragIndex(null); };
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        return () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp); };
    }, [activeDragIndex]);

    const addArrow = () => { if (readOnly || data.icpTarget.arrows.length >= 5) return; setArrowInput(''); const newArrow: ArrowItem = { id: Date.now().toString(), text: '', x: 0, y: 30 }; const newArrows = [...data.icpTarget.arrows, newArrow]; onUpdate({ ...data, icpTarget: { ...data.icpTarget, arrows: newArrows } }); setEditArrowIndex(newArrows.length - 1); };
    const saveArrowText = () => { if (editArrowIndex === null) return; const newArrows = [...data.icpTarget.arrows]; if (newArrows[editArrowIndex]) { newArrows[editArrowIndex].text = arrowInput; } onUpdate({ ...data, icpTarget: { ...data.icpTarget, arrows: newArrows } }); setEditArrowIndex(null); };
    const deleteArrow = (index: number) => { if (readOnly) return; const newArrows = data.icpTarget.arrows.filter((_, i) => i !== index); onUpdate({ ...data, icpTarget: { ...data.icpTarget, arrows: newArrows } }); };
    const saveCenter = () => { onUpdate({ ...data, icpTarget: { ...data.icpTarget, centerPhrase: centerInput } }); setIsEditingCenter(false); };
    const openCenterEdit = () => { setCenterInput(data.icpTarget.centerPhrase); setIsEditingCenter(true); };
    const calculateRelevance = (x: number, y: number) => { const dist = Math.sqrt(x * x + y * y); const maxDist = 50; return Math.round(Math.max(0, Math.min(100, 100 - (dist / maxDist * 100)))); };
    const calculateScale = (relevance: number) => { return 0.8 + (relevance / 100) * 0.5; };

    return (
        <div className="h-full flex flex-col max-w-7xl mx-auto w-full px-4 relative">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="text-center mb-4 flex-shrink-0"><h2 className="font-serif text-3xl text-white font-bold mb-1">Alvo do Seu Cliente Ideal</h2><p className="text-gray-400 text-sm">Você listou os padrões dos seus melhores clientes. Agora, vamos organizar e priorizar. Preencha de 3 a 5 características que mais se repetem entre os seus melhores clientes. Depois, clique no centro do alvo e resuma em uma frase quem é o seu cliente ideal.</p></div>
            <div className="flex-1 flex flex-col lg:grid lg:grid-cols-2 gap-8 items-center lg:overflow-hidden pb-8 lg:pb-0">
                <div className="flex items-center justify-center relative w-full min-h-[320px] lg:h-full flex-shrink-0">
                    <div ref={containerRef} className="relative w-[280px] sm:w-[320px] md:w-[400px] h-[280px] sm:h-[320px] md:h-[400px]">
                        {[5, 4, 3, 2, 1].map((ring) => (<div key={ring} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" style={{ width: `${ring * 20}%`, height: `${ring * 20}%`, background: `rgba(255, 255, 255, ${0.02 * ring})`, zIndex: 1 }} />))}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[15%] h-[15%] z-20 flex items-center justify-center"><motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={openCenterEdit} disabled={readOnly} className="w-full h-full bg-red-600 rounded-full border-4 border-[#031A2B] shadow-[0_0_20px_rgba(220,38,38,0.5)] flex items-center justify-center hover:bg-red-500 transition-colors"><i className="bi bi-crosshair text-white text-xl"></i></motion.button></div>
                        {data.icpTarget.arrows.map((arrow, i) => { const relevance = calculateRelevance(arrow.x, arrow.y); const scale = calculateScale(relevance); return (<motion.div key={arrow.id} onPointerDown={(e) => { if (readOnly) return; e.preventDefault(); e.stopPropagation(); setActiveDragIndex(i); }} className={`absolute z-30 ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`} style={{ left: `${50 + arrow.x}%`, top: `${50 + arrow.y}%`, transform: 'translate(-50%, -50%)' }} animate={{ scale: scale }} whileHover={{ scale: scale * 1.2 }}><div className="relative"><div className="w-8 h-8 rounded-full bg-[#031A2B] border-2 border-[#CA9A43] flex items-center justify-center text-[#CA9A43] font-bold text-xs shadow-lg shadow-black/50 select-none pointer-events-none">{i + 1}</div></div></motion.div>); })}
                    </div>
                </div>
                <div className="w-full h-auto lg:h-full flex flex-col bg-[#081e30] border border-white/5 rounded-lg p-6 lg:overflow-y-auto custom-scrollbar">
                    <div className="flex justify-between items-center mb-2"><h3 className="text-white font-bold text-sm uppercase tracking-widest">Características</h3><span className="text-xs text-gray-500">{data.icpTarget.arrows.length}/5</span></div>
                    <p className="text-[10px] text-gray-500 mb-4">Nem toda característica tem o mesmo peso. Use o alvo para filtrar seu cliente ideal:</p>
                    <div className="space-y-3 flex-1">{data.icpTarget.arrows.map((arrow, i) => ({ ...arrow, originalIndex: i })).sort((a, b) => calculateRelevance(b.x, b.y) - calculateRelevance(a.x, a.y)).map((arrow) => { const i = arrow.originalIndex; const relevance = calculateRelevance(arrow.x, arrow.y); return (<div key={arrow.id} className="bg-[#051522] border border-white/5 p-4 rounded-lg flex gap-3 items-center group relative overflow-hidden"><div className="absolute bottom-0 left-0 h-[2px] bg-[#CA9A43] opacity-50" style={{ width: `${relevance}%` }}></div><div className="w-6 h-6 rounded-full bg-[#CA9A43]/10 text-[#CA9A43] flex items-center justify-center text-xs font-bold border border-[#CA9A43]/30 flex-shrink-0">{i + 1}</div><div className="flex-1 min-w-0"><p className="text-sm text-gray-300 truncate" title={arrow.text}>{arrow.text || "Sem descrição"}</p><p className="text-[10px] text-gray-500">{relevance}% Relevância</p></div>{!readOnly && (<div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity flex-shrink-0"><button onClick={() => { setArrowInput(arrow.text); setEditArrowIndex(i); }} className="text-gray-500 hover:text-white"><i className="bi bi-pencil"></i></button><button onClick={() => deleteArrow(i)} className="text-gray-500 hover:text-red-400"><i className="bi bi-trash"></i></button></div>)}</div>); })} {!readOnly && data.icpTarget.arrows.length < 5 && (<button onClick={addArrow} className="w-full py-4 border-2 border-dashed border-white/10 rounded-lg text-gray-500 hover:border-[#CA9A43]/50 hover:text-[#CA9A43] transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider"><i className="bi bi-plus-lg"></i> Adicionar Característica</button>)}</div>
                    <div className="mt-6 pt-6 border-t border-white/5"><h3 className="text-white font-bold text-sm uppercase tracking-widest mb-1 text-center">Definição Central</h3><p className="text-[10px] text-gray-500 text-center mb-3">Descreva quem é o seu ICP em uma única frase no campo abaixo.</p>{data.icpTarget.centerPhrase ? (<div onClick={!readOnly ? openCenterEdit : undefined} className={`bg-red-900/20 border border-red-500/30 p-4 rounded-lg text-center ${!readOnly ? 'cursor-pointer hover:bg-red-900/30' : ''}`}><p className="text-white font-serif italic text-lg">"{data.icpTarget.centerPhrase}"</p></div>) : (<div onClick={!readOnly ? openCenterEdit : undefined} className={`text-center text-gray-500 text-sm italic py-4 border border-dashed border-white/10 rounded-lg ${!readOnly ? 'cursor-pointer hover:border-white/30' : ''}`}>Clique no centro do alvo para definir</div>)}</div>
                </div>
            </div>
            <AnimatePresence>
                {editArrowIndex !== null && (<div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"><motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-[#081e30] border border-[#CA9A43]/30 p-6 rounded-lg w-full max-w-md"><h3 className="text-white font-serif text-xl mb-4">Característica {editArrowIndex + 1}</h3><textarea value={arrowInput} onChange={e => setArrowInput(e.target.value)} className="w-full bg-[#051522] border border-white/10 p-3 text-white rounded outline-none h-24 resize-none focus:border-[#CA9A43] mb-4" placeholder="Ex: Empresários de tecnologia..." /><div className="flex justify-end gap-3"><button onClick={() => setEditArrowIndex(null)} className="text-gray-400 hover:text-white text-sm">Cancelar</button><button onClick={saveArrowText} disabled={!arrowInput} className="bg-[#CA9A43] text-[#031A2B] font-bold px-4 py-2 rounded text-sm disabled:opacity-50">Salvar</button></div></motion.div></div>)}
                {isEditingCenter && (<div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"><motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-[#081e30] border border-red-500/30 p-6 rounded-lg w-full max-w-md shadow-[0_0_50px_rgba(220,38,38,0.2)]"><h3 className="text-white font-serif text-xl mb-2 text-center">Defina seu Cliente Ideal</h3><p className="text-gray-400 text-xs text-center mb-6">Em uma frase clara e objetiva.</p><textarea value={centerInput} onChange={e => setCenterInput(e.target.value)} className="w-full bg-[#051522] border border-white/10 p-4 text-white rounded outline-none h-32 resize-none focus:border-red-500 mb-4 font-serif text-lg" placeholder="Ex: Empreendedores que buscam escalar..." /><div className="flex justify-end gap-3"><button onClick={() => setIsEditingCenter(false)} className="text-gray-400 hover:text-white text-sm">Cancelar</button><button onClick={saveCenter} disabled={!centerInput} className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-2 rounded text-sm disabled:opacity-50">Salvar Definição</button></div></motion.div></div>)}
            </AnimatePresence>
        </div>
    );
};

// ... (RadarChart, FanHaterMapComponent, EmpathyMapModal, CommunityImpact, ICPSynthesis code remains same - omitted for brevity)
const RadarChart: React.FC<{
    data: MenteeData;
    onUpdate: (d: MenteeData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    // ... RadarChart implementation ...
    const saveStatus = useAutoSave(data.personas);
    const containerRef = useRef<HTMLDivElement>(null);
    const [editingPersonaIndex, setEditingPersonaIndex] = useState<number | null>(null);
    const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef<{ x: number, y: number } | null>(null);
    const personasRef = useRef(data.personas);
    personasRef.current = data.personas;
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;
    const dataRef = useRef(data);
    dataRef.current = data;

    useEffect(() => {
        if (activeDragIndex === null) return;
        const handleMove = (e: PointerEvent) => { if (!containerRef.current) return; e.preventDefault(); if (!isDragging && dragStartPos.current) { const moveDist = Math.sqrt(Math.pow(e.clientX - dragStartPos.current.x, 2) + Math.pow(e.clientY - dragStartPos.current.y, 2)); if (moveDist > 5) { setIsDragging(true); } } if (isDragging) { const rect = containerRef.current.getBoundingClientRect(); const centerX = rect.left + rect.width / 2; const centerY = rect.top + rect.height / 2; const dx = e.clientX - centerX; const dy = e.clientY - centerY; let x = (dx / rect.width) * 100; let y = (dy / rect.height) * 100; const dist = Math.sqrt(x * x + y * y); const maxRadius = 48; if (dist > maxRadius) { const angle = Math.atan2(y, x); x = Math.cos(angle) * maxRadius; y = Math.sin(angle) * maxRadius; } const currentDist = Math.sqrt(x * x + y * y); const confidence = 5 - (currentDist / maxRadius) * 4; const currentPersonas = [...personasRef.current]; if (currentPersonas[activeDragIndex]) { const newPersonas = currentPersonas.map((p, i) => i === activeDragIndex ? { ...p, x, y, confidence: Math.max(1, Math.min(5, confidence)) } : p); onUpdateRef.current({ ...dataRef.current, personas: newPersonas }); } } };
        const handleUp = () => { if (!isDragging && activeDragIndex !== null) { setEditingPersonaIndex(activeDragIndex); } setActiveDragIndex(null); setIsDragging(false); dragStartPos.current = null; };
        window.addEventListener('pointermove', handleMove); window.addEventListener('pointerup', handleUp);
        return () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp); };
    }, [activeDragIndex, isDragging]);

    const addPersona = () => { if (readOnly || data.personas.length >= 5) return; const newPersona: Persona = { id: Date.now().toString(), name: '', description: '', currentSituation: '', problem: '', objective: '', differential: '', confidence: 1, x: 0, y: -40 }; const newPersonas = [...data.personas, newPersona]; onUpdate({ ...data, personas: newPersonas }); setEditingPersonaIndex(newPersonas.length - 1); };
    const updatePersonaDetails = (index: number, details: Partial<Persona>) => { const newPersonas = [...data.personas]; newPersonas[index] = { ...newPersonas[index], ...details }; onUpdate({ ...data, personas: newPersonas }); };
    const deletePersona = (index: number) => { const newPersonas = data.personas.filter((_, i) => i !== index); onUpdate({ ...data, personas: newPersonas }); setEditingPersonaIndex(null); };

    return (
        <div className="h-full flex flex-col max-w-7xl mx-auto w-full px-4 relative">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="flex flex-col lg:grid lg:grid-cols-[350px_1fr] gap-8 h-auto lg:h-full overflow-y-visible lg:overflow-hidden pb-12 lg:pb-0">
                <div className="flex flex-col justify-start lg:justify-center space-y-6">
                    <div><h2 className="font-serif text-3xl text-white font-bold mb-2">Radar de Clientes Potenciais</h2><p className="text-gray-400 text-sm leading-relaxed">{data.hasClients === 'yes' ? 'Como você ainda não tem um histórico de clientes, vamos trabalhar com hipóteses. O objetivo aqui não é tentar adivinhar o perfil perfeito logo de cara, mas sim listar diferentes perfis que você poderia atender e compará-los. Quanto mais perto do centro, maior sua confiança em gerar resultado.' : ''}</p></div>
                    <div className="bg-[#081e30] border border-white/5 p-6 rounded-lg space-y-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full border border-orange-500 bg-orange-500/10 flex items-center justify-center text-orange-500 text-xs font-bold">1</div><p className="text-gray-300 text-sm">Adicione personas que você pode ajudar.</p></div><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full border border-orange-500 bg-orange-500/10 flex items-center justify-center text-orange-500 text-xs font-bold">2</div><p className="text-gray-300 text-sm">Arraste para o centro se tiver muita confiança.</p></div><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full border border-orange-500 bg-orange-500/10 flex items-center justify-center text-orange-500 text-xs font-bold">3</div><p className="text-gray-300 text-sm">Clique para detalhar o perfil.</p></div></div>
                    {!readOnly && (<button onClick={addPersona} disabled={data.personas.length >= 5} className="bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><i className="bi bi-plus-lg"></i> Adicionar Persona</button>)}
                </div>
                <div className="flex items-center justify-center relative min-h-[350px] lg:min-h-0"><div ref={containerRef} className="relative w-full max-w-[400px] lg:max-w-[500px] aspect-square">{[5, 4, 3, 2, 1].map((ring) => (<div key={ring} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" style={{ width: `${ring * 20}%`, height: `${ring * 20}%`, background: ring === 1 ? 'rgba(255,255,255,0.05)' : 'transparent' }}><span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-600 uppercase font-bold tracking-widest">{ring === 1 ? 'Máxima' : ring === 5 ? 'Exploração' : ''}</span></div>))}<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">VOCÊ</div>{data.personas.map((persona, i) => (<motion.div key={persona.id} onPointerDown={(e) => { if (readOnly) return; e.preventDefault(); e.stopPropagation(); setActiveDragIndex(i); dragStartPos.current = { x: e.clientX, y: e.clientY }; }} className={`absolute z-20 group ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`} style={{ left: `${50 + persona.x}%`, top: `${50 + persona.y}%`, transform: 'translate(-50%, -50%)' }} whileHover={{ scale: 1.2 }}><div className="relative flex flex-col items-center"><div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[14px] border-t-orange-500 drop-shadow-lg"></div><div className="absolute -top-8 bg-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap shadow-lg">{persona.name || `Persona ${i + 1}`}</div><div className="mt-1 text-[10px] text-orange-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">{Math.round(persona.confidence * 10) / 10}/5</div></div></motion.div>))}</div></div>
            </div>
            <AnimatePresence>
                {editingPersonaIndex !== null && (<div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-end backdrop-blur-sm"><motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: "spring", damping: 25 }} className="bg-[#081e30] w-full max-w-2xl h-full border-l border-white/10 shadow-2xl flex flex-col">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#051522]"><h3 className="text-white font-serif text-xl">Detalhes da Persona</h3><button onClick={() => setEditingPersonaIndex(null)} className="text-gray-400 hover:text-white"><i className="bi bi-x-lg text-xl"></i></button></div>
                    <div className={`flex-1 overflow-y-auto p-8 space-y-6 ${verticalScrollbarStyles}`}>
                        <div><label className="block text-gray-500 text-xs font-bold uppercase mb-2">1. Nome da Persona</label><input value={data.personas[editingPersonaIndex].name} onChange={(e) => updatePersonaDetails(editingPersonaIndex, { name: e.target.value })} className="w-full bg-[#051522] border border-white/10 p-3 text-white rounded outline-none focus:border-orange-500" placeholder="Ex: Consultor Solo..." /></div>
                        <div><label className="block text-gray-500 text-xs font-bold uppercase mb-2">2. Quem ele é?</label><textarea value={data.personas[editingPersonaIndex].description} onChange={(e) => updatePersonaDetails(editingPersonaIndex, { description: e.target.value })} className="w-full bg-[#051522] border border-white/10 p-3 text-white rounded outline-none focus:border-orange-500 h-24 resize-none" placeholder="Idade, cargo, tipo de negócio..." /></div>
                        <div><label className="block text-gray-500 text-xs font-bold uppercase mb-2">3. Situação Atual</label><textarea value={data.personas[editingPersonaIndex].currentSituation} onChange={(e) => updatePersonaDetails(editingPersonaIndex, { currentSituation: e.target.value })} className="w-full bg-[#051522] border border-white/10 p-3 text-white rounded outline-none focus:border-orange-500 h-24 resize-none" placeholder="Trabalha 12h/dia, faturamento estagnado..." /></div>
                        <div className="border-l-2 border-orange-500 pl-4"><label className="block text-orange-500 text-xs font-bold uppercase mb-2">4. Problema Central</label><textarea value={data.personas[editingPersonaIndex].problem} onChange={(e) => updatePersonaDetails(editingPersonaIndex, { problem: e.target.value })} className="w-full bg-[#051522] border border-white/10 p-3 text-white rounded outline-none focus:border-orange-500 h-24 resize-none" placeholder="Qual problema principal você resolve?" /></div>
                        <div><label className="block text-gray-500 text-xs font-bold uppercase mb-2">5. Objetivo (Sucesso)</label><textarea value={data.personas[editingPersonaIndex].objective} onChange={(e) => updatePersonaDetails(editingPersonaIndex, { objective: e.target.value })} className="w-full bg-[#051522] border border-white/10 p-3 text-white rounded outline-none focus:border-orange-500 h-24 resize-none" placeholder="O que ele quer alcançar?" /></div>
                        <div><label className="block text-gray-500 text-xs font-bold uppercase mb-2">6. Por que você consegue ajudar?</label><textarea value={data.personas[editingPersonaIndex].differential} onChange={(e) => updatePersonaDetails(editingPersonaIndex, { differential: e.target.value })} className="w-full bg-[#051522] border border-white/10 p-3 text-white rounded outline-none focus:border-orange-500 h-32 resize-none" placeholder="Sua vantagem competitiva para esse perfil..." /></div>
                        <div className="bg-[#051522] p-6 rounded-lg"><label className="block text-gray-500 text-xs font-bold uppercase mb-4 flex justify-between"><span>7. Nível de Confiança (Distância do Centro)</span><span className="text-orange-500 text-lg">{Math.round(data.personas[editingPersonaIndex].confidence * 10) / 10} / 5</span></label><input type="range" min="1" max="5" step="0.1" value={data.personas[editingPersonaIndex].confidence} onChange={(e) => { const val = parseFloat(e.target.value); const maxRadius = 48; const dist = ((5 - val) / 4) * maxRadius; const currentX = data.personas[editingPersonaIndex].x; const currentY = data.personas[editingPersonaIndex].y; let angle = Math.atan2(currentY, currentX); if (currentX === 0 && currentY === 0) angle = -Math.PI / 2; const newX = Math.cos(angle) * dist; const newY = Math.sin(angle) * dist; updatePersonaDetails(editingPersonaIndex, { confidence: val, x: newX, y: newY }); }} className="w-full accent-orange-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" /><div className="flex justify-between text-xs text-gray-600 mt-2 font-bold uppercase"><span>Inseguro (Longe)</span><span>Muito Seguro (Centro)</span></div></div>
                        <div className="pt-6 flex justify-between"><button onClick={() => deletePersona(editingPersonaIndex)} className="text-red-400 hover:text-red-300 text-sm font-bold flex items-center gap-2"><i className="bi bi-trash"></i> Excluir Persona</button><button onClick={() => setEditingPersonaIndex(null)} className="bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 px-8 rounded-lg shadow-lg">Salvar e Fechar</button></div>
                    </div>
                </motion.div></div>)}
            </AnimatePresence>
        </div>
    );
};

// ... (FanHaterMapComponent, EmpathyMapModal, CommunityImpact, ICPSynthesis code remains same - omitted for brevity)
const FanHaterMapComponent: React.FC<{
    data: MenteeData;
    onUpdate: (d: MenteeData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    // ... FanHaterMapComponent implementation ...
    const saveStatus = useAutoSave(data.fanHaterMap);
    const [activeModal, setActiveModal] = useState<'fan' | 'hater' | null>(null);

    const updateMap = (type: 'fan' | 'hater', mapData: EmpathyMap) => {
        if (readOnly) return;
        onUpdate({
            ...data,
            fanHaterMap: {
                ...data.fanHaterMap,
                [type]: mapData
            }
        });
        setActiveModal(null);
    };

    const initialMap: EmpathyMap = {
        whoIs: '',
        feelings: '',
        saysDoes: '',
        sees: '',
        hears: '',
        thinks: '',
        weaknesses: '',
        gains: ''
    };

    return (
        <div className="flex flex-col max-w-7xl mx-auto w-full px-4 relative pb-8">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="text-center mb-8 flex-shrink-0">
                <h2 className="font-serif text-3xl text-white font-bold mb-2">Mapa Fã x Hater</h2>
                <p className="text-gray-400 text-sm">
                    Aqui você desenha o tipo de pessoa que tende a ser seu fã e o tipo de pessoa que tende a ser seu hater.<br />
                    Isso ajuda a ver quem você quer perto da sua marca e quem é melhor deixar de fora.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/10 rounded-lg overflow-hidden relative">
                <div className="hidden md:block absolute top-0 bottom-0 left-1/2 w-[2px] bg-[#031A2B] -translate-x-1/2 z-10"></div>
                <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0f16] p-8 flex flex-col items-center justify-center text-center relative group border-b md:border-b-0 md:border-r border-white/5">
                    <button onClick={() => setActiveModal('hater')} disabled={readOnly} className="bg-[#FBBF24] text-black font-bold py-3 px-8 rounded-lg shadow-[0_4px_12px_rgba(251,191,36,0.3)] hover:-translate-y-1 transition-all mb-8 disabled:opacity-50">{data.fanHaterMap.hater ? 'Editar Hater' : 'Desenhar Hater'}</button>
                    <div className={`w-32 h-32 rounded-full bg-[#FDE047] flex items-center justify-center text-6xl shadow-xl transition-all duration-500 ${data.fanHaterMap.hater ? 'opacity-100 scale-110' : 'opacity-60 scale-100'}`}>😠</div>
                    {data.fanHaterMap.hater && (<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 bg-[#081e30] p-6 rounded-lg max-w-xs shadow-md border border-white/10 w-[80%]"><h4 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">{data.fanHaterMap.hater.whoIs || 'Hater Indefinido'}</h4><p className="text-gray-400 text-xs line-clamp-3 italic">"{data.fanHaterMap.hater.feelings}"</p><button onClick={() => setActiveModal('hater')} className="text-[#FBBF24] text-xs font-bold mt-4 underline">Ver mapa completo</button></motion.div>)}
                </div>
                <div className="bg-gradient-to-bl from-[#1a2333] to-[#0a0f16] p-8 flex flex-col items-center justify-center text-center relative">
                    <button onClick={() => setActiveModal('fan')} disabled={readOnly} className="bg-[#FBBF24] text-black font-bold py-3 px-8 rounded-lg shadow-[0_4px_12px_rgba(251,191,36,0.3)] hover:-translate-y-1 transition-all mb-8 disabled:opacity-50">{data.fanHaterMap.fan ? 'Editar Fã' : 'Desenhar Fã'}</button>
                    <div className={`w-32 h-32 rounded-full bg-[#FDE047] flex items-center justify-center text-6xl shadow-xl transition-all duration-500 ${data.fanHaterMap.fan ? 'opacity-100 scale-110' : 'opacity-60 scale-100'}`}>😄</div>
                    {data.fanHaterMap.fan && (<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 bg-[#081e30] p-6 rounded-lg max-w-xs shadow-md border border-white/10 w-[80%]"><h4 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">{data.fanHaterMap.fan.whoIs || 'Fã Indefinido'}</h4><p className="text-gray-400 text-xs line-clamp-3 italic">"{data.fanHaterMap.fan.feelings}"</p><button onClick={() => setActiveModal('fan')} className="text-[#FBBF24] text-xs font-bold mt-4 underline">Ver mapa completo</button></motion.div>)}
                </div>
            </div>
            <AnimatePresence>
                {activeModal && (<EmpathyMapModal type={activeModal} initialData={data.fanHaterMap[activeModal] || initialMap} onSave={(map) => updateMap(activeModal, map)} onClose={() => setActiveModal(null)} />)}
            </AnimatePresence>
        </div>
    );
};

// ... (EmpathyMapModal, CommunityImpact, ICPSynthesis code remains same - omitted for brevity)
const EmpathyMapModal: React.FC<{
    type: 'fan' | 'hater';
    initialData: EmpathyMap;
    onSave: (data: EmpathyMap) => void;
    onClose: () => void;
}> = ({ type, initialData, onSave, onClose }) => {
    // ... EmpathyMapModal implementation ...
    const [formData, setFormData] = useState(initialData);
    const updateField = (field: keyof EmpathyMap, value: string) => { setFormData({ ...formData, [field]: value }); };
    const isHater = type === 'hater';
    const borderColor = 'border-white/10';
    const focusColor = isHater ? 'focus:border-red-500' : 'focus:border-green-500';

    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`bg-[#081e30] w-full max-w-5xl h-[90vh] rounded-2xl border border-white/10 shadow-2xl relative flex flex-col`}>
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#081e30] rounded-t-2xl flex-shrink-0">
                    <div className="text-center w-full"><span className="text-gray-500 text-xs font-bold uppercase tracking-widest block">MODAL</span><p className="text-gray-300 text-sm mt-1">{isHater ? 'Preencha este mapa pensando em um tipo específico de pessoa. Não tente abraçar todo mundo. Foque em quem mais te drena / te atrasa.' : 'Preencha este mapa pensando em um tipo específico de pessoa. Não tente abraçar todo mundo. Foque em quem mais combina com seu trabalho.'}</p></div>
                    <button onClick={onClose} className="absolute right-6 text-gray-400 hover:text-white"><i className="bi bi-x-lg text-2xl"></i></button>
                </div>
                <div className={`p-8 grid gap-8 flex-1 ${verticalScrollbarStyles}`}>
                    <div className="flex flex-col gap-4 justify-center items-center mb-4 relative py-8 border-b border-white/5"><div className="absolute top-1/2 left-1/2 w-[1px] h-full bg-white/5 -translate-x-1/2 -z-10"></div><div className="w-full max-w-xs text-center z-10"><label className="text-gray-400 text-xs font-bold uppercase mb-2 block">Quem ele é?</label><input value={formData.whoIs} onChange={e => updateField('whoIs', e.target.value)} className={`w-full bg-[#051522] border ${borderColor} p-3 text-white text-center rounded-xl outline-none ${focusColor}`} placeholder="Tipo de pessoa..." /></div><div className="w-full max-w-xs text-center z-10"><label className="text-gray-400 text-xs font-bold uppercase mb-2 block">Como se sente?</label><input value={formData.feelings} onChange={e => updateField('feelings', e.target.value)} className={`w-full bg-[#051522] border ${borderColor} p-3 text-white text-center rounded-xl outline-none ${focusColor}`} placeholder="Sentimento principal..." /></div></div>
                    <div className="grid md:grid-cols-2 gap-x-12 gap-y-8 relative">
                        <div className="hidden md:block absolute top-1/2 left-0 right-0 h-[1px] bg-white/5 -translate-y-1/2"></div><div className="hidden md:block absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/5 -translate-x-1/2"></div>
                        <div className="space-y-2 p-4"><h4 className="text-xl font-bold text-white">O que ele fala e faz?</h4><p className="text-gray-500 text-xs italic">Atitude em público, comportamento com os outros</p><textarea value={formData.saysDoes} onChange={e => updateField('saysDoes', e.target.value)} className={`w-full bg-[#051522] border ${borderColor} p-4 text-white rounded-lg outline-none h-32 resize-none ${focusColor}`} /></div>
                        <div className="space-y-2 text-right p-4"><h4 className="text-xl font-bold text-white">O que ele vê?</h4><p className="text-gray-500 text-xs italic">Ambiente, amigos, o que o mercado oferece</p><textarea value={formData.sees} onChange={e => updateField('sees', e.target.value)} className={`w-full bg-[#051522] border ${borderColor} p-4 text-white rounded-lg outline-none h-32 resize-none text-right ${focusColor}`} /></div>
                        <div className="space-y-2 p-4"><h4 className="text-xl font-bold text-white">O que ele escuta?</h4><p className="text-gray-500 text-xs italic">O que amigos dizem, o que mídia fala</p><textarea value={formData.hears} onChange={e => updateField('hears', e.target.value)} className={`w-full bg-[#051522] border ${borderColor} p-4 text-white rounded-lg outline-none h-32 resize-none ${focusColor}`} /></div>
                        <div className="space-y-2 text-right p-4"><h4 className="text-xl font-bold text-white">O que ele pensa?</h4><p className="text-gray-500 text-xs italic">O que realmente pensa, preocupações</p><textarea value={formData.thinks} onChange={e => updateField('thinks', e.target.value)} className={`w-full bg-[#051522] border ${borderColor} p-4 text-white rounded-lg outline-none h-32 resize-none text-right ${focusColor}`} /></div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-8 mt-4 pt-8 border-t border-white/5"><div className="bg-red-900/10 border border-red-500/20 p-6 rounded-xl"><h4 className="text-red-400 font-bold text-sm uppercase mb-2">Fraquezas (Medos)</h4><p className="text-red-300/50 text-xs mb-3 italic">Medos, frustrações e ansiedades</p><textarea value={formData.weaknesses} onChange={e => updateField('weaknesses', e.target.value)} className="w-full bg-transparent text-white text-sm outline-none resize-none h-20 p-3 rounded border border-red-500/10 focus:border-red-500/50" /></div><div className="bg-green-900/10 border border-green-500/20 p-6 rounded-xl"><h4 className="text-green-400 font-bold text-sm uppercase mb-2">Ganhos (Desejos)</h4><p className="text-green-300/50 text-xs mb-3 italic">Formas de medir sucesso</p><textarea value={formData.gains} onChange={e => updateField('gains', e.target.value)} className="w-full bg-transparent text-white text-sm outline-none resize-none h-20 p-3 rounded border border-green-500/10 focus:border-green-500/50" /></div></div>
                </div>
                <div className="p-6 border-t border-white/5 bg-[#051522] rounded-b-2xl flex justify-between items-center flex-shrink-0"><button onClick={onClose} className="text-gray-400 hover:text-white px-4 font-bold text-sm">Cancelar</button><button onClick={() => onSave(formData)} disabled={!formData.whoIs || !formData.feelings || !formData.saysDoes || !formData.sees || !formData.hears || !formData.thinks || !formData.weaknesses || !formData.gains} className={`bg-[#FBBF24] text-black font-bold py-3 px-8 rounded-lg shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all disabled:opacity-50 disabled:shadow-none disabled:transform-none`}>Salvar Persona {isHater ? 'Hater' : 'Fã'}</button></div>
            </motion.div>
        </div>
    );
};

// ... (CommunityImpact, ICPSynthesis code remains same - omitted for brevity)
const CommunityImpact: React.FC<{
    data: MenteeData;
    onUpdate: (d: MenteeData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    // ... CommunityImpact implementation ...
    const saveStatus = useAutoSave(data.communityImpact);
    const updateField = (section: 'community' | 'impact', field: keyof CommunityImpactSection, value: string) => { if (readOnly) return; onUpdate({ ...data, communityImpact: { ...data.communityImpact, [section]: { ...data.communityImpact[section], [field]: value } } }); };
    const renderCard = (type: 'community' | 'impact') => {
        const isCommunity = type === 'community';
        const sectionData = data.communityImpact[type];
        return (
            <div className="bg-[#081e30] border border-white/10 rounded-2xl p-4 shadow-sm">
                <h3 className="text-2xl md:text-3xl font-bold text-white text-center mb-8 font-serif">{isCommunity ? "Comunidade" : "Impacto"}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-blue-900/10 rounded-lg p-6 border border-blue-500/20"><div className="flex items-center gap-3 mb-4"><div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400"><i className="bi bi-check-lg"></i></div><label className="text-sm font-bold text-blue-400 uppercase tracking-widest">{isCommunity ? "Quem FAZ parte" : "Como DEVEM se sentir"}</label></div><textarea value={sectionData.positive} onChange={(e) => updateField(type, 'positive', e.target.value)} disabled={readOnly} placeholder={isCommunity ? "Ex: Empreendedores ambiciosos, focados em ação..." : "Ex: Confiantes, capazes, inspirados..."} className="w-full bg-[#051522] p-4 rounded border border-blue-500/10 text-white text-sm h-40 resize-none outline-none focus:border-blue-500/50" /></div>
                    <div className="bg-red-900/10 rounded-lg p-6 border border-red-500/20"><div className="flex items-center gap-3 mb-4"><div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400"><i className="bi bi-x-lg"></i></div><label className="text-sm font-bold text-red-400 uppercase tracking-widest">{isCommunity ? "Quem NÃO faz parte" : "Como NÃO devem se sentir"}</label></div><textarea value={sectionData.negative} onChange={(e) => updateField(type, 'negative', e.target.value)} disabled={readOnly} placeholder={isCommunity ? "Ex: Vitimistas, reclamões, curiosos..." : "Ex: Confusos, pressionados, sobrecarregados..."} className="w-full bg-[#051522] p-4 rounded border border-red-500/10 text-white text-sm h-40 resize-none outline-none focus:border-red-500/50" /></div>
                </div>
            </div>
        );
    }
    return (
        <div className="h-full flex flex-col max-w-7xl mx-auto w-full px-4 relative bg-[#E5E7EB]/5 rounded-lg">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="text-center pt-8 pb-4 flex-shrink-0"><h2 className="font-serif text-3xl text-white font-bold mb-2">Comunidade e Impacto</h2><p className="text-gray-400 text-sm">Agora, defina quem faz parte da sua comunidade ideal e como essas pessoas devem se sentir ao ter contato com você e com seu trabalho.</p></div>
            <div className={`flex-1 overflow-y-auto p-2 space-y-8 ${verticalScrollbarStyles}`}>{renderCard('community')}{renderCard('impact')}</div>
        </div>
    );
};

// ... (ICPSynthesis code remains same - omitted for brevity)
const ICPSynthesis: React.FC<{
    data: MenteeData;
    onUpdate: (d: MenteeData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    // ... ICPSynthesis implementation ...
    const saveStatus = useAutoSave(data.icpSynthesis);
    const [showExamples, setShowExamples] = useState(false);
    const updatePhrase = (text: string) => { if (readOnly) return; onUpdate({ ...data, icpSynthesis: { phrase: text } }); };
    const getLengthColor = (len: number) => { if (len < 30) return 'text-red-500'; if (len < 50) return 'text-orange-500'; if (len < 150) return 'text-green-600'; return 'text-blue-600'; };
    const examples = ["Um fundador de startup B2B entre 30-40 anos, faturando R$ 50-200k/mês, que está travado no crescimento.", "Uma designer freelancer que trabalha sozinha há 2+ anos e quer escalar sem perder qualidade.", "Um coach executivo recém-formado que tem dificuldade de atrair seus primeiros clientes pagantes."];

    return (
        <div className="h-full w-full bg-[#081e30] rounded-lg overflow-hidden flex flex-col relative text-gray-800">
            {!readOnly && <SaveStatusIndicator status={saveStatus} lightMode={true} />}
            <div className="pt-16 pb-8 text-center px-8"><p className="text-gray-500 font-medium text-sm md:text-base">Depois de tudo o que você escreveu, descreva em uma frase quem é o cliente ideal que você quer testar primeiro.</p></div>
            <div className="flex-1 flex flex-col items-center justify-center px-8 pb-16 max-w-4xl mx-auto w-full">
                <div className="w-full text-center mb-8"><p className="opacity-50 text-gray-400 font-medium text-lg md:text-xl mb-4">Comece com:</p><h2 className="text-white font-serif font-semibold text-3xl md:text-5xl leading-tight">"Meu cliente ideal de teste é..."</h2></div>
                <div className="w-full relative group"><textarea value={data.icpSynthesis.phrase} onChange={(e) => updatePhrase(e.target.value)} disabled={readOnly} placeholder="Complete a frase de forma clara e específica..." className={`w-full min-h-[160px] p-8 text-xl md:text-2xl font-serif text-white bg-[#051522] border-2 rounded-xl outline-none transition-all resize-none shadow-sm ${readOnly ? 'border-transparent cursor-not-allowed bg-transparent' : 'border-dashed border-[#D1D5DB] focus:border-solid focus:border-blue-500 focus:bg-[#051522] focus:shadow-[0_0_0_4px_rgba(59,130,246,0.1)]'} ${data.icpSynthesis.phrase.length > 50 ? '!border-emerald-500 !bg-[#051522]' : ''}`} />{!readOnly && (<div className="absolute top-4 right-4 text-xs font-bold transition-colors duration-300"><span className={getLengthColor(data.icpSynthesis.phrase.length)}>{data.icpSynthesis.phrase.length} chars</span></div>)}{data.icpSynthesis.phrase.length > 50 && (<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-3 -right-3 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg"><i className="bi bi-check-lg"></i></motion.div>)}</div>
                <div className="mt-8 flex gap-4"><button onClick={() => setShowExamples(true)} className="text-gray-500 hover:text-gray-800 text-sm font-medium border border-gray-300 rounded-full px-4 py-2 hover:bg-white transition-colors"><i className="bi bi-lightbulb mr-2"></i> Ver Exemplos</button></div>
                <p className="mt-12 text-gray-500 italic text-sm text-center max-w-lg">Esse será o ICP de teste, que você revisa depois com base em clientes reais.</p>
            </div>
            <AnimatePresence>
                {showExamples && (<div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"><motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl relative"><button onClick={() => setShowExamples(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><i className="bi bi-x-lg"></i></button><h3 className="text-gray-900 font-bold text-lg mb-6">Exemplos de Síntese</h3><div className="space-y-4">{examples.map((ex, i) => (<div key={i} className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-gray-700 italic font-serif">"{ex}"</div>))}</div></motion.div></div>)}
            </AnimatePresence>
        </div>
    );
}

// --- MAIN MODULE COMPONENT ---

export const MenteeModule: React.FC<MenteeModuleProps> = ({
    data,
    onUpdate,
    onSaveAndExit,
    onComplete,
    isReadOnly = false,
    savedStep,
    onStepChange
}) => {
    // Initial Step Logic
    const initialStep = getInitialStep(data);
    const maxSteps = data.hasClients === 'no' ? 6 : (data.hasClients === 'yes' ? 5 : 1);
    const isComplete = initialStep > maxSteps;

    // Usar savedStep se disponível, caso contrário usar initialStep
    const startingStep = savedStep !== undefined ? savedStep : (isComplete ? 1 : initialStep);
    const [currentStep, setCurrentStep] = useState(startingStep);
    // Intro logic: Show intro ONLY if not read-only AND user is at step 1 AND hasn't answered the first question.
    const [showIntro, setShowIntro] = useState(!isReadOnly && initialStep === 1 && !data.hasClients);
    const [showCompletion, setShowCompletion] = useState(isReadOnly || isComplete);

    // Calcula o total de passos baseado no fluxo
    const getTotalSteps = () => {
        // SWAPPED LOGIC:
        if (data.hasClients === 'no') return 6; // Deep Dive Flow (ClientStatus + Demo + Trans + Decision + Journey + Bullseye)
        if (data.hasClients === 'yes') return 5; // Hypothesis Flow (ClientStatus + Radar + FanHater + Community + Synthesis)
        return 1;
    };
    const totalSteps = getTotalSteps();

    // Salvar currentStep sempre que ele mudar
    useEffect(() => {
        if (onStepChange && !showIntro && !showCompletion) {
            onStepChange(currentStep);
        }
    }, [currentStep, onStepChange, showIntro, showCompletion]);

    // Se estiver em modo leitura, começa na tela de resumo/conclusão
    useEffect(() => {
        if (isReadOnly) {
            setShowIntro(false);
            setShowCompletion(true);
        }
    }, [isReadOnly]);

    const handleNext = () => {
        if (currentStep < totalSteps) {
            const nextStep = currentStep + 1;
            setCurrentStep(nextStep);
            if (onStepChange) onStepChange(nextStep);
        } else {
            setShowCompletion(true);
            if (onStepChange) onStepChange(currentStep);
        }
    };

    const handlePrev = () => {
        if (currentStep > 1) {
            const prevStep = currentStep - 1;
            setCurrentStep(prevStep);
            if (onStepChange) onStepChange(prevStep);
        }
    };

    // Renderiza o componente correto baseado no passo e fluxo
    const renderStep = () => {
        const commonProps = { data, onUpdate: onUpdate, readOnly: isReadOnly };

        if (currentStep === 1) return <ClientStatusSelection {...commonProps} />;

        // SWAPPED LOGIC:
        // Fluxo SEM CLIENTES (NO) -> Deep Dive Flow
        if (data.hasClients === 'no') {
            if (currentStep === 2) return <DemographicWizard {...commonProps} />;
            if (currentStep === 3) return <TransformationComparison {...commonProps} />;
            if (currentStep === 4) return <DecisionMountain {...commonProps} />;
            if (currentStep === 5) return <ConsumptionJourney {...commonProps} />;
            if (currentStep === 6) return <ICPBullseye {...commonProps} />;
        }

        // Fluxo COM CLIENTES (YES) -> Hypothesis Flow
        if (data.hasClients === 'yes') {
            if (currentStep === 2) return <RadarChart {...commonProps} />;
            if (currentStep === 3) return <FanHaterMapComponent {...commonProps} />;
            if (currentStep === 4) return <CommunityImpact {...commonProps} />;
            if (currentStep === 5) return <ICPSynthesis {...commonProps} />;
        }
    };

    // Validação de botão Próximo/Concluir
    const canProceed = () => {
        if (isReadOnly) return true;
        if (currentStep === 1) return !!data.hasClients;

        // NO CLIENTS FLOW (Deep Dive)
        if (data.hasClients === 'no') {
            // Step 2: Demographics
            if (currentStep === 2) {
                const d = data.demographics;
                return d.detailedProfile.length > 20 &&
                    !!d.gender &&
                    d.locations.length > 0 &&
                    d.digitalPresence.platforms.length > 0 &&
                    !!d.maritalStatus &&
                    !!d.role.category;
            }
            // Step 3: Transformation
            if (currentStep === 3) {
                const { before, after } = data.transformation;
                return (before.metrics.length > 5 && before.context.length > 5 && after.metrics.length > 5 && after.context.length > 5);
            }
            // Step 4: Decision
            if (currentStep === 4) {
                const { motivation, barriers, overcoming } = data.decisionMountain;
                return motivation.length > 3 && barriers.length > 3 && overcoming.length > 3;
            }
            // Step 5: Journey
            if (currentStep === 5) {
                const j = data.consumptionJourney;
                return !!j.discoveryChannel && j.discoveryChannel.trim().length > 0 &&
                    !!j.finalResult && j.finalResult.trim().length > 0 &&
                    j.steps.length >= 3 && // Min 3 middle steps + Start + End = 5 Total
                    j.steps.every(s => s.title.trim().length > 0 && s.description.trim().length > 0);
            }
            // Step 6: ICP Target
            if (currentStep === 6) {
                return data.icpTarget.centerPhrase.length > 3 && data.icpTarget.arrows.length >= 3;
            }
        }

        // YES CLIENTS FLOW (Hypothesis)
        if (data.hasClients === 'yes') {
            // Step 2: Radar
            if (currentStep === 2) {
                return data.personas.length >= 1 && data.personas.every(p => p.name && p.description && p.currentSituation && p.problem && p.objective);
            }
            // Step 3: Fan/Hater
            if (currentStep === 3) {
                const fh = data.fanHaterMap;
                return !!fh.fan && !!fh.hater &&
                    !!fh.fan.whoIs && !!fh.fan.feelings &&
                    !!fh.hater.whoIs && !!fh.hater.feelings;
            }
            // Step 4: Community
            if (currentStep === 4) {
                const comm = data.communityImpact;
                return comm.community.positive.length > 3 && comm.community.negative.length > 3 &&
                    comm.impact.positive.length > 3 && comm.impact.negative.length > 3;
            }
            // Step 5: Synthesis
            if (currentStep === 5) {
                return data.icpSynthesis.phrase.length >= 20;
            }
        }

        return true;
    }

    return (
        <div className="bg-[#051522] border border-white/5 rounded-lg h-[800px] shadow-2xl relative overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-[#081e30] p-6 border-b border-white/5 flex items-center justify-between flex-shrink-0">
                <div>
                    <div className="flex items-center gap-3">
                        <button onClick={onSaveAndExit} className="text-gray-400 hover:text-white transition-colors">
                            <i className="bi bi-arrow-left"></i>
                        </button>
                        <span className="text-[#CA9A43] text-xs font-bold uppercase tracking-widest">Módulo: O Mentorado</span>
                        {isReadOnly && <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded border border-blue-500/30">EM ANÁLISE</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1 pl-6">
                        <span className="text-white font-serif text-xl">
                            {showIntro ? 'Introdução' : (showCompletion ? 'Visão Geral' : `Etapa ${currentStep} de ${totalSteps}`)}
                        </span>
                    </div>
                </div>

                {!showIntro && (
                    <div className="flex gap-1">
                        {Array.from({ length: totalSteps }).map((_, i) => (
                            <div key={i} className={`h-1 w-8 rounded-full transition-all duration-300 ${i + 1 <= currentStep || showCompletion ? 'bg-[#CA9A43]' : 'bg-white/10'}`}></div>
                        ))}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar relative">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={showIntro ? 'intro' : (showCompletion ? 'complete' : currentStep)}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="h-full flex flex-col"
                    >
                        {showIntro ? (
                            <MenteeIntro onStart={() => setShowIntro(false)} />
                        ) : showCompletion ? (
                            <CompletionView
                                onReview={() => {
                                    setShowCompletion(false);
                                    setCurrentStep(1);
                                    if (onStepChange) onStepChange(1);
                                }}
                                onSend={onComplete}
                                readOnly={isReadOnly}
                            />
                        ) : (
                            renderStep()
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Footer Navigation */}
            {!showIntro && !showCompletion && (
                <div className="bg-[#031A2B] p-4 border-t border-white/5 flex flex-col-reverse sm:flex-row justify-between items-center gap-4 flex-shrink-0">
                    <button
                        onClick={handlePrev}
                        disabled={currentStep === 1}
                        className="text-gray-400 hover:text-white disabled:opacity-30 flex items-center gap-2 px-4 py-2 text-sm uppercase tracking-wider w-full sm:w-auto justify-center"
                    >
                        <i className="bi bi-arrow-left"></i> Anterior
                    </button>

                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                        <button onClick={onSaveAndExit} className="text-gray-400 hover:text-white text-xs uppercase font-bold tracking-widest px-4">
                            Salvar e Sair
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!canProceed()}
                            className={`font-bold px-6 py-3 rounded-sm flex items-center justify-center gap-2 transition-colors text-sm uppercase tracking-wider w-full sm:w-auto
                                ${!canProceed() ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-[#CA9A43] text-[#031A2B] hover:bg-[#FFE39B]'}
                            `}
                        >
                            {currentStep < totalSteps ? 'Próxima Etapa' : 'Concluir'} <i className="bi bi-arrow-right"></i>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
