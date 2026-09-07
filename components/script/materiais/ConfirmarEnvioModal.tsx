import React, { useState } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { ConsentimentoWhatsApp } from './ConsentimentoWhatsApp';
import type { ConsentimentoDados } from './ConsentimentoWhatsApp';
import type { SubmitMaterialsResult } from '../../../hooks/useScriptFicha';

interface ConfirmarEnvioModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** POST /api/script/ficha/materials/submit. */
  onConfirm: () => Promise<SubmitMaterialsResult>;
  /** Navega para /dashboard/ficha. `existing` = já havia pré-preenchimento em andamento (o servidor não duplicou). */
  onGoToFicha: (existing?: boolean) => void;
  /** Guarda o WhatsApp com a permissão (PUT /api/script/ficha/notify-phone). */
  onConfirmarWhats: (dados: ConsentimentoDados) => Promise<{ ok: boolean; message?: string }>;
  /** false quando a pessoa já confirmou um número (o bloco some). */
  pedirWhats?: boolean;
  /** Número que veio do cadastro; só pré-preenche o campo. */
  sugerido?: string | null;
}

// A copy, a validação e a frase da permissão vivem em ConsentimentoWhatsApp (o mesmo bloco aparece no pulo e no fim da ficha).
export {
  COPY_CONSENTIMENTO, COPY_WHATS_BOTAO, COPY_WHATS_ERRO, COPY_WHATS_LABEL, COPY_WHATS_PLACEHOLDER,
  ConsentimentoWhatsApp, WHATS_INPUT_CLASS, formatPhoneBR, phoneDigits, phoneError,
} from './ConsentimentoWhatsApp';

/**
 * Segunda confirmacao de "Enviei o que tinha": explica o pre-preenchimento e pede o WhatsApp com permissao.
 * Confirmou -> vai direto para a Ficha (tambem quando ja havia um pre-preenchimento em andamento): la o painel
 * mostra os marcos e as sugestoes chegam bloco a bloco. O WhatsApp e independente: sem a permissao marcada
 * nada e guardado, e a pergunta volta no fim da ficha.
 */
export const ConfirmarEnvioModal: React.FC<ConfirmarEnvioModalProps> = ({
  isOpen, onClose, onConfirm, onGoToFicha, onConfirmarWhats, pedirWhats = true, sugerido,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    const r = await onConfirm();
    setSubmitting(false);
    if (!r.ok) {
      setError(r.message || 'Não deu para confirmar agora. Tente de novo.');
      return;
    }
    onGoToFicha(!!r.existing);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="space-y-4">
        <h3 className="font-serif text-2xl text-white pr-8">Vamos começar a montar a sua ficha</h3>
        <p className="text-sm text-white/75 font-sans leading-relaxed">
          Com o que você enviou até agora, a gente começa a ler os seus materiais e a montar as sugestões da sua ficha.
          Elas chegam bloco a bloco, e você já pode ir preenchendo enquanto isso. Quando tudo estiver pronto, a gente avisa.
        </p>

        {pedirWhats && (
          <ConsentimentoWhatsApp
            id="notify-phone"
            sugerido={sugerido}
            onConfirmar={onConfirmarWhats}
            disabled={submitting}
            testId="whatsapp-envio"
          />
        )}
        {error && <p className="text-xs text-red-400 font-sans">{error}</p>}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Button variant="ghost" size="lg" className="min-h-[44px]" onClick={onClose} disabled={submitting}>Continuar enviando</Button>
          <Button variant="primary" size="lg" className="min-h-[44px]" onClick={handleConfirm} loading={submitting}>
            Confirmar e ir para a ficha
          </Button>
        </div>
      </div>
    </Modal>
  );
};
