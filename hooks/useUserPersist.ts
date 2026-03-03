import { useEffect, useState } from 'react';
import axios from 'axios';

export interface ModuleData {
    mentor: Record<string, any>;
    mentee: Record<string, any>;
    method: Record<string, any>;
    delivery: Record<string, any>;
}

interface UseUserPersistenceReturn {
    formData: ModuleData;
    progressPercentage: number;
    lastUpdated: string | null;
    saveProgress: (data: ModuleData, percentage: number) => Promise<void>;
    loadProgress: () => Promise<void>;
    isLoading: boolean;
    error: string | null;
}

export const useUserPersistence = (token: string | null): UseUserPersistenceReturn => {
    const [formData, setFormData] = useState<ModuleData>({
        mentor: {},
        mentee: {},
        method: {},
        delivery: {}
    });
    const [progressPercentage, setProgressPercentage] = useState(0);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const API_URL = '/api/user';

    // Carregar dados salvos ao montar o componente
    const loadProgress = async () => {
        if (!token) return;

        try {
            setIsLoading(true);
            setError(null);

            const response = await axios.get(`${API_URL}/progress`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                const { formData: savedData, progressPercentage: savedProgress, lastUpdated: savedDate } = response.data.progress;
                setFormData(savedData || {
                    mentor: {},
                    mentee: {},
                    method: {},
                    delivery: {}
                });
                setProgressPercentage(savedProgress);
                setLastUpdated(savedDate);
            }
        } catch (err) {
            console.error('Erro ao carregar progresso:', err);
            setError('Erro ao carregar dados salvos.');
        } finally {
            setIsLoading(false);
        }
    };

    // Salvar progresso do usuário
    const saveProgress = async (data: ModuleData, percentage: number) => {
        if (!token) {
            setError('Token não disponível.');
            return;
        }

        try {
            setError(null);

            const response = await axios.post(
                `${API_URL}/save-progress`,
                {
                    formData: data,
                    progressPercentage: percentage
                },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            if (response.data.success) {
                setFormData(data);
                setProgressPercentage(percentage);
                setLastUpdated(new Date().toISOString());
            }
        } catch (err) {
            console.error('Erro ao salvar progresso:', err);
            setError('Erro ao salvar dados.');
        }
    };

    // Calcular progresso automático baseado em módulos preenchidos
    const calculateProgress = (data: ModuleData) => {
        let filledModules = 0;
        
        // Verificar se cada módulo tem pelo menos algum dado
        if (Object.keys(data.mentor).length > 0 && data.mentor.name) filledModules++;
        if (Object.keys(data.mentee).length > 0 && data.mentee.hasClients) filledModules++;
        if (Object.keys(data.method).length > 0 && data.method.stage) filledModules++;
        if (Object.keys(data.delivery).length > 0 && data.delivery.groupName) filledModules++;

        return Math.round((filledModules / 4) * 100);
    };

    // Carregar dados ao montar
    useEffect(() => {
        loadProgress();
    }, [token]);

    return {
        formData,
        progressPercentage,
        lastUpdated,
        saveProgress,
        loadProgress,
        isLoading,
        error
    };
};
