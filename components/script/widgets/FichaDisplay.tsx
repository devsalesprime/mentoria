/**
 * FichaDisplay: mostra um campo da ficha no modo visual (só leitura), a partir da sugestão ou do
 * valor que vale hoje. Sugestão que o parse não estrutura vira bloco de texto corrido com a nota.
 */
import React, { useMemo, useState } from 'react';
import type { ScriptFieldView } from '../../../data/script-ficha-fields';
import { buildContext, resolveWidget, type Estrutura, type ParseContext, type ResolvedWidget } from './index';
import { DISPLAYS, TextoBruto } from './display';

export type DisplayModo = 'sugerido' | 'atual';

export const NOTA_TEXTO_CORRIDO = 'Sugestão em texto corrido.';

/** Texto que o modo lê: a sugestão, ou o que vale hoje (efetivo > valor > sugerido). */
export function textoDoModo(campo: ScriptFieldView, modo: DisplayModo): string {
  return modo === 'sugerido' ? campo.sugerido || '' : campo.valor_efetivo || campo.valor || campo.sugerido || '';
}

export interface EstruturaResolvida {
  widget: ResolvedWidget | null;
  ctx: ParseContext;
  texto: string;
  estrutura: Estrutura | null;
  bruto: boolean;
}

/** Widget, contexto e estrutura (salva ou parseada do texto) de um campo, no modo pedido. */
export function useEstruturaResolvida(campo: ScriptFieldView, modo: DisplayModo, contexto?: Record<string, ScriptFieldView>): EstruturaResolvida {
  const widget = useMemo(() => resolveWidget(campo), [campo.widget, campo.template]);
  const ctx = useMemo(() => buildContext(campo, contexto), [campo, contexto]);
  const texto = textoDoModo(campo, modo);
  const resolvido = useMemo<{ estrutura: Estrutura | null; bruto: boolean }>(() => {
    if (!widget) return { estrutura: null, bruto: false };
    if (modo === 'atual' && campo.status === 'editado' && campo.estrutura && typeof campo.estrutura === 'object' && !Array.isArray(campo.estrutura)) {
      return { estrutura: campo.estrutura, bruto: false };
    }
    if (!texto.trim()) return { estrutura: null, bruto: false };
    const r = widget.parse(texto, ctx);
    const vazio = !widget.render(r.estrutura);
    return { estrutura: vazio ? null : r.estrutura, bruto: r.bruto };
  }, [widget, ctx, texto, modo, campo.status, campo.estrutura]);
  return { widget, ctx, texto, ...resolvido };
}

interface FichaDisplayProps {
  campo: ScriptFieldView;
  modo?: DisplayModo;
  contexto?: Record<string, ScriptFieldView>;
  className?: string;
}

export const FichaDisplay: React.FC<FichaDisplayProps> = ({ campo, modo = 'sugerido', contexto, className = '' }) => {
  const { widget, ctx, texto, estrutura, bruto } = useEstruturaResolvida(campo, modo, contexto);

  if (!texto.trim()) return null;

  if (!widget || !estrutura || bruto) {
    return (
      <div className={className}>
        <TextoBruto texto={texto} tipo={campo.tipo} nota={widget && bruto ? NOTA_TEXTO_CORRIDO : undefined} testId={`display-bruto-${campo.key}`} />
      </div>
    );
  }

  const Display = DISPLAYS[widget.type];
  return (
    <div className={className} data-testid={`display-${campo.key}`}>
      <Display campo={campo} template={widget.template} value={estrutura} ctx={ctx} />
    </div>
  );
};

/** Alterna a exibição do texto original da sugestão (como veio da fonte). */
export const TextoOriginal: React.FC<{ campo: ScriptFieldView }> = ({ campo }) => {
  const [aberto, setAberto] = useState(false);
  if (!campo.sugerido.trim()) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="text-[11px] text-white/40 hover:text-white/70 font-sans underline-offset-2 hover:underline"
      >
        {aberto ? 'Esconder texto original' : 'Ver texto original'}
      </button>
      {aberto && <TextoBruto texto={campo.sugerido} tipo={campo.tipo} testId={`texto-original-${campo.key}`} />}
    </div>
  );
};

/** Fonte sem colchetes nem espaços dobrados. */
export function fonteLimpa(fonte: string | null | undefined): string {
  return (fonte || '').replace(/[\[\]]/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Linha "Fonte: …" discreta: cinza, sem negrito, sem colchetes; "derivado" quando a classe é DER. */
export const Fonte: React.FC<{ campo: ScriptFieldView; className?: string }> = ({ campo, className = '' }) => (
  <span className={`text-xs text-white/45 font-sans font-normal ${className}`} data-testid={`fonte-${campo.key}`}>
    Fonte: {fonteLimpa(campo.fonte) || 'não informada'}{campo.classe === 'DER' ? ' · derivado' : ''}
  </span>
);
