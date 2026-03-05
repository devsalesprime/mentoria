import React from 'react';
import { Button } from '../ui/Button';

// BB-3.2: BBApprovedState is now a thin approval banner.
// The section-picker + textarea editor have been removed — editing is handled
// by the inline subsection editing in BrandBrainSection (same as pre-approval flow).

interface BBApprovedStateProps {
  brandBrain: Record<string, any>;
  token: string;
  downloadingPdf: boolean;
  onDownloadPdf: () => void;
  onDownloadMd: () => void;
  onRefresh: () => Promise<void>;
}

export const BBApprovedState: React.FC<BBApprovedStateProps> = ({
  brandBrain,
  downloadingPdf,
  onDownloadPdf,
  onDownloadMd,
}) => {
  return (
    <div className="space-y-4 mb-6">
      {/* Approval status banner */}
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✓</span>
            <div>
              <p className="text-green-400 font-semibold text-sm">Brand Brain aprovado</p>
              <p className="text-green-300/50 text-sm">
                Edite tópicos diretamente nos cards abaixo para manter seu Brand Brain atualizado.
                {brandBrain?.userEditedAt && (
                  <span className="ml-2 text-blue-400/70">
                    Última edição: {new Date(brandBrain.userEditedAt).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="primary" size="sm" onClick={onDownloadPdf} loading={downloadingPdf}>
              {downloadingPdf ? 'Gerando...' : 'Baixar PDF'}
            </Button>
            <Button variant="secondary" size="sm" onClick={onDownloadMd} className="text-white/70">
              Baixar Texto
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
