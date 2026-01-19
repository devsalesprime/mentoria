
import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion } from 'framer-motion';
import { MentorData } from './MentorModule';
import { MenteeData } from './MenteeModule';
import { MethodData } from './MethodModule';

interface ActionPlanProps {
    mentorData: MentorData;
    menteeData: MenteeData;
    methodData: MethodData;
}

interface AIDiagnosis {
    score: number;
    scoreReason: string;
    strengths: string[];
    blindSpots: string[];
    tacticalSteps: {
        title: string;
        action: string;
    }[];
}

export const ActionPlanModule: React.FC<ActionPlanProps> = ({ mentorData, menteeData, methodData }) => {
    const [diagnosis, setDiagnosis] = useState<AIDiagnosis | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasEnoughData = () => {
        // Validação básica para garantir que a IA tenha o que analisar
        return mentorData.step1.field1.length > 5 || menteeData.hasClients !== null || methodData.name.length > 2;
    };

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

            // Construção do contexto para a IA
            const context = {
                mentor: {
                    positioning: mentorData.step1.field1,
                    target: mentorData.step1.field2,
                    pitch: mentorData.step1.field4,
                    mission: mentorData.step4.mission
                },
                mentee: {
                    hasClients: menteeData.hasClients,
                    profile: menteeData.demographics.detailedProfile,
                    pain: menteeData.transformation.before.context,
                    desire: menteeData.transformation.after.context,
                    decisionBarriers: menteeData.decisionMountain.barriers
                },
                method: {
                    name: methodData.name,
                    promise: methodData.transformation,
                    stage: methodData.stage
                }
            };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                config: {
                    systemInstruction: `Você é um estrategista de negócios de elite, especializado em mentorias High-Ticket (ticket médio de R$2k a R$5k) e grupos de Mastermind. 
                    Seu objetivo é analisar os dados de um especialista e dar um diagnóstico brutalmente honesto e construtivo.
                    Seja direto, profissional e focado em VENDAS e ESCALA.
                    O idioma de resposta deve ser Português (Brasil).`,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            score: { type: Type.NUMBER, description: "Nota de 0 a 100 para o potencial de venda atual." },
                            scoreReason: { type: Type.STRING, description: "Uma frase curta (max 15 palavras) justificando a nota." },
                            strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 pontos fortes claros." },
                            blindSpots: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 pontos cegos ou riscos que o mentor não está vendo." },
                            tacticalSteps: {
                                type: Type.ARRAY,
                                description: "3 passos práticos para executar na próxima semana.",
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        action: { type: Type.STRING }
                                    }
                                }
                            }
                        }
                    }
                },
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: `Analise este negócio de mentoria: ${JSON.stringify(context)}` }]
                    }
                ]
            });

            if (response.text) {
                const result = JSON.parse(response.text) as AIDiagnosis;
                setDiagnosis(result);
            }

        } catch (err) {
            console.error(err);
            setError("Ocorreu um erro ao gerar sua análise. Tente novamente.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#051522] border border-white/5 rounded-lg p-8 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#CA9A43]/10 to-transparent animate-pulse"></div>
                <div className="w-20 h-20 border-4 border-[#CA9A43]/30 border-t-[#CA9A43] rounded-full animate-spin mb-8 z-10"></div>
                <h3 className="text-2xl font-serif text-white mb-2 z-10 animate-pulse">Processando Estratégia...</h3>
                <p className="text-gray-400 font-sans z-10">Nossa IA está cruzando seus dados com padrões de mercado de alta performance.</p>
                <div className="mt-8 space-y-2 z-10">
                    <p className="text-xs text-[#CA9A43] animate-pulse">Analizando Autoridade...</p>
                    <p className="text-xs text-[#CA9A43] animate-pulse delay-75">Validando Promessa...</p>
                    <p className="text-xs text-[#CA9A43] animate-pulse delay-150">Calculando Market Fit...</p>
                </div>
            </div>
        );
    }

    if (diagnosis) {
        return (
            <div className="bg-[#051522] border border-white/5 rounded-lg h-full overflow-y-auto custom-scrollbar p-8">
                <div className="max-w-4xl mx-auto space-y-8">
                    {/* Header Score */}
                    <div className="text-center mb-12">
                        <div className="inline-block relative">
                            <svg className="w-32 h-32 transform -rotate-90">
                                <circle cx="64" cy="64" r="60" stroke="#1f2937" strokeWidth="8" fill="transparent" />
                                <circle cx="64" cy="64" r="60" stroke="#CA9A43" strokeWidth="8" fill="transparent" strokeDasharray={377} strokeDashoffset={377 - (377 * diagnosis.score) / 100} className="transition-all duration-1000 ease-out" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-4xl font-serif font-bold text-white">{diagnosis.score}</span>
                                <span className="text-[10px] uppercase text-[#CA9A43] tracking-widest">Score</span>
                            </div>
                        </div>
                        <h2 className="text-white font-serif text-2xl mt-4 mb-2">{diagnosis.scoreReason}</h2>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Strengths */}
                        <div className="bg-[#081e30] p-6 rounded-lg border border-green-500/20">
                            <h3 className="text-green-500 font-bold uppercase tracking-widest text-xs mb-4 flex items-center gap-2"><i className="bi bi-check-circle"></i> Pontos Fortes</h3>
                            <ul className="space-y-3">
                                {diagnosis.strengths.map((item, i) => (
                                    <li key={i} className="text-gray-300 text-sm flex items-start gap-2">
                                        <span className="text-green-500 mt-1">•</span> {item}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Blind Spots */}
                        <div className="bg-[#081e30] p-6 rounded-lg border border-red-500/20">
                            <h3 className="text-red-500 font-bold uppercase tracking-widest text-xs mb-4 flex items-center gap-2"><i className="bi bi-exclamation-triangle"></i> Pontos Cegos</h3>
                            <ul className="space-y-3">
                                {diagnosis.blindSpots.map((item, i) => (
                                    <li key={i} className="text-gray-300 text-sm flex items-start gap-2">
                                        <span className="text-red-500 mt-1">•</span> {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Tactical Steps */}
                    <div className="bg-[#081e30] p-8 rounded-lg border border-[#CA9A43]/30">
                        <h3 className="text-[#CA9A43] font-bold uppercase tracking-widest text-sm mb-6 flex items-center gap-2"><i className="bi bi-list-check"></i> Plano Tático Imediato</h3>
                        <div className="space-y-6">
                            {diagnosis.tacticalSteps.map((step, i) => (
                                <div key={i} className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-[#CA9A43]/10 text-[#CA9A43] flex items-center justify-center font-bold text-sm flex-shrink-0">{i + 1}</div>
                                    <div>
                                        <h4 className="text-white font-bold text-sm mb-1">{step.title}</h4>
                                        <p className="text-gray-400 text-sm">{step.action}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-[#051522] border border-white/5 rounded-lg">
            <div className="w-20 h-20 bg-[#CA9A43]/10 rounded-full flex items-center justify-center mb-6 border border-[#CA9A43]/30">
                <i className="bi bi-lightning-charge text-4xl text-[#CA9A43]"></i>
            </div>
            <h2 className="font-serif text-3xl text-white mb-4">Gerar Plano de Ação com IA</h2>
            <p className="text-gray-400 max-w-lg mb-8">
                Nossa IA vai analisar todas as suas respostas dos módulos anteriores e criar um diagnóstico estratégico personalizado.
            </p>

            {/*
            {!hasEnoughData() ? (
                <div className="bg-red-500/10 border border-red-500/30 p-4 rounded text-sm text-red-300 mb-6">
                    Você precisa preencher mais informações nos módulos de Fundação antes de gerar o plano.
                </div>
            ) : (
                <button 
                    onClick={handleGenerate}
                    className="bg-[#CA9A43] text-[#031A2B] font-bold py-3 px-8 rounded uppercase tracking-widest hover:bg-[#FFE39B] transition-colors shadow-lg shadow-[#CA9A43]/20"
                >
                    Gerar Diagnóstico
                </button>
            )}
            */}

            <div className="bg-[#081e30] border border-white/10 p-4 rounded-lg text-sm text-gray-400 max-w-md">
                <p className="flex items-center justify-center gap-2">
                    <i className="bi bi-cone-striped text-[#CA9A43]"></i>
                    Funcionalidade de IA temporariamente indisponível.
                </p>
                <p className="text-xs mt-2 text-gray-500">
                    O diagnóstico completo será liberado em breve. Por enquanto, foque em preencher os módulos de fundação.
                </p>
            </div>
        </div>
    );
};
