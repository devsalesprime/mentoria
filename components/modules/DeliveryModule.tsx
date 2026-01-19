
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- TYPES ---

export interface Accelerator {
    id: string;
    pillar: string; // Título
    acceleration: string; // Descrição
}

export interface DeliveryData {
    groupName: string;
    uniqueObjective: string;
    mandatory: {
        frequency: '2' | '3' | '4' | null;
        onlineEngagement: string[];
        otherEngagementText: string; // New field for custom description
        communityRules: string;
    };
    overdelivery: {
        hasIndividual: 'yes' | 'no' | null;
        individualDetails: string;
        frequency: string;
        accelerators: Accelerator[];
    };
}

export const INITIAL_DELIVERY_DATA: DeliveryData = {
    groupName: '',
    uniqueObjective: '',
    mandatory: {
        frequency: null,
        onlineEngagement: [],
        otherEngagementText: '',
        communityRules: ''
    },
    overdelivery: {
        hasIndividual: null,
        individualDetails: '',
        frequency: '',
        accelerators: [
            { id: '1', pillar: 'Assistente de Vendas', acceleration: 'Inteligência Artificial que participa de reuniões comigo e preenche o CRM automaticamente' },
            { id: '2', pillar: 'Plataforma de Conteúdo', acceleration: 'Acesso a um portal estilo "Netflix" com aulas gravadas' },
            { id: '3', pillar: 'Suporte/Acompanhamento Individual', acceleration: 'Canal de atendimento rápido para resolver problemas' }
        ]
    }
};

interface DeliveryModuleProps {
    data: DeliveryData;
    onUpdate: (newData: DeliveryData) => void;
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

// --- COMPONENTS ---

const DeliveryIntro: React.FC<{ onStart: () => void }> = ({ onStart }) => {
    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="min-h-full flex flex-col items-center justify-center text-center p-6 md:p-16 animate-fadeIn">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-[#CA9A43]/10 rounded-full flex items-center justify-center mb-6 md:mb-8 border border-[#CA9A43]/30 flex-shrink-0">
                    <i className="bi bi-box-seam text-3xl md:text-4xl text-[#CA9A43]"></i>
                </div>

                <h2 className="font-serif text-3xl md:text-5xl text-white mb-6 md:mb-8">
                    A Oferta
                </h2>

                <div className="max-w-3xl space-y-4 md:space-y-6 text-gray-300 font-sans text-base md:text-lg leading-relaxed mb-8 md:mb-10">
                    <p>
                        Para que sua mentoria tenha alto valor percebido e seja elegível para a MLS futuramente, ela não pode ser apenas digital. Existe um "esqueleto" obrigatório.
                    </p>
                    <p>
                        Você precisa garantir três entregáveis:
                    </p>

                    <div className="text-left bg-[#081e30] p-6 md:p-8 rounded-lg border border-white/5 space-y-4">
                        <div className="flex items-start gap-3">
                            <i className="bi bi-check-circle-fill text-[#CA9A43] mt-1 flex-shrink-0"></i>
                            <span className="text-sm md:text-base">Pelo menos 2 Eventos Presenciais de 2 dias cada, por ano (para experiência e conexão)</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <i className="bi bi-check-circle-fill text-[#CA9A43] mt-1 flex-shrink-0"></i>
                            <span className="text-sm md:text-base">Encontros Online todos os meses (para manter o engajamento do grupo entre eventos)</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <i className="bi bi-check-circle-fill text-[#CA9A43] mt-1 flex-shrink-0"></i>
                            <span className="text-sm md:text-base">Comunidade (para networking e suporte diário)</span>
                        </div>
                    </div>

                    <p className="italic text-[#CA9A43]">
                        Vamos definir agora como você entregará cada um.
                    </p>
                </div>

                <button
                    onClick={onStart}
                    className="bg-[#CA9A43] hover:bg-[#FFE39B] text-[#031A2B] font-bold py-3 px-8 md:py-4 md:px-10 rounded-sm uppercase tracking-widest transition-all shadow-lg hover:shadow-[#CA9A43]/20 flex-shrink-0 text-sm md:text-base"
                >
                    Começar Diagnóstico
                </button>
            </div>
        </div>
    );
};

const SaveStatusIndicator = ({ status }: { status: 'idle' | 'saving' | 'saved' }) => {
    if (status === 'idle') return null;
    return (
        <div className="flex items-center gap-2 text-xs font-sans uppercase tracking-widest absolute top-6 right-6 px-3 py-1 rounded-full border border-white/10 bg-[#031A2B]/80 backdrop-blur-sm z-50 text-gray-400 transition-all duration-300">
            {status === 'saving' && (
                <>
                    <div className="w-2 h-2 rounded-full bg-[#CA9A43] animate-pulse"></div>
                    <span className="text-[#CA9A43]">Salvando...</span>
                </>
            )}
            {status === 'saved' && (
                <>
                    <span className="text-green-500 text-sm">✓</span>
                    <span>Salvo</span>
                </>
            )}
        </div>
    );
};

// --- STEP 1: NOME + OBJETIVO ---
const Step1Identity: React.FC<{ data: DeliveryData, onUpdate: (d: DeliveryData) => void, readOnly?: boolean }> = ({ data, onUpdate, readOnly }) => {
    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center py-8">
            {/* GROUP NAME */}
            <div className="w-full flex flex-col items-center mb-16 animate-fadeIn">
                <label className="text-white text-3xl md:text-4xl font-serif font-semibold mb-6">Nome do Grupo: <span className="text-red-500 text-lg">*</span></label>
                <input
                    type="text"
                    value={data.groupName}
                    onChange={(e) => onUpdate({ ...data, groupName: e.target.value })}
                    disabled={readOnly}
                    placeholder="Nome da Mentoria"
                    className="w-full max-w-md h-[60px] bg-[#081e30] border border-[#CA9A43]/50 rounded-full text-center text-lg md:text-xl font-medium text-[#CA9A43] placeholder:text-[#CA9A43]/30 outline-none focus:ring-4 ring-[#CA9A43]/10 focus:shadow-[0_0_20px_rgba(202,154,67,0.2)] transition-all"
                />
            </div>

            {/* UNIQUE OBJECTIVE */}
            <div className="w-full flex flex-col items-center animate-fadeIn delay-100">
                <label className="text-white text-2xl md:text-3xl font-serif font-medium mb-6 text-center px-4">
                    Qual é o objetivo único desse grupo em uma frase? <span className="text-red-500 text-lg">*</span>
                </label>

                <div className="w-[90%] md:w-[80%] h-[160px] bg-[#081e30] border border-white/5 hover:border-[#CA9A43]/30 rounded-2xl flex items-center justify-center p-6 transition-all group relative overflow-hidden">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[1px] bg-gradient-to-r from-transparent via-[#CA9A43] to-transparent opacity-50"></div>
                    <textarea
                        value={data.uniqueObjective}
                        onChange={(e) => onUpdate({ ...data, uniqueObjective: e.target.value })}
                        disabled={readOnly}
                        placeholder="Ex: “O único grupo focado em escalar agências para 7 dígitos sem sacrificar a vida pessoal.”"
                        className="w-full h-full bg-transparent border-none text-center text-gray-200 placeholder:text-gray-600 text-lg md:text-xl resize-none outline-none leading-relaxed font-sans"
                    />
                </div>
            </div>
        </div>
    );
};

// --- STEP 2: ENTREGÁVEIS OBRIGATÓRIOS ---
const Step2Mandatory: React.FC<{ data: DeliveryData, onUpdate: (d: DeliveryData) => void, readOnly?: boolean }> = ({ data, onUpdate, readOnly }) => {

    const toggleEngagement = (item: string) => {
        if (readOnly) return;
        const current = data.mandatory.onlineEngagement;
        const updated = current.includes(item)
            ? current.filter(i => i !== item)
            : [...current, item];
        onUpdate({ ...data, mandatory: { ...data.mandatory, onlineEngagement: updated } });
    };

    const engagementOptions = [
        "HOTSEAT: Alguém traz problema, todos resolvem",
        "CONTEÚDO: Aula nova ao vivo",
        "CONVIDADO: Trazer um expert de fora",
        "ACOMPANHAMENTO: Revisão de metas",
        "Q&A: Plantão de dúvidas com especialista",
        "OUTRO: Descreva"
    ];

    const hasOther = data.mandatory.onlineEngagement.includes("OUTRO: Descreva");

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center py-8">
            <div className="text-center mb-12">
                <h2 className="text-white text-3xl md:text-4xl font-serif font-bold mb-4">Entregáveis Obrigatórios</h2>
            </div>

            {/* FREQUENCY */}
            <div className="w-full mb-16 animate-fadeIn">
                <label className="block text-center text-white text-xl font-semibold mb-8 font-serif px-4">
                    Quantos encontros presenciais de 2 dias o grupo terá por ano? <span className="text-red-500 text-lg">*</span>
                </label>
                <div className="flex justify-center gap-8 md:gap-16">
                    {['2', '3', '4'].map((opt) => (
                        <button
                            key={opt}
                            onClick={() => !readOnly && onUpdate({ ...data, mandatory: { ...data.mandatory, frequency: opt as any } })}
                            className={`w-16 h-16 md:w-20 md:h-20 rounded-full border-2 flex items-center justify-center text-xl font-bold transition-all
                                ${data.mandatory.frequency === opt
                                    ? 'border-[#CA9A43] bg-[#CA9A43] text-[#031A2B] shadow-[0_0_20px_rgba(202,154,67,0.4)] scale-110'
                                    : 'border-white/10 bg-[#081e30] text-gray-500 hover:border-[#CA9A43]/50 hover:text-white'
                                }
                            `}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            </div>

            {/* ENGAGEMENT */}
            <div className="w-full mb-16 animate-fadeIn delay-100">
                <label className="block text-center text-white text-xl font-semibold mb-8 font-serif px-4">
                    Como você vai manter o engajamento do grupo nos encontros online? <span className="text-red-500 text-lg">*</span>
                </label>
                <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto px-4">
                    {engagementOptions.map((opt) => (
                        <button
                            key={opt}
                            onClick={() => toggleEngagement(opt)}
                            className={`p-4 rounded-xl border flex items-center gap-4 text-left transition-all group
                                ${data.mandatory.onlineEngagement.includes(opt)
                                    ? 'border-[#CA9A43] bg-[#CA9A43]/10'
                                    : 'border-white/10 bg-[#081e30] hover:border-white/20'
                                }
                            `}
                        >
                            <div className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors
                                ${data.mandatory.onlineEngagement.includes(opt) ? 'border-[#CA9A43] bg-[#CA9A43]' : 'border-gray-600 group-hover:border-gray-400'}
                             `}>
                                {data.mandatory.onlineEngagement.includes(opt) && <i className="bi bi-check text-[#031A2B] text-lg"></i>}
                            </div>
                            <span className={`text-sm md:text-sm font-medium font-sans ${data.mandatory.onlineEngagement.includes(opt) ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'}`}>
                                {opt}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Custom Text Input for 'OUTRO' */}
                <AnimatePresence>
                    {hasOther && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="max-w-3xl mx-auto px-4 mt-4 overflow-hidden"
                        >
                            <input
                                type="text"
                                value={data.mandatory.otherEngagementText || ''}
                                onChange={(e) => onUpdate({
                                    ...data,
                                    mandatory: { ...data.mandatory, otherEngagementText: e.target.value }
                                })}
                                placeholder="Descreva a outra forma de engajamento..."
                                disabled={readOnly}
                                className="w-full bg-[#051522] border border-[#CA9A43] rounded-lg p-4 text-white text-sm outline-none focus:shadow-[0_0_15px_rgba(202,154,67,0.2)] placeholder:text-gray-600 transition-all"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* RULES */}
            <div className="w-full flex flex-col items-center animate-fadeIn delay-200">
                <label className="block text-center text-white text-xl font-semibold mb-6 font-serif">
                    Regras da Comunidade <span className="text-red-500 text-lg">*</span>
                </label>
                <div className="w-[90%] md:w-[80%] min-h-[160px] bg-[#081e30] border border-white/5 hover:border-[#CA9A43]/30 rounded-2xl p-6 shadow-sm transition-all">
                    <textarea
                        value={data.mandatory.communityRules}
                        onChange={(e) => onUpdate({ ...data, mandatory: { ...data.mandatory, communityRules: e.target.value } })}
                        disabled={readOnly}
                        placeholder="Ex: Proibido excluir. Proibido vender sem permissão. O que acontece no grupo fica no grupo."
                        className="w-full h-full bg-transparent border-none text-center text-gray-200 placeholder:text-gray-600 text-lg resize-none outline-none leading-relaxed font-sans"
                    />
                </div>
            </div>
        </div>
    );
};

// --- STEP 3: OVERDELIVERY ---
const Step3Overdelivery: React.FC<{ data: DeliveryData, onUpdate: (d: DeliveryData) => void, readOnly?: boolean }> = ({ data, onUpdate, readOnly }) => {

    const updateAccelerator = (id: string, field: 'pillar' | 'acceleration', val: string) => {
        if (readOnly) return;
        const updated = data.overdelivery.accelerators.map(acc =>
            acc.id === id ? { ...acc, [field]: val } : acc
        );
        onUpdate({ ...data, overdelivery: { ...data.overdelivery, accelerators: updated } });
    };

    const addAccelerator = () => {
        if (readOnly) return;
        const newAcc: Accelerator = {
            id: Date.now().toString(),
            pillar: '',
            acceleration: ''
        };
        onUpdate({
            ...data,
            overdelivery: {
                ...data.overdelivery,
                accelerators: [...data.overdelivery.accelerators, newAcc]
            }
        });
    };

    const removeAccelerator = (id: string) => {
        if (readOnly) return;
        const updated = data.overdelivery.accelerators.filter(acc => acc.id !== id);
        onUpdate({ ...data, overdelivery: { ...data.overdelivery, accelerators: updated } });
    };

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center py-8">
            <div className="text-center mb-12">
                <h2 className="text-white text-3xl md:text-4xl font-serif font-bold mb-4">Entregáveis Opcionais: O "Overdelivery"</h2>
                <p className="text-gray-400 text-base max-w-xl mx-auto font-sans mb-8">
                    Os entregáveis anteriores são o mínimo. Agora vamos definir seu Overdelivery para aumentar percepção de valor.
                </p>
            </div>

            {/* INDIVIDUAL SESSIONS */}
            <div className="w-full mb-16 animate-fadeIn">
                <label className="block text-center text-white text-xl font-semibold mb-8 font-serif">
                    Entregas Individuais (1:1) <span className="text-red-500 text-lg">*</span>
                </label>

                <div className="flex justify-center gap-8 mb-8">
                    {['no', 'yes'].map((opt) => (
                        <button
                            key={opt}
                            onClick={() => !readOnly && onUpdate({ ...data, overdelivery: { ...data.overdelivery, hasIndividual: opt as any } })}
                            className={`px-8 py-3 rounded-full font-bold uppercase tracking-wider transition-all border
                                ${data.overdelivery.hasIndividual === opt
                                    ? 'bg-[#CA9A43] text-[#031A2B] border-[#CA9A43] shadow-[0_0_20px_rgba(202,154,67,0.3)]'
                                    : 'bg-transparent text-gray-500 border-white/10 hover:border-[#CA9A43] hover:text-white'
                                }
                            `}
                        >
                            {opt === 'yes' ? 'Sim' : 'Não'}
                        </button>
                    ))}
                </div>

                <AnimatePresence>
                    {data.overdelivery.hasIndividual === 'yes' && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex flex-col items-center gap-6 overflow-hidden"
                        >
                            <div className="w-[90%] md:w-[80%] bg-[#081e30] border border-white/10 rounded-2xl p-6 shadow-sm">
                                <label className="block text-xs font-bold uppercase text-[#CA9A43] mb-2 tracking-widest">Quem fará a entrega? <span className="text-red-500">*</span></label>
                                <textarea
                                    value={data.overdelivery.individualDetails}
                                    onChange={(e) => onUpdate({ ...data, overdelivery: { ...data.overdelivery, individualDetails: e.target.value } })}
                                    disabled={readOnly}
                                    placeholder="Ex: Eu mesmo farei a sessão inicial de alinhamento..."
                                    className="w-full bg-transparent border-none text-left text-gray-200 placeholder:text-gray-600 text-base resize-none outline-none leading-relaxed h-24"
                                />
                            </div>

                            <input
                                type="text"
                                value={data.overdelivery.frequency}
                                onChange={(e) => onUpdate({ ...data, overdelivery: { ...data.overdelivery, frequency: e.target.value } })}
                                disabled={readOnly}
                                placeholder="Frequência/Quantidade (Ex: 1 por mês) *"
                                className="w-[280px] h-[50px] bg-[#051522] border border-[#CA9A43]/50 rounded-full text-center text-base font-medium text-white placeholder:text-gray-600 outline-none focus:border-[#CA9A43] transition-all"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ACCELERATORS TABLE */}
            <div className="w-full animate-fadeIn delay-100">
                <label className="block text-center text-white text-xl font-semibold mb-2 font-serif">
                    Aceleradores de Resultado
                </label>
                <p className="text-gray-400 text-sm text-center mb-8 italic max-w-2xl mx-auto">
                    "O seu cliente não quer apenas aprender a fazer; ele quer o resultado pronto. O que você pode entregar 'mastigado' para que ele ganhe velocidade?"
                </p>

                <div className="w-full max-w-4xl mx-auto bg-[#081e30] border border-white/10 rounded-lg overflow-hidden shadow-sm">
                    {/* TABLE HEADER - Hidden on mobile */}
                    <div className="hidden md:grid grid-cols-[1fr_2fr_50px] bg-white/5 border-b border-white/10 p-4">
                        <div className="text-gray-400 font-bold text-sm uppercase tracking-wider text-center">TÍTULO</div>
                        <div className="text-gray-400 font-bold text-sm uppercase tracking-wider text-center">DESCRIÇÃO</div>
                        <div className="text-gray-400 font-bold text-sm uppercase tracking-wider text-center"></div>
                    </div>

                    {/* TABLE BODY */}
                    <div>
                        {data.overdelivery.accelerators.map((acc) => (
                            <div key={acc.id} className="flex flex-col md:grid md:grid-cols-[1fr_2fr_50px] border-b border-white/5 last:border-0 group hover:bg-white/5 transition-colors p-4 md:p-0">

                                {/* Mobile Label Title */}
                                <label className="md:hidden text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Título</label>
                                <input
                                    value={acc.pillar}
                                    onChange={(e) => updateAccelerator(acc.id, 'pillar', e.target.value)}
                                    placeholder="Ex: Assistente de Vendas"
                                    disabled={readOnly}
                                    className="mb-4 md:mb-0 p-4 text-left md:text-center bg-[#051522] md:bg-transparent border border-white/10 md:border-none md:border-r md:border-white/5 rounded md:rounded-none text-white font-medium outline-none transition-colors placeholder:text-gray-600"
                                />

                                {/* Mobile Label Description */}
                                <label className="md:hidden text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Descrição</label>
                                <input
                                    value={acc.acceleration}
                                    onChange={(e) => updateAccelerator(acc.id, 'acceleration', e.target.value)}
                                    placeholder="Ex: Inteligência Artificial que participa de reuniões..."
                                    disabled={readOnly}
                                    className="mb-2 md:mb-0 p-4 text-left bg-[#051522] md:bg-transparent border border-white/10 md:border-none md:border-r md:border-white/5 rounded md:rounded-none text-gray-300 outline-none transition-colors placeholder:text-gray-600"
                                />

                                <div className="flex items-center justify-end md:justify-center mt-2 md:mt-0">
                                    {!readOnly && (
                                        <button
                                            onClick={() => removeAccelerator(acc.id)}
                                            className="text-gray-600 hover:text-red-400 transition-colors p-2 flex items-center gap-2"
                                        >
                                            <span className="md:hidden uppercase font-bold text-xs text-red-400">Remover</span>
                                            <i className="bi bi-trash"></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {!readOnly && (
                        <button
                            onClick={addAccelerator}
                            className="w-full py-3 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-sm font-bold uppercase transition-colors border-t border-white/5 flex items-center justify-center gap-2"
                        >
                            <i className="bi bi-plus-lg"></i> Adicionar Linha
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- COMPLETION VIEW ---
const CompletionView: React.FC<{ onReview: () => void; onSend?: () => void; readOnly?: boolean }> = ({ onReview, onSend, readOnly }) => {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8 rounded-lg">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, type: "spring" }}
                className={`w-24 h-24 rounded-full border flex items-center justify-center mb-6 shadow-xl
                    ${readOnly
                        ? 'bg-blue-500/10 border-blue-500 shadow-blue-500/20 text-blue-500'
                        : 'bg-green-500/10 border-green-500 shadow-green-500/20 text-green-500'
                    }`}
            >
                {readOnly ? (
                    <i className="bi bi-file-earmark-lock text-5xl"></i>
                ) : (
                    <i className="bi bi-check-lg text-5xl"></i>
                )}
            </motion.div>

            <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="font-serif text-4xl text-white mb-4"
            >
                {readOnly ? 'Módulo em Análise' : 'Entrega Definida!'}
            </motion.h2>

            <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-gray-400 max-w-md font-sans text-lg mb-8 leading-relaxed"
            >
                {readOnly
                    ? 'Seus entregáveis foram enviados e estão sendo analisados.'
                    : 'Parabéns! Você estruturou seu produto final. Agora você tem clareza do que vai vender.'
                }
            </motion.p>

            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex flex-col md:flex-row gap-4"
            >
                <button
                    onClick={onReview}
                    className="px-6 py-3 border border-white/10 hover:bg-white/5 text-gray-300 rounded-sm font-bold text-sm uppercase tracking-wider transition-colors"
                >
                    {readOnly ? 'Visualizar' : 'Revisar'}
                </button>

                {!readOnly && onSend && (
                    <button
                        onClick={onSend}
                        className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white hover:bg-green-500 font-bold rounded-sm text-sm uppercase tracking-wider shadow-lg hover:shadow-green-500/30 transition-all flex items-center justify-center gap-2"
                    >
                        Concluir Módulo <i className="bi bi-check2-circle"></i>
                    </button>
                )}
            </motion.div>
        </div>
    );
};

// --- MAIN MODULE ---
export const DeliveryModule: React.FC<DeliveryModuleProps> = ({
    data,
    onUpdate,
    onSaveAndExit,
    onComplete,
    isReadOnly = false,
    savedStep,
    onStepChange
}) => {
    // Usar savedStep se disponível, caso contrário começar do passo 1
    const startingStep = savedStep !== undefined ? savedStep : 1;
    const [currentStep, setCurrentStep] = useState(startingStep);
    const [showCompletion, setShowCompletion] = useState(isReadOnly);
    const [showIntro, setShowIntro] = useState(!isReadOnly);
    const totalSteps = 3;
    const saveStatus = useAutoSave(data);

    // Salvar currentStep sempre que ele mudar
    useEffect(() => {
        if (onStepChange && !showIntro && !showCompletion) {
            onStepChange(currentStep);
        }
    }, [currentStep, onStepChange, showIntro, showCompletion]);

    useEffect(() => {
        if (isReadOnly) {
            setShowCompletion(true);
            setShowIntro(false);
        }
    }, [isReadOnly]);

    const handleNext = () => {
        if (canProceed) {
            if (currentStep < totalSteps) {
                const nextStep = currentStep + 1;
                setCurrentStep(nextStep);
                if (onStepChange) onStepChange(nextStep);
            } else {
                setShowCompletion(true);
                if (onStepChange) onStepChange(currentStep);
            }
        }
    };

    const handlePrev = () => {
        if (currentStep > 1) {
            const prevStep = currentStep - 1;
            setCurrentStep(prevStep);
            if (onStepChange) onStepChange(prevStep);
        }
    };

    // Validation Logic
    const validateStep = () => {
        if (isReadOnly) return true;

        switch (currentStep) {
            case 1: // Identity
                return data.groupName.trim().length > 0 &&
                    data.uniqueObjective.trim().length > 0;
            case 2: // Mandatory
                const hasOther = data.mandatory.onlineEngagement.includes("OUTRO: Descreva");
                const otherValid = hasOther ? (data.mandatory.otherEngagementText || '').trim().length > 0 : true;

                return data.mandatory.frequency !== null &&
                    data.mandatory.onlineEngagement.length > 0 &&
                    data.mandatory.communityRules.trim().length > 0 &&
                    otherValid;
            case 3: // Overdelivery
                // Check Individual logic
                if (data.overdelivery.hasIndividual === null) return false;
                if (data.overdelivery.hasIndividual === 'yes') {
                    if (data.overdelivery.individualDetails.trim().length === 0 ||
                        data.overdelivery.frequency.trim().length === 0) {
                        return false;
                    }
                }
                // Check Accelerators (ensure existing ones are filled)
                const validAccelerators = data.overdelivery.accelerators.every(acc =>
                    acc.pillar.trim().length > 0 && acc.acceleration.trim().length > 0
                );
                return validAccelerators;
            default:
                return true;
        }
    };

    const canProceed = validateStep();

    const renderStep = () => {
        const props = { data, onUpdate, readOnly: isReadOnly };
        switch (currentStep) {
            case 1: return <Step1Identity {...props} />;
            case 2: return <Step2Mandatory {...props} />;
            case 3: return <Step3Overdelivery {...props} />;
            default: return null;
        }
    };

    return (
        <div className="bg-[#051522] border border-white/5 rounded-lg h-[800px] shadow-2xl relative overflow-hidden flex flex-col font-sans">
            {/* Header - Dark Theme */}
            <div className="bg-[#081e30] p-6 border-b border-white/5 flex items-center justify-between flex-shrink-0 z-10">
                <div>
                    <div className="flex items-center gap-3">
                        <button onClick={onSaveAndExit} className="text-gray-400 hover:text-white transition-colors">
                            <i className="bi bi-arrow-left text-xl"></i>
                        </button>
                        <span className="text-[#CA9A43] text-xs font-bold uppercase tracking-widest">Módulo: A Oferta</span>
                        {isReadOnly && <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded border border-blue-500/30 font-bold">EM ANÁLISE</span>}
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

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-[#051522]">
                {!isReadOnly && !showCompletion && !showIntro && <SaveStatusIndicator status={saveStatus} />}

                <AnimatePresence mode="wait">
                    <motion.div
                        key={showIntro ? 'intro' : (showCompletion ? 'complete' : currentStep)}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className="h-full"
                    >
                        {showIntro ? (
                            <DeliveryIntro onStart={() => setShowIntro(false)} />
                        ) : showCompletion ? (
                            <CompletionView onReview={() => { 
                                setShowCompletion(false); 
                                setCurrentStep(1);
                                if (onStepChange) onStepChange(1);
                            }} onSend={onComplete} readOnly={isReadOnly} />
                        ) : (
                            renderStep()
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Footer Navigation - Dark Theme */}
            {!showIntro && !showCompletion && (
                <div className="bg-[#031A2B] p-4 border-t border-white/5 flex justify-between items-center flex-shrink-0 z-10">
                    <button
                        onClick={handlePrev}
                        disabled={currentStep === 1}
                        className="text-gray-400 hover:text-white disabled:opacity-30 flex items-center gap-2 px-6 py-3 text-sm font-bold uppercase tracking-wider rounded-lg border border-transparent hover:bg-white/5 transition-all"
                    >
                        <i className="bi bi-arrow-left"></i> Voltar
                    </button>

                    <div className="flex items-center gap-4">
                        <button onClick={onSaveAndExit} className="text-gray-400 hover:text-white text-xs uppercase font-bold tracking-widest px-4">
                            Salvar Rascunho
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!canProceed}
                            className={`font-bold px-8 py-3 rounded-sm flex items-center gap-2 transition-colors text-sm uppercase tracking-wider shadow-lg
                                ${!canProceed
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
                                    : 'bg-[#CA9A43] text-[#031A2B] hover:bg-[#FFE39B] hover:shadow-xl hover:-translate-y-0.5'
                                }
                            `}
                        >
                            {currentStep < totalSteps ? 'Próxima Etapa' : 'Finalizar'} <i className="bi bi-arrow-right"></i>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
