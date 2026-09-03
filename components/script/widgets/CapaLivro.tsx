/**
 * 4.1 "Nome e fio condutor": o método visto como capa de livro.
 * Moldura dourada dupla, o nome em serifa no centro, o filete e o fio condutor embaixo:
 * o que o cliente compra tem nome e tem promessa de A para B numa frase.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { WidgetTemplate } from './estrutura';
import { Area, Entrada, Rotulo, VazioLido, type DisplayProps, type WidgetProps } from './ui';
import { IconeLivro } from '../contexto/icones';

type CampoDef = { key: string; label: string; placeholder?: string };

const PADRAO: [CampoDef, CampoDef] = [
  { key: 'nome', label: 'Nome do método', placeholder: 'Ex.: Método Clínica Livre' },
  { key: 'fio', label: 'De A para B em 1 frase', placeholder: 'leva o dono do balcão para a cadeira de gestor' },
];

/** Os dois campos do template, com os padrões do 4.1 quando o JSON não trouxer. */
function campos(t: WidgetTemplate): [CampoDef, CampoDef] {
  const cs: any[] = Array.isArray(t?.campos) ? t.campos : [];
  return [{ ...PADRAO[0], ...(cs[0] || {}) }, { ...PADRAO[1], ...(cs[1] || {}) }];
}

/** Moldura da capa: borda dourada por fora, filete interno por dentro. */
const CAPA = 'mx-auto w-full max-w-[420px] min-w-0 rounded-lg border border-prosperus-gold-dark/60 bg-prosperus-navy p-2';
const MIOLO = 'min-w-0 rounded-md px-4 py-6 sm:px-6 sm:py-8 ring-1 ring-inset ring-prosperus-gold-dark/30';

/** Filete dourado curto entre o nome e o fio condutor. */
const Filete: React.FC = () => (
  <span aria-hidden="true" className="mx-auto block h-px w-16 bg-prosperus-gold-dark" />
);

/** Cabeçalho da capa: o glifo do livro e a palavra "Método" em versalete. */
const Selo: React.FC = () => (
  <span className="flex items-center justify-center gap-2 text-prosperus-gold-dark">
    <IconeLivro className="shrink-0" />
    <Rotulo className="!inline !text-prosperus-gold-dark tracking-[0.2em]">Método</Rotulo>
  </span>
);

export const CapaLivroDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const [c0, c1] = campos(template);
  const reduzido = useReducedMotion();
  const nome = (value?.[c0.key] || '').trim();
  const fio = (value?.[c1.key] || '').trim();
  const anima = reduzido
    ? {}
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } };
  return (
    <motion.div data-testid="capa-livro" {...anima} className={CAPA}>
      <div className={`${MIOLO} space-y-3 text-center`}>
        <Selo />
        {nome
          ? <p className="min-w-0 break-words font-serif text-2xl sm:text-3xl leading-tight text-prosperus-gold-light">{nome}</p>
          : <VazioLido />}
        <Filete />
        {fio && (
          <p className="min-w-0 break-words font-serif italic text-sm sm:text-base leading-relaxed text-white/85">{fio}</p>
        )}
      </div>
    </motion.div>
  );
};

export const CapaLivroWidget: React.FC<WidgetProps> = ({ template, value, onChange }) => {
  const [c0, c1] = campos(template);
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className={CAPA}>
      <div className={`${MIOLO} space-y-3 text-center`}>
        <Selo />
        <Entrada
          value={value?.[c0.key] || ''}
          onChange={(e) => set(c0.key, e.target.value)}
          aria-label={c0.label}
          placeholder={c0.placeholder || 'Ex.: Método Clínica Livre'}
          className="!font-serif !text-xl sm:!text-2xl !text-prosperus-gold-light text-center"
        />
        <Filete />
        <Area
          value={value?.[c1.key] || ''}
          onChange={(e) => set(c1.key, e.target.value)}
          rows={2}
          aria-label={c1.label}
          placeholder={c1.placeholder || 'leva o dono do balcão para a cadeira de gestor'}
          className="!font-serif italic text-center !text-white/85"
        />
      </div>
    </div>
  );
};
