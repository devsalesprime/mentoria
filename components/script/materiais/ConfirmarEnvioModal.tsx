import React, { useState, useEffect } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import type { SubmitMaterialsOptions, SubmitMaterialsResult } from '../../../hooks/useScriptFicha';

interface ConfirmarEnvioModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** POST /api/script/ficha/materials/submit com o telefone (opcional). */
  onConfirm: (opts: SubmitMaterialsOptions) => Promise<SubmitMaterialsResult>;
  /** Navega para /dashboard/ficha. */
  onGoToFicha: () => void;
  /** Telefone ja salvo desta pessoa (preenche o campo). */
  initialPhone?: string | null;
}

/** Mesma regra do servidor (utils/validation-materials.cjs normalizePhone): 10 a 13 digitos. */
export function phoneDigits(raw: string): string {
  return (raw || '').replace(/\D+/g, '');
}

export function phoneError(raw: string): string | null {
  const d = phoneDigits(raw);
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return null;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return null;
  return 'Use DDD + número (10 a 11 dígitos), com ou sem o 55.';
}

const inputClass =
  'w-full bg-prosperus-navy-mid border border-white/10 focus:border-prosperus-gold-dark/60 rounded-lg px-3 py-2.5 min-h-[44px] text-sm text-white placeholder-white/40 font-sans outline-none';

/** Segunda confirmacao de "Enviei o que tinha": explica o pre-preenchimento e pede o WhatsApp para o aviso. */
export const ConfirmarEnvioModal: React.FC<ConfirmarEnvioModalProps> = ({ isOpen, onClose, onConfirm, onGoToFicha, initialPhone }) => {
  const [phone, setPhone] = useState(initialPhone || '');
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPhone(initialPhone || '');
      setNotify(true);
      setError(null);
      setExisting(false);
      setSubmitting(false);
    }
  }, [isOpen, initialPhone]);

  const handleConfirm = async () => {
    const err = notify ? phoneError(phone) : null;
    if (err) { setError(err); return; }
    setError(null);
    setSubmitting(true);
    const r = await onConfirm({ notify_phone: notify ? phone : '', notify });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.message || 'Não deu para confirmar agora. Tente de novo.');
      return;
    }
    if (r.existing) {
      setExisting(true);
      return;
    }
    onGoToFicha();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="space-y-4">
        <h3 className="font-serif text-2xl text-white pr-8">Vamos começar a montar a sua ficha</h3>
        <p className="text-sm text-white/75 font-sans leading-relaxed">
          Com o que você enviou até agora, a gente inicia o pré-preenchimento da sua ficha. Você pode continuar enviando material
          e já ir revisando a ficha enquanto a gente enriquece. Quando o pré-preenchimento terminar, avisamos você.
        </p>

        {existing ? (
          <div className="space-y-3">
            <p className="text-sm text-prosperus-gold-light font-sans">Já estamos processando o que você enviou.</p>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="ghost" size="lg" className="min-h-[44px]" onClick={onClose}>Fechar</Button>
              <Button variant="primary" size="lg" className="min-h-[44px]" onClick={onGoToFicha}>Ir para a ficha</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label htmlFor="notify-phone" className="block text-sm text-white/80 font-sans">Seu WhatsApp para o aviso (com DDD)</label>
              <input
                id="notify-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); } }}
                placeholder="(11) 99999-9999"
                disabled={!notify || submitting}
                className={`${inputClass} ${!notify ? 'opacity-50' : ''}`}
              />
              <label className="flex items-center gap-2 min-h-[44px] text-sm text-white/80 font-sans cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(e) => { setNotify(e.target.checked); setError(null); }}
                  className="w-5 h-5 accent-prosperus-gold-dark"
                />
                Quero receber o aviso no WhatsApp
              </label>
              <p className="text-xs text-white/40 font-sans">Opcional. Sem o número, você vê o resultado direto na ficha.</p>
            </div>
            {error && <p className="text-xs text-red-400 font-sans">{error}</p>}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <Button variant="ghost" size="lg" className="min-h-[44px]" onClick={onClose} disabled={submitting}>Ainda não</Button>
              <Button variant="primary" size="lg" className="min-h-[44px]" onClick={handleConfirm} loading={submitting}>
                Confirmar e ir para a ficha
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
