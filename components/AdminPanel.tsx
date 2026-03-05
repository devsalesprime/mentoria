import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { Toast } from './admin/Toast';
import { AdminUserList } from './admin/AdminUserList';
import { AdminUserDetail } from './admin/AdminUserDetail';
import { PipelineOverview } from './admin/PipelineOverview';

export const AdminPanel: React.FC<{ token: string; onLogout: () => void }> = ({ token, onLogout }) => {
    const [activeTab, setActiveTab] = useState<'users' | 'pipeline'>('users');
    const [pipelineUserId, setPipelineUserId] = useState<string | null>(null);

    const {
        users, loading, deleting, toast,
        selectedUser, showDetails, userAudio, userFiles,
        showToast, fetchUsers,
        handleViewDetails, handleDownload, handleDelete,
        setShowDetails,
    } = useAdminUsers(token);

    useEffect(() => {
        if (activeTab === 'users') fetchUsers();
    }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        fetchUsers();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const navigateToUserPipeline = (userId: string) => {
        setPipelineUserId(userId);
        setActiveTab('pipeline');
    };

    return (
        <div className="min-h-screen bg-prosperus-navy-dark text-white p-4 sm:p-6 md:p-8">
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

                {/* Tab toggle */}
                <div className="flex gap-1 mb-6 bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
                    <button
                        onClick={() => { setActiveTab('users'); setPipelineUserId(null); }}
                        className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
                            activeTab === 'users' ? 'bg-prosperus-gold text-black' : 'text-white/60 hover:text-white'
                        }`}
                    >
                        Usuários
                    </button>
                    <button
                        onClick={() => setActiveTab('pipeline')}
                        className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
                            activeTab === 'pipeline' ? 'bg-prosperus-gold text-black' : 'text-white/60 hover:text-white'
                        }`}
                    >
                        Pipeline
                    </button>
                </div>

                {/* Pipeline tab */}
                {activeTab === 'pipeline' && (
                    <PipelineOverview token={token} showToast={showToast} initialUserId={pipelineUserId} />
                )}

                {/* Users tab */}
                {activeTab === 'users' && (
                    <AdminUserList
                        users={users}
                        loading={loading}
                        deleting={deleting}
                        onViewDetails={handleViewDetails}
                        onDownload={handleDownload}
                        onDelete={handleDelete}
                        onNavigatePipeline={navigateToUserPipeline}
                        onRefresh={fetchUsers}
                    />
                )}
            </div>

            {/* User details modal */}
            <Modal isOpen={showDetails} onClose={() => setShowDetails(false)}>
                {selectedUser && (
                    <AdminUserDetail
                        user={selectedUser}
                        audio={userAudio}
                        files={userFiles}
                        token={token}
                        onClose={() => setShowDetails(false)}
                        onDownload={handleDownload}
                    />
                )}
            </Modal>

            <Toast toast={toast} />
        </div>
    );
};
