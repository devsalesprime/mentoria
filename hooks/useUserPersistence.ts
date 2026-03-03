import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { calculateProgress } from '../utils/progress';

// Função para obter a URL base da API dinamicamente
// IMPORTANTE: Esta função é chamada a cada requisição para garantir detecção correta
const getApiBaseUrl = (): string => {
    // Sempre retornar vazio para usar URLs relativas
    // Isso garante que o proxy do Vite (localhost:3000 -> 3001) seja usado uniformemente
    return '';
};

export interface ModuleData {
    mentor: Record<string, any>;
    mentee: Record<string, any>;
    method: Record<string, any>;
    delivery: Record<string, any>;
}

export interface ModuleSteps {
    mentor?: number;
    mentee?: number;
    method?: number;
    delivery?: number;
}

export const useUserPersistence = (token: string | undefined) => {
    const [formData, setFormData] = useState<ModuleData>({
        mentor: {},
        mentee: {},
        method: {},
        delivery: {}
    });

    const [isSaving, setIsSaving] = useState(false);
    const [lastSaveError, setLastSaveError] = useState<string | null>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const latestFormDataRef = useRef(formData);
    const [moduleSteps, setModuleSteps] = useState<ModuleSteps>({});
    const latestModuleStepsRef = useRef<ModuleSteps>({});

    // Atualizar ref quando formData mudar
    useEffect(() => {
        latestFormDataRef.current = formData;
    }, [formData]);

    // Atualizar ref quando moduleSteps mudar
    useEffect(() => {
        latestModuleStepsRef.current = moduleSteps;
    }, [moduleSteps]);

    // Carregar dados ao montar
    useEffect(() => {
        if (token) {
            console.log('🔄 useUserPersistence: Carregando dados do usuário...');
            loadProgress();
        } else {
            console.warn('⚠️ useUserPersistence: Token não disponível');
        }
    }, [token]);

    // Carregar progresso do servidor
    const loadProgress = async () => {
        if (!token) {
            console.warn('❌ Token não disponível para carregar progresso');
            return;
        }

        try {
            const apiBaseUrl = getApiBaseUrl();
            // Construir URL corretamente: se apiBaseUrl for vazio, usar apenas o path
            // Não incluir o base path do Vite porque o servidor Express já trata as rotas /api/* diretamente
            const apiUrl = apiBaseUrl ? `${apiBaseUrl}/api/user/progress` : '/api/user/progress';
            console.log('📥 Buscando dados salvos do servidor...');
            console.log('🌐 URL completa:', apiUrl);
            console.log('📍 Hostname atual:', typeof window !== 'undefined' ? window.location.hostname : 'N/A');
            console.log('📍 API Base URL:', apiBaseUrl || '(vazio = URLs relativas)');
            console.log('📍 Base path:', typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : 'N/A');
            const response = await axios.get(apiUrl, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.success && response.data.progress?.formData) {
                const loadedData = response.data.progress.formData;
                const loadedProgress = response.data.progress.progressPercentage || 0;
                console.log('✅ Dados carregados do servidor:', Object.keys(loadedData));
                console.log('📊 Progresso salvo no servidor:', loadedProgress + '%');

                // Garantir que todos os módulos existam
                const updatedFormData = {
                    mentor: loadedData.mentor || {},
                    mentee: loadedData.mentee || {},
                    method: loadedData.method || {},
                    delivery: loadedData.delivery || {}
                };

                // Carregar currentStep de cada módulo se existir
                const loadedSteps: ModuleSteps = {};
                if (updatedFormData.mentor._currentStep) {
                    loadedSteps.mentor = updatedFormData.mentor._currentStep;
                    delete updatedFormData.mentor._currentStep; // Remover do formData, manter apenas em moduleSteps
                }
                if (updatedFormData.mentee._currentStep) {
                    loadedSteps.mentee = updatedFormData.mentee._currentStep;
                    delete updatedFormData.mentee._currentStep;
                }
                if (updatedFormData.method._currentStep) {
                    loadedSteps.method = updatedFormData.method._currentStep;
                    delete updatedFormData.method._currentStep;
                }
                if (updatedFormData.delivery._currentStep) {
                    loadedSteps.delivery = updatedFormData.delivery._currentStep;
                    delete updatedFormData.delivery._currentStep;
                }

                console.log('📍 Etapas carregadas:', loadedSteps);

                setFormData(updatedFormData);
                setModuleSteps(loadedSteps);
                latestFormDataRef.current = updatedFormData;
                latestModuleStepsRef.current = loadedSteps;
            } else {
                console.log('📭 Nenhum dado salvo encontrado para este usuário');
            }
        } catch (error: any) {
            console.error('❌ Erro ao carregar progresso:', error.message);
            if (error.response) {
                console.error('Resposta do servidor:', error.response.data);
            }
        }
    };





    // Função central de persistência
    const persistData = useCallback(async (data: ModuleData, steps?: ModuleSteps) => {
        try {
            setLastSaveError(null);
            const progressPercentage = calculateProgress(data);

            // Incluir currentStep de cada módulo nos dados antes de salvar
            const dataWithSteps = { ...data };
            if (steps && Object.keys(steps).length > 0) {
                if (steps.mentor !== undefined) {
                    dataWithSteps.mentor = { ...dataWithSteps.mentor, _currentStep: steps.mentor };
                }
                if (steps.mentee !== undefined) {
                    dataWithSteps.mentee = { ...dataWithSteps.mentee, _currentStep: steps.mentee };
                }
                if (steps.method !== undefined) {
                    dataWithSteps.method = { ...dataWithSteps.method, _currentStep: steps.method };
                }
                if (steps.delivery !== undefined) {
                    dataWithSteps.delivery = { ...dataWithSteps.delivery, _currentStep: steps.delivery };
                }
            }

            const apiBaseUrl = getApiBaseUrl();
            const apiUrl = apiBaseUrl ? `${apiBaseUrl}/api/user/save-progress` : '/api/user/save-progress';

            console.log(`📊 Progresso calculado: ${progressPercentage}%`);

            const response = await axios.post(
                apiUrl,
                {
                    formData: dataWithSteps,
                    progressPercentage
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            if (response.data && response.data.success) {
                console.log('✅ Dados salvos com sucesso!');
            } else {
                setLastSaveError(response.data?.message || 'Erro desconhecido');
            }
        } catch (error: any) {
            console.error('❌ Erro na requisição de salvamento:', error.message);
            setLastSaveError(error.message || 'Erro ao salvar dados');
        } finally {
            setIsSaving(false);
        }
    }, [token]);

    // Marcar módulo como concluído
    const markModuleCompleted = useCallback((module: 'mentor' | 'mentee' | 'method' | 'delivery') => {
        setFormData(prev => {
            const updated = {
                ...prev,
                [module]: { ...prev[module], _completed: true }
            };
            latestFormDataRef.current = updated;

            // Forçar salvamento
            setIsSaving(true);
            persistData(updated, latestModuleStepsRef.current).catch(err => {
                console.error(`❌ Erro ao marcar módulo ${module} como concluído:`, err);
            });

            return updated;
        });
    }, [persistData]);

    // Salvar dados com debounce
    const saveProgress = useCallback((newFormData: Partial<ModuleData>) => {
        if (!token) return;

        // Atualizar estado local imediatamente
        setFormData(prev => {
            const updated = { ...prev, ...newFormData };
            latestFormDataRef.current = updated; // Atualizar ref explicitamente aqui também
            return updated;
        });

        // Limpar timeout anterior
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        setIsSaving(true);
        saveTimeoutRef.current = setTimeout(() => {
            // Usar ref para garantir que temos os valores mais recentes
            persistData(latestFormDataRef.current, latestModuleStepsRef.current);
        }, 2000); // Increased from 1s to 2s to reduce request frequency
    }, [token, persistData]);

    // Salvar imediatamente (para logout)
    const saveImmediately = useCallback(async () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        // Usar ref para garantir que temos os valores mais recentes
        const currentSteps = latestModuleStepsRef.current;
        const currentData = latestFormDataRef.current;

        console.log('💾 saveImmediately: Salvando etapas antes de logout:', currentSteps);

        if (Object.keys(currentData).length > 0 || Object.keys(currentSteps).length > 0) {
            setIsSaving(true);
            await persistData(currentData, currentSteps);
        }
    }, [token, persistData]);

    // Salvar currentStep de um módulo específico
    const saveModuleStep = useCallback((module: 'mentor' | 'mentee' | 'method' | 'delivery', step: number) => {
        console.log(`💾 saveModuleStep: Salvando etapa ${step} para módulo ${module}`);
        setModuleSteps(prev => {
            const updated = { ...prev, [module]: step };
            latestModuleStepsRef.current = updated; // Atualizar ref imediatamente
            console.log(`📋 Todas as etapas atuais:`, updated);

            // Add debounce to prevent too many requests when navigating quickly
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            setIsSaving(true);
            saveTimeoutRef.current = setTimeout(() => {
                persistData(latestFormDataRef.current, latestModuleStepsRef.current).catch(err => {
                    console.error(`❌ Erro ao salvar etapa do módulo ${module}:`, err);
                });
            }, 1500); // 1.5s debounce for step changes

            return updated;
        });
    }, [token, persistData]);

    // Obter currentStep de um módulo específico
    const getModuleStep = useCallback((module: 'mentor' | 'mentee' | 'method' | 'delivery'): number | undefined => {
        return moduleSteps[module];
    }, [moduleSteps]);

    // Limpar timeout no unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return {
        formData,
        saveProgress,
        saveImmediately,
        isSaving,
        lastSaveError,
        loadProgress,
        saveModuleStep,
        getModuleStep,
        markModuleCompleted, // Exportar nova função
        getMentorData: () => formData.mentor,
        getMenteeData: () => formData.mentee,
        getMethodData: () => formData.method,
        getDeliveryData: () => formData.delivery
    };
};