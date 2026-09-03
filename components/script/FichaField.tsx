import React from 'react';
import type { ScriptFieldView } from '../../data/script-ficha-fields';
import type { FieldDecision } from '../../hooks/useScriptFicha';
import { campoRefinando, sugestaoVazia } from '../../hooks/useContextoCampo';
import { Button } from '../ui/Button';
import { FieldEditor, useFieldEditor } from './widgets/editor';
import { FichaDisplay, Fonte, TextoOriginal } from './widgets/FichaDisplay';
import { BadgeRefinando, ContextoCampo } from './contexto/ContextoCampo';

/** Convite do campo sem sugestão: o widget já abre em edição, com esta frase em cima. */
export const COPY_VAZIO = 'Não encontramos nos seus materiais. Conte com as suas palavras ou grave um áudio.';

/** Campo obrigatório deixado em branco: o que acontece no script. */
export const COPY_EM_BRANCO = 'Fica em branco no script até você preencher.';

interface FichaFieldProps {
  campo: ScriptFieldView;
  onDecide: (key: string, decision: FieldDecision) => void;
  readOnly?: boolean;
  /** Todos os campos da ficha por chave (4.3 e 4.4 leem os pilares do 4.2). */
  contexto?: Record<string, ScriptFieldView>;
  /** Recarrega a ficha (flush + GET) depois de pedir uma nova sugestão com contexto. */
  onRecarregar?: () => Promise<void> | void;
}

// Alvo de toque no celular: 44 px de altura minima (desktop mantem o tamanho do Button)
const TAP = 'min-h-[44px] sm:min-h-0';

/** Chip de estado do campo (Confirmado / Editado por você / Deixado em branco). */
export const StatusChip: React.FC<{ status: ScriptFieldView['status'] }> = ({ status }) => {
  if (status === 'confirmado') return <span className="text-xs text-green-400 font-sans">Confirmado</span>;
  if (status === 'editado') return <span className="text-xs text-green-400 font-sans">Editado por você</span>;
  if (status === 'aceito_vazio') return <span className="text-xs text-white/50 font-sans">Deixado em branco</span>;
  return null;
};

/** "Também encontramos:" com as alternativas da sugestão (toque para usar). */
export const Alternativas: React.FC<{ campo: ScriptFieldView; onUse: (texto: string) => void }> = ({ campo, onUse }) => {
  const alts = campo.alternativas.filter((a) => !sugestaoVazia(a.sugerido));
  if (!alts.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-white/50 font-sans">Também encontramos:</p>
      {alts.slice(0, 2).map((alt, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onUse(alt.sugerido)}
          className="w-full text-left bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 rounded-lg p-3 transition"
        >
          <div className="text-sm text-white/80 font-sans whitespace-pre-line">{alt.sugerido}</div>
          <div className="text-[11px] text-white/40 font-sans mt-1">Fonte: {alt.fonte || 'não informada'} · toque para usar</div>
        </button>
      ))}
    </div>
  );
};

/** Estado que a tela usa: sugestão só de marcador ("a definir") vira vazio. Nunca "Confirmar" para valor vazio. */
export function statusDaTela(campo: ScriptFieldView): ScriptFieldView['status'] {
  return campo.status === 'sugerido' && sugestaoVazia(campo.sugerido) ? 'vazio' : campo.status;
}

export const FichaField: React.FC<FichaFieldProps> = ({ campo, onDecide, readOnly = false, contexto, onRecarregar }) => {
  const editor = useFieldEditor(campo, contexto);
  const { editing, canSave } = editor;

  const isEmptySource = sugestaoVazia(campo.sugerido);
  const status = statusDaTela(campo);
  const decided = campo.decidido;
  const refinando = campoRefinando(campo as { refinando?: boolean });

  const saveEdit = () => {
    const d = editor.decision();
    if (!d) return;
    onDecide(campo.key, d);
    editor.reset();
  };

  const confirm = () => onDecide(campo.key, { status: 'confirmado' });
  const acceptEmpty = () => onDecide(campo.key, { status: 'aceito_vazio' });
  const undo = () => onDecide(campo.key, { status: isEmptySource ? 'vazio' : 'sugerido' });
  const useAlternative = (text: string) => onDecide(campo.key, { status: 'editado', valor: text });

  const badge = campo.obrigatorio
    ? <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-light font-sans">obrigatório</span>
    : <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-sans">opcional</span>;

  const renderEditor = (showCancel: boolean) => (
    <div className="space-y-2">
      <FieldEditor campo={campo} editor={editor} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="md" className={TAP} onClick={saveEdit} disabled={!canSave}>Salvar</Button>
        {showCancel && <Button variant="ghost" size="md" className={TAP} onClick={editor.reset}>Cancelar</Button>}
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
        {refinando && <BadgeRefinando />}
      </div>
      <p className="text-sm text-white/70 font-sans leading-relaxed">{campo.pergunta}</p>

      {/* Corpo por estado */}
      {editing ? renderEditor(true) : (
        <>
          {(status === 'sugerido') && (
            <div className="space-y-3">
              {/* Sugestao no visual do widget (podio, VS, cartoes...). Texto corrido cai no bloco de citacao. */}
              <FichaDisplay campo={campo} modo="sugerido" contexto={contexto} />
              <Fonte campo={campo} />
              <TextoOriginal campo={campo} />
              <Alternativas campo={campo} onUse={useAlternative} />
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="md" className={TAP} onClick={confirm}>Confirmar</Button>
                  <Button variant="secondary" size="md" className={TAP} onClick={() => editor.start('sugerido')}>Editar</Button>
                </div>
              )}
            </div>
          )}

          {(status === 'confirmado' || status === 'editado') && (
            <div className="space-y-3">
              <div className="rounded-lg border border-green-500/20 p-2 sm:p-3">
                <FichaDisplay campo={campo} modo="atual" contexto={contexto} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <StatusChip status={status} />
                {status === 'confirmado' && campo.fonte && <span className="text-[11px] text-white/40 font-sans">Fonte: {campo.fonte}</span>}
              </div>
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="md" className={TAP} onClick={() => editor.start('atual')}>Editar</Button>
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
              <p className="text-sm text-white/60 font-sans italic">{COPY_VAZIO}</p>
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
                <StatusChip status={status} />
                {campo.obrigatorio && (
                  <span className="text-[11px] text-prosperus-gold-light/80 font-sans">{COPY_EM_BRANCO}</span>
                )}
              </div>
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="md" className={TAP} onClick={() => editor.start('vazio')}>Preencher</Button>
                  {!isEmptySource && <Button variant="ghost" size="md" className={TAP} onClick={undo}>Ver sugestão</Button>}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Contexto por pergunta: áudio, foto, vídeo, link, nota e o pedido de nova sugestão */}
      {!readOnly && <ContextoCampo campo={campo} onRecarregar={onRecarregar} />}
    </div>
  );
};
