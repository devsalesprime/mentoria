import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { motion } from 'framer-motion';
import axios from 'axios';
import { calculateProgress } from '../utils/progress';

interface AdminUser {
    id: string;
    email: string;
    name: string;
    progressPercentage: number;
    lastUpdated: string;
    status: string;
}

interface AdminUserDetails {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    progressPercentage: number;
    lastUpdated: string;
    status: string;
    formData: {
        mentor: Record<string, any>;
        mentee: Record<string, any>;
        method: Record<string, any>;
        delivery: Record<string, any>;
    };
}

export const AdminPanel: React.FC<{ token: string; onLogout: () => void }> = ({ token, onLogout }) => {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<AdminUserDetails | null>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const API_BASE = '/api/admin';

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
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
            alert('Erro ao carregar usuários.');
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = async (userId: string) => {
        try {
            const response = await axios.get(`${API_BASE}/users/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                setSelectedUser(response.data.user);
                setShowDetails(true);
            }
        } catch (error) {
            console.error('Erro ao buscar detalhes:', error);
            alert('Erro ao carregar detalhes do usuário.');
        }
    };

    const handleDownload = async (userId: string, userName: string) => {
        try {
            const response = await axios.get(`${API_BASE}/users/${userId}/download`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `relatorio-${userName.replace(/\s+/g, '-')}.txt`);
            document.body.appendChild(link);
            link.click();
            link.parentElement?.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Erro ao fazer download:', error);
            alert('Erro ao fazer download do relatório.');
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
                setUsers(users.filter(u => u.id !== userId));
                if (selectedUser?.id === userId) {
                    setShowDetails(false);
                    setSelectedUser(null);
                }
                alert('Usuário deletado com sucesso.');
            }
        } catch (error) {
            console.error('Erro ao deletar:', error);
            alert('Erro ao deletar usuário.');
        } finally {
            setDeleting(false);
        }
    };

    const getProgressColor = (percentage: number) => {
        if (percentage >= 75) return '#10b981';
        if (percentage >= 50) return '#f59e0b';
        if (percentage >= 25) return '#ef4444';
        return '#6b7280';
    };

    const getModuleStatus = (formData: any, module: string) => {
        const data = formData[module];
        if (!data || Object.keys(data).length === 0) return '❌';
        return '✅';
    };

    return (
        <div
            className="min-h-screen bg-prosperus-navy-dark text-white p-4 sm:p-6 md:p-8"
        >
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 sm:mb-8">
                    <div className="flex-1">
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-prosperus-gold mb-1 sm:mb-2">Painel Administrativo</h1>
                        <p className="text-sm sm:text-base text-gray-300">Acompanhe o diagnóstico de cada mentor(a)</p>
                    </div>
                    <button
                        onClick={onLogout}
                        className="px-4 sm:px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition text-sm sm:text-base w-full sm:w-auto"
                    >
                        Sair
                    </button>
                </div>

                {/* Tabela de Usuários - Desktop */}
                <div className="hidden md:block bg-prosperus-navy rounded-lg overflow-hidden border border-white/10">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-white/5 border-b border-white/10">
                                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-left font-semibold text-sm lg:text-base">Nome / Email</th>
                                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-left font-semibold text-sm lg:text-base">Última Atualização</th>
                                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-left font-semibold text-sm lg:text-base">Progresso</th>
                                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-left font-semibold text-sm lg:text-base">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 lg:px-6 py-8 text-center text-gray-400 text-sm">
                                            Carregando dados...
                                        </td>
                                    </tr>
                                ) : users.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 lg:px-6 py-8 text-center text-gray-400 text-sm">
                                            Nenhum usuário encontrado.
                                        </td>
                                    </tr>
                                ) : (
                                    users.map((user) => (
                                        <tr key={user.id} className="border-b border-white/5 hover:bg-white/2 transition">
                                            <td className="px-4 lg:px-6 py-3 lg:py-4">
                                                <div>
                                                    <p className="font-semibold text-sm lg:text-base">{user.name}</p>
                                                    <p className="text-xs lg:text-sm text-gray-400">{user.email}</p>
                                                </div>
                                            </td>
                                            <td className="px-4 lg:px-6 py-3 lg:py-4 text-xs lg:text-sm text-gray-300">
                                                {user.lastUpdated
                                                    ? new Date(user.lastUpdated).toLocaleDateString('pt-BR') +
                                                    ' ' +
                                                    new Date(user.lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                                                    : 'Nunca'}
                                            </td>
                                            <td className="px-4 lg:px-6 py-3 lg:py-4">
                                                <div className="flex items-center gap-2 lg:gap-3">
                                                    <div className="w-24 lg:w-32 bg-gray-700 rounded-full h-2">
                                                        <div
                                                            className="h-full rounded-full transition-all"
                                                            style={{
                                                                width: `${user.progressPercentage}%`,
                                                                backgroundColor: getProgressColor(user.progressPercentage)
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="text-xs lg:text-sm font-semibold w-10 lg:w-12">{user.progressPercentage}%</span>
                                                </div>
                                            </td>
                                            <td className="px-4 lg:px-6 py-3 lg:py-4">
                                                <div className="flex gap-1 lg:gap-2">
                                                    <button
                                                        onClick={() => handleViewDetails(user.id)}
                                                        className="px-2 lg:px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs lg:text-sm transition"
                                                    >
                                                        <i className="bi bi-eye"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownload(user.id, user.name)}
                                                        className="px-2 lg:px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs lg:text-sm transition"
                                                    >
                                                        <i className="bi bi-download"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(user.id)}
                                                        disabled={deleting}
                                                        className="px-2 lg:px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs lg:text-sm transition disabled:opacity-50"
                                                    >
                                                        <i className="bi bi-trash"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Cards de Usuários - Mobile */}
                <div className="md:hidden space-y-4">
                    {loading ? (
                        <div className="bg-prosperus-navy rounded-lg p-6 text-center text-gray-400 text-sm">
                            Carregando dados...
                        </div>
                    ) : users.length === 0 ? (
                        <div className="bg-prosperus-navy rounded-lg p-6 text-center text-gray-400 text-sm">
                            Nenhum usuário encontrado.
                        </div>
                    ) : (
                        users.map((user) => (
                            <div key={user.id} className="bg-prosperus-navy rounded-lg p-4 border border-white/10">
                                <div className="mb-3">
                                    <p className="font-semibold text-base">{user.name}</p>
                                    <p className="text-xs text-gray-400">{user.email}</p>
                                </div>
                                <div className="mb-3">
                                    <p className="text-xs text-gray-400 mb-1">Última Atualização</p>
                                    <p className="text-xs text-gray-300">
                                        {user.lastUpdated
                                            ? new Date(user.lastUpdated).toLocaleDateString('pt-BR') +
                                            ' ' +
                                            new Date(user.lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                                            : 'Nunca'}
                                    </p>
                                </div>
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs text-gray-400">Progresso</p>
                                        <span className="text-sm font-semibold">{user.progressPercentage}%</span>
                                    </div>
                                    <div className="w-full bg-gray-700 rounded-full h-2">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                                width: `${user.progressPercentage}%`,
                                                backgroundColor: getProgressColor(user.progressPercentage)
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleViewDetails(user.id)}
                                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-xs font-semibold transition"
                                    >
                                        Ver Detalhes
                                    </button>
                                    <button
                                        onClick={() => handleDownload(user.id, user.name)}
                                        className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-xs font-semibold transition"
                                    >
                                        <i className="bi bi-download"></i>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(user.id)}
                                        disabled={deleting}
                                        className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-xs font-semibold transition disabled:opacity-50"
                                    >
                                        <i className="bi bi-trash"></i>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Refresh Button */}
                <div className="mt-6 sm:mt-8 flex justify-center">
                    <button
                        onClick={fetchUsers}
                        disabled={loading}
                        className="px-4 sm:px-6 py-2 bg-prosperus-gold text-black font-semibold rounded-lg hover:bg-yellow-400 transition disabled:opacity-50 text-sm sm:text-base w-full sm:w-auto"
                    >
                        {loading ? 'Atualizando...' : 'Atualizar Lista'}
                    </button>
                </div>
            </div>

            {/* Modal de Detalhes */}
            <Modal isOpen={showDetails} onClose={() => setShowDetails(false)}>
                {selectedUser && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-prosperus-navy-dark text-white p-4 sm:p-6 md:p-8 rounded-lg max-h-[90vh] overflow-y-auto mx-4"
                    >
                        <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-prosperus-gold">{selectedUser.name}</h2>

                        <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6 text-sm sm:text-base">
                            <p>
                                <span className="font-semibold">Email:</span> {selectedUser.email}
                            </p>
                            <p>
                                <span className="font-semibold">Data de Criação:</span>{' '}
                                {selectedUser.createdAt
                                    ? new Date(selectedUser.createdAt).toLocaleDateString('pt-BR')
                                    : 'Não informado'}
                            </p>
                            <p>
                                <span className="font-semibold">Última Atualização:</span>{' '}
                                {selectedUser.lastUpdated
                                    ? new Date(selectedUser.lastUpdated).toLocaleDateString('pt-BR') +
                                    ' ' +
                                    new Date(selectedUser.lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                                    : 'Nunca'}
                            </p>
                            <div>
                                <span className="font-semibold">Progresso:</span>
                                <div className="w-full bg-gray-700 rounded-full h-2 sm:h-3 mt-2">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            // Recalcular localmente para garantir consistência com a nova lógica
                                            width: `${calculateProgress(selectedUser.formData as any)}%`,
                                            backgroundColor: getProgressColor(calculateProgress(selectedUser.formData as any))
                                        }}
                                    />
                                </div>
                                <p className="text-xs sm:text-sm text-gray-300 mt-1">{calculateProgress(selectedUser.formData as any)}%</p>
                            </div>
                        </div>

                        {/* Status dos Módulos */}
                        <div className="bg-white/5 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6">
                            <h3 className="font-semibold mb-2 sm:mb-3 text-sm sm:text-base">Status dos Módulos:</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                                <div className={getModuleStatus(selectedUser.formData, 'mentor') === '✅' ? 'text-green-400' : 'text-gray-400'}>
                                    {getModuleStatus(selectedUser.formData, 'mentor')} O Mentor
                                </div>
                                <div className={getModuleStatus(selectedUser.formData, 'mentee') === '✅' ? 'text-green-400' : 'text-gray-400'}>
                                    {getModuleStatus(selectedUser.formData, 'mentee')} O Mentorado
                                </div>
                                <div className={getModuleStatus(selectedUser.formData, 'method') === '✅' ? 'text-green-400' : 'text-gray-400'}>
                                    {getModuleStatus(selectedUser.formData, 'method')} O Método
                                </div>
                                <div className={getModuleStatus(selectedUser.formData, 'delivery') === '✅' ? 'text-green-400' : 'text-gray-400'}>
                                    {getModuleStatus(selectedUser.formData, 'delivery')} A Entrega
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-end">
                            <button
                                onClick={() => handleDownload(selectedUser.id, selectedUser.name)}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition text-sm sm:text-base"
                            >
                                Download Relatório
                            </button>
                            <button
                                onClick={() => setShowDetails(false)}
                                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition text-sm sm:text-base"
                            >
                                Fechar
                            </button>
                        </div>
                    </motion.div>
                )}
            </Modal>
        </div>
    );
};