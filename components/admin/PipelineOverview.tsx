import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { PipelineUser } from '../../types/admin';
import { StatusBadge } from './StatusBadge';
import { PipelineDetailView } from './PipelineDetailView';

interface PipelineOverviewProps {
    token: string;
    showToast: (msg: string, type: 'success' | 'error') => void;
    initialUserId?: string | null;
}

export const PipelineOverview: React.FC<PipelineOverviewProps> = ({ token, showToast, initialUserId }) => {
    const [users, setUsers] = useState<PipelineUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId ?? null);

    const fetchPipeline = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/admin/pipeline', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data.success) {
                const rawData: any[] = res.data.data || [];
                const mapped: PipelineUser[] = rawData.map((u) => ({
                    userId:           u.userId           ?? u.user_id           ?? u.id ?? '',
                    name:             u.name             ?? '',
                    email:            u.email            ?? '',
                    diagnosticStatus: u.diagnosticStatus ?? u.diagnostic_status ?? 'pending',
                    researchStatus:   u.researchStatus   ?? u.research_status   ?? 'pending',
                    brandBrainStatus: u.brandBrainStatus ?? u.brand_brain_status ?? 'pending',
                    assetsStatus:     u.assetsStatus     ?? u.assets_status     ?? 'pending',
                    lastUpdated:      u.lastUpdated      ?? u.last_updated      ?? '',
                }));
                setUsers(mapped);
            }
        } catch (e: any) {
            showToast(e.response?.data?.message || 'Erro ao carregar pipeline', 'error');
        } finally {
            setLoading(false);
        }
    }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

    useEffect(() => {
        if (initialUserId) setSelectedUserId(initialUserId);
    }, [initialUserId]);

    if (selectedUserId) {
        return (
            <PipelineDetailView
                userId={selectedUserId}
                token={token}
                onBack={() => { setSelectedUserId(null); fetchPipeline(); }}
                showToast={showToast}
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-white">Visão Geral do Pipeline</h3>
                <button
                    onClick={fetchPipeline}
                    disabled={loading}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition disabled:opacity-50"
                >
                    {loading ? 'Atualizando...' : 'Atualizar'}
                </button>
            </div>

            {loading ? (
                <div className="animate-pulse space-y-3">
                    {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
                </div>
            ) : users.length === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-white/50 text-sm">
                    Nenhum mentor com pipeline ativo
                </div>
            ) : (
                <>
                    {/* Desktop table */}
                    <div className="hidden md:block bg-prosperus-navy rounded-xl overflow-hidden border border-white/10">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-white/5 border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
                                    <th className="px-4 py-3 text-left">Nome / Email</th>
                                    <th className="px-4 py-3 text-left">Diagnóstico</th>
                                    <th className="px-4 py-3 text-left">Pesquisa</th>
                                    <th className="px-4 py-3 text-left">Brand Brain</th>
                                    <th className="px-4 py-3 text-left">Assets</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr
                                        key={u.userId}
                                        onClick={() => setSelectedUserId(u.userId)}
                                        className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition"
                                    >
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-semibold text-white">{u.name}</p>
                                            <p className="text-xs text-white/50">{u.email}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={u.diagnosticStatus} label={u.diagnosticStatus === 'submitted' ? 'Enviado' : 'Em Progresso'} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={u.researchStatus} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={u.brandBrainStatus} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={u.assetsStatus} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden space-y-3">
                        {users.map((u) => (
                            <div
                                key={u.userId}
                                onClick={() => setSelectedUserId(u.userId)}
                                className="bg-white/5 border border-white/10 rounded-xl p-4 cursor-pointer hover:bg-white/10 transition"
                            >
                                <p className="font-semibold text-white text-sm mb-1">{u.name}</p>
                                <p className="text-xs text-white/50 mb-3">{u.email}</p>
                                <div className="flex flex-wrap gap-2">
                                    <StatusBadge status={u.diagnosticStatus} label={u.diagnosticStatus === 'submitted' ? 'Enviado' : 'Em Prog.'} />
                                    <StatusBadge status={u.researchStatus} />
                                    <StatusBadge status={u.brandBrainStatus} />
                                    <StatusBadge status={u.assetsStatus} />
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
