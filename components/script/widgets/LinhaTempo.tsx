/**
 * Linha do tempo do 2.2 (História de autoridade e 3 provas): a trajetória em marcos, um por linha,
 * descendo por um filete dourado, e embaixo o pódio das 3 provas (ouro, prata, bronze).
 *
 * Estrutura (base `historia_podio`): { historia, ouro, prata, bronze }. Os marcos são as linhas de
 * `historia`. Como o texto salvo volta pelo `splitLines`, linha em branco não vira marco; a edição
 * lê o texto cru para o índice não escorregar enquanto o mentor escreve.
 */
import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { splitLines } from './estrutura';
import { Area, BotaoAdd, BotaoIcone, Contador, Dica, DicaTeclado, Entrada, Numero, Rotulo, VazioLido, move, teclasLista, type DisplayProps, type WidgetProps } from './ui';
import { textoLimpo } from './vazio';
import { IconeMarco, IconeSeta, IconeX } from '../contexto/icones';

// Pódio sem emoji: numeral em serifa dentro de um círculo na cor da medalha
const MEDALHAS = [
  { key: 'ouro', label: 'Ouro', medal: '1', border: 'border-medal-gold/50', text: 'text-medal-gold', order: 'md:order-2', pad: 'md:pt-6' },
  { key: 'prata', label: 'Prata', medal: '2', border: 'border-medal-silver/50', text: 'text-medal-silver', order: 'md:order-1', pad: '' },
  { key: 'bronze', label: 'Bronze', medal: '3', border: 'border-medal-bronze/50', text: 'text-medal-bronze', order: 'md:order-3', pad: '' },
];

const MARCO_TXT = 'font-sans text-sm text-white/90 leading-relaxed whitespace-pre-line break-words';

const cru = (s: any): string[] => String(s ?? '').replace(/\r/g, '').split('\n');

/** Poda as linhas vazias do fim. */
function podar(ls: string[]): string[] {
  const n = ls.slice();
  while (n.length && !n[n.length - 1].trim()) n.pop();
  return n;
}

/** Texto de leitura: marcador ("a definir" e afins) conta como vazio. */
const Lido: React.FC<{ v?: any; className?: string }> = ({ v, className = '' }) => {
  const s = textoLimpo(typeof v === 'string' ? v : v == null ? '' : String(v));
  return s ? <p className={`${MARCO_TXT} ${className}`}>{s}</p> : <VazioLido />;
};

/** historia_podio (2.2) em leitura: os marcos na linha do tempo e as 3 provas no pódio. */
export const LinhaTempoDisplay: React.FC<DisplayProps> = ({ value }) => {
  const reduzido = useReducedMotion();
  const marcos = splitLines(value?.historia || '');
  return (
    <div className="space-y-4">
      {marcos.length > 0 && (
        <ol className="ml-3 border-l border-prosperus-gold-dark/40 space-y-3" data-testid="linha-tempo">
          {marcos.map((m, i) => (
            <motion.li
              key={i}
              data-testid={`marco-${i}`}
              className="relative min-w-0 pl-5"
              initial={reduzido ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduzido ? 0 : 0.3, delay: reduzido ? 0 : Math.min(i * 0.05, 0.3) }}
            >
              <span
                className="absolute -left-2 top-0.5 text-prosperus-gold-dark bg-prosperus-navy-mid rounded-full"
                aria-hidden="true"
              >
                <IconeMarco />
              </span>
              <p className={MARCO_TXT}>{m}</p>
            </motion.li>
          ))}
        </ol>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:items-end">
        {MEDALHAS.map((m) => (
          <div
            key={m.key}
            data-testid={`podio-${m.key}`}
            className={`bg-prosperus-navy-mid border ${m.border} rounded-lg p-3 flex md:flex-col items-start md:items-stretch gap-3 ${m.order} ${m.pad}`}
          >
            <span className={`w-9 h-9 md:mx-auto rounded-full border ${m.border} ${m.text} font-serif text-xl leading-none flex items-center justify-center shrink-0`} aria-hidden="true">{m.medal}</span>
            <div className="flex-1 min-w-0 space-y-1">
              <span className={`block text-xs font-semibold font-sans md:text-center ${m.text}`}>{m.label}</span>
              <div className="md:text-center"><Lido v={value?.[m.key]} /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** historia_podio (2.2) em edição: os marcos em lista e as 3 provas no pódio, com setas. */
export const LinhaTempoWidget: React.FC<WidgetProps> = ({ template, value, onChange }) => {
  const maxMarcos: number = template.maxMarcos || 8;

  const base = cru(value?.historia);
  const [minLinhas, setMinLinhas] = useState(1);
  const total = Math.max(1, base.length, minLinhas);
  const marcos: string[] = Array.from({ length: total }, (_, i) => base[i] || '');

  const emitir = (next: string[]) => onChange({ ...value, historia: podar(next).join('\n') });
  const set = (i: number, v: string) => emitir(marcos.map((m, j) => (j === i ? v : m)));
  const mover = (de: number, para: number) => {
    if (para < 0 || para >= marcos.length) return;
    setMinLinhas(Math.max(minLinhas, marcos.length));
    emitir(move(marcos, de, para));
  };
  const remover = (i: number) => {
    const next = marcos.filter((_, j) => j !== i);
    setMinLinhas(Math.max(1, next.length));
    emitir(next);
  };
  const adicionar = () => setMinLinhas(total + 1);

  /** Troca duas provas de degrau no pódio. */
  const trocar = (a: string, b: string) => onChange({ ...value, [a]: value?.[b] || '', [b]: value?.[a] || '' });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Rotulo>Sua história em marcos</Rotulo>
        <Dica>Um marco por linha: o que você viveu antes de ensinar isso.</Dica>
        <div className="space-y-2" data-lista>
          {marcos.map((m, i) => (
            <div
              key={i}
              data-item={i}
              className="flex items-start gap-1"
              onKeyDown={teclasLista({ i, total: marcos.length, onMover: mover, onAdd: adicionar })}
            >
              <div className="pt-2 shrink-0"><Numero n={i + 1} /></div>
              <div className="flex-1 min-w-0">
                <Entrada
                  value={m}
                  onChange={(e) => set(i, e.target.value)}
                  aria-label={`Marco ${i + 1}`}
                  placeholder="Um marco da sua trajetória"
                />
              </div>
              <div className="flex shrink-0">
                <BotaoIcone onClick={() => mover(i, i - 1)} label={`Subir marco ${i + 1}`} disabled={i === 0}><IconeSeta direcao="cima" /></BotaoIcone>
                <BotaoIcone onClick={() => mover(i, i + 1)} label={`Descer marco ${i + 1}`} disabled={i === marcos.length - 1}><IconeSeta direcao="baixo" /></BotaoIcone>
                <BotaoIcone onClick={() => remover(i)} label={`Remover marco ${i + 1}`} disabled={marcos.length <= 1}><IconeX /></BotaoIcone>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Contador n={marcos.length} min={3} max={5} unidade="marcos" />
          <DicaTeclado />
        </div>
        {marcos.length < maxMarcos && <BotaoAdd onClick={adicionar}>+ Marco</BotaoAdd>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:items-end">
        {MEDALHAS.map((m, idx) => (
          <div
            key={m.key}
            className={`bg-prosperus-navy-mid border ${m.border} rounded-lg p-3 space-y-2 ${m.order} ${m.pad}`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-9 h-9 rounded-full border ${m.border} ${m.text} font-serif text-xl leading-none flex items-center justify-center shrink-0`} aria-hidden="true">{m.medal}</span>
              <span className={`flex-1 min-w-0 text-xs font-semibold font-sans ${m.text}`}>{m.label}</span>
              <div className="flex shrink-0">
                <BotaoIcone
                  onClick={() => trocar(m.key, MEDALHAS[idx - 1].key)}
                  label={`Subir prova ${m.label}`}
                  disabled={idx === 0}
                >
                  <IconeSeta direcao="cima" />
                </BotaoIcone>
                <BotaoIcone
                  onClick={() => trocar(m.key, MEDALHAS[idx + 1].key)}
                  label={`Descer prova ${m.label}`}
                  disabled={idx === MEDALHAS.length - 1}
                >
                  <IconeSeta direcao="baixo" />
                </BotaoIcone>
              </div>
            </div>
            <Area
              value={value?.[m.key] || ''}
              onChange={(e) => onChange({ ...value, [m.key]: e.target.value })}
              rows={2}
              aria-label={`Prova ${m.label}`}
              placeholder="Uma conquista contada"
            />
          </div>
        ))}
      </div>
      <Dica>Resultados, não credenciais: "ajudei 200 clínicas a sair do balcão" vale mais que "MBA".</Dica>
    </div>
  );
};
