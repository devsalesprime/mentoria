/**
 * 4.3 "Pilar que resolve a dor principal": a linha que sai da dor do cliente (3.3) e desce até o
 * degrau do método que resolve ela (4.2). No Passo 3 é isso que se apresenta, não o catálogo.
 *
 * A dor vem do contexto (`ctx.dor`) e os degraus do 4.2 (`ctx.pilares`); nada aqui inventa etapa
 * nem reescreve a fala do cliente.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { norm } from './estrutura';
import { Dica, Entrada, Numero, Rotulo, VazioLido, type DisplayProps, type WidgetProps } from './ui';
import { IconeAspas } from '../contexto/icones';

const txt = (v: any): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();

/** Degraus a mostrar: os do 4.2 e, se o mentor escolheu algo de fora, ele entra no fim da escada. */
function degrausDe(pilares: string[] | undefined, escolhido: string): string[] {
  const base = (pilares || []).map(txt).filter(Boolean);
  if (escolhido && !base.some((p) => norm(p) === norm(escolhido))) return [...base, escolhido];
  return base;
}

/** O cartão com a fala do cliente, de onde a linha parte. */
const CartaoDor: React.FC<{ dor: string }> = ({ dor }) => (
  <div data-testid="dor-pilar-dor" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-1">
    <Rotulo>A dor principal</Rotulo>
    <div className="flex items-start gap-2">
      <span className="shrink-0 mt-1 text-prosperus-gold-dark" aria-hidden="true"><IconeAspas /></span>
      <p className="font-serif italic text-white/90 leading-snug min-w-0">{dor}</p>
    </div>
  </div>
);

/** A linha que liga a dor ao degrau escolhido. */
const Linha: React.FC = () => {
  const reduzido = useReducedMotion();
  return (
    <div data-testid="dor-pilar-linha" className="flex flex-col items-center py-1" aria-hidden="true">
      <motion.span
        initial={reduzido ? false : { scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: reduzido ? 0 : 0.4, ease: 'easeOut' }}
        style={{ transformOrigin: 'top' }}
        className="block w-px h-6 bg-gradient-to-b from-prosperus-gold-dark/20 to-prosperus-gold-dark"
      />
      <span className="block w-1.5 h-1.5 rounded-full bg-prosperus-gold-dark" />
    </div>
  );
};

const LINHA_BASE = 'w-full flex items-center gap-2 min-h-[44px] rounded-lg border p-2 text-left';
const ACESA = 'border-prosperus-gold-dark/60 bg-prosperus-gold-dark/10 text-prosperus-gold-light';
const APAGADA = 'border-white/10 bg-white/[0.02] text-white/40';

export const DorPilarDisplay: React.FC<DisplayProps> = ({ value, ctx }) => {
  const dor = txt(ctx?.dor);
  const escolhido = txt(value?.escolhido);
  const texto = txt(value?.texto);
  const degraus = degrausDe(ctx?.pilares, escolhido);
  return (
    <div className="space-y-2">
      {dor && <CartaoDor dor={dor} />}
      {!!escolhido && <Linha />}
      {degraus.length > 0 && (
        <ol className="space-y-1.5">
          {degraus.map((p, i) => {
            const on = !!escolhido && norm(p) === norm(escolhido);
            return (
              <li
                key={`${p}-${i}`}
                data-testid={`dor-pilar-degrau-${i}`}
                data-selected={on ? 'true' : 'false'}
                className={`${LINHA_BASE} ${on ? ACESA : APAGADA}`}
              >
                <Numero n={i + 1} gold={on} />
                <span className="text-sm font-sans min-w-0 break-words">{p}</span>
              </li>
            );
          })}
        </ol>
      )}
      {!escolhido && texto && <p className="text-sm sm:text-base font-sans font-semibold text-white/90 leading-relaxed">{texto}</p>}
      {!escolhido && !texto && <VazioLido />}
    </div>
  );
};

export const DorPilarWidget: React.FC<WidgetProps> = ({ campo, value, onChange, ctx }) => {
  const dor = txt(ctx?.dor);
  const escolhido = txt(value?.escolhido);
  const degraus = degrausDe(ctx?.pilares, escolhido);
  return (
    <div className="space-y-2">
      {dor && <CartaoDor dor={dor} />}
      {!!escolhido && <Linha />}
      {degraus.length > 0 ? (
        <div role="radiogroup" aria-label={campo.nome} className="space-y-1.5">
          {degraus.map((p, i) => {
            const on = norm(p) === norm(escolhido);
            return (
              <button
                key={`${p}-${i}`}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={p}
                data-testid={`dor-pilar-degrau-${i}`}
                data-selected={on ? 'true' : 'false'}
                onClick={() => onChange({ escolhido: p, texto: '' })}
                className={`${LINHA_BASE} transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prosperus-gold-dark/60 ${
                  on ? ACESA : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-prosperus-gold-dark/40 hover:text-white'
                }`}
              >
                <Numero n={i + 1} gold={on} />
                <span className="text-sm font-sans min-w-0 break-words">{p}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <Dica>Preencha os pilares no 4.2 para escolher da lista, ou escreva abaixo.</Dica>
      )}
      <Entrada
        value={value?.texto || ''}
        onChange={(e) => onChange({ escolhido: '', texto: e.target.value })}
        aria-label={`Editar ${campo.nome}`}
        placeholder={degraus.length ? 'Ou escreva outro' : 'Qual pilar resolve a dor principal?'}
      />
    </div>
  );
};
