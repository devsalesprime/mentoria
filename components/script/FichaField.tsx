/**
 * FichaField: um campo da ficha no modo "Ver tudo" (acordeões). A mesma leitura de cima para baixo do
 * passo a passo, em cartão: chave e nome, a pergunta em serifa, por que isso importa no script, a
 * resposta ("Sugestão encontrada" no visual do widget, com a fonte discreta; ou o editor com o convite),
 * a linha "no seu script", o contexto e os botões. Também exporta as peças que o FichaWizard reusa.
 */
import React from 'react';
import type { ScriptFieldView } from '../../data/script-ficha-fields';
import { SCRIPT_FIELD_BY_KEY } from '../../data/script-ficha-fields';
import type { FieldDecision } from '../../hooks/useScriptFicha';
import { campoRefinando, sugestaoVazia } from '../../hooks/useContextoCampo';
import { Button } from '../ui/Button';
import { FieldEditor, useFieldEditor } from './widgets/editor';
import { BadgeNovaSugestao } from './ProgressoPreenchimento';
import { FichaDisplay, Fonte, TextoOriginal } from './widgets/FichaDisplay';
import { PreviaCampo } from './widgets/PreviaScript';
import { BadgeRefinando, ContextoCampo } from './contexto/ContextoCampo';
import { IconeCheck } from './contexto/icones';
import { rotuloStatus } from './FichaNavegador';

/** Convite do campo sem sugestão: o widget já abre em edição, com esta frase em cima. Nunca placeholder plausível. */
export const COPY_VAZIO = 'Não encontramos. Conte com a sua voz: grave um áudio ou escreva do seu jeito.';

/** Campo obrigatório deixado em branco: o que acontece no script. */
export const COPY_EM_BRANCO = 'Fica em branco no script até você preencher.';

/** Rótulo da linha de ajuda (o que a pergunta alimenta no script). */
export const COPY_POR_QUE = 'Por que isso importa no script';

interface FichaFieldProps {
  campo: ScriptFieldView;
  onDecide: (key: string, decision: FieldDecision) => void;
  readOnly?: boolean;
  /** Todos os campos da ficha por chave (4.3 e 4.4 leem os pilares do 4.2; a prévia lê "[@3.3…]"). */
  contexto?: Record<string, ScriptFieldView>;
  /** Recarrega a ficha (flush + GET) depois de pedir uma nova sugestão com contexto. */
  onRecarregar?: () => Promise<void> | void;
}

// Alvo de toque no celular: 44 px de altura minima (desktop mantem o tamanho do Button)
const TAP = 'min-h-[44px] sm:min-h-0';

/** Chip de estado do campo, no vocabulário único (Confirmado / Editado / Aceito em branco). */
export const StatusChip: React.FC<{ status: ScriptFieldView['status'] }> = ({ status }) => {
  if (status === 'confirmado' || status === 'editado') return <span className="text-xs text-green-400 font-sans">{rotuloStatus(status)}</span>;
  if (status === 'aceito_vazio') return <span className="text-xs text-white/50 font-sans">{rotuloStatus(status)}</span>;
  return null;
};

/** Selo obrigatório / opcional. */
export const BadgeObrigatorio: React.FC<{ campo: ScriptFieldView }> = ({ campo }) => (campo.obrigatorio
  ? <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-light font-sans">obrigatório</span>
  : <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-sans">opcional</span>);

/** (c) Uma linha: por que a pergunta importa no script (o que ela alimenta). Vem do JSON do campo. */
export const PorQueImporta: React.FC<{ campo: ScriptFieldView; className?: string }> = ({ campo, className = '' }) => {
  const texto = campo.ajuda || SCRIPT_FIELD_BY_KEY[campo.key]?.ajuda || '';
  if (!texto) return null;
  return (
    <p className={`text-sm text-white/60 font-sans leading-relaxed ${className}`} data-testid={`ajuda-${campo.key}`}>
      <span className="text-prosperus-gold-dark/90">{COPY_POR_QUE}: </span>{texto}
    </p>
  );
};

/** (d) Cabeçalho da resposta sugerida: "Sugestão encontrada" e a fonte, numa linha cinza discreta. */
export const SugestaoEncontrada: React.FC<{ campo: ScriptFieldView }> = ({ campo }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
    <span className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Sugestão encontrada</span>
    <Fonte campo={campo} />
  </div>
);

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
          className="w-full min-h-[44px] text-left hover:bg-white/[0.05] border-l-2 border-white/15 hover:border-prosperus-gold-dark/60 pl-3 py-2 transition"
        >
          <div className="text-sm text-white/80 font-sans whitespace-pre-line">{alt.sugerido}</div>
          <div className="text-[11px] text-white/40 font-sans mt-1">Fonte: {alt.fonte || 'não informada'} · toque para usar</div>
        </button>
      ))}
    </div>
  );
};

/** Estado que a tela usa: sugestão só de marcador ("a definir") vira em branco. Nunca "Confirmar" para valor vazio. */
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

  // (e) A linha "no seu script": ao vivo no editor, da sugestão em revisão, do valor decidido
  const previa = editing
    ? <PreviaCampo campo={campo} estrutura={editor.est} texto={editor.draft} contexto={contexto} editing />
    : status === 'sugerido'
    ? <PreviaCampo campo={campo} modo="sugerido" contexto={contexto} />
    : status === 'confirmado' || status === 'editado'
    ? <PreviaCampo campo={campo} modo="atual" contexto={contexto} />
    : null;

  const renderEditor = (showCancel: boolean) => (
    <div className="space-y-3">
      <FieldEditor campo={campo} editor={editor} />
      {previa}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="md" className={TAP} onClick={saveEdit} disabled={!canSave}><IconeCheck />Salvar</Button>
        {showCancel && <Button variant="ghost" size="md" className={TAP} onClick={editor.reset}>Cancelar</Button>}
      </div>
    </div>
  );

  return (
    <div
      className={`rounded-lg border p-4 sm:p-5 space-y-4 transition-colors ${
        decided ? 'border-green-500/20 bg-green-500/5' : 'border-white/10 bg-white/[0.03]'
      }`}
      data-testid={`ficha-field-${campo.key}`}
    >
      {/* (a) chave e nome · (b) a pergunta · (c) por que importa */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-sans text-xs text-prosperus-gold-dark font-bold">{campo.key} · {campo.nome}</span>
          <BadgeObrigatorio campo={campo} />
          {refinando && <BadgeRefinando />}
          {campo.nova_sugestao && <BadgeNovaSugestao />}
        </div>
        <h4 className="font-serif text-lg sm:text-xl text-white leading-snug">{campo.pergunta}</h4>
        <PorQueImporta campo={campo} />
      </div>

      {/* (d) a resposta, por estado */}
      {editing ? renderEditor(true) : (
        <>
          {status === 'sugerido' && (
            <div className="space-y-3">
              <SugestaoEncontrada campo={campo} />
              {/* Sugestao no visual do widget (podio, VS, cartoes...). Texto corrido cai no bloco de citacao. */}
              <FichaDisplay campo={campo} modo="sugerido" contexto={contexto} />
              {previa}
              <TextoOriginal campo={campo} />
              <Alternativas campo={campo} onUse={useAlternative} />
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="md" className={TAP} onClick={confirm}><IconeCheck />Confirmar</Button>
                  <Button variant="secondary" size="md" className={TAP} onClick={() => editor.start('sugerido')}>Editar</Button>
                </div>
              )}
            </div>
          )}

          {(status === 'confirmado' || status === 'editado') && (
            <div className="space-y-3">
              <FichaDisplay campo={campo} modo="atual" contexto={contexto} />
              {previa}
              <div className="flex flex-wrap items-center gap-3">
                <StatusChip status={status} />
                {status === 'confirmado' && campo.fonte && <Fonte campo={campo} />}
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

      {/* (f) Contexto por pergunta: falar, foto, vídeo, link, nota e o pedido de nova sugestão */}
      {!readOnly && <ContextoCampo campo={campo} onRecarregar={onRecarregar} onUsarTexto={(t: string) => editor.startTexto(t)} />}
    </div>
  );
};
