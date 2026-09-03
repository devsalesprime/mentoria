/**
 * Editor de um campo da ficha: estado (estrutura do widget ou rascunho de texto), abertura a partir
 * da sugestão / do valor atual / em branco / de um texto (transcrição de áudio), e a decisão pronta
 * para o `decide` do hook. Usado pelo FichaField (cartão) e pelo FichaWizard (passo a passo).
 */
import React, { useMemo, useState } from 'react';
import type { ScriptFieldView } from '../../../data/script-ficha-fields';
import type { FieldDecision } from '../../../hooks/useScriptFicha';
import { buildContext, resolveWidget, type Estrutura, type ParseContext, type ResolvedWidget } from './index';

export type EditMode = 'sugerido' | 'atual' | 'vazio';

const ROWS_BY_TYPE: Record<string, number> = { tc: 2, tx: 5, ls: 5, num: 1, esc: 2 };

export interface FieldEditorState {
  widget: ResolvedWidget | null;
  ctx: ParseContext;
  editing: boolean;
  bruto: boolean;
  est: Estrutura | null;
  draft: string;
  canSave: boolean;
  setDraft: (v: string) => void;
  setEstrutura: (e: Estrutura) => void;
  /** Abre o editor. 'sugerido' = parte da sugestão; 'atual' = do valor decidido (estrutura salva, se houver); 'vazio' = em branco. */
  start: (mode: EditMode) => void;
  /** Abre o editor a partir de um texto (ex.: "Usar como resposta" da transcrição do áudio). */
  startTexto: (texto: string) => void;
  reset: () => void;
  /** Decisão 'editado' com valor (e estrutura, quando há widget); null quando não há o que salvar. */
  decision: () => FieldDecision | null;
}

export function useFieldEditor(campo: ScriptFieldView, contexto?: Record<string, ScriptFieldView>): FieldEditorState {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [estrutura, setEstruturaState] = useState<Estrutura | null>(null);
  const [bruto, setBruto] = useState(false);

  const widget = useMemo(() => resolveWidget(campo), [campo.widget, campo.template]);
  const ctx = useMemo(() => buildContext(campo, contexto), [campo, contexto]);

  const est: Estrutura | null = widget ? (estrutura ?? widget.vazio(ctx)) : null;
  const rendered = widget && est ? widget.render(est) : draft.trim();
  const canSave = widget && est ? widget.valido(est) : rendered.length > 0;

  const reset = () => {
    setEditing(false);
    setDraft('');
    setEstruturaState(null);
    setBruto(false);
  };

  const abrirCom = (text: string) => {
    if (widget) {
      if (!text.trim()) {
        setEstruturaState(widget.vazio(ctx));
        setBruto(false);
      } else {
        const r = widget.parse(text, ctx);
        setEstruturaState(r.estrutura);
        setBruto(r.bruto);
      }
    } else {
      setDraft(text);
    }
    setEditing(true);
  };

  const start = (mode: EditMode) => {
    const text = mode === 'vazio' ? '' : mode === 'sugerido' ? campo.sugerido : (campo.valor || campo.sugerido || '');
    if (widget && mode === 'atual' && campo.status === 'editado' && campo.estrutura && typeof campo.estrutura === 'object') {
      setEstruturaState(campo.estrutura);
      setBruto(false);
      setEditing(true);
      return;
    }
    abrirCom(text);
  };

  const startTexto = (texto: string) => abrirCom(texto || '');

  const decision = (): FieldDecision | null => {
    if (!canSave) return null;
    if (widget && est) return { status: 'editado', valor: rendered, estrutura: est };
    return { status: 'editado', valor: draft.trim() };
  };

  return {
    widget, ctx, editing, bruto, est, draft, canSave,
    setDraft,
    setEstrutura: (e) => { setEstruturaState(e); setBruto(false); },
    start, startTexto, reset, decision,
  };
}

/** Corpo do editor (widget ou textarea simples), sem botões: quem monta decide o que fica embaixo. */
export const FieldEditor: React.FC<{ campo: ScriptFieldView; editor: FieldEditorState; testId?: string }> = ({ campo, editor, testId }) => {
  const { widget, est, ctx, bruto, draft, setDraft, setEstrutura } = editor;
  return (
    <div className="space-y-2" data-testid={testId || `editor-${campo.key}`}>
      {bruto && (
        <p className="text-[11px] text-prosperus-gold-light/80 font-sans" data-testid={`nota-bruto-${campo.key}`}>
          Sugestão em texto corrido, ajuste nos campos.
        </p>
      )}
      {widget && est ? (
        <widget.Component campo={campo} template={widget.template} value={est} onChange={setEstrutura} ctx={ctx} />
      ) : (
        <>
          {campo.tipo === 'esc' && campo.opcoes && campo.opcoes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {campo.opcoes.map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => setDraft(op)}
                  className={`min-h-[44px] px-3 py-1.5 rounded-full text-xs font-sans border transition ${
                    draft === op
                      ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark'
                      : 'border-white/20 text-white/70 hover:border-prosperus-gold-dark/60'
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={ROWS_BY_TYPE[campo.tipo] || 3}
            inputMode={campo.tipo === 'num' ? 'decimal' : undefined}
            placeholder={campo.tipo === 'ls' ? 'Um item por linha' : campo.tipo === 'num' ? 'Só o número' : 'Escreva do seu jeito'}
            aria-label={`Editar ${campo.nome}`}
            className="w-full bg-prosperus-navy-mid border border-white/10 focus:border-prosperus-gold-dark/60 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 font-sans outline-none resize-y"
          />
          {campo.tipo === 'ls' && <p className="text-[11px] text-white/40 font-sans">Lista: um item por linha.</p>}
        </>
      )}
    </div>
  );
};
