import React from 'react';
import type { AdminUser } from '../../types/admin';
import { getProgressColor } from './helpers';
import { Button } from '../ui/Button';

interface AdminUserListProps {
    users: AdminUser[];
    loading: boolean;
    deleting: boolean;
    onViewDetails: (userId: string) => void;
    onDownload: (userId: string, userName: string) => void;
    onDelete: (userId: string) => void;
    onNavigatePipeline: (userId: string) => void;
    onRefresh: () => void;
}

export const AdminUserList: React.FC<AdminUserListProps> = ({
    users, loading, deleting,
    onViewDetails, onDownload, onDelete, onNavigatePipeline, onRefresh,
}) => {
    return (
        <>
            {/* Desktop table */}
            <div className="hidden md:block bg-prosperus-navy rounded-lg overflow-hidden border border-white/10">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/10">
                                <th className="px-4 lg:px-6 py-3 lg:py-4 text-left font-semibold text-sm lg:text-base">Nome / Email</th>
                                <th className="px-4 lg:px-6 py-3 lg:py-4 text-left font-semibold text-sm lg:text-base">Status</th>
                                <th className="px-4 lg:px-6 py-3 lg:py-4 text-left font-semibold text-sm lg:text-base">Etapa Atual</th>
                                <th className="px-4 lg:px-6 py-3 lg:py-4 text-left font-semibold text-sm lg:text-base">Última Atualização</th>
                                <th className="px-4 lg:px-6 py-3 lg:py-4 text-left font-semibold text-sm lg:text-base">Progresso</th>
                                <th className="px-4 lg:px-6 py-3 lg:py-4 text-left font-semibold text-sm lg:text-base">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 lg:px-6 py-8 text-center text-gray-400 text-sm">
                                        Carregando dados...
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 lg:px-6 py-8 text-center text-gray-400 text-sm">
                                        Nenhum usuário encontrado.
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition">
                                        <td className="px-4 lg:px-6 py-3 lg:py-4">
                                            <div>
                                                <p className="font-semibold text-sm lg:text-base">{user.name}</p>
                                                <p className="text-xs lg:text-sm text-gray-400">{user.email}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 lg:px-6 py-3 lg:py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${user.status === 'submitted' ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'}`}>
                                                {user.status === 'submitted' ? 'Enviado' : 'Em Progresso'}
                                            </span>
                                        </td>
                                        <td className="px-4 lg:px-6 py-3 lg:py-4">
                                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-white/5 text-white/60 border border-white/10">
                                                {user.pipelineStage || 'Diagnóstico'}
                                            </span>
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
                                                <Button
                                                    variant="primary"
                                                    size="xs"
                                                    onClick={() => onNavigatePipeline(user.id)}
                                                    title="Gerenciar pipeline"
                                                >
                                                    <i className="bi bi-kanban"></i>
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="xs"
                                                    onClick={() => onViewDetails(user.id)}
                                                    className="!bg-blue-600 hover:!bg-blue-700 !text-white !border-none"
                                                    title="Ver diagnóstico"
                                                >
                                                    <i className="bi bi-eye"></i>
                                                </Button>
                                                <Button
                                                    variant="success"
                                                    size="xs"
                                                    onClick={() => onDownload(user.id, user.name)}
                                                    title="Baixar relatório"
                                                >
                                                    <i className="bi bi-download"></i>
                                                </Button>
                                                <Button
                                                    variant="danger"
                                                    size="xs"
                                                    onClick={() => onDelete(user.id)}
                                                    disabled={deleting}
                                                    title="Deletar usuário"
                                                >
                                                    <i className="bi bi-trash"></i>
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mobile cards */}
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
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <p className="font-semibold text-base">{user.name}</p>
                                    <p className="text-xs text-gray-400">{user.email}</p>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${user.status === 'submitted' ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'}`}>
                                    {user.status === 'submitted' ? 'Enviado' : 'Em Progresso'}
                                </span>
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
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => onNavigatePipeline(user.id)}
                                    className="flex-1"
                                >
                                    Gerenciar
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => onViewDetails(user.id)}
                                    className="!bg-blue-600 hover:!bg-blue-700 !text-white !border-none"
                                >
                                    <i className="bi bi-eye"></i>
                                </Button>
                                <Button
                                    variant="success"
                                    size="sm"
                                    onClick={() => onDownload(user.id, user.name)}
                                >
                                    <i className="bi bi-download"></i>
                                </Button>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => onDelete(user.id)}
                                    disabled={deleting}
                                >
                                    <i className="bi bi-trash"></i>
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Refresh */}
            <div className="mt-6 sm:mt-8 flex justify-center">
                <Button
                    variant="primary"
                    onClick={onRefresh}
                    disabled={loading}
                    loading={loading}
                    className="w-full sm:w-auto"
                >
                    {loading ? 'Atualizando...' : 'Atualizar Lista'}
                </Button>
            </div>
        </>
    );
};
