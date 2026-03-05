import React from 'react';
import type { ApprovalStatus } from '../../utils/brand-brain-constants';

export const StatusBadge: React.FC<{ status: ApprovalStatus }> = ({ status }) => {
  if (status === 'approved') {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-600/20 text-green-400">
        Aprovado ✓
      </span>
    );
  }
  if (status === 'revised') {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-600/20 text-blue-400">
        Atualizado — Revise
      </span>
    );
  }
  if (status === 'editing') {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-600/20 text-yellow-400">
        Alterações Solicitadas
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-600/20 text-gray-400">
      Pendente
    </span>
  );
};
