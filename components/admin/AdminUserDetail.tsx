import React from 'react';
import { motion } from 'framer-motion';
import type { AdminUserDetails, AdminAudioRecording, AdminUploadedFile } from '../../types/admin';
import { getProgressColor, getModuleStatus, MODULE_NAME_MAP, questionIdLabel, formatBytes } from './helpers';
import { Button } from '../ui/Button';

interface AdminUserDetailProps {
    user: AdminUserDetails;
    audio: AdminAudioRecording[];
    files: AdminUploadedFile[];
    token: string;
    onClose: () => void;
    onDownload: (userId: string, userName: string) => void;
}

export const AdminUserDetail: React.FC<AdminUserDetailProps> = ({ user, audio, files, token, onClose, onDownload }) => {
    const handleDownloadFile = (fileId: string, fileName: string) => {
        const link = document.createElement('a');
        link.href = `/api/admin/files/${fileId}?token=${token}`;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.parentElement?.removeChild(link);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-prosperus-navy-dark text-white p-4 sm:p-6 md:p-8 rounded-lg max-h-[90vh] overflow-y-auto mx-4"
        >
            <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-prosperus-gold">{user.name}</h2>

            <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6 text-sm sm:text-base">
                <p><span className="font-semibold">Email:</span> {user.email}</p>
                <p>
                    <span className="font-semibold">Data de Criação:</span>{' '}
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : 'Não informado'}
                </p>
                <p>
                    <span className="font-semibold">Última Atualização:</span>{' '}
                    {user.lastUpdated
                        ? new Date(user.lastUpdated).toLocaleDateString('pt-BR') + ' ' +
                          new Date(user.lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                        : 'Nunca'}
                </p>
                <div>
                    <span className="font-semibold">Progresso:</span>
                    <div className="w-full bg-gray-700 rounded-full h-2 sm:h-3 mt-2">
                        <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${user.progressPercentage}%`, backgroundColor: getProgressColor(user.progressPercentage) }}
                        />
                    </div>
                    <p className="text-xs sm:text-sm text-gray-300 mt-1">{user.progressPercentage}%</p>
                </div>
                {user.status === 'in_progress' && user.currentModule && (
                    <p className="text-sm text-yellow-400">
                        Atualmente em: <span className="font-semibold">{MODULE_NAME_MAP[user.currentModule] || user.currentModule}</span>
                        {user.currentStep > 0 && `, passo ${user.currentStep}`}
                    </p>
                )}
                {user.status === 'submitted' && user.submittedAt && (
                    <p className="text-xs sm:text-sm text-green-400">
                        Diagnóstico enviado em: <span className="font-semibold">{new Date(user.submittedAt).toLocaleDateString('pt-BR')}</span>
                    </p>
                )}
            </div>

            {/* Module Status */}
            <div className="bg-white/5 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6">
                <h3 className="font-semibold mb-2 sm:mb-3 text-sm sm:text-base">Status dos Módulos:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                    {['preModule', 'mentor', 'mentee', 'method', 'offer'].map((mod) => {
                        const status = getModuleStatus(user.diagnosticData, mod);
                        const labels: Record<string, string> = { preModule: '📁 Materiais Existentes', mentor: '👤 O Mentor', mentee: '🎯 O Mentorado', method: '🔧 O Método', offer: '💼 A Oferta' };
                        const icon = status === 'complete' ? '✅' : status === 'partial' ? '🟡' : '❌';
                        const cls = status === 'complete' ? 'text-green-400' : status === 'partial' ? 'text-yellow-400' : 'text-gray-400';
                        return (
                            <div key={mod} className={cls}>
                                {icon} {labels[mod]}{status === 'partial' ? ' (Em andamento)' : ''}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Audio recordings */}
            {audio.length > 0 && (
                <div className="bg-white/5 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6">
                    <h3 className="font-semibold mb-3 text-sm sm:text-base">🎙️ Respostas em Áudio ({audio.length})</h3>
                    <div className="space-y-3">
                        {audio.map((a) => (
                            <div key={a.id} className="bg-white/5 rounded-lg p-3">
                                <p className="text-xs font-semibold text-prosperus-gold mb-1">
                                    {MODULE_NAME_MAP[a.module] || a.module} — {questionIdLabel(a.question_id)}
                                </p>
                                <audio controls src={`/api/admin/audio/${a.id}?token=${token}`} className="w-full h-8 mb-2" />
                                {a.transcript ? (
                                    <p className="text-sm text-gray-300 bg-black/20 rounded p-2 mt-1">{a.transcript}</p>
                                ) : (
                                    <p className="text-xs text-gray-500 italic mt-1">Transcrição pendente...</p>
                                )}
                                {a.duration_seconds && (
                                    <p className="text-xs text-gray-500 mt-1">{a.duration_seconds}s</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Uploaded files */}
            {files.length > 0 && (
                <div className="bg-white/5 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6">
                    <h3 className="font-semibold mb-3 text-sm sm:text-base">📎 Arquivos Enviados ({files.length})</h3>
                    <div className="space-y-2">
                        {files.map((file) => (
                            <div key={file.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium truncate">{file.file_name}</p>
                                    <p className="text-xs text-gray-500">{file.category}{file.file_size ? ` · ${formatBytes(file.file_size)}` : ''}</p>
                                </div>
                                <Button
                                    variant="success"
                                    size="xs"
                                    onClick={() => handleDownloadFile(file.id, file.file_name)}
                                    className="ml-3 flex-shrink-0"
                                >
                                    <i className="bi bi-download" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-end">
                <Button
                    variant="success"
                    onClick={() => onDownload(user.id, user.name)}
                >
                    Download Relatório
                </Button>
                <Button
                    variant="secondary"
                    onClick={onClose}
                    className="!bg-gray-600 hover:!bg-gray-700 !text-white"
                >
                    Fechar
                </Button>
            </div>
        </motion.div>
    );
};
