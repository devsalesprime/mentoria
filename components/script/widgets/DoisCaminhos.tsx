/**
 * 6.5 "Próximo passo padrão": os dois caminhos que saem da mesa.
 * À esquerda o "sim", em degraus numerados (um passo por linha); à direita o "vou pensar",
 * que só fecha com data e hora do retorno.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { splitLines, norm, type WidgetTemplate } from './estrutura';
import {
  Area, BotaoAdd, BotaoIcone, Chip, Entrada, Numero, Rotulo, VazioLido,
  move, teclasLista, type DisplayProps, type WidgetProps,
} from './ui';
import { IconeCalendario, IconeSeta, IconeX } from '../contexto/icones';

type CampoDef = { key: string; label: string; placeholder?: string };

const PADRAO: [CampoDef, CampoDef] = [
  { key: 'sim', label: 'Depois do sim', placeholder: 'contrato, dados, pagamento, início' },
  { key: 'pensar', label: "Depois do 'vou pensar'", placeholder: 'data e hora do retorno' },
];

const PASSOS_PADRAO = ['contrato', 'dados', 'pagamento', 'início'];

/** Os dois campos do template, com os padrões do 6.5 quando o JSON não trouxer. */
function campos(t: WidgetTemplate): [CampoDef, CampoDef] {
  const cs: any[] = Array.isArray(t?.campos) ? t.campos : [];
  return [{ ...PADRAO[0], ...(cs[0] || {}) }, { ...PADRAO[1], ...(cs[1] || {}) }];
}

/** Texto do "sim" em passos: uma linha por passo, sempre pelo menos um. */
function partir(s: any): string[] {
  const ls = (typeof s === 'string' ? s : '').replace(/\r/g, '').split('\n');
  return ls.length ? ls : [''];
}

/** Passos de volta em texto: cada passo aparado, os vazios do fim descartados. */
function juntar(passos: string[]): string {
  const a = passos.map((p) => (p || '').trim());
  while (a.length && !a[a.length - 1]) a.pop();
  return a.join('\n');
}

export const DoisCaminhosDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const [cSim, cPensar] = campos(template);
  const reduzido = useReducedMotion();
  const passos = splitLines(value?.[cSim.key] || '');
  const pensar = (value?.[cPensar.key] || '').trim();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
      <div data-testid="caminho-sim" className="min-w-0 space-y-2">
        <Rotulo className="!text-prosperus-gold-dark">{cSim.label}</Rotulo>
        {passos.length ? (
          <ol className="relative ml-3.5 space-y-3 border-l border-prosperus-gold-dark/30">
            {passos.map((p, i) => {
              const anima = reduzido
                ? {}
                : { initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.25, delay: Math.min(i * 0.05, 0.25) } };
              return (
                <motion.li key={i} data-testid="caminho-sim-passo" {...anima} className="relative min-w-0 pl-6">
                  <span className="absolute -left-[15px] top-0"><Numero n={i + 1} /></span>
                  <p className="min-w-0 break-words pt-1 font-sans text-sm sm:text-base leading-snug text-white/90">{p}</p>
                </motion.li>
              );
            })}
          </ol>
        ) : (
          <VazioLido />
        )}
      </div>

      <div data-testid="caminho-pensar" className="min-w-0">
        <div className="min-w-0 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <span className="flex items-center gap-2">
            <IconeCalendario className="shrink-0 text-prosperus-gold-dark" />
            <Rotulo>{cPensar.label}</Rotulo>
          </span>
          {pensar ? (
            <p className="min-w-0 whitespace-pre-line break-words font-sans text-sm sm:text-base leading-relaxed text-white/90">{pensar}</p>
          ) : (
            <VazioLido />
          )}
        </div>
      </div>
    </div>
  );
};

export const DoisCaminhosWidget: React.FC<WidgetProps> = ({ template, value, onChange }) => {
  const [cSim, cPensar] = campos(template);
  const max: number = template?.max || 8;
  const sugeridos: string[] = Array.isArray(template?.passos) ? template.passos : PASSOS_PADRAO;
  const texto: string = typeof value?.[cSim.key] === 'string' ? value[cSim.key] : '';

  const [passos, setPassos] = React.useState<string[]>(() => partir(texto));
  React.useEffect(() => {
    setPassos((atual) => (juntar(atual) === juntar(partir(texto)) ? atual : partir(texto)));
  }, [texto]);

  const aplicar = (next: string[]) => {
    setPassos(next);
    onChange({ ...value, [cSim.key]: juntar(next) });
  };
  const set = (i: number, v: string) => {
    const next = passos.slice();
    next[i] = v;
    aplicar(next);
  };
  /** Chip: preenche o passo em branco do fim ou entra como novo passo. */
  const adicionar = (txt: string) => {
    const next = passos.slice();
    const ultimo = next.length - 1;
    if (ultimo >= 0 && !next[ultimo].trim()) next[ultimo] = txt;
    else if (next.length < max) next.push(txt);
    else return;
    aplicar(next);
  };

  const jaEstao = new Set(passos.map((p) => norm(p)).filter(Boolean));
  const livres = sugeridos.filter((s) => !jaEstao.has(norm(s)));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="min-w-0 space-y-2" data-lista="passos-do-sim">
        <Rotulo className="!text-prosperus-gold-dark">{cSim.label}</Rotulo>
        <ol className="space-y-2">
          {passos.map((p, i) => (
            <li
              key={i}
              data-item={i}
              className="flex min-w-0 items-center gap-2"
              onKeyDown={teclasLista({
                i,
                total: passos.length,
                onMover: (de, para) => aplicar(move(passos, de, para)),
                onAdd: () => { if (passos.length < max) aplicar([...passos, '']); },
              })}
            >
              <Numero n={i + 1} />
              <div className="min-w-0 flex-1">
                <Entrada
                  value={p}
                  onChange={(e) => set(i, e.target.value)}
                  aria-label={`${cSim.label}: passo ${i + 1}`}
                  placeholder="O que acontece depois do sim"
                />
              </div>
              <div className="flex shrink-0 gap-0.5">
                <BotaoIcone onClick={() => aplicar(move(passos, i, i - 1))} label={`Subir passo ${i + 1}`} disabled={i === 0} className="!min-w-[40px] px-1">
                  <IconeSeta direcao="cima" />
                </BotaoIcone>
                <BotaoIcone onClick={() => aplicar(move(passos, i, i + 1))} label={`Descer passo ${i + 1}`} disabled={i === passos.length - 1} className="!min-w-[40px] px-1">
                  <IconeSeta direcao="baixo" />
                </BotaoIcone>
                <BotaoIcone onClick={() => aplicar(passos.filter((_, k) => k !== i))} label={`Remover passo ${i + 1}`} disabled={passos.length <= 1} className="!min-w-[40px] px-1">
                  <IconeX />
                </BotaoIcone>
              </div>
            </li>
          ))}
        </ol>

        {livres.length > 0 && passos.length < max && (
          <div className="space-y-1.5">
            <Rotulo>Toque para adicionar</Rotulo>
            <div className="flex flex-wrap gap-2">
              {livres.map((s) => <Chip key={s} selected={false} onClick={() => adicionar(s)}>{s}</Chip>)}
            </div>
          </div>
        )}
        {passos.length < max && <BotaoAdd onClick={() => aplicar([...passos, ''])}>+ Passo</BotaoAdd>}
      </div>

      <div className="min-w-0 space-y-2">
        <span className="flex items-center gap-2">
          <IconeCalendario className="shrink-0 text-prosperus-gold-dark" />
          <Rotulo>{cPensar.label}</Rotulo>
        </span>
        <Area
          value={value?.[cPensar.key] || ''}
          onChange={(e) => onChange({ ...value, [cPensar.key]: e.target.value })}
          rows={3}
          aria-label={cPensar.label}
          placeholder={cPensar.placeholder || 'data e hora do retorno'}
        />
      </div>
    </div>
  );
};
