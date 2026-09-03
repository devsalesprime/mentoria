/**
 * 3.7 "Soluções que ele já tentou": a prateleira das alternativas que já estão na cabeça dele.
 * Cada solução é uma carta apoiada num filete dourado, com a etiqueta de preço ao lado.
 * A etiqueta vazia diz "em branco": o custo que ninguém sabe nunca vira número inventado.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { norm, type WidgetTemplate } from './estrutura';
import {
  BotaoAdd, BotaoIcone, Chip, Contador, Entrada, Etiqueta, Rotulo, VazioLido,
  lista, type DisplayProps, type WidgetProps,
} from './ui';
import { IconeX } from '../contexto/icones';

type Coluna = { key: string; label: string; tipo?: string; placeholder?: string };

const PADRAO: [Coluna, Coluna] = [
  { key: 'tentou', label: 'O que ele já tentou' },
  { key: 'custo', label: 'Quanto custa (se souber)', tipo: 'moeda' },
];

/** As duas colunas do template, com os padrões do 3.7 quando o JSON não trouxer. */
function colunas(t: WidgetTemplate): [Coluna, Coluna] {
  const cols: any[] = Array.isArray(t?.colunas) ? t.colunas : [];
  return [{ ...PADRAO[0], ...(cols[0] || {}) }, { ...PADRAO[1], ...(cols[1] || {}) }];
}

/** Grade das cartas: uma coluna no celular, sem estouro lateral. */
const GRADE = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';

/** A tábua: filete dourado sob as cartas, com a sombra curta de quem apoia. */
const Tabua: React.FC = () => (
  <div
    aria-hidden="true"
    className="border-b-2 border-prosperus-gold-dark/60 rounded-b-sm shadow-[0_6px_12px_-8px_rgba(202,154,67,0.75)]"
  />
);

/** Carta na prateleira (moldura comum ao modo leitura e ao modo edição). */
const CARTA = 'min-w-0 rounded-t-lg border border-b-0 border-white/10 bg-white/[0.03] p-3';

export const PrateleiraDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const [c0, c1] = colunas(template);
  const reduzido = useReducedMotion();
  const linhas = lista<Record<string, string>>(value?.linhas)
    .filter((r) => (r?.[c0.key] || '').trim() || (r?.[c1.key] || '').trim());
  if (!linhas.length) return <VazioLido />;
  return (
    <div>
      <div className={`${GRADE} pb-3`}>
        {linhas.map((r, i) => {
          const nome = (r[c0.key] || '').trim();
          const anima = reduzido
            ? {}
            : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.28, delay: Math.min(i * 0.05, 0.25) } };
          return (
            <motion.div key={i} data-testid="prateleira-carta" {...anima} className={`${CARTA} flex flex-col justify-between gap-2`}>
              <p className="min-w-0 break-words font-serif text-base leading-snug text-white">{nome || <VazioLido />}</p>
              <span className="min-w-0"><Etiqueta valor={r[c1.key]} /></span>
            </motion.div>
          );
        })}
      </div>
      <Tabua />
    </div>
  );
};

export const PrateleiraWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const [c0, c1] = colunas(template);
  const max: number = template?.max || 8;
  const sugeridas: string[] = Array.isArray(template?.chips) ? template.chips : [];
  const linhas = lista<Record<string, string>>(value?.linhas);
  const rows: Record<string, string>[] = linhas.length ? linhas : [{ [c0.key]: '', [c1.key]: '' }];

  const update = (next: Record<string, string>[]) => onChange({ ...value, linhas: next });
  const set = (i: number, k: string, v: string) => {
    const next = rows.map((r) => ({ ...r }));
    next[i][k] = v;
    update(next);
  };

  const jaEstao = new Set(rows.map((r) => norm(r[c0.key] || '')).filter(Boolean));
  const livres = sugeridas.filter((s) => !jaEstao.has(norm(s)));
  const preenchidas = rows.filter((r) => (r[c0.key] || '').trim() || (r[c1.key] || '').trim()).length;

  return (
    <div className="space-y-3">
      <div className={GRADE}>
        {rows.map((r, i) => (
          <div key={i} data-testid={`prateleira-editor-carta-${i}`} className={`${CARTA} space-y-2`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <Entrada
                  value={r[c0.key] || ''}
                  onChange={(e) => set(i, c0.key, e.target.value)}
                  aria-label={`${campo.nome}: linha ${i + 1}, ${c0.label}`}
                  placeholder={c0.placeholder || 'O que ele já tentou'}
                  className="!font-serif"
                />
                <Entrada
                  value={r[c1.key] || ''}
                  onChange={(e) => set(i, c1.key, e.target.value)}
                  aria-label={`${campo.nome}: linha ${i + 1}, ${c1.label}`}
                  prefixo="R$"
                  inputMode="decimal"
                  placeholder="0"
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
            <Etiqueta valor={r[c1.key]} />
          </div>
        ))}
      </div>
      <Tabua />

      {livres.length > 0 && rows.length < max && (
        <div className="space-y-1.5">
          <Rotulo>Toque para pôr na prateleira</Rotulo>
          <div className="flex flex-wrap gap-2">
            {livres.map((s) => (
              <Chip key={s} selected={false} onClick={() => update([...rows, { [c0.key]: s, [c1.key]: '' }])}>{s}</Chip>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Contador n={preenchidas} max={max} unidade="soluções" />
        {rows.length < max && (
          <BotaoAdd onClick={() => update([...rows, { [c0.key]: '', [c1.key]: '' }])}>+ Solução</BotaoAdd>
        )}
      </div>
    </div>
  );
};
