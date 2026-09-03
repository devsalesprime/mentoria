/**
 * 5.7 "Bônus e objeção que mata": cada bônus é uma chave que entra numa fechadura.
 * A chave é o que você entrega; a fechadura é a objeção que aquele bônus derruba.
 * As objeções que o mentor já listou no 6.3 chegam por `ctx.objecoes` e viram sugestões.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { norm, stripQuotes, type WidgetTemplate } from './estrutura';
import {
  BotaoAdd, BotaoIcone, Chip, Contador, Entrada, Rotulo, VazioLido,
  lista, type DisplayProps, type WidgetProps,
} from './ui';
import { IconeCadeado, IconeChave, IconeX } from '../contexto/icones';

type Coluna = { key: string; label: string; placeholder?: string };

const PADRAO: [Coluna, Coluna] = [
  { key: 'bonus', label: 'Bônus' },
  { key: 'objecao', label: 'Objeção que mata' },
];

/** As duas colunas do template, com os padrões do 5.7 quando o JSON não trouxer. */
function colunas(t: WidgetTemplate): [Coluna, Coluna] {
  const cols: any[] = Array.isArray(t?.colunas) ? t.colunas : [];
  return [{ ...PADRAO[0], ...(cols[0] || {}) }, { ...PADRAO[1], ...(cols[1] || {}) }];
}

/** Objeção inteira não cabe numa pastilha: o chip mostra o começo e o clique guarda o texto todo. */
const LIMITE_CHIP = 56;
function curto(s: string): string {
  const t = stripQuotes((s || '').trim());
  return t.length <= LIMITE_CHIP ? t : `${t.slice(0, LIMITE_CHIP).trimEnd()}…`;
}

/** O elo curto entre a chave e a fechadura: vertical no celular, horizontal a partir do sm. */
const Elo: React.FC = () => (
  <span aria-hidden="true" className="self-center shrink-0 h-6 w-0.5 sm:h-0.5 sm:w-6 bg-prosperus-gold-dark/70" />
);

export const ChaveFechaduraDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const [c0, c1] = colunas(template);
  const reduzido = useReducedMotion();
  const linhas = lista<Record<string, string>>(value?.linhas)
    .filter((r) => (r?.[c0.key] || '').trim() || (r?.[c1.key] || '').trim());
  if (!linhas.length) return <VazioLido />;
  return (
    <div className="space-y-3">
      {linhas.map((r, i) => {
        const bonus = (r[c0.key] || '').trim();
        const objecao = stripQuotes((r[c1.key] || '').trim());
        const anima = reduzido
          ? {}
          : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.28, delay: Math.min(i * 0.05, 0.25) } };
        return (
          <motion.div key={i} data-testid={`chave-${i}`} {...anima} className="flex flex-col sm:flex-row sm:items-stretch">
            <div className="min-w-0 flex-1 flex items-start gap-2 rounded-lg border border-prosperus-gold-dark/40 bg-prosperus-gold-dark/5 p-3">
              <IconeChave className="mt-0.5 shrink-0 text-prosperus-gold-dark" />
              <p className="min-w-0 break-words font-serif text-base leading-snug text-white/90">{bonus || <VazioLido />}</p>
            </div>
            <Elo />
            <div className="min-w-0 flex-1 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <IconeCadeado className="mt-0.5 shrink-0 text-white/50" />
              {objecao
                ? <p className="min-w-0 break-words font-serif italic text-sm leading-snug text-white/80">{`“${objecao}”`}</p>
                : <VazioLido />}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export const ChaveFechaduraWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange, ctx }) => {
  const [c0, c1] = colunas(template);
  const max: number = template?.max || 8;
  const opcoes = (ctx?.objecoes || []).map((o) => (o || '').trim()).filter(Boolean);
  const linhas = lista<Record<string, string>>(value?.linhas);
  const rows: Record<string, string>[] = linhas.length ? linhas : [{ [c0.key]: '', [c1.key]: '' }];

  const update = (next: Record<string, string>[]) => onChange({ ...value, linhas: next });
  const set = (i: number, k: string, v: string) => {
    const next = rows.map((r) => ({ ...r }));
    next[i][k] = v;
    update(next);
  };
  const preenchidas = rows.filter((r) => (r[c0.key] || '').trim() || (r[c1.key] || '').trim()).length;

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} data-testid={`chave-editor-${i}`} className="min-w-0 space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-start gap-2">
            <IconeChave className="mt-3 shrink-0 text-prosperus-gold-dark" />
            <div className="min-w-0 flex-1">
              <Entrada
                value={r[c0.key] || ''}
                onChange={(e) => set(i, c0.key, e.target.value)}
                aria-label={`${campo.nome}: linha ${i + 1}, ${c0.label}`}
                placeholder={c0.placeholder || 'O bônus que você entrega'}
                className="!font-serif"
              />
            </div>
            <BotaoIcone
              onClick={() => update(rows.filter((_, k) => k !== i))}
              label={`Remover linha ${i + 1}`}
              disabled={rows.length <= 1}
              className="shrink-0 -mr-1"
            >
              <IconeX />
            </BotaoIcone>
          </div>

          <div className="min-w-0 space-y-2 rounded-lg border border-white/10 bg-prosperus-navy-mid p-3">
            <span className="flex items-center gap-2">
              <IconeCadeado className="shrink-0 text-white/50" />
              <Rotulo>Que objeção esse bônus derruba</Rotulo>
            </span>
            {opcoes.length > 0 && (
              <div role="radiogroup" aria-label={`${campo.nome}: linha ${i + 1}, objeções já listadas`} className="flex flex-wrap gap-2">
                {opcoes.map((o, k) => (
                  <Chip
                    key={k}
                    role="radio"
                    selected={!!(r[c1.key] || '').trim() && norm(r[c1.key] || '') === norm(o)}
                    onClick={() => set(i, c1.key, o)}
                  >
                    {curto(o)}
                  </Chip>
                ))}
              </div>
            )}
            <Entrada
              value={r[c1.key] || ''}
              onChange={(e) => set(i, c1.key, e.target.value)}
              aria-label={`${campo.nome}: linha ${i + 1}, ${c1.label}`}
              placeholder="Ou escreva a objeção"
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Contador n={preenchidas} max={max} unidade="bônus" />
        {rows.length < max && (
          <BotaoAdd onClick={() => update([...rows, { [c0.key]: '', [c1.key]: '' }])}>+ Bônus</BotaoAdd>
        )}
      </div>
    </div>
  );
};
