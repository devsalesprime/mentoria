import React, { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';

/**
 * Pedido de WhatsApp COM PERMISSÃO, o mesmo nos três lugares que perguntam o número:
 * "Enviei o que tinha" (ConfirmarEnvioModal), "Não tenho materiais, ir para a ficha" (MateriaisScreen)
 * e o fim da ficha (FichaWizard).
 *
 * Regra (decisão do Danilo, 07/09): o número só é guardado com a marcação de permissão marcada.
 * Sem permissão, nada sai da tela e o runner não tem por onde mandar mensagem. O campo já vem
 * preenchido com o número que veio do cadastro (`notify_phone_sugerido`), que serve só de sugestão:
 * ele nunca vira o número dos avisos sozinho.
 */

export const COPY_WHATS_LABEL = 'Seu WhatsApp (com DDD)';
export const COPY_WHATS_PLACEHOLDER = '(11) 99999-9999';
export const COPY_WHATS_ERRO = 'Digite o DDD e o número, como (11) 99999-9999.';

/** Frase da permissão. É gravada junto com o número (`notify_consent_texto`); mudou aqui, muda no registro. */
export const COPY_CONSENTIMENTO =
  'Quero receber no meu WhatsApp, pelo número do Danilo (Prosperus), as atualizações do meu script: quando a ficha ficar pronta, quando o script sair e se faltar alguma informação.';

export const COPY_WHATS_PERGUNTA = 'Quer acompanhar pelo WhatsApp?';
export const COPY_WHATS_BOTAO = 'Confirmar WhatsApp';
export const COPY_WHATS_SEM_PERMISSAO = 'Marque a permissão acima para a gente poder avisar você.';
export const COPY_WHATS_SUGERIDO = 'Esse número veio do seu cadastro. Confira e ajuste se precisar.';
export const COPY_WHATS_SALVO = 'Pronto. As atualizações do seu script vão para esse WhatsApp.';

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

/** 5511987654321 vira "(11) 98765-4321" para o campo não abrir com um monte de dígito colado. */
export function formatPhoneBR(raw: string | null | undefined): string {
  const d = phoneDigits(String(raw || ''));
  if (!d) return '';
  const local = (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d;
  if (local.length === 10 || local.length === 11) {
    const ddd = local.slice(0, 2);
    const resto = local.slice(2);
    const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
    return `(${ddd}) ${meio}-${resto.slice(meio.length)}`;
  }
  return String(raw || '');
}

export interface ConsentimentoDados {
  notify_phone: string;
  consentimento: true;
  consent_texto: string;
}

interface ConsentimentoWhatsAppProps {
  /** id do input (o rótulo aponta para ele). Único por tela. */
  id: string;
  /** Número que veio do cadastro; só pré-preenche o campo. */
  sugerido?: string | null;
  /** Pergunta no alto do bloco. */
  titulo?: string;
  /** Guarda o número com a permissão. Só é chamado com a marcação marcada e o número válido. */
  onConfirmar: (dados: ConsentimentoDados) => Promise<{ ok: boolean; message?: string }>;
  disabled?: boolean;
  testId?: string;
}

export const ConsentimentoWhatsApp: React.FC<ConsentimentoWhatsAppProps> = ({
  id, sugerido, titulo = COPY_WHATS_PERGUNTA, onConfirmar, disabled = false, testId,
}) => {
  const [phone, setPhone] = useState(() => formatPhoneBR(sugerido));
  const [tocou, setTocou] = useState(false);
  const [consentimento, setConsentimento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  // A sugestão chega depois do primeiro render (a ficha vem do servidor); só preenche quem não digitou nada.
  useEffect(() => {
    if (tocou || !sugerido) return;
    setPhone(formatPhoneBR(sugerido));
  }, [sugerido, tocou]);

  const confirmar = async () => {
    if (!consentimento) { setErro(COPY_WHATS_SEM_PERMISSAO); return; }
    const invalido = phoneError(phone) || (phoneDigits(phone) ? null : COPY_WHATS_ERRO);
    if (invalido) { setErro(invalido); return; }
    setErro(null);
    setSalvando(true);
    const r = await onConfirmar({ notify_phone: phone, consentimento: true, consent_texto: COPY_CONSENTIMENTO });
    setSalvando(false);
    if (!r.ok) { setErro(r.message || 'Não deu para salvar o WhatsApp agora. Tente de novo.'); return; }
    setSalvo(true);
  };

  if (salvo) {
    return (
      <p className="text-xs text-green-400 font-sans" data-testid={testId ? `${testId}-salvo` : undefined}>{COPY_WHATS_SALVO}</p>
    );
  }

  return (
    <div className="space-y-2 text-left" data-testid={testId}>
      {titulo && <p className="text-sm text-white/70 font-sans">{titulo}</p>}
      <label htmlFor={id} className="block text-xs text-white/50 font-sans">{COPY_WHATS_LABEL}</label>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => { setTocou(true); setPhone(e.target.value); setErro(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } }}
        placeholder={COPY_WHATS_PLACEHOLDER}
        disabled={disabled || salvando}
        className={WHATS_INPUT_CLASS}
      />
      {sugerido && !tocou && <p className="text-xs text-white/40 font-sans">{COPY_WHATS_SUGERIDO}</p>}
      <label className="flex items-start gap-2 py-2 text-sm text-white/80 font-sans cursor-pointer select-none">
        <input
          type="checkbox"
          checked={consentimento}
          onChange={(e) => { setConsentimento(e.target.checked); setErro(null); }}
          disabled={disabled || salvando}
          className="w-5 h-5 mt-0.5 flex-shrink-0 accent-prosperus-gold-dark"
        />
        <span>{COPY_CONSENTIMENTO}</span>
      </label>
      <Button
        variant="secondary"
        size="md"
        className="min-h-[44px]"
        onClick={confirmar}
        loading={salvando}
        disabled={disabled || salvando}
      >
        {COPY_WHATS_BOTAO}
      </Button>
      {erro && <p className="text-xs text-red-400 font-sans">{erro}</p>}
    </div>
  );
};
