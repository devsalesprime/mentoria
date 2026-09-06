import React from 'react';
import { Button } from '../../ui/Button';

/** Copy do campo de WhatsApp; a mesma nos três lugares que pedem o número (envio, pulo e fim da ficha). */
export const COPY_WHATS_LABEL = 'Seu WhatsApp para o aviso (com DDD)';
export const COPY_WHATS_PLACEHOLDER = '(11) 99999-9999';
export const COPY_WHATS_TOGGLE = 'Quero receber o aviso no WhatsApp';
export const COPY_WHATS_HINT = 'Opcional. Sem o número, você vê o resultado direto na ficha.';
export const COPY_WHATS_ERRO = 'Digite o DDD e o número, como (11) 99999-9999.';

export const WHATS_INPUT_CLASS =
  'w-full bg-prosperus-navy-mid border border-white/10 focus:border-prosperus-gold-dark/60 rounded-lg px-3 py-2.5 min-h-[44px] text-sm text-white placeholder-white/40 font-sans outline-none';

/** Mesma regra do servidor (utils/validation-materials.cjs normalizePhone): 10 a 13 digitos. */
export function phoneDigits(raw: string): string {
  return (raw || '').replace(/\D+/g, '');
}

export function phoneError(raw: string): string | null {
  const d = phoneDigits(raw);
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return null;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return null;
  return COPY_WHATS_ERRO;
}

/**
 * Pergunta de uma linha do WhatsApp dos avisos, fora do "Enviei o que tinha": mesmo campo, mesma copy e
 * mesma regra de validação do envio. Aparece para quem ainda não deixou número (quem pulou os materiais e
 * quem chega ao fim da ficha sem telefone guardado). Nunca trava a tela: dá para seguir sem preencher.
 */
export const COPY_WHATS_PERGUNTA = 'Quer receber os avisos no WhatsApp?';
export const COPY_WHATS_SALVAR = 'Salvar o WhatsApp';

interface PromptWhatsAppProps {
  /** id do input (o rótulo aponta para ele). */
  id: string;
  phone: string;
  onPhone: (valor: string) => void;
  /** Pergunta no alto do bloco; sem ela, só o campo. */
  titulo?: string;
  /** Marcação "Quero receber o aviso no WhatsApp"; sem `onNotify`, o bloco não mostra a marcação. */
  notify?: boolean;
  onNotify?: (valor: boolean) => void;
  erro?: string | null;
  disabled?: boolean;
  /** Botão que salva o número na hora (fim da ficha). Sem ele, o número segue junto da ação da tela. */
  onSalvar?: () => void;
  salvando?: boolean;
  testId?: string;
}

export const PromptWhatsApp: React.FC<PromptWhatsAppProps> = ({
  id, phone, onPhone, titulo, notify = true, onNotify, erro, disabled = false, onSalvar, salvando = false, testId,
}) => (
  <div className="space-y-2 text-left" data-testid={testId}>
    {titulo && <p className="text-sm text-white/70 font-sans">{titulo}</p>}
    <label htmlFor={id} className="block text-xs text-white/50 font-sans">{COPY_WHATS_LABEL}</label>
    <input
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={phone}
      onChange={(e) => onPhone(e.target.value)}
      placeholder={COPY_WHATS_PLACEHOLDER}
      disabled={disabled || !notify}
      className={`${WHATS_INPUT_CLASS} ${!notify ? 'opacity-50' : ''}`}
    />
    {onNotify && (
      <label className="flex items-center gap-2 min-h-[44px] text-sm text-white/80 font-sans cursor-pointer select-none">
        <input
          type="checkbox"
          checked={notify}
          onChange={(e) => onNotify(e.target.checked)}
          className="w-5 h-5 accent-prosperus-gold-dark"
        />
        {COPY_WHATS_TOGGLE}
      </label>
    )}
    {onSalvar && (
      <Button variant="ghost" size="md" className="min-h-[44px]" onClick={onSalvar} loading={salvando} disabled={salvando}>
        {COPY_WHATS_SALVAR}
      </Button>
    )}
    <p className="text-xs text-white/40 font-sans">{COPY_WHATS_HINT}</p>
    {erro && <p className="text-xs text-red-400 font-sans">{erro}</p>}
  </div>
);
