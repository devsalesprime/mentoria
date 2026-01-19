
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI, Type } from "@google/genai";
import { Modal } from '../ui/Modal';

// --- TYPES & INTERFACES ---

export interface Moment {
    id: string;
    year: string; // Format YYYY-MM
    description: string;
}

export interface Testimonial {
    id: string;
    title: string; // Was name
    description: string; // Was text
    imageUrl?: string;
    videoUrl?: string;
}

// Estrutura completa dos dados do módulo
export interface MentorData {
    step1: {
        field4: string; // The Pitch
    };
    step2: {
        moments: Moment[];
    };
    step3: {
        first: string;
        second: string;
        third: string;
    };
    step4: {
        mission: string;
        vision: string;
        values: string;
    };
    step5: {
        text: string;
    };
    step6: {
        testimonials: Testimonial[];
        hasNoTestimonials: boolean;
    };
    step7: {
        marketStandard: string;
        myDifference: string;
    };
}

export const INITIAL_MENTOR_DATA: MentorData = {
    step1: { field4: '' },
    step2: { moments: [] },
    step3: { first: '', second: '', third: '' },
    step4: { mission: '', vision: '', values: '' },
    step5: { text: '' },
    step6: { testimonials: [], hasNoTestimonials: false },
    step7: { marketStandard: '', myDifference: '' }
};

// Props recebidas pelo Módulo
interface MentorModuleProps {
    data: MentorData;
    onUpdate: (newData: MentorData) => void;
    onComplete: () => void; // Chamado quando o usuário clica em "Enviar para Avaliação"
    onSaveAndExit: () => void; // Chamado para apenas salvar e voltar
    isReadOnly?: boolean; // Se true, desabilita edições
    savedStep?: number; // Etapa salva anteriormente
    onStepChange?: (step: number) => void; // Callback quando a etapa muda
}

interface StepProps<T> {
    data: T;
    onUpdate: (newData: T) => void;
    readOnly?: boolean;
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

// Formata YYYY-MM para Mês/Ano
const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month] = dateStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

const getInitialStep = (data: MentorData): number => {
    // Step 1: Pitch
    if (!data.step1.field4 || data.step1.field4.trim() === '') return 1;
    // Step 2: Moments (At least one)
    if (data.step2.moments.length === 0) return 2;
    // Step 3: Achievements (All 3 fields)
    if (!data.step3.first || !data.step3.second || !data.step3.third) return 3;
    // Step 4: MVV (All 3 fields)
    if (!data.step4.mission || !data.step4.vision || !data.step4.values) return 4;
    // Step 5: Team
    if (!data.step5.text || data.step5.text.length <= 5) return 5;
    // Step 6: Testimonials
    if (data.step6.testimonials.length === 0 && !data.step6.hasNoTestimonials) return 6;
    // Step 7: Differentiation
    if (!data.step7.marketStandard || !data.step7.myDifference) return 7;

    return 8; // Completed
};

// --- SUB-COMPONENTS ---

const MentorIntro: React.FC<{ onStart: () => void }> = ({ onStart }) => {
    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="min-h-full flex flex-col items-center justify-center text-center p-6 md:p-16 animate-fadeIn">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-[#CA9A43]/10 rounded-full flex items-center justify-center mb-6 md:mb-8 border border-[#CA9A43]/30 flex-shrink-0">
                    <i className="bi bi-person-badge text-3xl md:text-4xl text-[#CA9A43]"></i>
                </div>

                <h2 className="font-serif text-3xl md:text-5xl text-white mb-6 md:mb-8">
                    O Mentor
                </h2>

                <div className="max-w-2xl space-y-4 md:space-y-6 text-gray-300 font-sans text-base md:text-lg leading-relaxed mb-8 md:mb-10">
                    <p>
                        Neste módulo, as perguntas serão sobre <strong className="text-white">você como mentor(a)</strong>: sua história, seus pontos fortes, jeito de pensar e forma de ajudar.
                    </p>
                    <p>
                        O objetivo é montar uma base clara para o seu posicionamento.
                    </p>
                    <p className="italic text-[#CA9A43]">
                        Responda com calma e com verdade.
                    </p>
                    <p>
                        A força do plano que vamos montar depois depende da qualidade do que você colocar aqui.
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
        <div className="flex items-center gap-2 text-xs font-sans uppercase tracking-widest absolute top-4 right-4 bg-[#031A2B]/80 px-3 py-1 rounded-full border border-white/10 backdrop-blur-sm z-20 pointer-events-none transition-all duration-300">
            {status === 'saving' && (
                <>
                    <div className="w-2 h-2 rounded-full bg-[#CA9A43] animate-pulse"></div>
                    <span className="text-[#CA9A43]">Salvando...</span>
                </>
            )}
            {status === 'saved' && (
                <>
                    <span className="text-green-400 text-sm">✓</span>
                    <span className="text-gray-400">Salvo</span>
                </>
            )}
        </div>
    );
};

// Tela de Conclusão / Envio
const CompletionView: React.FC<{ onReview: () => void; onSend: () => void; readOnly?: boolean }> = ({ onReview, onSend, readOnly }) => {
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
                    ? 'Suas respostas foram enviadas e estão sendo analisadas pela nossa equipe. Você será notificado em breve.'
                    : 'Parabéns! Você finalizou a etapa fundamental. Deseja enviar agora para avaliação ou apenas salvar?'
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

                {!readOnly && (
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

// --- GENERIC AI ANALYSIS BUTTON & MODAL ---
interface AnalysisResult {
    score: number;
    title: string;
    feedback: string;
    improvements: { title: string; text: string }[];
}

const AIAnalysisModal: React.FC<{ isOpen: boolean; onClose: () => void; analysis: AnalysisResult | null }> = ({ isOpen, onClose, analysis }) => (
    <Modal isOpen={isOpen} onClose={onClose} size="80%">
        {analysis && (
            <div className="text-center w-full max-w-5xl mx-auto">
                <div className="mb-8">
                    <span className="text-[#CA9A43] text-xs font-bold uppercase tracking-widest block mb-2">Diagnóstico de Inteligência Artificial</span>
                    <h3 className="font-serif text-3xl md:text-4xl text-white">{analysis.title}</h3>
                </div>

                <div className="grid md:grid-cols-[200px_1fr] gap-8 items-start mb-8 text-left">
                    <div className="flex flex-col items-center justify-center bg-[#051522] border border-[#CA9A43]/20 p-6 rounded-lg relative overflow-hidden group">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#CA9A43]/10 to-transparent opacity-50"></div>
                        <div className="relative w-32 h-32 flex items-center justify-center">
                            <svg className="absolute inset-0 w-full h-full -rotate-90">
                                <circle cx="64" cy="64" r="60" stroke="#1f2937" strokeWidth="4" fill="transparent" />
                                <circle cx="64" cy="64" r="60" stroke="#CA9A43" strokeWidth="4" fill="transparent" strokeDasharray={377} strokeDashoffset={377 - (377 * analysis.score) / 100} className="transition-all duration-1000 ease-out" />
                            </svg>
                            <div className="flex flex-col items-center">
                                <span className="text-4xl font-serif font-bold text-white">{analysis.score}</span>
                                <span className="text-[10px] uppercase text-[#CA9A43] tracking-widest mt-1">Pontos</span>
                            </div>
                        </div>
                        <div className="mt-4 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded border ${analysis.score >= 80 ? 'border-green-500/30 text-green-500 bg-green-500/10' : analysis.score >= 50 ? 'border-yellow-500/30 text-yellow-500 bg-yellow-500/10' : 'border-red-500/30 text-red-500 bg-red-500/10'}`}>
                                {analysis.score >= 80 ? 'Excelente' : analysis.score >= 50 ? 'Bom Potencial' : 'Precisa Ajustar'}
                            </span>
                        </div>
                    </div>

                    <div>
                        <div className="mb-6">
                            <h4 className="text-white font-serif text-lg mb-2 flex items-center gap-2"><i className="bi bi-chat-quote text-[#CA9A43]"></i> Veredito Estratégico</h4>
                            <p className="text-gray-300 font-sans text-sm leading-relaxed italic border-l-2 border-[#CA9A43] pl-4 py-1">"{analysis.feedback}"</p>
                        </div>
                        <div>
                            <h4 className="text-white font-serif text-lg mb-3 flex items-center gap-2"><i className="bi bi-tools text-[#CA9A43]"></i> Pontos de Ajuste</h4>
                            <div className="space-y-3">
                                {analysis.improvements.map((imp, idx) => (
                                    <div key={idx} className="bg-[#051522] p-4 rounded border border-white/5 hover:border-[#CA9A43]/30 transition-colors">
                                        <div className="flex items-start gap-3">
                                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#CA9A43]/20 text-[#CA9A43] flex items-center justify-center text-xs font-bold mt-0.5">{idx + 1}</span>
                                            <div>
                                                <span className="text-[#CA9A43] font-bold text-xs uppercase tracking-wider block mb-1">{imp.title}</span>
                                                <p className="text-gray-400 text-sm leading-snug">{imp.text}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <button onClick={onClose} className="w-full py-4 bg-[#CA9A43] text-[#031A2B] font-bold uppercase tracking-widest text-sm rounded hover:bg-[#FFE39B] transition-colors shadow-lg hover:shadow-[#CA9A43]/20">Entendi, vou ajustar</button>
            </div>
        )}
    </Modal>
);

const AIButton: React.FC<{ onClick: () => void; loading: boolean; disabled: boolean }> = ({ onClick, loading, disabled }) => (
    <div className="pt-4 flex flex-col items-center">
        <button
            onClick={onClick}
            disabled={disabled || loading}
            className={`
                relative group overflow-hidden px-8 py-4 rounded-full font-bold uppercase tracking-widest text-sm transition-all duration-300 shadow-[0_0_20px_rgba(202,154,67,0.2)]
                ${loading
                    ? 'bg-gray-800 text-gray-500 cursor-wait'
                    : 'bg-gradient-to-r from-[#CA9A43] to-[#FBBF24] text-[#031A2B] hover:shadow-[0_0_30px_rgba(202,154,67,0.6)] hover:-translate-y-1'
                }
                disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none
            `}
        >
            <div className="relative z-10 flex items-center gap-2">
                {loading ? (
                    <>
                        <div className="w-4 h-4 border-2 border-[#031A2B] border-t-transparent rounded-full animate-spin"></div>
                        Analisando com IA...
                    </>
                ) : (
                    <>
                        <i className="bi bi-stars text-lg"></i> Validar com IA
                    </>
                )}
            </div>
        </button>
    </div>
);

// Helper para chamadas de IA
const useAIAnalysis = () => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const analyze = async (context: string, type: string) => {
        setIsAnalyzing(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `
                Atue como um estrategista de negócios High-Ticket.
                Analise o seguinte conteúdo de um mentor (${type}):
                "${context}"

                Critérios: Clareza, Autoridade, Desejo e Coerência.
                Gere um JSON estrito com: score (0-100), title (3 palavras), feedback (2 frases), improvements (3 objs: title, text).
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            score: { type: Type.NUMBER },
                            title: { type: Type.STRING },
                            feedback: { type: Type.STRING },
                            improvements: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: { title: { type: Type.STRING }, text: { type: Type.STRING } }
                                }
                            }
                        }
                    }
                }
            });

            if (response.text) {
                setAnalysis(JSON.parse(response.text));
                setIsModalOpen(true);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    return { isAnalyzing, analysis, isModalOpen, setIsModalOpen, analyze };
};

// STEP 1: O QUE VOCÊ FAZ HOJE?
const Step1: React.FC<StepProps<MentorData['step1']>> = ({ data, onUpdate, readOnly }) => {
    const saveStatus = useAutoSave(data);
    const { analyze, isAnalyzing, analysis, isModalOpen, setIsModalOpen } = useAIAnalysis();

    const handleChange = (field: keyof MentorData['step1'], value: string) => {
        if (readOnly) return;
        onUpdate({ ...data, [field]: value });
    };

    return (
        <div className="relative h-full flex flex-col overflow-y-auto custom-scrollbar pr-2 pb-8">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="mb-6 flex-shrink-0">
                <h2 className="font-serif text-3xl text-white mb-2">O que você faz hoje?</h2>
                <p className="text-sm text-gray-400 font-sans">
                    Para construir sua autoridade, precisamos clareza absoluta.
                </p>
            </div>

            <div className="space-y-8 pb-4">
                {/* Instructional Bullet Points */}
                <div className="bg-[#081e30] border border-white/10 p-6 rounded-lg">
                    <h4 className="text-[#CA9A43] text-sm font-bold uppercase tracking-widest mb-4">Antes de escrever seu Pitch, reflita:</h4>
                    <ul className="space-y-3 text-gray-300 font-sans text-sm">
                        <li className="flex items-start gap-3">
                            <i className="bi bi-check-circle text-[#CA9A43] mt-0.5"></i>
                            <span><strong>Simplicidade:</strong> Você consegue explicar o que faz para uma criança de 10 anos?</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <i className="bi bi-check-circle text-[#CA9A43] mt-0.5"></i>
                            <span><strong>Público:</strong> Com quem exatamente você trabalha e qual problema resolve?</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <i className="bi bi-check-circle text-[#CA9A43] mt-0.5"></i>
                            <span><strong>Entrega:</strong> Como você entrega isso hoje? (Consultoria, serviço, mentoria...)</span>
                        </li>
                    </ul>
                </div>

                {/* The Pitch Input */}
                <div className={`bg-[#081e30] p-6 border rounded-sm transition-colors group ${readOnly ? 'border-white/5 opacity-80' : 'border-white/5 hover:border-[#CA9A43]/20'}`}>
                    <label className="block text-[#CA9A43] text-xs font-bold uppercase tracking-widest mb-3">
                        Pitch: Escreva como se estivesse falando para um empresário que nunca te viu.
                    </label>
                    <textarea
                        value={data.field4}
                        onChange={(e) => handleChange('field4', e.target.value)}
                        placeholder="Ex: Eu ajudo donos de agência a dobrarem o lucro sem trabalhar mais..."
                        disabled={readOnly}
                        className={`w-full bg-[#051522] border p-4 text-white text-lg outline-none rounded-sm resize-none transition-all placeholder:text-gray-700 h-40
                    ${readOnly ? 'border-transparent text-gray-400 cursor-not-allowed' : 'border-white/10 focus:border-[#CA9A43]'}
                `}
                    />
                </div>

                {/* 
        {!readOnly && (
            <AIButton 
                onClick={() => analyze(data.field4, 'Posicionamento e Pitch')} 
                loading={isAnalyzing} 
                disabled={!data.field4} 
            />
        )}
        */}

                <AIAnalysisModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} analysis={analysis} />
            </div>
        </div>
    );
};

// STEP 2: SUA HISTÓRIA (TIMELINE)
const Step2: React.FC<StepProps<MentorData['step2']>> = ({ data, onUpdate, readOnly }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentMoment, setCurrentMoment] = useState<Moment>({ id: '', year: '', description: '' });
    const saveStatus = useAutoSave(data);
    const { analyze, isAnalyzing, analysis, isModalOpen: isAIModalOpen, setIsModalOpen: setIsAIModalOpen } = useAIAnalysis();

    const handleSaveMoment = () => {
        if (currentMoment.year && currentMoment.description) {
            let updatedMoments = [...data.moments];

            if (currentMoment.id) {
                // Edit existing
                updatedMoments = updatedMoments.map(m => m.id === currentMoment.id ? currentMoment : m);
            } else {
                // Add new
                updatedMoments.push({ ...currentMoment, id: Date.now().toString() });
            }

            // Sort Chronologically
            updatedMoments.sort((a, b) => a.year.localeCompare(b.year));

            onUpdate({ moments: updatedMoments });
            setIsModalOpen(false);
            setCurrentMoment({ id: '', year: '', description: '' });
        }
    };

    const openEdit = (moment: Moment) => {
        if (readOnly) return;
        setCurrentMoment(moment);
        setIsModalOpen(true);
    };

    const openNew = () => {
        if (readOnly) return;
        setCurrentMoment({ id: '', year: '', description: '' });
        setIsModalOpen(true);
    };

    const removeMoment = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onUpdate({ moments: data.moments.filter(m => m.id !== id) });
    };

    return (
        <div className="relative h-full flex flex-col">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4 mb-4 sm:mb-8 flex-shrink-0">
                <div className="flex-1">
                    <h2 className="font-serif text-xl sm:text-3xl text-white mb-1 sm:mb-2">Sua história em momentos</h2>
                    <p className="text-[11px] sm:text-sm text-gray-400 font-sans max-w-2xl leading-tight sm:leading-normal">
                        Compartilhe os momentos que marcaram sua jornada.
                    </p>
                </div>
                {!readOnly && (
                    <button
                        onClick={openNew}
                        className="bg-[#CA9A43] hover:bg-[#FFE39B] text-[#031A2B] font-bold py-2 px-4 text-xs sm:text-sm rounded-sm flex items-center justify-center gap-2 transition-colors flex-shrink-0 w-full sm:w-auto"
                    >
                        <i className="bi bi-plus-lg"></i> Adicionar
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto pr-2 sm:pr-4 custom-scrollbar relative">
                <div className="absolute left-[12px] sm:left-[20px] top-0 bottom-0 w-[1px] bg-gradient-to-b from-[#CA9A43] to-transparent opacity-30"></div>
                <div className="space-y-6 sm:space-y-8 pl-0 sm:pl-2 pb-32">
                    {data.moments.map((moment) => (
                        <motion.div
                            key={moment.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="relative pl-8 sm:pl-10 group"
                        >
                            <div className="absolute left-[8px] sm:left-[16px] top-4 sm:top-6 w-[9px] h-[9px] rounded-full bg-[#CA9A43] ring-4 ring-[#031A2B] z-10"></div>
                            <div
                                onClick={() => openEdit(moment)}
                                className={`bg-[#081e30] border border-white/5 p-3 sm:p-4 rounded-sm relative transition-all
                                ${!readOnly ? 'cursor-pointer hover:border-[#CA9A43]/50 hover:bg-[#0a253a]' : ''}
                            `}
                            >
                                {!readOnly && (
                                    <button
                                        onClick={(e) => removeMoment(moment.id, e)}
                                        className="absolute top-2 right-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity z-20 text-sm sm:text-base"
                                    >
                                        <i className="bi bi-trash"></i>
                                    </button>
                                )}
                                <span className="inline-block px-2 py-0.5 bg-[#CA9A43]/10 text-[#CA9A43] text-[10px] sm:text-xs font-bold rounded mb-2">
                                    {formatDate(moment.year)}
                                </span>
                                <p className="text-gray-300 text-xs sm:text-sm leading-relaxed pr-6">{moment.description}</p>
                                {!readOnly && <div className="text-[9px] sm:text-[10px] text-gray-600 mt-2 opacity-0 group-hover:opacity-100 uppercase font-bold">Clique para editar</div>}
                            </div>
                        </motion.div>
                    ))}
                    {data.moments.length === 0 && (
                        <div className="text-center text-gray-500 italic py-10 pl-8 sm:pl-10 text-sm">Nenhum momento adicionado ainda.</div>
                    )}
                </div>

                {/*
            {!readOnly && data.moments.length > 0 && (
                 <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                    <AIButton 
                        onClick={() => analyze(JSON.stringify(data.moments), 'Linha do Tempo e Trajetória')} 
                        loading={isAnalyzing} 
                        disabled={false} 
                    />
                 </div>
            )}
            */}
            </div>

            <AIAnalysisModal isOpen={isAIModalOpen} onClose={() => setIsAIModalOpen(false)} analysis={analysis} />

            <AnimatePresence>
                {isModalOpen && (
                    <div className="absolute inset-0 bg-[#031A2B]/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#081e30] border border-[#CA9A43]/30 p-4 sm:p-6 w-full max-w-md shadow-2xl rounded-sm"
                        >
                            <h3 className="font-serif text-lg sm:text-xl text-white mb-3 sm:mb-4">{currentMoment.id ? 'Editar Momento' : 'Novo Momento'}</h3>
                            <div className="space-y-3 sm:space-y-4">
                                <div>
                                    <label className="block text-[10px] sm:text-xs uppercase text-gray-500 font-bold mb-1">Data</label>
                                    <input
                                        type="month"
                                        value={currentMoment.year}
                                        onChange={e => setCurrentMoment({ ...currentMoment, year: e.target.value })}
                                        className="w-full bg-[#051522] border border-white/10 p-2 text-white text-sm focus:border-[#CA9A43] outline-none rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] sm:text-xs uppercase text-gray-500 font-bold mb-1">O que aconteceu?</label>
                                    <textarea
                                        value={currentMoment.description}
                                        onChange={e => setCurrentMoment({ ...currentMoment, description: e.target.value })}
                                        placeholder="Descreva este marco..."
                                        className="w-full bg-[#051522] border border-white/10 p-2 sm:p-3 text-white text-xs sm:text-sm focus:border-[#CA9A43] outline-none h-24 sm:h-28 resize-none rounded"
                                    />
                                </div>
                                <div className="flex gap-2 justify-end pt-2">
                                    <button onClick={() => setIsModalOpen(false)} className="px-3 sm:px-4 py-2 text-xs text-gray-400 hover:text-white transition">Cancelar</button>
                                    <button onClick={handleSaveMoment} className="px-3 sm:px-4 py-2 bg-[#CA9A43] text-[#031A2B] text-xs font-bold hover:bg-[#FFE39B] transition rounded">Salvar</button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

// STEP 3: PÓDIO DAS CONQUISTAS
const Step3: React.FC<StepProps<MentorData['step3']>> = ({ data, onUpdate, readOnly }) => {
    const saveStatus = useAutoSave(data);
    const { analyze, isAnalyzing, analysis, isModalOpen, setIsModalOpen } = useAIAnalysis();

    const handleChange = (key: keyof MentorData['step3'], value: string) => {
        if (readOnly) return;
        onUpdate({ ...data, [key]: value });
    };

    return (
        <div className="relative h-full flex flex-col">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="mb-6">
                <h2 className="font-serif text-3xl text-white mb-2">Pódio das Conquistas</h2>
                <p className="text-sm text-gray-400 font-sans max-w-2xl">
                    Agora quero ver as conquistas que mais te deixam orgulhoso(a).
                    Pense em resultados que mostram sua força como empresário(a) ou mentor(a).
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 overflow-y-auto custom-scrollbar pb-4">
                <div className="lg:col-span-1 space-y-4">
                    {['first', 'second', 'third'].map((key, idx) => {
                        const labels = ['1º Lugar (Ouro)', '2º Lugar (Prata)', '3º Lugar (Bronze)'];
                        const colors = ['#CA9A43', '#9CA3AF', '#A05D2D'];
                        return (
                            <div key={key} className={`bg-[#081e30] p-4 border rounded-sm ${readOnly ? 'border-white/5' : 'border-white/5'}`}>
                                <label className="font-bold text-xs uppercase block mb-2" style={{ color: colors[idx] }}>{labels[idx]}</label>
                                <textarea
                                    value={(data as any)[key]}
                                    onChange={(e) => handleChange(key as any, e.target.value)}
                                    disabled={readOnly}
                                    className={`w-full bg-[#051522] border-b text-white p-2 text-sm h-20 resize-none outline-none
                                        ${readOnly ? 'border-transparent text-gray-400 cursor-not-allowed' : 'border-white/10 focus:border-white/30'}
                                    `}
                                    placeholder="Digite sua conquista..."
                                />
                            </div>
                        );
                    })}
                </div>

                <div className="lg:col-span-2 bg-[#2C2C2C] rounded-lg p-8 flex items-end justify-center gap-4 relative overflow-hidden min-h-[300px]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/5 to-transparent pointer-events-none"></div>

                    {/* 2nd Place */}
                    <motion.div initial={{ height: 0 }} animate={{ height: '12rem' }} className="w-1/3 bg-gray-400/20 border-t-4 border-gray-400 flex flex-col items-center justify-start pt-4 relative">
                        <span className="text-4xl font-serif text-gray-400 font-bold opacity-50 absolute bottom-4">2</span>
                        <div className="px-4 text-center">
                            <p className="text-white text-xs md:text-sm line-clamp-4 leading-relaxed italic">"{data.second || '...'}"</p>
                        </div>
                    </motion.div>

                    {/* 1st Place */}
                    <motion.div initial={{ height: 0 }} animate={{ height: '16rem' }} className="w-1/3 bg-[#CA9A43]/20 border-t-4 border-[#CA9A43] flex flex-col items-center justify-start pt-6 relative shadow-[0_0_30px_rgba(202,154,67,0.2)] z-10">
                        <span className="text-6xl font-serif text-[#CA9A43] font-bold opacity-50 absolute bottom-4">1</span>
                        <div className="absolute -top-6 text-[#CA9A43] text-2xl animate-bounce">👑</div>
                        <div className="px-4 text-center">
                            <p className="text-white text-sm md:text-base font-bold line-clamp-5 leading-relaxed italic">"{data.first || '...'}"</p>
                        </div>
                    </motion.div>

                    {/* 3rd Place */}
                    <motion.div initial={{ height: 0 }} animate={{ height: '10rem' }} className="w-1/3 bg-[#A05D2D]/20 border-t-4 border-[#A05D2D] flex flex-col items-center justify-start pt-4 relative">
                        <span className="text-4xl font-serif text-[#A05D2D] font-bold opacity-50 absolute bottom-4">3</span>
                        <div className="px-4 text-center">
                            <p className="text-white text-xs md:text-sm line-clamp-4 leading-relaxed italic">"{data.third || '...'}"</p>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/*
            {!readOnly && (
                <AIButton 
                    onClick={() => analyze(`Ouro: ${data.first}, Prata: ${data.second}, Bronze: ${data.third}`, 'Conquistas e Autoridade')} 
                    loading={isAnalyzing} 
                    disabled={!data.first} 
                />
            )}
            */}
            <AIAnalysisModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} analysis={analysis} />
        </div>
    );
};

// STEP 4: MVV
const Step4: React.FC<StepProps<MentorData['step4']>> = ({ data, onUpdate, readOnly }) => {
    const saveStatus = useAutoSave(data);
    const { analyze, isAnalyzing, analysis, isModalOpen, setIsModalOpen } = useAIAnalysis();

    const handleChange = (key: keyof MentorData['step4'], value: string) => {
        if (readOnly) return;
        onUpdate({ ...data, [key]: value });
    };

    const definitions = {
        mission: 'Qual é o motivo que faz você trabalhar do jeito que trabalha? Escreva em 1 frase o que te move por dentro.',
        vision: 'Onde você quer chegar como empresário(a) e mentor(a)? Descreva seu próximo grande destino.',
        values: 'Liste de 3 a 10 valores que guiam suas escolhas. Tente usar palavras ou expressões curtas.'
    };

    return (
        <div className="relative h-full flex flex-col">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="mb-8">
                <h2 className="font-serif text-3xl text-white mb-2">E o que guia suas decisões?</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-y-auto custom-scrollbar pb-4 pr-2">
                {[
                    { id: 'mission', title: 'MISSÃO', icon: 'bi-flag' },
                    { id: 'vision', title: 'VISÃO', icon: 'bi-eye' },
                    { id: 'values', title: 'VALORES', icon: 'bi-diamond' }
                ].map((card) => (
                    <div key={card.id} className="bg-white group flex flex-col min-h-[450px] md:h-full rounded-sm overflow-hidden shadow-lg md:shadow-none">
                        <div className="bg-gray-100 p-4 border-b border-gray-200 text-center">
                            <i className={`bi ${card.icon} text-2xl text-[#CA9A43] mb-2 block`}></i>
                            <h3 className="font-serif text-xl text-[#031A2B] font-bold tracking-wider">{card.title}</h3>
                        </div>
                        <div className="bg-gray-50 px-6 py-2 border-b border-gray-200/50">
                            <p className="text-[10px] text-gray-500 italic text-center leading-tight">
                                {definitions[card.id as keyof typeof definitions]}
                            </p>
                        </div>
                        <div className="flex-1 p-0 relative">
                            <textarea
                                value={(data as any)[card.id]}
                                onChange={(e) => handleChange(card.id as any, e.target.value)}
                                disabled={readOnly}
                                placeholder="..."
                                className={`w-full h-full p-6 text-gray-600 font-sans text-sm resize-none outline-none transition-colors
                                    ${readOnly ? 'bg-gray-50 cursor-not-allowed' : 'focus:bg-blue-50/50'}
                                `}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/*
            {!readOnly && (
                <AIButton 
                    onClick={() => analyze(`Missão: ${data.mission}, Visão: ${data.vision}, Valores: ${data.values}`, 'Cultura e Fundamentos')} 
                    loading={isAnalyzing} 
                    disabled={!data.mission} 
                />
            )}
            */}
            <AIAnalysisModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} analysis={analysis} />
        </div>
    );
};

// STEP 5: EQUIPE (BASTIDORES)
const Step5: React.FC<StepProps<MentorData['step5']>> = ({ data, onUpdate, readOnly }) => {
    const saveStatus = useAutoSave(data.text);
    return (
        <div className="relative h-full flex flex-col">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="mb-6">
                <h2 className="font-serif text-3xl text-white mb-2">Quem faz a roda girar?</h2>
                <p className="text-sm text-gray-400">
                    Para ter uma mentoria de 60k, você não pode ser o "faz-tudo". Descreva quem cuida de Marketing, Vendas, Financeiro e Suporte hoje e, caso esteja sozinho, qual sua real disposição (e capacidade) de investir na contratação de um time agora.
                </p>
            </div>
            <textarea
                className={`flex-1 w-full bg-[#051522] border rounded-sm p-6 text-gray-200 font-sans text-lg leading-relaxed outline-none resize-none transition-all
                    ${readOnly ? 'border-transparent opacity-80 cursor-not-allowed' : 'border-white/10 focus:border-[#CA9A43]'}
                `}
                placeholder="Ex: Hoje faço o marketing e as vendas sozinho. Meu financeiro é terceirizado. Sei que preciso contratar um comercial urgente e estou disposto a investir nisso..."
                value={data.text}
                disabled={readOnly}
                onChange={(e) => !readOnly && onUpdate({ text: e.target.value })}
            />
        </div>
    );
};

// STEP 6: DEPOIMENTOS
const Step6: React.FC<StepProps<{ testimonials: Testimonial[], hasNoTestimonials: boolean }>> = ({ data, onUpdate, readOnly }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentTestimonial, setCurrentTestimonial] = useState<Testimonial>({ id: '', title: '', description: '', videoUrl: '', imageUrl: '' });
    const saveStatus = useAutoSave(data);

    // File Input Ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    const openEdit = (t: Testimonial) => {
        if (readOnly) return;
        setCurrentTestimonial(t);
        setIsModalOpen(true);
    };

    const openNew = () => {
        if (readOnly) return;
        setCurrentTestimonial({ id: '', title: '', description: '', videoUrl: '', imageUrl: '' });
        setIsModalOpen(true);
    };

    const handleSaveTestimonial = () => {
        if (!currentTestimonial.title || !currentTestimonial.description) return;

        let updated = [...data.testimonials];
        if (currentTestimonial.id) {
            updated = updated.map(t => t.id === currentTestimonial.id ? currentTestimonial : t);
        } else {
            updated.push({ ...currentTestimonial, id: Date.now().toString() });
        }

        onUpdate({ ...data, testimonials: updated, hasNoTestimonials: false });
        setIsModalOpen(false);
    };

    const removeTestimonial = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onUpdate({ ...data, testimonials: data.testimonials.filter(t => t.id !== id) });
    };

    const toggleNoTestimonials = () => {
        if (readOnly) return;
        const newVal = !data.hasNoTestimonials;
        onUpdate({
            ...data,
            hasNoTestimonials: newVal,
            testimonials: newVal ? [] : data.testimonials
        });
    };

    // Simulate Image Upload via FileReader
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setCurrentTestimonial(prev => ({ ...prev, imageUrl: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="relative h-full flex flex-col">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4 mb-3 sm:mb-2 flex-shrink-0">
                <div className="flex-1">
                    <h2 className="font-serif text-xl sm:text-3xl text-white mb-1 sm:mb-2">Depoimentos: Quem valida o seu resultado?</h2>
                    <p className="text-[11px] sm:text-sm text-gray-400 font-sans max-w-2xl leading-tight sm:leading-normal">
                        Selecione os casos de sucesso que melhor representam a transformação que você entrega.
                    </p>
                </div>
                {!readOnly && !data.hasNoTestimonials && (
                    <button onClick={openNew} className="bg-[#CA9A43] hover:bg-[#FFE39B] text-[#031A2B] font-bold py-2 px-4 text-xs sm:text-sm rounded-sm flex items-center justify-center gap-2 flex-shrink-0 w-full sm:w-auto">
                        <i className="bi bi-plus-lg"></i> Adicionar
                    </button>
                )}
            </div>

            {/* Checkbox for "Starting from Scratch" */}
            <div className="mb-6">
                <label className="flex items-center gap-3 cursor-pointer group w-fit">
                    <div className={`w-5 h-5 border rounded flex items-center justify-center transition-colors ${data.hasNoTestimonials ? 'bg-[#CA9A43] border-[#CA9A43]' : 'border-gray-500 group-hover:border-gray-300'}`}>
                        {data.hasNoTestimonials && <i className="bi bi-check text-[#031A2B]"></i>}
                    </div>
                    <input type="checkbox" className="hidden" checked={data.hasNoTestimonials} onChange={toggleNoTestimonials} disabled={readOnly} />
                    <span className={`text-sm ${data.hasNoTestimonials ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`}>
                        Estou começando do zero e construirei meus primeiros cases agora.
                    </span>
                </label>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-4">
                {data.hasNoTestimonials ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 border border-dashed border-white/10 rounded-lg">
                        <i className="bi bi-stars text-4xl mb-4 text-[#CA9A43]"></i>
                        <p>Foco total na construção de autoridade agora.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {data.testimonials.map((t) => (
                            <div
                                key={t.id}
                                onClick={() => openEdit(t)}
                                className={`bg-white p-6 rounded-sm relative group transition-all
                                     ${!readOnly ? 'cursor-pointer hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]' : ''}
                                `}
                            >
                                {!readOnly && (
                                    <button onClick={(e) => removeTestimonial(t.id, e)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                        <i className="bi bi-trash"></i>
                                    </button>
                                )}

                                <div className="flex items-start gap-4 mb-4">
                                    {t.imageUrl ? (
                                        <img src={t.imageUrl} alt="Client" className="w-12 h-12 rounded-full object-cover border-2 border-[#CA9A43]" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold text-lg">
                                            {t.title.charAt(0)}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-[#031A2B] text-sm truncate">{t.title}</h4>
                                        <div className="flex gap-2 text-xs text-gray-500 mt-1">
                                            {t.videoUrl && <span className="flex items-center gap-1 text-red-500"><i className="bi bi-play-circle-fill"></i> Vídeo</span>}
                                            {t.imageUrl && <span className="flex items-center gap-1 text-blue-500"><i className="bi bi-image"></i> Foto</span>}
                                        </div>
                                    </div>
                                </div>
                                <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">"{t.description}"</p>
                                {!readOnly && <div className="text-[10px] text-gray-400 mt-3 uppercase font-bold text-right opacity-0 group-hover:opacity-100">Editar</div>}
                            </div>
                        ))}
                        {data.testimonials.length === 0 && !data.hasNoTestimonials && (
                            <div className="col-span-full text-center text-gray-500 italic py-10">
                                Nenhum depoimento adicionado. Clique em "Adicionar" ou marque a opção de começar do zero.
                            </div>
                        )}
                    </div>
                )}
            </div>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="absolute inset-0 bg-[#031A2B]/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
                        <div className="bg-[#081e30] border border-[#CA9A43]/30 p-6 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
                            <h3 className="text-white text-xl font-serif mb-2">{currentTestimonial.id ? 'Editar Depoimento' : 'Novo Depoimento'}</h3>
                            <p className="text-gray-400 text-xs mb-6">
                                Use o Título para destacar o resultado principal (Ex: 'Dobrou o faturamento em 3 meses') e a Descrição para contar brevemente o contexto do cliente.
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Título (Resultado Principal)</label>
                                    <input
                                        className="w-full bg-[#051522] border border-white/10 p-3 text-white focus:border-[#CA9A43] outline-none"
                                        placeholder="Ex: Faturou 100k em 30 dias"
                                        value={currentTestimonial.title}
                                        onChange={e => setCurrentTestimonial({ ...currentTestimonial, title: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Descrição (Contexto)</label>
                                    <textarea
                                        className="w-full bg-[#051522] border border-white/10 p-3 text-white h-24 focus:border-[#CA9A43] outline-none resize-none"
                                        placeholder="Como ele estava antes e como ficou depois..."
                                        value={currentTestimonial.description}
                                        onChange={e => setCurrentTestimonial({ ...currentTestimonial, description: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Imagem (Opcional)</label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            ref={fileInputRef}
                                            onChange={handleImageUpload}
                                            className="hidden"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="flex-1 bg-[#051522] border border-white/10 p-3 text-gray-400 hover:text-white hover:border-white/30 text-xs flex items-center justify-center gap-2"
                                            >
                                                <i className="bi bi-upload"></i> {currentTestimonial.imageUrl ? 'Alterar' : 'Carregar'}
                                            </button>

                                            {currentTestimonial.imageUrl && (
                                                <button
                                                    onClick={() => setCurrentTestimonial(prev => ({ ...prev, imageUrl: '' }))}
                                                    className="px-3 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-sm"
                                                    title="Remover imagem"
                                                >
                                                    <i className="bi bi-trash"></i>
                                                </button>
                                            )}
                                        </div>
                                        {currentTestimonial.imageUrl && <div className="mt-2 text-[10px] text-green-500 flex items-center gap-1"><i className="bi bi-check"></i> Imagem carregada</div>}
                                    </div>

                                    <div>
                                        <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Link do Vídeo (Opcional)</label>
                                        <input
                                            className="w-full bg-[#051522] border border-white/10 p-3 text-white text-xs focus:border-[#CA9A43] outline-none"
                                            placeholder="YouTube / Vimeo / Drive"
                                            value={currentTestimonial.videoUrl}
                                            onChange={e => setCurrentTestimonial({ ...currentTestimonial, videoUrl: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-8 pt-4 border-t border-white/5">
                                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white px-4 text-sm font-bold uppercase tracking-wider">Cancelar</button>
                                <button onClick={handleSaveTestimonial} disabled={!currentTestimonial.title || !currentTestimonial.description} className="bg-[#CA9A43] text-[#031A2B] font-bold px-6 py-2 rounded-sm text-sm uppercase tracking-wider disabled:opacity-50">Salvar</button>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

// STEP 7: DIFERENCIAÇÃO (ROSE-WHITE)
const Step7: React.FC<StepProps<{ marketStandard: string, myDifference: string }>> = ({ data, onUpdate, readOnly }) => {
    const saveStatus = useAutoSave(data);

    const handleChange = (field: 'marketStandard' | 'myDifference', value: string) => {
        if (readOnly) return;
        onUpdate({ ...data, [field]: value });
    };

    return (
        <div className="relative h-full flex flex-col">
            {!readOnly && <SaveStatusIndicator status={saveStatus} />}
            <div className="mb-4">
                <h2 className="font-serif text-3xl text-white mb-2 leading-tight">O que faz com que em um mar de rosas-vermelhas,<br /> você seja a única <span className="text-[#CA9A43] italic">rosa-branca?</span></h2>
                <p className="text-sm text-gray-400 font-sans">Compare o que é comum no seu mercado com o que você entrega de um jeito único.</p>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/10 rounded-lg overflow-hidden">
                {/* Left: Market Standard */}
                <div className="bg-red-900/10 p-6 flex flex-col border-b md:border-b-0 md:border-r border-white/10">
                    <label className="text-red-400 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                        <i className="bi bi-x-circle"></i> O que é comum no mercado?
                    </label>
                    <p className="text-gray-500 text-xs mb-4">Liste promessas, crenças, estilos, etc. que você vê como padrão no mercado em que atua.</p>
                    <textarea
                        value={data.marketStandard}
                        onChange={(e) => handleChange('marketStandard', e.target.value)}
                        disabled={readOnly}
                        placeholder="Ex: Todo mundo promete dinheiro fácil sem esforço..."
                        className={`flex-1 w-full bg-[#051522]/50 border border-red-500/10 p-4 text-gray-300 text-sm outline-none resize-none rounded-sm transition-all
                            ${readOnly ? 'cursor-not-allowed opacity-80' : 'focus:border-red-500/50 focus:bg-[#051522]'}
                        `}
                    />
                </div>

                {/* Right: My Difference */}
                <div className="bg-emerald-900/10 p-6 flex flex-col">
                    <label className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                        <i className="bi bi-check-circle"></i> O que você faz diferente?
                    </label>
                    <p className="text-gray-500 text-xs mb-4">Agora descreva o que você faz de um jeito próprio: sua forma de trabalhar, método, experiência ou estilo.</p>
                    <textarea
                        value={data.myDifference}
                        onChange={(e) => handleChange('myDifference', e.target.value)}
                        disabled={readOnly}
                        placeholder="Ex: Eu foco na construção de patrimônio sólido a longo prazo com segurança..."
                        className={`flex-1 w-full bg-[#051522]/50 border border-emerald-500/10 p-4 text-white text-sm outline-none resize-none rounded-sm transition-all
                            ${readOnly ? 'cursor-not-allowed opacity-80' : 'focus:border-emerald-500/50 focus:bg-[#051522]'}
                        `}
                    />
                </div>
            </div>
        </div>
    );
};

// --- MAIN MODULE COMPONENT ---

export const MentorModule: React.FC<MentorModuleProps> = ({
    data,
    onUpdate,
    onComplete,
    onSaveAndExit,
    isReadOnly = false,
    savedStep,
    onStepChange
}) => {
    // Initial Step Logic
    const initialStep = getInitialStep(data);
    const isComplete = initialStep > 7;

    // Usar savedStep se disponível, caso contrário usar initialStep
    const startingStep = savedStep !== undefined ? savedStep : (isComplete ? 1 : initialStep);
    const [currentStep, setCurrentStep] = useState(startingStep);
    // Intro logic: Show intro ONLY if not read-only AND user is at step 1 AND hasn't started filling field4.
    const [showIntro, setShowIntro] = useState(!isReadOnly && initialStep === 1 && !data.step1.field4);
    const [showCompletion, setShowCompletion] = useState(isReadOnly || isComplete);
    const totalSteps = 7;

    // Salvar currentStep sempre que ele mudar
    useEffect(() => {
        if (onStepChange && !showIntro && !showCompletion) {
            console.log(`💾 MentorModule: Salvando etapa ${currentStep}`);
            onStepChange(currentStep);
        }
    }, [currentStep, onStepChange, showIntro, showCompletion]);

    // Validation Logic
    const canProceed = (() => {
        if (isReadOnly) return true;
        switch (currentStep) {
            case 1: return !!data.step1.field4 && data.step1.field4.trim().length > 0; // Pitch
            case 2: return data.step2.moments.length > 0; // Moments (At least one)
            case 3: return !!data.step3.first && data.step3.first.trim().length > 0 &&
                !!data.step3.second && data.step3.second.trim().length > 0 &&
                !!data.step3.third && data.step3.third.trim().length > 0; // Achievements (All 3)
            case 4: return !!data.step4.mission && data.step4.mission.trim().length > 0 &&
                !!data.step4.vision && data.step4.vision.trim().length > 0 &&
                !!data.step4.values && data.step4.values.trim().length > 0; // MVV (All 3)
            case 5: return data.step5.text.length > 5; // Team
            case 6: return data.step6.testimonials.length > 0 || data.step6.hasNoTestimonials; // Testimonials
            case 7: return data.step7.marketStandard.length > 5 && data.step7.myDifference.length > 5; // Difference
            default: return true; // Other steps are optional or handled internally
        }
    })();

    const handleNext = () => {
        if (!canProceed && !isReadOnly) return;

        if (currentStep === totalSteps) {
            setShowCompletion(true);
            if (onStepChange) onStepChange(currentStep);
        } else {
            const nextStep = currentStep + 1;
            setCurrentStep(nextStep);
            if (onStepChange) onStepChange(nextStep);
        }
    };

    // Atualiza campo específico dentro do objeto global data
    const updateStepData = <K extends keyof MentorData>(stepKey: K, newData: MentorData[K]) => {
        onUpdate({
            ...data,
            [stepKey]: newData
        });
    };

    // Se estiver em modo leitura, começa na tela de resumo/conclusão
    useEffect(() => {
        if (isReadOnly) {
            setShowIntro(false);
            setShowCompletion(true);
        }
    }, [isReadOnly]);

    const renderStep = () => {
        const commonProps = { readOnly: isReadOnly };
        switch (currentStep) {
            case 1: return <Step1 data={data.step1} onUpdate={(d) => updateStepData('step1', d)} {...commonProps} />;
            case 2: return <Step2 data={data.step2} onUpdate={(d) => updateStepData('step2', d)} {...commonProps} />;
            case 3: return <Step3 data={data.step3} onUpdate={(d) => updateStepData('step3', d)} {...commonProps} />;
            case 4: return <Step4 data={data.step4} onUpdate={(d) => updateStepData('step4', d)} {...commonProps} />;
            case 5: return <Step5 data={data.step5} onUpdate={(d) => updateStepData('step5', d)} {...commonProps} />;
            case 6: return <Step6 data={data.step6} onUpdate={(d) => updateStepData('step6', d)} {...commonProps} />;
            case 7: return <Step7 data={data.step7} onUpdate={(d) => updateStepData('step7', d)} {...commonProps} />;
            default: return <Step1 data={data.step1} onUpdate={(d) => updateStepData('step1', d)} {...commonProps} />;
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
                        <span className="text-[#CA9A43] text-xs font-bold uppercase tracking-widest">Módulo: O Mentor</span>
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
            <div className="flex-1 p-8 overflow-hidden">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={showIntro ? 'intro' : (showCompletion ? 'completed' : currentStep)}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="h-full"
                    >
                        {showIntro ? (
                            <MentorIntro onStart={() => setShowIntro(false)} />
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
                <div className="bg-[#031A2B] p-4 border-t border-white/5 flex flex-col-reverse sm:flex-row justify-between items-center gap-4">
                    <button
                        onClick={() => {
                            const prevStep = Math.max(1, currentStep - 1);
                            setCurrentStep(prevStep);
                            if (onStepChange) onStepChange(prevStep);
                        }}
                        disabled={currentStep === 1}
                        className="text-gray-400 hover:text-white disabled:opacity-30 flex items-center gap-2 px-4 py-2 text-sm uppercase tracking-wider w-full sm:w-auto justify-center"
                    >
                        <i className="bi bi-arrow-left"></i> Anterior
                    </button>

                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        {isReadOnly && (
                            <button onClick={() => setShowCompletion(true)} className="text-[#CA9A43] hover:text-[#FFE39B] text-xs uppercase font-bold tracking-widest px-4">
                                Voltar ao Resumo
                            </button>
                        )}
                        {!isReadOnly && (
                            <button onClick={onSaveAndExit} className="text-gray-400 hover:text-white text-xs uppercase font-bold tracking-widest px-4">
                                Salvar e Sair
                            </button>
                        )}

                        <button
                            onClick={handleNext}
                            disabled={!canProceed && !isReadOnly}
                            className={`font-bold px-6 py-3 rounded-sm flex items-center justify-center gap-2 transition-colors text-sm uppercase tracking-wider w-full sm:w-auto
                                ${!canProceed && !isReadOnly
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    : 'bg-[#CA9A43] text-[#031A2B] hover:bg-[#FFE39B]'
                                }
                            `}
                        >
                            {currentStep === totalSteps ? (isReadOnly ? 'Finalizar Revisão' : 'Concluir') : 'Próxima Etapa'} <i className="bi bi-arrow-right"></i>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
