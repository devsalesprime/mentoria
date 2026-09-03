/**
 * Balança do 2.3 (Diferencial): "O mercado faz" x "Eu faço", par a par. O prato dourado é o seu;
 * quanto mais pares com resposta sua, mais a viga inclina para o seu lado.
 *
 * Estrutura (base `vs`): { mercado, eu }, os dois multilinha. O par i é a linha i de cada lado,
 * então os dois textos andam sempre com o mesmo número de linhas (lado sem texto vira '' para o
 * índice não escorregar).
 *
 * GOTCHA aceito: linha em branco no MEIO some ao recarregar, porque o texto salvo volta pelo
 * `splitLines`, que descarta linha vazia. Dentro da sessão o alinhamento se mantém (a edição lê o
 * texto cru, sem filtrar), e só o par do fim é podado quando os dois lados estão vazios.
 */
import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { splitLines, type Estrutura } from './estrutura';
import { Area, BotaoAdd, BotaoIcone, Contador, Rotulo, VazioLido, type DisplayProps, type WidgetProps } from './ui';
import { IconeX } from '../contexto/icones';

export interface Par { esq: string; dir: string }

const TXT = 'font-sans text-sm text-white/90 leading-relaxed whitespace-pre-line break-words';

const parear = (esq: string[], dir: string[]): Par[] => {
  const n = Math.max(esq.length, dir.length);
  return Array.from({ length: n }, (_, i) => ({ esq: esq[i] || '', dir: dir[i] || '' }));
};

/** Pares do texto salvo (leitura): linha em branco não vira par. */
export const paresLidos = (v: Estrutura): Par[] => parear(splitLines(v?.mercado || ''), splitLines(v?.eu || ''));

/** Pares da edição: texto cru, para a linha em branco do meio não desalinhar os índices. */
const cru = (s: any): string[] => String(s ?? '').replace(/\r/g, '').split('\n');
const paresEditados = (v: Estrutura): Par[] => parear(cru(v?.mercado), cru(v?.eu));

const vazio = (): Par => ({ esq: '', dir: '' });

/** Sem par: reta. Com pares: 0 a 8 graus, na proporção dos pares que já têm a sua resposta. */
export function inclinacao(pares: Par[]): number {
  if (!pares.length) return 0;
  const cheios = pares.filter((p) => p.dir.trim()).length;
  return Math.round((8 * cheios) / pares.length);
}

/** Poda os pares do fim em que os dois lados estão vazios. */
function podar(ps: Par[]): Par[] {
  const n = ps.slice();
  while (n.length && !n[n.length - 1].esq.trim() && !n[n.length - 1].dir.trim()) n.pop();
  return n;
}

/**
 * A viga: pivô ao centro, prato branco à esquerda (o mercado) e prato dourado à direita (você).
 * Gira em torno do pivô até 8 graus, em 0,5 s (sem movimento quando o sistema pede menos).
 */
const Viga: React.FC<{ esquerda: string; direita: string; inclina: number }> = ({ esquerda, direita, inclina }) => {
  const reduzido = useReducedMotion();
  return (
    <svg
      viewBox="0 0 320 80"
      className="w-full h-auto max-w-[360px] mx-auto text-white/25"
      role="img"
      aria-label={`Balança: ${esquerda} de um lado, ${direita} do outro`}
    >
      {/* chão e pivô */}
      <line x1="124" y1="60" x2="196" y2="60" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M147 60 L160 26 L173 60 Z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />

      <motion.g
        animate={{ rotate: -inclina }}
        transition={reduzido ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
        style={{ transformBox: 'view-box', transformOrigin: '160px 26px' }}
      >
        <g className="text-prosperus-gold-dark">
          <line x1="50" y1="26" x2="270" y2="26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="160" cy="26" r="3.5" fill="currentColor" />
        </g>
        {/* prato do mercado */}
        <g className="text-white/40">
          <line x1="50" y1="26" x2="50" y2="38" stroke="currentColor" strokeWidth="1.2" />
          <path d="M34 38 H66 A16 16 0 0 1 34 38 Z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" />
        </g>
        {/* prato do mentor */}
        <g className="text-prosperus-gold-dark">
          <line x1="270" y1="26" x2="270" y2="38" stroke="currentColor" strokeWidth="1.2" />
          <path d="M254 38 H286 A16 16 0 0 1 254 38 Z" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.2" />
        </g>
      </motion.g>

      <text x="50" y="76" textAnchor="middle" fill="currentColor" className="text-white/50 font-sans" fontSize="8">{esquerda}</text>
      <text x="160" y="76" textAnchor="middle" fill="currentColor" className="text-prosperus-gold-light font-sans" fontSize="11" fontWeight="700">VS</text>
      <text x="270" y="76" textAnchor="middle" fill="currentColor" className="text-prosperus-gold-dark font-sans" fontSize="8">{direita}</text>
    </svg>
  );
};

/** vs (2.3) em leitura: a viga inclinada e os pares lado a lado. */
export const BalancaDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const esquerda: string = template.esquerda || 'O mercado faz';
  const direita: string = template.direita || 'Eu faço';
  const pares = paresLidos(value || {});
  const inclina = inclinacao(pares);
  return (
    <div className="space-y-3" data-testid="balanca" data-inclina={inclina}>
      <Viga esquerda={esquerda} direita={direita} inclina={inclina} />
      {pares.length === 0 ? (
        <VazioLido />
      ) : (
        <div className="space-y-2">
          {pares.map((p, i) => (
            <div
              key={i}
              data-testid={`balanca-par-${i}`}
              className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-stretch"
            >
              <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-3 space-y-1">
                <Rotulo>{esquerda}</Rotulo>
                {p.esq.trim() ? <p className={TXT}>{p.esq}</p> : <VazioLido />}
              </div>
              <div className="hidden sm:flex items-center justify-center text-white/25 font-sans text-sm" aria-hidden="true">&#215;</div>
              <div className="min-w-0 rounded-lg border border-prosperus-gold-dark/30 bg-prosperus-gold-dark/5 p-3 space-y-1">
                <Rotulo className="!text-prosperus-gold-dark">{direita}</Rotulo>
                {p.dir.trim() ? <p className={TXT}>{p.dir}</p> : <VazioLido />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** vs (2.3) em edição: a viga ao vivo e um par por linha. */
export const BalancaWidget: React.FC<WidgetProps> = ({ template, value, onChange }) => {
  const esquerda: string = template.esquerda || 'O mercado faz';
  const direita: string = template.direita || 'Eu faço';
  const max: number = template.max || 6;

  const base = paresEditados(value || {});
  const [minLinhas, setMinLinhas] = useState(1);
  const total = Math.max(1, base.length, minLinhas);
  const rows: Par[] = Array.from({ length: total }, (_, i) => base[i] || vazio());

  const emitir = (next: Par[]) => {
    const p = podar(next);
    onChange({ ...value, mercado: p.map((x) => x.esq).join('\n'), eu: p.map((x) => x.dir).join('\n') });
  };
  const set = (i: number, lado: 'esq' | 'dir', v: string) => {
    emitir(rows.map((r, j) => (j !== i ? r : lado === 'esq' ? { esq: v, dir: r.dir } : { esq: r.esq, dir: v })));
  };
  const remover = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    setMinLinhas(Math.max(1, next.length));
    emitir(next);
  };
  const adicionar = () => setMinLinhas(total + 1);

  return (
    <div className="space-y-3">
      <Viga esquerda={esquerda} direita={direita} inclina={inclinacao(rows)} />
      <div className="space-y-2">
        {rows.map((p, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 sm:p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Rotulo>Par {i + 1}</Rotulo>
              <BotaoIcone onClick={() => remover(i)} label={`Remover par ${i + 1}`} disabled={rows.length <= 1}>
                <IconeX />
              </BotaoIcone>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-start">
              <div className="min-w-0 space-y-1">
                <Rotulo>{esquerda}</Rotulo>
                <Area
                  value={p.esq}
                  onChange={(e) => set(i, 'esq', e.target.value)}
                  rows={2}
                  aria-label={`${esquerda} ${i + 1}`}
                  placeholder="O padrão do seu mercado"
                />
              </div>
              <div className="hidden sm:flex items-start justify-center pt-7 text-white/25 font-sans text-sm" aria-hidden="true">&#215;</div>
              <div className="min-w-0 space-y-1">
                <Rotulo className="!text-prosperus-gold-dark">{direita}</Rotulo>
                <Area
                  value={p.dir}
                  onChange={(e) => set(i, 'dir', e.target.value)}
                  rows={2}
                  aria-label={`${direita} ${i + 1}`}
                  placeholder="O que você faz diferente"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Contador n={rows.length} max={max} unidade="pares" />
      </div>
      {rows.length < max && <BotaoAdd onClick={adicionar}>+ Par</BotaoAdd>}
    </div>
  );
};
