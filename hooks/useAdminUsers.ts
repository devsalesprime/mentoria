import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import type { AdminUser, AdminUserDetails, AdminAudioRecording, AdminUploadedFile, ToastState } from '../types/admin';

const API_BASE = '/api/admin';

export function useAdminUsers(token: string) {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<AdminUserDetails | null>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [userAudio, setUserAudio] = useState<AdminAudioRecording[]>([]);
    const [userFiles, setUserFiles] = useState<AdminUploadedFile[]>([]);
    const [toast, setToast] = useState<ToastState | null>(null);

    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToast({ message, type });
        toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
    }, []);

    useEffect(() => () => { if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current); }, []);

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_BASE}/users`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data.success) {
                setUsers(response.data.users);
            }
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
            showToast('Erro ao carregar usuários.', 'error');
        } finally {
            setLoading(false);
        }
    }, [token, showToast]);

    const handleViewDetails = async (userId: string) => {
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const [detailsRes, audioRes, filesRes] = await Promise.all([
                axios.get(`${API_BASE}/users/${userId}`, { headers }),
                axios.get(`${API_BASE}/users/${userId}/audio`, { headers }).catch(() => ({ data: { data: [] } })),
                axios.get(`${API_BASE}/users/${userId}/files`, { headers }).catch(() => ({ data: { data: [] } }))
            ]);

            if (detailsRes.data.success) {
                setSelectedUser(detailsRes.data.user);
                setUserAudio(audioRes.data.data || []);
                setUserFiles(filesRes.data.data || []);
                setShowDetails(true);
            }
        } catch (error) {
            console.error('Erro ao buscar detalhes:', error);
            showToast('Erro ao carregar detalhes do usuário.', 'error');
        }
    };

    const handleDownload = async (userId: string, userName: string) => {
        try {
            const response = await axios.get(`${API_BASE}/users/${userId}/download`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });

            const disposition = response.headers['content-disposition'];
            const match = disposition?.match(/filename="(.+)"/);
            const safeName = userName.replace(/\s+/g, '-');
            const fileName = match?.[1] ?? `diagnostico-${safeName}.txt`;

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.parentElement?.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Erro ao fazer download:', error);
            showToast('Erro ao fazer download do relatório.', 'error');
        }
    };

    const handleDelete = async (userId: string) => {
        if (!window.confirm('Tem certeza que deseja deletar este usuário? Esta ação é irreversível.')) {
            return;
        }
        try {
            setDeleting(true);
            const response = await axios.delete(`${API_BASE}/users/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                setUsers(prev => prev.filter(u => u.id !== userId));
                if (selectedUser?.id === userId) {
                    setShowDetails(false);
                    setSelectedUser(null);
                }
                showToast('Usuário deletado com sucesso.', 'success');
            }
        } catch (error) {
            console.error('Erro ao deletar:', error);
            showToast('Erro ao deletar usuário.', 'error');
        } finally {
            setDeleting(false);
        }
    };

    return {
        users, loading, deleting, toast,
        selectedUser, showDetails, userAudio, userFiles,
        showToast, fetchUsers,
        handleViewDetails, handleDownload, handleDelete,
        setShowDetails,
    };
}
