/**
 * baralho: as objeções como cartas. Frente = o que o cliente diz (aspas grandes); toque em "Virar" e o verso
 * abre para escrever o que você responde. Mesma estrutura e mesmo valor da tabela (linhas objecao · resposta).
 * template.classicas = objeções clássicas para adicionar num toque.
 */
import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { norm } from './estrutura';
import { Area, BotaoAdd, BotaoIcone, Chip, Contador, Rotulo, TAP, lista, type WidgetProps } from './ui';
import { IconeVirar, IconeX } from '../contexto/icones';

type Linha = Record<string, string>;

export const BaralhoWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const cols: { key: string; label: string }[] = Array.isArray(template.colunas) ? template.colunas : [{ key: 'objecao', label: 'Objeção' }, { key: 'resposta', label: 'O que você responde hoje' }];
  const kO = cols[0]?.key || 'objecao';
  const kR = cols[1]?.key || 'resposta';
  const max: number = template.max || 12;
  const classicas: string[] = Array.isArray(template.classicas) ? template.classicas : [];
  const linhas = lista<Linha>(value.linhas);
  const rows: Linha[] = linhas.length ? linhas : [{ [kO]: '', [kR]: '' }];
  const [viradas, setViradas] = useState<Record<number, boolean>>({});
  const reduzido = useReducedMotion();

  const update = (next: Linha[]) => onChange({ linhas: next });
  const set = (i: number, k: string, v: string) => { const next = rows.map((r) => ({ ...r })); next[i][k] = v; update(next); };
  const remove = (i: number) => { update(rows.filter((_, k) => k !== i)); setViradas({}); };
  const add = (obj = '') => { update([...rows, { [kO]: obj, [kR]: '' }]); setViradas((v) => ({ ...v, [rows.length]: false })); };
  const virar = (i: number) => setViradas((v) => ({ ...v, [i]: !v[i] }));
  const faltando = classicas.filter((c) => !rows.some((r) => norm(r[kO] || '') === norm(c)));
  const face = 'col-start-1 row-start-1 rounded-lg border p-3 space-y-2 [backface-visibility:hidden]';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map((r, i) => {
          const virada = !!viradas[i];
          return (
            <div key={i} className="[perspective:1000px]" data-testid={`carta-${i}`} data-virada={virada ? 'true' : 'false'}>
              <motion.div
                animate={{ rotateY: virada ? 180 : 0 }}
                transition={{ duration: reduzido ? 0 : 0.45, ease: 'easeInOut' }}
                style={{ transformStyle: 'preserve-3d' }}
                className="grid"
              >
                {/* frente: a objeção */}
                <div className={`${face} border-white/10 bg-white/[0.03]`} aria-hidden={virada}>
                  <div className="flex items-center justify-between gap-2">
                    <Rotulo>Objeção {i + 1}</Rotulo>
                    <BotaoIcone onClick={() => remove(i)} label={`Remover linha ${i + 1}`} disabled={rows.length <= 1} className="!min-h-[36px] !min-w-[36px] -mr-1"><IconeX /></BotaoIcone>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-serif text-3xl text-prosperus-gold-dark/70 leading-none select-none -mt-1" aria-hidden="true">“</span>
                    <Area
                      value={r[kO] || ''}
                      onChange={(e) => set(i, kO, e.target.value)}
                      rows={2}
                      aria-label={`${campo.nome}: linha ${i + 1}, ${cols[0]?.label || 'Objeção'}`}
                      placeholder="O que ele diz"
                      className="!bg-transparent !border-0 !px-0 !py-1 !min-h-0 font-serif italic !text-base !leading-snug"
                      tabIndex={virada ? -1 : undefined}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => virar(i)}
                    tabIndex={virada ? -1 : undefined}
                    className={`${TAP} w-full rounded-lg border border-prosperus-gold-dark/40 text-prosperus-gold-light text-sm font-sans font-semibold inline-flex items-center justify-center gap-2 hover:bg-prosperus-gold-dark/10 transition`}
                  >
                    <IconeVirar />
                    {(r[kR] || '').trim() ? 'Ver a resposta' : 'Virar e responder'}
                  </button>
                </div>
                {/* verso: a resposta */}
                <div className={`${face} border-prosperus-gold-dark/40 bg-prosperus-gold-dark/5 [transform:rotateY(180deg)]`} aria-hidden={!virada}>
                  <Rotulo className="!text-prosperus-gold-dark">{cols[1]?.label || 'O que você responde hoje'}</Rotulo>
                  <p className="text-xs text-white/60 font-serif italic leading-snug">“{(r[kO] || '').trim() || 'a objeção'}”</p>
                  <Area
                    value={r[kR] || ''}
                    onChange={(e) => set(i, kR, e.target.value)}
                    rows={3}
                    aria-label={`${campo.nome}: linha ${i + 1}, ${cols[1]?.label || 'O que você responde hoje'}`}
                    placeholder="Como você acolhe e responde hoje"
                    tabIndex={virada ? undefined : -1}
                  />
                  <button
                    type="button"
                    onClick={() => virar(i)}
                    tabIndex={virada ? undefined : -1}
                    className={`${TAP} w-full rounded-lg border border-white/15 text-white/70 text-sm font-sans inline-flex items-center justify-center gap-2 hover:bg-white/5 transition`}
                  >
                    <IconeVirar />
                    Voltar para a objeção
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
      {faltando.length > 0 && (
        <div className="space-y-1.5">
          <Rotulo>Clássicas que você pode ter ouvido: toque para adicionar</Rotulo>
          <div className="flex flex-wrap gap-2">
            {faltando.map((c) => <Chip key={c} selected={false} onClick={() => add(c)}>{c}</Chip>)}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Contador n={rows.filter((r) => (r[kO] || '').trim()).length} max={max} unidade="objeções" />
        {rows.length < max && <BotaoAdd onClick={() => add()}>+ Objeção</BotaoAdd>}
      </div>
    </div>
  );
};
