import React, { useMemo, useState } from 'react';
import type { ScriptFieldView } from '../../data/script-ficha-fields';
import type { FieldDecision } from '../../hooks/useScriptFicha';
import { Button } from '../ui/Button';
import { buildContext, resolveWidget, type Estrutura } from './widgets';

interface FichaFieldProps {
  campo: ScriptFieldView;
  onDecide: (key: string, decision: FieldDecision) => void;
  readOnly?: boolean;
  /** Todos os campos da ficha por chave (4.3 e 4.4 leem os pilares do 4.2). */
  contexto?: Record<string, ScriptFieldView>;
}

const ROWS_BY_TYPE: Record<string, number> = { tc: 2, tx: 5, ls: 5, num: 1, esc: 2 };
// Alvo de toque no celular: 44 px de altura minima (desktop mantem o tamanho do Button)
const TAP = 'min-h-[44px] sm:min-h-0';

type EditMode = 'sugerido' | 'atual' | 'vazio';

function renderValue(value: string, tipo: string) {
  const lines = value.split('\n').map((l) => l.trim()).filter(Boolean);
  if (tipo === 'ls' && lines.length > 1) {
    return (
      <ul className="list-disc pl-5 space-y-1">
        {lines.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    );
  }
  return <p className="whitespace-pre-line">{value}</p>;
}

export const FichaField: React.FC<FichaFieldProps> = ({ campo, onDecide, readOnly = false, contexto }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [estrutura, setEstrutura] = useState<Estrutura | null>(null);
  const [bruto, setBruto] = useState(false);

  const widget = useMemo(() => resolveWidget(campo), [campo.widget, campo.template]);
  const ctx = useMemo(() => buildContext(campo, contexto), [campo, contexto]);

  const isEmptySource = !campo.sugerido.trim();
  const status = campo.status;
  const decided = campo.decidido;

  // Estrutura em edicao: a do estado ou, no campo vazio (editor inline), a vazia do widget
  const est: Estrutura | null = widget ? (estrutura ?? widget.vazio(ctx)) : null;
  const rendered = widget && est ? widget.render(est) : draft.trim();
  const canSave = rendered.length > 0;

  const resetEditor = () => {
    setEditing(false);
    setDraft('');
    setEstrutura(null);
    setBruto(false);
  };

  /**
   * Abre o editor. 'sugerido' = parte da sugestao; 'atual' = do valor decidido (estrutura salva, se houver);
   * 'vazio' = em branco. Sugestao em texto corrido entra no widget pela heuristica (parse); se nao
   * estruturar, vai para o primeiro slot livre com a nota "sugestão em texto corrido".
   */
  const startEdit = (mode: EditMode) => {
    const text = mode === 'vazio' ? '' : mode === 'sugerido' ? campo.sugerido : (campo.valor || campo.sugerido || '');
    if (widget) {
      if (mode === 'atual' && campo.status === 'editado' && campo.estrutura && typeof campo.estrutura === 'object') {
        setEstrutura(campo.estrutura);
        setBruto(false);
      } else if (!text.trim()) {
        setEstrutura(widget.vazio(ctx));
        setBruto(false);
      } else {
        const r = widget.parse(text, ctx);
        setEstrutura(r.estrutura);
        setBruto(r.bruto);
      }
    } else {
      setDraft(text);
    }
    setEditing(true);
  };

  const saveEdit = () => {
    if (!canSave) return;
    if (widget && est) {
      onDecide(campo.key, { status: 'editado', valor: rendered, estrutura: est });
    } else {
      onDecide(campo.key, { status: 'editado', valor: draft.trim() });
    }
    resetEditor();
  };

  const confirm = () => onDecide(campo.key, { status: 'confirmado' });
  const acceptEmpty = () => onDecide(campo.key, { status: 'aceito_vazio' });
  const undo = () => onDecide(campo.key, { status: campo.sugerido.trim() ? 'sugerido' : 'vazio' });
  const useAlternative = (text: string) => onDecide(campo.key, { status: 'editado', valor: text });

  const badge = campo.obrigatorio
    ? <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-light font-sans">obrigatório</span>
    : <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-sans">opcional</span>;

  const statusChip = (() => {
    if (status === 'confirmado') return <span className="text-xs text-green-400 font-sans">Confirmado</span>;
    if (status === 'editado') return <span className="text-xs text-green-400 font-sans">Editado por você</span>;
    if (status === 'aceito_vazio') return <span className="text-xs text-white/50 font-sans">Deixado em branco</span>;
    return null;
  })();

  const renderFallbackEditor = () => (
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
  );

  const renderEditor = (showCancel: boolean) => (
    <div className="space-y-2" data-testid={`editor-${campo.key}`}>
      {bruto && (
        <p className="text-[11px] text-prosperus-gold-light/80 font-sans" data-testid={`nota-bruto-${campo.key}`}>
          Sugestão em texto corrido, ajuste nos campos.
        </p>
      )}
      {widget && est ? (
        <widget.Component
          campo={campo}
          template={widget.template}
          value={est}
          onChange={(e) => { setEstrutura(e); setBruto(false); }}
          ctx={ctx}
        />
      ) : renderFallbackEditor()}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="md" className={TAP} onClick={saveEdit} disabled={!canSave}>Salvar</Button>
        {showCancel && <Button variant="ghost" size="md" className={TAP} onClick={resetEditor}>Cancelar</Button>}
      </div>
    </div>
  );

  return (
    <div
      className={`rounded-lg border p-3 sm:p-4 space-y-3 transition-colors ${
        decided ? 'border-green-500/20 bg-green-500/5' : 'border-white/10 bg-white/[0.03]'
      }`}
      data-testid={`ficha-field-${campo.key}`}
    >
      {/* Cabecalho */}
      <div className="flex flex-wrap items-start gap-2">
        <span className="font-sans text-xs text-prosperus-gold-dark font-bold mt-0.5">{campo.key}</span>
        <h4 className="font-serif text-base sm:text-lg text-white flex-1 min-w-0 leading-snug">{campo.nome}</h4>
        {badge}
      </div>
      <p className="text-sm text-white/70 font-sans leading-relaxed">{campo.pergunta}</p>

      {/* Corpo por estado */}
      {editing ? renderEditor(true) : (
        <>
          {(status === 'sugerido') && (
            <div className="space-y-3">
              <div className="bg-prosperus-navy-mid/70 border border-white/10 rounded-lg p-3 text-sm text-white/90 font-sans leading-relaxed">
                {renderValue(campo.sugerido, campo.tipo)}
              </div>
              <p className="text-xs text-white/50 font-sans">
                Fonte: {campo.fonte || 'não informada'}
                {campo.classe === 'DER' && <span className="ml-2 px-1.5 py-0.5 rounded bg-white/10 text-white/60">derivado</span>}
              </p>
              {campo.alternativas.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-white/50 font-sans">Também encontramos:</p>
                  {campo.alternativas.slice(0, 2).map((alt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => useAlternative(alt.sugerido)}
                      className="w-full text-left bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 rounded-lg p-3 transition"
                    >
                      <div className="text-sm text-white/80 font-sans whitespace-pre-line">{alt.sugerido}</div>
                      <div className="text-[11px] text-white/40 font-sans mt-1">Fonte: {alt.fonte || 'não informada'} · toque para usar</div>
                    </button>
                  ))}
                </div>
              )}
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="md" className={TAP} onClick={confirm}>Confirmar</Button>
                  <Button variant="secondary" size="md" className={TAP} onClick={() => startEdit('sugerido')}>Editar</Button>
                </div>
              )}
            </div>
          )}

          {(status === 'confirmado' || status === 'editado') && (
            <div className="space-y-3">
              <div className="bg-prosperus-navy-mid/70 border border-green-500/20 rounded-lg p-3 text-sm text-white/90 font-sans leading-relaxed">
                {renderValue(campo.valor_efetivo || campo.valor || campo.sugerido, campo.tipo)}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {statusChip}
                {status === 'confirmado' && campo.fonte && <span className="text-[11px] text-white/40 font-sans">Fonte: {campo.fonte}</span>}
              </div>
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="md" className={TAP} onClick={() => startEdit('atual')}>Editar</Button>
                  {status === 'editado' && !isEmptySource && (
                    <Button variant="ghost" size="md" className={TAP} onClick={confirm}>Voltar ao sugerido</Button>
                  )}
                  <Button variant="ghost" size="md" className={TAP} onClick={undo}>Desfazer</Button>
                </div>
              )}
            </div>
          )}

          {status === 'vazio' && (
            <div className="space-y-3">
              <p className="text-sm text-white/60 font-sans italic">Não encontramos, você preenche.</p>
              {!readOnly && (
                <>
                  {renderEditor(false)}
                  <Button variant="ghost" size="md" className={`${TAP} !text-white/60 hover:!text-white`} onClick={acceptEmpty}>
                    {campo.obrigatorio ? 'Deixar em branco por enquanto' : 'Não se aplica / deixar vazio'}
                  </Button>
                </>
              )}
            </div>
          )}

          {status === 'aceito_vazio' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {statusChip}
                {campo.obrigatorio && (
                  <span className="text-[11px] text-prosperus-gold-light/80 font-sans">No script vai como "a definir com a gente na mentoria".</span>
                )}
              </div>
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="md" className={TAP} onClick={() => startEdit('vazio')}>Preencher</Button>
                  {!isEmptySource && <Button variant="ghost" size="md" className={TAP} onClick={undo}>Ver sugestão</Button>}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
