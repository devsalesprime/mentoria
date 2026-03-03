export interface ModuleData {
    mentor: Record<string, any>;
    mentee: Record<string, any>;
    method: Record<string, any>;
    delivery: Record<string, any>;
}

export const calculateProgress = (data: ModuleData): number => {
    const modules = ['mentor', 'mentee', 'method', 'delivery'] as const;

    let totalProgress = 0;

    modules.forEach(moduleKey => {
        const moduleData = data[moduleKey];

        // 1. Prioridade: Verificar se o módulo está explicitamente marcado como concluído
        if (moduleData && moduleData._completed) {
            totalProgress += 25;
            return;
        }

        // 2. HEURÍSTICA DE COMPLETUDE PARA DADOS LEGADOS (Prioridade sobre steps parciais)
        // Verificar se os campos finais/críticos estão preenchidos para garantir 100%
        let isLegacyComplete = false;
        let failureReason = '';

        if (moduleKey === 'mentor') {
            // Heurística ampliada: se tem step6 (Testimonials) ou step7 (Diferenciais)
            const s7 = moduleData.step7;
            const s6 = moduleData.step6;
            // Se chegou no step 6 e salvou algo, ou step 7
            if (s7 && (s7.myDifference || s7.marketStandard)) {
                isLegacyComplete = true;
            } else if (s6 && (s6.testimonials?.length > 0 || s6.hasNoTestimonials)) {
                isLegacyComplete = true;
            } else {
                failureReason = 'Step 6/7 missing';
            }
        } else if (moduleKey === 'mentee') {
            // Heurística ampliada: icpSynthesis OU step5 (consumptionJourney) preenchido
            const synth = moduleData.icpSynthesis;
            const journey = moduleData.consumptionJourney;
            if (synth && synth.phrase && synth.phrase.length > 3) {
                isLegacyComplete = true;
            } else if (journey && journey.steps && journey.steps.length > 0) {
                isLegacyComplete = true;
            } else {
                failureReason = 'ICP Synthesis/Journey missing';
            }
        } else if (moduleKey === 'method') {
            // Structured ou Unstructured
            if (moduleData.pillars && moduleData.pillars.length > 0) isLegacyComplete = true;
            else if (moduleData.journeyMap && moduleData.journeyMap.length > 0) isLegacyComplete = true;
            else if (moduleData.name && moduleData.transformation) isLegacyComplete = true;
            else failureReason = 'Method Pillars/Journey/Name missing';
        } else if (moduleKey === 'delivery') {
            // Delivery: Se tem mandatory preenchido é suficiente
            if (moduleData.mandatory && moduleData.mandatory.frequency) {
                isLegacyComplete = true;
                // Se overdelivery existir e estiver vazio, NÃO bloqueia.
                // Apenas bloqueia se não tiver mandatory.
            } else {
                failureReason = 'Delivery Mandatory missing';
            }
        }

        if (isLegacyComplete) {
            // console.log(`✅ [Progress] Legacy Complete Detected for ${moduleKey}`);
            totalProgress += 25;
            return;
        }

        // 3. Score por Steps
        let stepScore = 0;
        if (moduleData && moduleData._currentStep) {
            const step = moduleData._currentStep;
            let max = 0;

            // Definir max steps dinamicamente baseado nos dados
            if (moduleKey === 'mentor') {
                max = 7;
            } else if (moduleKey === 'mentee') {
                max = moduleData.hasClients === 'no' ? 6 : 5;
            } else if (moduleKey === 'method') {
                max = moduleData.stage === 'structured' ? 2 : 4;
            } else if (moduleKey === 'delivery') {
                max = 3;
            }

            if (max > 0) {
                const ratio = Math.min(1, step / max);
                stepScore = ratio * 25;
            }
        }

        // 4. Score por Densidade (Campos preenchidos)
        let densityScore = 0;
        if (moduleData && typeof moduleData === 'object') {
            const fields = Object.keys(moduleData).filter(key => key !== '_completed' && key !== '_currentStep');
            let localFilled = 0;
            let localTotal = fields.length;

            fields.forEach(field => {
                const value = moduleData[field];
                if (value !== null && value !== undefined && value !== '') {
                    if (Array.isArray(value) && value.length > 0) {
                        localFilled++;
                    } else if (typeof value === 'object' && Object.keys(value).length > 0) {
                        localFilled++;
                    } else if (typeof value === 'string' && value.trim().length > 0) {
                        localFilled++;
                    } else if (typeof value === 'number' || typeof value === 'boolean') {
                        localFilled++;
                    }
                }
            });

            if (localTotal > 0) {
                densityScore = (localFilled / localTotal) * 25;
            }
        }

        // USAR O MAIOR SCORE
        totalProgress += Math.max(stepScore, densityScore);
    });

    return Math.min(100, Math.round(totalProgress));
};
