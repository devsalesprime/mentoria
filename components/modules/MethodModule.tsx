
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- TYPES ---

export interface Pillar {
    id: string;
    what: string;
    why: string;
    how: string;
}

export interface JourneyStep {
    id: string;
    title: string;
    importance: string;
    problems?: string;
    solutions?: string;
}

export interface MethodData {
    stage: 'none' | 'idea' | 'structured' | null;
    name: string;
    transformation: string;
    pillars: Pillar[];
    // Campos para a Jornada (Propósito)
    purpose: {
        pointA: {
            pain: string;
            failed: string;
            limit: string;
        };
        pointB: {
            worth: string;
            ability: string;
            feeling: string;
        };
    };
    // Novo campo para Mapa da Jornada
    journeyMap: JourneyStep[];
}

export const INITIAL_METHOD_DATA: MethodData = {
    stage: null,
    name: '',
    transformation: '',
    pillars: [
        { id: '1', what: '', why: '', how: '' },
        { id: '2', what: '', why: '', how: '' },
        { id: '3', what: '', why: '', how: '' }
    ],
    purpose: {
        pointA: { pain: '', failed: '', limit: '' },
        pointB: { worth: '', ability: '', feeling: '' }
    },
    journeyMap: [
        { id: '1', title: '', importance: '', problems: '', solutions: '' },
        { id: '2', title: '', importance: '', problems: '', solutions: '' },
        { id: '3', title: '', importance: '', problems: '', solutions: '' }
    ]
};

interface MethodModuleProps {
    data: MethodData;
    onUpdate: (newData: MethodData) => void;
    onSaveAndExit: () => void;
    onComplete?: () => void;
    isReadOnly?: boolean;
    savedStep?: number; // Etapa salva anteriormente
    onStepChange?: (step: number) => void; // Callback quando a etapa muda
}

// --- STYLES FOR SCROLLBARS ---
const scrollbarStyles = "overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-[#031A2B] [&::-webkit-scrollbar-thumb]:bg-[#CA9A43]/50 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#CA9A43]";
const verticalScrollbarStyles = "overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[#031A2B] [&::-webkit-scrollbar-thumb]:bg-[#CA9A43]/50 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#CA9A43]";

const getInitialStep = (data: MethodData): number => {
    if (!data.stage) return 1;

    // Structured Path logic (Short Flow)
    if (data.stage === 'structured') {
        // Step 2 for structured is MethodStructuring (Name, Trans, Pillars)
        // Check strict validation for pillars (3 mins, fields length > 3)
        const hasValidPillars = data.pillars.length >= 3 && data.pillars.every(p =>
            p.what.length >= 3 && p.why.length >= 3 && p.how.length >= 3
        );

        if (!data.name || data.name.length < 5 ||
            !data.transformation || data.transformation.length < 10 ||
            !hasValidPillars) return 2;

        return 3; // Completed (Structured flow has 2 steps)
    }

    // Idea/None Path Logic (Long Flow)
    const pA = data.purpose.pointA;
    const pB = data.purpose.pointB;
    const hasPurpose = pA.pain.length > 3 && pA.failed.length > 3 && pA.limit.length > 3 &&
        pB.worth.length > 3 && pB.ability.length > 3 && pB.feeling.length > 3;

    if (!hasPurpose) return 2; // Purpose

    const hasJourney = data.journeyMap.length >= 3 &&
        data.journeyMap.every(s => s.title.length > 3 && s.importance.length > 3);

    if (!hasJourney) return 3; // Journey

    // XRay Check
    const hasXRay = hasJourney && data.journeyMap.every(s => (s.problems?.length || 0) > 5 && (s.solutions?.length || 0) > 5);
    if (!hasXRay) return 4; // XRay

    return 5; // Completed (Standard flow has 4 steps)
}

// --- SUB-COMPONENTS ---

const MethodIntro: React.FC<{ onStart: () => void }> = ({ onStart }) => {
    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="min-h-full flex flex-col items-center justify-start md:justify-center text-center p-4 md:p-16 animate-fadeIn py-12 md:py-0">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-[#CA9A43]/10 rounded-full flex items-center justify-center mb-6 md:mb-8 border border-[#CA9A43]/30 flex-shrink-0">
                    <i className="bi bi-diagram-3 text-3xl md:text-4xl text-[#CA9A43]"></i>
                </div>

                <h2 className="font-serif text-3xl md:text-5xl text-white mb-6 md:mb-8">
                    O Método
                </h2>

                <p className="text-gray-300 font-sans text-base md:text-lg mb-8 md:mb-10 max-w-2xl leading-relaxed">
                    Método vem do grego de “caminho até a meta”.<br />
                    É só isso: um jeito claro de sair do ponto A e chegar no ponto B.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full max-w-5xl mb-8 md:mb-10 text-left">
                    <div className="bg-[#081e30] p-6 rounded border border-white/5 hover:border-[#CA9A43]/30 transition-colors">
                        <h3 className="text-[#CA9A43] font-bold text-xs md:text-sm uppercase tracking-widest mb-3">1. Cria Autoridade Real</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Um método mostra que o que você faz não é sorte. É um processo: tem começo, meio e fim.
                            Você deixa claro: “Eu fiz. Aprendi. Refinei. Agora ensino.”
                            Isso tira você da multidão e te coloca como referência.
                        </p>
                    </div>

                    <div className="bg-[#081e30] p-6 rounded border border-white/5 hover:border-[#CA9A43]/30 transition-colors">
                        <h3 className="text-[#CA9A43] font-bold text-xs md:text-sm uppercase tracking-widest mb-3">2. Mostra que é Autêntico</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Método próprio = história própria. Ninguém copia sua jornada com os mesmos passos.
                            Quando você ensina com base no que viveu, soa verdadeiro.
                            Isso atrai quem busca mais do que teoria: busca prova viva.
                        </p>
                    </div>

                    <div className="bg-[#081e30] p-6 rounded border border-white/5 hover:border-[#CA9A43]/30 transition-colors">
                        <h3 className="text-[#CA9A43] font-bold text-xs md:text-sm uppercase tracking-widest mb-3">3. Simples é Poderoso</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Gente confusa não toma decisão.
                            Quando você pega algo difícil e quebra em etapas simples, você vira um guia confiável.
                            A pessoa pensa: “Se ele explica assim, imagina como resolve.”
                            Você mostra que entende mais do problema do que ela mesma. E por isso, está pronto pra levar ela à solução.
                        </p>
                    </div>
                </div>

                <p className="text-gray-400 text-sm max-w-2xl mb-8 md:mb-10 italic leading-relaxed">
                    Quando você entende isso, fica fácil ver porquê um mentor precisa de um.
                    No fim, ter um método é mostrar que você sabe o caminho e pode levar alguém junto. Isso cria confiança. E confiança é o que faz uma pessoa dizer: “Quero que você seja meu mentor.”
                </p>

                <button
                    onClick={onStart}
                    className="bg-[#CA9A43] hover:bg-[#FFE39B] text-[#031A2B] font-bold py-3 px-8 md:py-4 md:px-10 rounded-sm uppercase tracking-widest transition-all shadow-lg hover:shadow-[#CA9A43]/20 flex-shrink-0 text-sm md:text-base mb-8 md:mb-0"
                >
                    Começar Diagnóstico
                </button>
            </div>
        </div>
    );
};

// Completion View (Tela de Sucesso/Envio)
const CompletionView: React.FC<{ onReview: () => void; onSend?: () => void; readOnly?: boolean }> = ({ onReview, onSend, readOnly }) => {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, type: "spring" }}
                className={`w-24 h-24 rounded-full border flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,0,0,0.2)]
                    ${readOnly
                        ? 'bg-blue-500/10 border-blue-500/50 shadow-blue-500/20'
                        : 'bg-green-500/10 border-green-500/50 shadow-green-500/20'
                    }`}
            >
                {readOnly ? (
                    <i className="bi bi-file-earmark-lock text-5xl text-blue-500"></i>
                ) : (
                    <i className="bi bi-check-lg text-5xl text-green-500"></i>
                )}
            </motion.div>

            <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="font-serif text-4xl text-white mb-4"
            >
                {readOnly ? 'Módulo em Análise' : 'Módulo Concluído!'}
            </motion.h2>

            <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-gray-400 max-w-md font-sans text-lg mb-8 leading-relaxed"
            >
                {readOnly
                    ? 'Suas respostas foram enviadas e estão sendo analisadas pela nossa equipe.'
                    : 'Parabéns! Você estruturou seu método. Deseja enviar agora para avaliação ou apenas salvar?'
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
                    {readOnly ? 'Visualizar Respostas' : 'Revisar Respostas'}
                </button>

                {!readOnly && onSend && (
                    <button
                        onClick={onSend}
                        className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white font-bold rounded-sm text-sm uppercase tracking-wider shadow-lg hover:shadow-green-500/30 transition-all flex items-center justify-center gap-2"
                    >
                        Enviar para Avaliação <i className="bi bi-send-fill"></i>
                    </button>
                )}
            </motion.div>
        </div>
    );
};

// ETAPA 1: SELEÇÃO DO ESTÁGIO
const MethodSelection: React.FC<{
    data: MethodData;
    onUpdate: (d: MethodData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    const [showTooltip, setShowTooltip] = useState(false);

    const handleSelect = (stage: MethodData['stage']) => {
        if (readOnly) return;
        onUpdate({ ...data, stage });
    };

    const cards = [
        {
            id: 'none',
            color: 'text-red-500',
            borderColor: 'border-red-500',
            bgSelected: 'bg-red-500/10',
            glow: 'shadow-red-900/40',
            text: 'Ainda não tenho um método definido.',
            feedback: 'Perfeito! Vamos construir seu método do zero juntos. 🚀',
        },
        {
            id: 'idea',
            color: 'text-orange-500',
            borderColor: 'border-orange-500',
            bgSelected: 'bg-orange-500/10',
            glow: 'shadow-orange-900/40',
            text: 'Tenho um método na cabeça, mas nunca coloquei no papel.',
            feedback: 'Ótimo! Vamos estruturar e documentar o que está na sua cabeça. 📝',
        },
        {
            id: 'structured',
            color: 'text-emerald-500',
            borderColor: 'border-emerald-500',
            bgSelected: 'bg-emerald-500/10',
            glow: 'shadow-emerald-900/40',
            text: 'Sim, tenho um método estruturado e já usei com clientes.',
            feedback: 'Excelente! Vamos refinar e otimizar seu método testado. ✨',
        }
    ];

    const selectedCard = cards.find(c => c.id === data.stage);

    return (
        <div className={`max-w-6xl mx-auto h-full flex flex-col ${verticalScrollbarStyles}`}>
            <div className="text-center mb-12 relative flex-shrink-0">
                <h2 className="font-serif text-3xl md:text-4xl text-white font-bold leading-tight mb-4 inline-block relative">
                    Você já tem um método claro para entregar a transformação que os seus mentorados buscam?
                    <button
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-white/20 text-white/50 text-sm ml-3 hover:text-white hover:border-white transition-colors cursor-help align-middle font-sans"
                    >
                        ?
                    </button>
                    <AnimatePresence>
                        {showTooltip && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute left-1/2 -translate-x-1/2 top-full mt-4 w-72 bg-[#031A2B] border border-[#CA9A43]/30 text-gray-300 text-sm font-sans font-normal p-4 rounded-sm shadow-xl text-left z-50 pointer-events-none"
                            >
                                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#031A2B] border-t border-l border-[#CA9A43]/30 rotate-45"></div>
                                Seu método é o caminho estruturado que você usa para levar seus clientes de onde estão até onde querem chegar.
                            </motion.div>
                        )}
                    </AnimatePresence>
                </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8 flex-shrink-0 px-2">
                {cards.map((card, index) => {
                    const isSelected = data.stage === card.id;
                    return (
                        <motion.div
                            key={card.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1, duration: 0.4 }}
                            whileHover={!readOnly ? { y: -4 } : {}}
                            onClick={() => handleSelect(card.id as MethodData['stage'])}
                            className={`relative bg-[#081e30] border rounded-sm p-8 min-h-[280px] flex flex-col items-center justify-center text-center transition-all duration-300 group
                                ${readOnly ? 'cursor-default' : 'cursor-pointer'}
                                ${isSelected
                                    ? `${card.borderColor} ${card.bgSelected} shadow-[0_0_30px_rgba(0,0,0,0.2)]`
                                    : `border-white/5 ${!readOnly && 'hover:border-white/20'}`
                                }
                                ${readOnly && !isSelected ? 'opacity-50' : 'opacity-100'}
                            `}
                        >
                            {isSelected && (
                                <motion.div
                                    initial={{ scale: 0, rotate: -90 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    className={`absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-[#031A2B] bg-[#031A2B] ${card.color}`}
                                >
                                    <i className="bi bi-check-lg font-bold"></i>
                                </motion.div>
                            )}

                            <p className={`text-xl md:text-2xl font-serif font-bold leading-snug mb-6 transition-colors ${isSelected ? card.color : 'text-gray-300 group-hover:text-white'}`}>
                                {card.text}
                            </p>

                        </motion.div>
                    );
                })}
            </div>

            <AnimatePresence mode="wait">
                {selectedCard && (
                    <motion.div
                        key={selectedCard.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-center mb-8"
                    >
                        <p className={`text-lg md:text-xl font-medium ${selectedCard.color}`}>{selectedCard.feedback}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ETAPA 2 (FLUXO STRUCTURED): ESTRUTURAÇÃO DO MÉTODO
const MethodStructuring: React.FC<{
    data: MethodData;
    onUpdate: (d: MethodData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {

    const updatePillar = (id: string, field: keyof Pillar, value: string) => {
        if (readOnly) return;
        const newPillars = data.pillars.map(p => p.id === id ? { ...p, [field]: value } : p);
        onUpdate({ ...data, pillars: newPillars });
    };

    const addPillar = () => {
        if (readOnly || data.pillars.length >= 8) return;
        const newPillar: Pillar = { id: Date.now().toString(), what: '', why: '', how: '' };
        onUpdate({ ...data, pillars: [...data.pillars, newPillar] });
    };

    const removePillar = (id: string) => {
        if (readOnly || data.pillars.length <= 3) return;
        onUpdate({ ...data, pillars: data.pillars.filter(p => p.id !== id) });
    };

    // Helper to check if a pillar is complete
    const isPillarComplete = (p: Pillar) => p.what.length >= 3 && p.why.length >= 3 && p.how.length >= 3;

    return (
        <div className={`w-full h-full max-w-[1200px] mx-auto flex flex-col items-center pb-12 ${verticalScrollbarStyles}`}>

            {/* SEÇÃO 1: NOME DO MÉTODO */}
            <div className="w-full flex justify-center mb-12 mt-4 relative">
                <input
                    type="text"
                    value={data.name}
                    onChange={(e) => onUpdate({ ...data, name: e.target.value })}
                    placeholder="Nome do seu método"
                    maxLength={50}
                    disabled={readOnly}
                    className={`w-[300px] h-[48px] rounded-full px-8 text-center text-lg font-semibold bg-[#031A2B] border border-[#CA9A43]/20 shadow-[0_4px_12px_rgba(202,154,67,0.25)] text-white placeholder:text-[#CA9A43]/40 outline-none transition-all
                        ${!readOnly && 'focus:shadow-[0_0_0_4px_rgba(202,154,67,0.2)] focus:border-[#CA9A43]'}
                        ${readOnly ? 'opacity-80 cursor-not-allowed' : ''}
                    `}
                />
            </div>

            {/* SEÇÃO 2: TRANSFORMAÇÃO */}
            <div className="w-full max-w-[850px] mb-20 text-center">
                <h3 className="text-white text-2xl md:text-3xl font-semibold mb-4 font-serif">Que mudança esse método gera?</h3>
                <p className="text-gray-400 text-base mb-8">Descreva a grande transformação que seu método entrega na vida ou no negócio do mentorado.</p>

                <div className={`w-full min-h-[150px] rounded-[20px] bg-[#081e30] border border-white/5 shadow-[0_4px_20px_rgba(202,154,67,0.1)] p-8 md:p-10 relative group transition-all
                    ${!readOnly && 'hover:shadow-[0_8px_30px_rgba(202,154,67,0.2)] hover:border-[#CA9A43]/30'}
                `}>
                    <label className="block text-left text-[#CA9A43] font-bold text-base mb-2">A Promessa:</label>
                    <textarea
                        value={data.transformation}
                        onChange={(e) => onUpdate({ ...data, transformation: e.target.value })}
                        placeholder="Ex: Ajudo donos de pequenas empresas a saírem do caos diário para uma operação previsível e lucrativa."
                        maxLength={250}
                        disabled={readOnly}
                        className="w-full bg-transparent border-none text-center text-xl md:text-2xl font-medium text-white placeholder:text-gray-600 outline-none resize-none h-[100px] leading-relaxed"
                    />
                    {!readOnly && (
                        <div className="absolute bottom-4 right-6 text-xs font-mono text-gray-500">
                            {data.transformation.length}/250
                        </div>
                    )}
                </div>
            </div>

            {/* SEÇÃO 3: PILARES */}
            <div className="w-full">
                <h3 className="text-white text-3xl font-semibold text-center mb-4 font-serif">Como o seu método faz essa mudança acontecer?</h3>
                <p className="text-gray-400 text-center text-sm mb-12 max-w-2xl mx-auto">
                    Que passos ou pilares sempre aparecem quando você aplica esse método?<br />
                    Pense em grandes movimentos, não em tarefas pequenas.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10 px-4">
                    {data.pillars.map((pillar, index) => {
                        const isLast = index === data.pillars.length - 1;
                        const complete = isPillarComplete(pillar);

                        return (
                            <motion.div
                                key={pillar.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`relative min-h-[350px] bg-[#081e30] border-2 rounded-2xl p-6 flex flex-col shadow-lg transition-all
                                    ${complete ? 'border-[#CA9A43]/50' : 'border-white/5'}
                                    ${!readOnly && 'hover:-translate-y-1 hover:shadow-2xl hover:border-[#CA9A43]/30'}
                                `}
                            >
                                {/* Header / Delete */}
                                <div className="flex justify-between items-center mb-6">
                                    <span className="text-xs font-bold uppercase tracking-widest text-[#CA9A43] bg-[#CA9A43]/10 px-2 py-1 rounded">
                                        Pilar {index + 1}
                                    </span>
                                    {!readOnly && data.pillars.length > 3 && (
                                        <button
                                            onClick={() => removePillar(pillar.id)}
                                            className="text-gray-600 hover:text-red-400 transition-colors"
                                        >
                                            <i className="bi bi-trash"></i>
                                        </button>
                                    )}
                                    {complete && <i className="bi bi-check-circle-fill text-green-500 absolute top-6 right-6"></i>}
                                </div>

                                {/* Campo 1: O Que É */}
                                <div className="mb-4">
                                    <label className="block text-[11px] font-bold uppercase text-gray-400 mb-2">O que é?</label>
                                    <textarea
                                        value={pillar.what}
                                        onChange={(e) => updatePillar(pillar.id, 'what', e.target.value)}
                                        placeholder="Descreva em uma frase..."
                                        disabled={readOnly}
                                        className="w-full bg-[#051522] border border-white/10 rounded-lg p-3 text-sm text-white resize-none h-[70px] outline-none focus:border-[#CA9A43] transition-colors"
                                    />
                                </div>

                                {/* Campo 2: Por que */}
                                <div className="mb-4">
                                    <label className="block text-[11px] font-bold uppercase text-gray-400 mb-2">Por que é importante?</label>
                                    <textarea
                                        value={pillar.why}
                                        onChange={(e) => updatePillar(pillar.id, 'why', e.target.value)}
                                        placeholder="Por que é indispensável?"
                                        disabled={readOnly}
                                        className="w-full bg-[#051522] border border-white/10 rounded-lg p-3 text-sm text-white resize-none h-[70px] outline-none focus:border-[#CA9A43] transition-colors"
                                    />
                                </div>

                                {/* Campo 3: Como */}
                                <div className="flex-1">
                                    <label className="block text-[11px] font-bold uppercase text-gray-400 mb-2">Como acontece?</label>
                                    <textarea
                                        value={pillar.how}
                                        onChange={(e) => updatePillar(pillar.id, 'how', e.target.value)}
                                        placeholder="Na prática..."
                                        disabled={readOnly}
                                        className="w-full bg-[#051522] border border-white/10 rounded-lg p-3 text-sm text-white resize-none h-[70px] outline-none focus:border-[#CA9A43] transition-colors"
                                    />
                                </div>

                                {/* Arrow Connector (Desktop only, between cards) */}
                                {!isLast && (
                                    <div className="hidden lg:flex absolute -right-[26px] top-1/2 -translate-y-1/2 w-6 h-6 bg-[#051522] border border-[#CA9A43]/50 rounded-full items-center justify-center z-10 text-[#CA9A43]">
                                        <i className="bi bi-chevron-right text-xs"></i>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>

                {!readOnly && data.pillars.length < 8 && (
                    <div className="flex justify-center mb-8">
                        <button
                            onClick={addPillar}
                            className="w-full max-w-[380px] h-[80px] rounded-xl border-2 border-dashed border-[#CA9A43]/30 flex flex-col items-center justify-center text-[#CA9A43] hover:bg-[#CA9A43]/5 transition-all group"
                        >
                            <i className="bi bi-plus text-3xl mb-1 group-hover:scale-110 transition-transform"></i>
                            <span className="text-sm font-medium">+ Adicionar outro pilar</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ETAPA 2 (FLUXO A/B): PROPÓSITO DO MÉTODO (Jornada)
const MethodPurpose: React.FC<{
    data: MethodData;
    onUpdate: (d: MethodData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    const [activeTooltip, setActiveTooltip] = useState<'pointA' | 'pointB' | null>(null);

    const updatePointA = (field: keyof MethodData['purpose']['pointA'], value: string) => {
        if (readOnly) return;
        onUpdate({
            ...data,
            purpose: { ...data.purpose, pointA: { ...data.purpose.pointA, [field]: value } }
        });
    };

    const updatePointB = (field: keyof MethodData['purpose']['pointB'], value: string) => {
        if (readOnly) return;
        onUpdate({
            ...data,
            purpose: { ...data.purpose, pointB: { ...data.purpose.pointB, [field]: value } }
        });
    };

    return (
        <div className={`w-full h-full max-w-6xl mx-auto flex flex-col items-center pb-8 overflow-x-hidden ${verticalScrollbarStyles}`}>
            <h2 className="font-serif text-3xl md:text-4xl text-white font-bold mb-4 text-center flex-shrink-0 mt-4 px-4">
                Propósito do Método
            </h2>
            <p className="text-gray-400 text-center text-sm mb-10 w-4/5">Ninguém compra 'método' ou 'aulas'; as pessoas compram uma nova realidade. Para que sua oferta tenha alto valor, precisamos mapear a jornada completa:</p>

            {/* Container da Jornada */}
            <div className="w-full relative flex flex-col lg:flex-row items-stretch justify-between gap-8 lg:gap-16 px-4 pb-20">

                {/* Linha de Conexão (Desktop) */}
                <div className="hidden lg:block absolute top-[60px] left-[15%] right-[15%] h-[2px] bg-gradient-to-r from-white/10 via-[#CA9A43] to-white/10 z-0">
                    <div className="absolute right-0 top-1/2 -translate-x-1/2 text-[#CA9A43] text-xl">
                        <i className="bi bi-caret-right-fill"></i>
                    </div>
                </div>

                {/* --- PONTO A (START) --- */}
                <div className="flex-1 z-10 flex flex-col w-full">
                    <div className="flex flex-col items-center text-center mb-8">
                        <div className="w-32 h-24 mb-4 relative flex items-center justify-center">
                            {/* Ilustração Start: Bandeiras Xadrez */}
                            <div className="absolute bottom-0 w-1 h-16 bg-white/20 -left-4 rotate-[-10deg]"></div>
                            <div className="absolute bottom-0 w-1 h-16 bg-white/20 -right-4 rotate-[10deg]"></div>
                            <div className="w-full bg-[#CA9A43] text-[#031A2B] font-bold py-1 px-4 text-sm uppercase tracking-widest -rotate-2 shadow-lg z-10">START</div>
                            <div className="absolute top-0 w-16 h-10 bg-[url('https://www.transparenttextures.com/patterns/checkered-pattern.png')] opacity-50"></div>
                        </div>

                        <div className="relative flex items-center justify-center gap-2 mb-2">
                            <h3 className="text-[#CA9A43] font-bold uppercase tracking-widest text-sm">Ponto A</h3>
                            <button
                                onMouseEnter={() => setActiveTooltip('pointA')}
                                onMouseLeave={() => setActiveTooltip(null)}
                                className="text-[#CA9A43]/50 hover:text-[#CA9A43] transition-colors"
                            >
                                <i className="bi bi-info-circle"></i>
                            </button>
                            <AnimatePresence>
                                {activeTooltip === 'pointA' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute bottom-full mb-2 w-64 bg-[#031A2B] border border-[#CA9A43]/30 text-gray-300 text-xs p-3 rounded shadow-xl z-50 pointer-events-none"
                                    >
                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#031A2B] border-b border-r border-[#CA9A43]/30 rotate-45"></div>
                                        Conhecer a motivação que faz essa pessoa topar esforço para mudar.
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <p className="text-white font-serif text-xl">Por que seu mentorado não aguenta mais?</p>
                    </div>

                    <div className="bg-[#081e30] border border-white/5 p-4 md:p-6 rounded-sm space-y-6 shadow-xl w-full">
                        {[
                            { id: 'pain', label: 'O que incomoda, irrita ou pesa no dia a dia?', ph: 'Ex: Sente que trabalha 14h e não vê o dinheiro sobrar...' },
                            { id: 'failed', label: 'O que ele sente que já tentou e não funcionou?', ph: 'Ex: Já contratou agência, já fez curso online...' },
                            { id: 'limit', label: 'O que faz ele pensar "assim não dá mais"?', ph: 'Ex: Perdeu o aniversário do filho por causa da empresa...' }
                        ].map((field) => (
                            <div key={field.id}>
                                <label className="block text-gray-400 text-xs uppercase font-bold mb-2">{field.label}</label>
                                <textarea
                                    value={(data.purpose.pointA as any)[field.id]}
                                    onChange={e => updatePointA(field.id as any, e.target.value)}
                                    disabled={readOnly}
                                    placeholder={field.ph}
                                    className={`w-full bg-[#051522] border border-white/10 p-3 text-white text-sm rounded-sm resize-none h-24 outline-none focus:border-[#CA9A43] transition-colors
                                        ${readOnly ? 'cursor-not-allowed opacity-70' : ''}
                                    `}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Mobile Connector Arrow */}
                <div className="lg:hidden flex items-center justify-center text-white/20 text-3xl py-4">
                    <i className="bi bi-arrow-down"></i>
                </div>

                {/* --- PONTO B (FINISH) --- */}
                <div className="flex-1 z-10 flex flex-col w-full">
                    <div className="flex flex-col items-center text-center mb-8">
                        <div className="w-32 h-24 mb-4 relative flex items-center justify-center">
                            {/* Ilustração Finish */}
                            <div className="w-full bg-red-600 text-white font-bold py-1 px-4 text-sm uppercase tracking-widest rotate-2 shadow-lg z-10">FINISH</div>
                            <div className="absolute -right-6 top-0 text-4xl">🏁</div>
                        </div>

                        <div className="relative flex items-center justify-center gap-2 mb-2">
                            <h3 className="text-green-500 font-bold uppercase tracking-widest text-sm">Ponto B</h3>
                            <button
                                onMouseEnter={() => setActiveTooltip('pointB')}
                                onMouseLeave={() => setActiveTooltip(null)}
                                className="text-green-500/50 hover:text-green-500 transition-colors"
                            >
                                <i className="bi bi-info-circle"></i>
                            </button>
                            <AnimatePresence>
                                {activeTooltip === 'pointB' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute bottom-full mb-2 w-64 bg-[#031A2B] border border-green-500/30 text-gray-300 text-xs p-3 rounded shadow-xl z-50 pointer-events-none"
                                    >
                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#031A2B] border-b border-r border-green-500/30 rotate-45"></div>
                                        Entender o que é “vitória” na cabeça desse cliente, além de resultado frio.
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <p className="text-white font-serif text-xl">O que ele quer conquistar?</p>
                    </div>

                    <div className="bg-[#081e30] border border-white/5 p-4 md:p-6 rounded-sm space-y-6 shadow-xl w-full">
                        {[
                            { id: 'worth', label: 'O que faz ele pensar: "Valeu a pena"?', ph: 'Ex: Ter tempo livre e a conta cheia...' },
                            { id: 'ability', label: 'O que ele consegue fazer agora que não conseguia?', ph: 'Ex: Tirar férias sem o negócio parar...' },
                            { id: 'feeling', label: 'Como ele quer se sentir (emocional)?', ph: 'Ex: Orgulhoso, seguro, reconhecido...' }
                        ].map((field) => (
                            <div key={field.id}>
                                <label className="block text-gray-400 text-xs uppercase font-bold mb-2">{field.label}</label>
                                <textarea
                                    value={(data.purpose.pointB as any)[field.id]}
                                    onChange={e => updatePointB(field.id as any, e.target.value)}
                                    disabled={readOnly}
                                    placeholder={field.ph}
                                    className={`w-full bg-[#051522] border border-white/10 p-3 text-white text-sm rounded-sm resize-none h-24 outline-none focus:border-green-500 transition-colors
                                        ${readOnly ? 'cursor-not-allowed opacity-70' : ''}
                                    `}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ETAPA 3 (FLUXO A/B): MAPA DA JORNADA (Timeline Horizontal)
const MethodJourneyMap: React.FC<{
    data: MethodData;
    onUpdate: (d: MethodData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {

    const addStep = () => {
        const newStep: JourneyStep = { id: Date.now().toString(), title: '', importance: '' };
        onUpdate({ ...data, journeyMap: [...data.journeyMap, newStep] });
    };

    const updateStep = (id: string, field: keyof JourneyStep, value: string) => {
        if (readOnly) return;
        const updatedMap = data.journeyMap.map(step =>
            step.id === id ? { ...step, [field]: value } : step
        );
        onUpdate({ ...data, journeyMap: updatedMap });
    };

    const removeStep = (id: string) => {
        if (readOnly) return;
        if (data.journeyMap.length <= 3) return; // Mínimo de 3
        onUpdate({ ...data, journeyMap: data.journeyMap.filter(s => s.id !== id) });
    };

    return (
        <div className="flex flex-col h-full">
            <div className="text-center mb-8 flex-shrink-0">
                <h2 className="font-serif text-3xl md:text-4xl text-white font-bold mb-2">Como vocês vencem?</h2>
                <p className="text-gray-400 font-sans max-w-2xl mx-auto">
                    Desenhe os "degraus" que o mentorado precisa subir para sair do Ponto A e chegar na Vitória. Pense em etapas grandes, na ordem em que as coisas precisam acontecer para dar certo.
                </p>
            </div>

            <div className={`flex-1 flex items-center gap-8 px-8 pb-8 w-full ${scrollbarStyles}`}>

                {/* START FLAG */}
                <div className="flex-shrink-0 flex flex-col items-center me-20 ml-20">
                    <div className="w-1 h-24 bg-white/20 relative">
                        <div className="absolute top-0 left-0 w-24 h-16 bg-[#CA9A43] flex items-center justify-center shadow-lg transform -skew-y-6 origin-left">
                            <span className="text-[#031A2B] font-bold text-xl tracking-widest">START</span>
                        </div>
                    </div>
                </div>

                {/* STEPS */}
                {data.journeyMap.map((step, index) => (
                    <div key={step.id} className="flex items-center gap-4 flex-shrink-0">
                        {/* Connector Arrow */}
                        <div className="text-white/20 text-4xl">
                            <i className="bi bi-arrow-right"></i>
                        </div>

                        {/* Card */}
                        <div className="w-[300px] min-h-[320px] bg-[#081e30] border border-white/10 hover:border-[#CA9A43]/50 p-6 rounded-sm shadow-xl flex flex-col group relative transition-all duration-300">
                            {!readOnly && data.journeyMap.length > 3 && (
                                <button
                                    onClick={() => removeStep(step.id)}
                                    className="absolute top-2 right-2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <i className="bi bi-trash"></i>
                                </button>
                            )}

                            <div className="mb-4">
                                <label className="text-[#CA9A43] text-[10px] font-bold uppercase tracking-widest block mb-1">
                                    Etapa {index + 1} - O que é?
                                </label>
                                <textarea
                                    value={step.title}
                                    onChange={e => updateStep(step.id, 'title', e.target.value)}
                                    disabled={readOnly}
                                    placeholder="Descreva em uma frase o que precisa ser verdadeiro para considerar essa etapa “cumprida”"
                                    className="w-full bg-[#051522] border border-white/20 rounded-lg p-3 focus:border-[#CA9A43] text-white text-lg font-serif outline-none h-24 resize-none placeholder:text-gray-600 leading-snug transition-colors"
                                />
                            </div>

                            <div className="flex-1">
                                <label className="text-gray-500 text-[10px] font-bold uppercase tracking-widest block mb-1">
                                    Por que é importante?
                                </label>
                                <textarea
                                    value={step.importance}
                                    onChange={e => updateStep(step.id, 'importance', e.target.value)}
                                    disabled={readOnly}
                                    placeholder="Explique por que essa etapa é indispensável para o resultado final."
                                    className="w-full h-full bg-[#051522] border border-white/20 rounded-lg p-3 text-gray-300 text-sm outline-none resize-none focus:border-[#CA9A43] transition-colors"
                                />
                            </div>
                        </div>
                    </div>
                ))}

                {/* ADD BUTTON */}
                {!readOnly && (
                    <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-white/20 text-4xl"><i className="bi bi-arrow-right"></i></div>
                        <button
                            onClick={addStep}
                            className="w-20 h-20 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center text-white/20 hover:text-[#CA9A43] hover:border-[#CA9A43] transition-all"
                        >
                            <i className="bi bi-plus-lg text-3xl"></i>
                        </button>
                    </div>
                )}

                {/* FINISH FLAG */}
                <div className="flex-shrink-0 flex flex-col items-center ml-8 mr-24">
                    <div className="w-1 h-32 bg-white/20 relative">
                        <div className="absolute top-0 left-0 w-28 h-20 bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-lg transform skew-y-6 origin-right">
                            <span className="text-white font-bold text-xl tracking-widest">FINISH</span>
                        </div>
                        <div className="absolute top-0 right-full mr-2 text-4xl">🏁</div>
                    </div>
                </div>

            </div>
        </div>
    );
};

// ETAPA 4 (FLUXO A/B): RAIO X (Problemas e Soluções)
const MethodXRay: React.FC<{
    data: MethodData;
    onUpdate: (d: MethodData) => void;
    readOnly?: boolean;
}> = ({ data, onUpdate, readOnly }) => {
    const [openStepId, setOpenStepId] = useState<string | null>(null);
    const [activeTooltip, setActiveTooltip] = useState<'problems' | 'solutions' | null>(null);

    const activeStep = data.journeyMap.find(s => s.id === openStepId);
    const activeIndex = data.journeyMap.findIndex(s => s.id === openStepId);

    const handleUpdate = (id: string, field: 'problems' | 'solutions', value: string) => {
        if (readOnly) return;
        const updatedMap = data.journeyMap.map(s =>
            s.id === id ? { ...s, [field]: value } : s
        );
        onUpdate({ ...data, journeyMap: updatedMap });
    };

    const handleBulletPointInput = (e: React.KeyboardEvent<HTMLTextAreaElement>, id: string, field: 'problems' | 'solutions', currentValue: string) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newValue = currentValue + '\n• ';
            handleUpdate(id, field, newValue);
        }

        // Adiciona bullet no início se o campo estiver vazio ou sem bullet na primeira linha
        if (e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab') {
            const textarea = e.target as HTMLTextAreaElement;
            const cursorPosition = textarea.selectionStart;

            // Se estiver no início do texto e não houver bullet
            if (cursorPosition === 0 && (!currentValue || !currentValue.startsWith('•'))) {
                e.preventDefault();
                const newValue = '• ' + (currentValue || '');
                handleUpdate(id, field, newValue);

                // Move o cursor para depois do bullet
                setTimeout(() => {
                    textarea.selectionStart = 2;
                    textarea.selectionEnd = 2;
                }, 0);
            }
        }
    };
    const navigateModal = (direction: 'prev' | 'next') => {
        if (!activeStep) return;
        const newIndex = direction === 'next' ? activeIndex + 1 : activeIndex - 1;
        if (newIndex >= 0 && newIndex < data.journeyMap.length) {
            setOpenStepId(data.journeyMap[newIndex].id);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="text-center mb-8 flex-shrink-0">
                <h2 className="font-serif text-3xl md:text-4xl text-white font-bold mb-2">Raio X de Cada Etapa</h2>
                <p className="text-gray-400 font-sans max-w-2xl mx-auto">
                    Vamos olhar uma etapa por vez, mapear tudo o que pode travar o avanço e tudo o que você pode oferecer para destravar.
                </p>
            </div>

            {/* Scroll Horizontal de Cards (Read-only view + Action) */}
            <div className={`flex-1 flex items-center gap-8 px-8 pb-8 w-full ${scrollbarStyles}`}>

                {/* START Marker */}
                <div className="flex-shrink-0 w-12 h-12 bg-[#CA9A43] rounded-full flex items-center justify-center text-[#031A2B] font-bold shadow-lg shadow-[#CA9A43]/20">A</div>

                {data.journeyMap.map((step, index) => {
                    // Check status
                    const hasProblems = step.problems && step.problems.length >= 5;
                    const hasSolutions = step.solutions && step.solutions.length >= 5;
                    const isComplete = hasProblems && hasSolutions;

                    return (
                        <div key={step.id} className="flex items-center gap-4 flex-shrink-0">
                            <div className="text-white/10 text-2xl"><i className="bi bi-chevron-right"></i></div>

                            <div className="w-[340px] bg-[#081e30] border border-white/10 p-6 rounded-sm shadow-xl flex flex-col relative overflow-hidden group">
                                {isComplete && <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/10 rounded-bl-full flex justify-end p-3"><i className="bi bi-check-lg text-green-500 text-xl"></i></div>}

                                <div className="mb-4">
                                    <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Etapa {index + 1}</span>
                                    <h3 className="text-white font-serif text-xl line-clamp-1" title={step.title}>{step.title || 'Sem título'}</h3>
                                </div>

                                <div className="space-y-3 mb-6 flex-1">
                                    <div className={`p-3 rounded border text-xs ${hasProblems ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-[#051522] border-white/5 text-gray-500'}`}>
                                        <i className="bi bi-exclamation-triangle mr-2"></i>
                                        {hasProblems ? 'Problemas mapeados' : 'Problemas pendentes'}
                                    </div>
                                    <div className={`p-3 rounded border text-xs ${hasSolutions ? 'bg-green-500/10 border-green-500/30 text-green-200' : 'bg-[#051522] border-white/5 text-gray-500'}`}>
                                        <i className="bi bi-key mr-2"></i>
                                        {hasSolutions ? 'Soluções definidas' : 'Soluções pendentes'}
                                    </div>
                                </div>

                                <button
                                    onClick={() => setOpenStepId(step.id)}
                                    className={`w-full py-3 rounded-sm font-bold text-sm uppercase tracking-wider transition-all
                                        ${isComplete
                                            ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20'
                                            : 'bg-[#CA9A43] hover:bg-[#FFE39B] text-[#031A2B] shadow-lg shadow-[#CA9A43]/20'
                                        }`}
                                >
                                    {isComplete ? 'Ver Raio X' : 'Fazer Raio X'}
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* FINISH Marker */}
                <div className="flex-shrink-0 ml-4 w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-green-900/20">B</div>
            </div>

            {/* Observação Bottom */}
            <div className="mt-4 mb-4 text-center max-w-4xl mx-auto px-4 flex-shrink-0">
                <div className="bg-[#CA9A43]/5 border border-[#CA9A43]/20 p-4 rounded-lg flex gap-3 items-start text-left">
                    <i className="bi bi-info-circle text-[#CA9A43] mt-0.5"></i>
                    <p className="text-[#CA9A43]/80 text-sm italic">
                        "Liste, para cada etapa, os principais problemas que aparecem e as possíveis soluções que você consegue entregar. Quanto mais específico você for aqui, mais sólido e eficiente seu método se torna na prática."
                    </p>
                </div>
            </div>

            {/* MODAL DE RAIO X */}
            <AnimatePresence>
                {openStepId && activeStep && (
                    <div className="fixed inset-0 bg-[#031A2B]/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#081e30] w-full max-w-4xl max-h-[90vh] rounded-lg border border-white/10 shadow-2xl flex flex-col"
                        >
                            {/* Modal Header */}
                            <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                <div>
                                    <span className="text-gray-500 text-xs font-bold uppercase tracking-widest">Raio X - Etapa {activeIndex + 1}</span>
                                    <h3 className="text-2xl text-white font-serif">{activeStep.title}</h3>
                                </div>
                                <button onClick={() => setOpenStepId(null)} className="text-gray-400 hover:text-white"><i className="bi bi-x-lg text-2xl"></i></button>
                            </div>

                            {/* Modal Content */}
                            <div className={`flex-1 overflow-y-auto p-8 grid md:grid-cols-2 gap-8 ${verticalScrollbarStyles}`}>
                                {/* Problemas (Red) */}
                                <div>
                                    <div className="flex items-center gap-2 mb-4 relative">
                                        <label className="text-red-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                                            <i className="bi bi-exclamation-octagon-fill"></i> Principais Obstáculos
                                        </label>
                                        <button
                                            onMouseEnter={() => setActiveTooltip('problems')}
                                            onMouseLeave={() => setActiveTooltip(null)}
                                            className="text-red-400/50 hover:text-red-400 transition-colors"
                                        >
                                            <i className="bi bi-info-circle"></i>
                                        </button>
                                        <AnimatePresence>
                                            {activeTooltip === 'problems' && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: 10 }}
                                                    className="absolute top-full left-0 mt-2 w-72 bg-[#031A2B] border border-red-500/30 text-gray-300 text-xs p-4 rounded shadow-xl z-50 pointer-events-none"
                                                >
                                                    <div className="absolute -top-2 left-4 w-4 h-4 bg-[#031A2B] border-t border-l border-red-500/30 rotate-45"></div>
                                                    <p className="font-bold mb-2 text-red-400">Considere as 4 travas universais:</p>
                                                    <ul className="list-disc pl-4 space-y-1 mb-2 text-gray-400">
                                                        <li>Conhecimento (não sabe como fazer);</li>
                                                        <li>Tempo/Preguiça (acha trabalhoso);</li>
                                                        <li>Dificuldade Técnica (falta habilidade);</li>
                                                        <li>Crença (acha impossível).</li>
                                                    </ul>
                                                    <p className="italic text-[10px] text-gray-500">Vá além do óbvio. É medo de errar? É a sensação de que 'dá muito trabalho'? Ou falta de saber o passo técnico?</p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <div className="bg-red-500/5 border border-red-500/20 p-6 rounded-sm h-full min-h-[300px] flex flex-col">
                                        <p className="text-gray-400 text-xs mb-3">O que trava o cliente aqui? (Medos, erros, falta de recursos)</p>
                                        <textarea
                                            value={activeStep.problems || ''}
                                            onChange={e => handleUpdate(activeStep.id, 'problems', e.target.value)}
                                            onKeyDown={(e) => handleBulletPointInput(e, activeStep.id, 'problems', activeStep.problems || '')}
                                            disabled={readOnly}
                                            placeholder="• Ex: Cliente tem medo de investir..."
                                            className="flex-1 w-full bg-[#031A2B]/50 border border-red-500/10 p-4 text-white text-sm outline-none resize-none focus:border-red-500/50 rounded-sm"
                                        />
                                        <div className="text-right mt-2 text-[10px] text-red-400/50">
                                            {(activeStep.problems?.length || 0)} caracteres (mín 5)
                                        </div>
                                    </div>
                                </div>

                                {/* Soluções (Green) */}
                                <div>
                                    <div className="flex items-center gap-2 mb-4 relative">
                                        <label className="text-green-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                                            <i className="bi bi-key-fill"></i> Suas Soluções
                                        </label>
                                        <button
                                            onMouseEnter={() => setActiveTooltip('solutions')}
                                            onMouseLeave={() => setActiveTooltip(null)}
                                            className="text-green-400/50 hover:text-green-400 transition-colors"
                                        >
                                            <i className="bi bi-info-circle"></i>
                                        </button>
                                        <AnimatePresence>
                                            {activeTooltip === 'solutions' && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: 10 }}
                                                    className="absolute top-full left-0 mt-2 w-72 bg-[#031A2B] border border-green-500/30 text-gray-300 text-xs p-4 rounded shadow-xl z-50 pointer-events-none"
                                                >
                                                    <div className="absolute -top-2 left-4 w-4 h-4 bg-[#031A2B] border-t border-l border-green-500/30 rotate-45"></div>
                                                    <p className="font-bold mb-2 text-green-400">Considere os 4 aceleradores:</p>
                                                    <ul className="list-disc pl-4 space-y-1 mb-2 text-gray-400">
                                                        <li>Ferramental (templates, scripts);</li>
                                                        <li>Processual (checklists, mapas);</li>
                                                        <li>Acesso (análise, suporte VIP);</li>
                                                        <li>Ambiental (networking, exemplos).</li>
                                                    </ul>
                                                    <p className="italic text-[10px] text-gray-500">Vá além do 'ensinar'. Se é preguiça, o que você entrega pronto? Se é medo, como você valida?</p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <div className="bg-green-500/5 border border-green-500/20 p-6 rounded-sm h-full min-h-[300px] flex flex-col">
                                        <p className="text-gray-400 text-xs mb-3">O que você entrega para destravar? (Ferramentas, aulas, suporte)</p>
                                        <textarea
                                            value={activeStep.solutions || ''}
                                            onChange={e => handleUpdate(activeStep.id, 'solutions', e.target.value)}
                                            onKeyDown={(e) => handleBulletPointInput(e, activeStep.id, 'solutions', activeStep.solutions || '')}
                                            disabled={readOnly}
                                            placeholder="• Ex: Planilha de cálculo de ROI..."
                                            className="flex-1 w-full bg-[#031A2B]/50 border border-green-500/10 p-4 text-white text-sm outline-none resize-none focus:border-green-500/50 rounded-sm"
                                        />
                                        <div className="text-right mt-2 text-[10px] text-green-400/50">
                                            {(activeStep.solutions?.length || 0)} caracteres (mín 5)
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-white/5 bg-[#051522] flex justify-between items-center">
                                <button
                                    onClick={() => navigateModal('prev')}
                                    disabled={activeIndex === 0}
                                    className="px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-20 flex items-center gap-2"
                                >
                                    <i className="bi bi-arrow-left"></i> Etapa Anterior
                                </button>

                                <button
                                    onClick={() => {
                                        if (activeIndex < data.journeyMap.length - 1) {
                                            navigateModal('next');
                                        } else {
                                            setOpenStepId(null);
                                        }
                                    }}
                                    className="px-6 py-2 bg-[#CA9A43] text-[#031A2B] font-bold text-sm uppercase tracking-wider rounded-sm shadow-lg hover:bg-[#FFE39B]"
                                >
                                    {activeIndex < data.journeyMap.length - 1 ? 'Próxima Etapa' : 'Concluir Raio X'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const MethodModule: React.FC<MethodModuleProps> = ({
    data,
    onUpdate,
    onSaveAndExit,
    onComplete,
    isReadOnly = false,
    savedStep,
    onStepChange
}) => {
    const initialStep = getInitialStep(data);

    // Logic for dynamic pathing
    const isStructured = data.stage === 'structured';
    const maxSteps = isStructured ? 2 : 4; // Structured: Selection -> Structuring. Standard: Selection -> Purpose -> Journey -> XRay.

    const isComplete = initialStep > maxSteps;

    // Usar savedStep se disponível, caso contrário usar initialStep
    const startingStep = savedStep !== undefined ? savedStep : (isComplete ? 1 : initialStep);
    const [currentStep, setCurrentStep] = useState(startingStep);
    const [showIntro, setShowIntro] = useState(!isReadOnly && initialStep === 1 && !data.stage);
    const [showCompletion, setShowCompletion] = useState(isReadOnly || isComplete);

    // Salvar currentStep sempre que ele mudar
    useEffect(() => {
        if (onStepChange && !showIntro && !showCompletion) {
            onStepChange(currentStep);
        }
    }, [currentStep, onStepChange, showIntro, showCompletion]);

    useEffect(() => {
        if (isReadOnly) {
            setShowIntro(false);
            setShowCompletion(true);
        }
    }, [isReadOnly]);

    const handleNext = () => {
        if (canProceed()) {
            if (currentStep < maxSteps) {
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

    const canProceed = () => {
        if (isReadOnly) return true;
        switch (currentStep) {
            case 1: return !!data.stage;
            case 2:
                if (isStructured) {
                    // Validations for Structuring (Step 9.1 interface)
                    return !!data.name && data.name.trim().length >= 5 &&
                        !!data.transformation && data.transformation.trim().length >= 10 &&
                        data.pillars.length >= 3 &&
                        data.pillars.every(p =>
                            p.what.trim().length >= 3 &&
                            p.why.trim().length >= 3 &&
                            p.how.trim().length >= 3
                        );
                }
                // Validations for Purpose (Point A & B) - All fields mandatory
                const pA = data.purpose.pointA;
                const pB = data.purpose.pointB;
                return pA.pain.trim().length > 3 &&
                    pA.failed.trim().length > 3 &&
                    pA.limit.trim().length > 3 &&
                    pB.worth.trim().length > 3 &&
                    pB.ability.trim().length > 3 &&
                    pB.feeling.trim().length > 3;

            case 3:
                // Journey Map validation
                return data.journeyMap.length >= 3 &&
                    data.journeyMap.every(s => s.title.trim().length > 3 && s.importance.trim().length > 3);
            case 4:
                // Check if all steps have at least some problem/solution content
                return data.journeyMap.length >= 3 &&
                    data.journeyMap.every(s => (s.problems?.trim().length || 0) > 5 && (s.solutions?.trim().length || 0) > 5);
            default: return true;
        }
    };

    const renderStep = () => {
        const props = { data, onUpdate, readOnly: isReadOnly };
        switch (currentStep) {
            case 1: return <MethodSelection {...props} />;
            case 2:
                // If Structured -> Show the "Structuring" Interface
                if (isStructured) {
                    return <MethodStructuring {...props} />;
                }
                // Else -> Show the standard "Purpose" Interface
                return <MethodPurpose {...props} />;
            case 3: return <MethodJourneyMap {...props} />;
            case 4: return <MethodXRay {...props} />;
            default: return null;
        }
    };

    return (
        <div className="bg-[#051522] border border-white/5 rounded-lg h-[800px] shadow-2xl relative overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-[#081e30] p-6 border-b border-white/5 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <button onClick={onSaveAndExit} className="text-gray-400 hover:text-white transition-colors">
                            <i className="bi bi-arrow-left"></i>
                        </button>
                        <span className="text-[#CA9A43] text-xs font-bold uppercase tracking-widest">Módulo: O Método</span>
                        {isReadOnly && <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded border border-blue-500/30">EM ANÁLISE</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1 pl-6">
                        <span className="text-white font-serif text-xl">
                            {showIntro ? 'Introdução' : (showCompletion ? 'Visão Geral' : `Etapa ${currentStep} de ${maxSteps}`)}
                        </span>
                    </div>
                </div>

                {!showIntro && (
                    <div className="flex gap-1">
                        {Array.from({ length: maxSteps }).map((_, i) => (
                            <div key={i} className={`h-1 w-8 rounded-full transition-all duration-300 ${i + 1 <= currentStep || showCompletion ? 'bg-[#CA9A43]' : 'bg-white/10'}`}></div>
                        ))}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 p-8 overflow-hidden">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={showIntro ? 'intro' : (showCompletion ? 'complete' : currentStep)}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="h-full"
                    >
                        {showIntro ? (
                            <MethodIntro onStart={() => setShowIntro(false)} />
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

            {/* Footer */}
            {!showIntro && !showCompletion && (
                <div className="bg-[#031A2B] p-4 border-t border-white/5 flex flex-col-reverse sm:flex-row justify-between items-center gap-4">
                    <button
                        onClick={handlePrev}
                        disabled={currentStep === 1}
                        className="text-gray-400 hover:text-white disabled:opacity-30 flex items-center gap-2 px-4 py-2 text-sm uppercase tracking-wider w-full sm:w-auto justify-center"
                    >
                        <i className="bi bi-arrow-left"></i> Anterior
                    </button>

                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        <button onClick={onSaveAndExit} className="text-gray-400 hover:text-white text-xs uppercase font-bold tracking-widest px-4">
                            Salvar e Sair
                        </button>

                        <button
                            onClick={handleNext}
                            disabled={!canProceed()}
                            className={`font-bold px-6 py-3 rounded-sm flex items-center justify-center gap-2 transition-colors text-sm uppercase tracking-wider w-full sm:w-auto
                                ${!canProceed()
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    : 'bg-[#CA9A43] text-[#031A2B] hover:bg-[#FFE39B]'
                                }
                            `}
                        >
                            {currentStep === maxSteps ? 'Concluir' : 'Próxima Etapa'} <i className="bi bi-arrow-right"></i>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
