/**
 * Prévia do script na tela: o cartão creme "Como isso aparece no seu script" por campo, o passo
 * rascunhado que cada bloco revela (interstício), os 7 capítulos (revelados × trancados) e a
 * coluna lateral do desktop. Navy é cockpit, creme é papel: o que vira script aparece em creme.
 */
import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ScriptBlockView, ScriptFieldView } from '../../../data/script-ficha-fields';
import type { Estrutura } from './estrutura';
import {
  META_SCRIPT, capitulosDoScript, linhasDaPrevia, previaDoCampo, previaDoScript, textoCapitulos, textoTrancado,
  type PassoScript, type PreviaResolvida,
} from './previa';
import { IconeCadeado, IconeCheck, IconeLivro, IconeSeta } from '../contexto/icones';

export const COPY_PREVIA_CAMPO = 'No seu script';
export const SELO_RASCUNHO = 'rascunho v0';

/** A frase resolvida: valores em negrito, lacunas como traço. */
export const FrasePrevia: React.FC<{ previa: PreviaResolvida; tom?: 'navy' | 'creme' }> = ({ previa, tom = 'navy' }) => (
  <>
    {previa.partes.map((p, i) => {
      if (p.tipo === 'texto') return <React.Fragment key={i}>{p.texto}</React.Fragment>;
      if (p.tipo === 'valor') return <span key={i} className={`font-semibold ${tom === 'navy' ? 'text-prosperus-navy' : 'text-prosperus-gold-light'}`} data-parte="valor">{p.texto}</span>;
      return <span key={i} className={`inline-block min-w-[3ch] border-b ${tom === 'navy' ? 'border-prosperus-navy/40' : 'border-white/40'} mx-0.5 align-baseline`} aria-label="lacuna" data-parte="lacuna">&nbsp;</span>;
    })}
  </>
);

interface PreviaCampoProps {
  campo: ScriptFieldView;
  /** Estrutura do editor ao vivo (enquanto o mentor digita). */
  estrutura?: Estrutura | null;
  /** Texto do rascunho (campo sem widget) ao vivo. */
  texto?: string;
  /** 'sugerido' lê a sugestão; 'atual' o que vale hoje. */
  modo?: 'sugerido' | 'atual';
  contexto?: Record<string, ScriptFieldView>;
  /** Em edição a frase aparece mesmo com lacunas (elas guiam o preenchimento). */
  editing?: boolean;
  className?: string;
}

/** (e) Uma linha por campo, em itálico: "No seu script" e a frase com o valor de agora (sem caixa). */
export const PreviaCampo: React.FC<PreviaCampoProps> = ({ campo, estrutura, texto, modo = 'atual', contexto, editing = false, className = '' }) => {
  const reduzido = useReducedMotion();
  const previa = useMemo(
    () => previaDoCampo(campo, { estrutura: estrutura || undefined, texto, modo, contexto }),
    [campo, estrutura, texto, modo, contexto],
  );
  if (!previa) return null;
  if (!previa.algum && !editing) return null;
  return (
    <motion.p
      key={`${campo.key}-${campo.status}`}
      initial={reduzido ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.4 }}
      className={`font-serif italic text-base sm:text-lg text-white/75 leading-snug border-l-2 border-prosperus-gold-dark/40 pl-3 ${className}`}
      data-testid={`previa-${campo.key}`}
      data-preenchida={previa.preenchida ? 'true' : 'false'}
    >
      <span className="not-italic font-sans text-[10px] uppercase tracking-widest text-prosperus-gold-dark mr-2 align-middle">{COPY_PREVIA_CAMPO}</span>
      <span data-testid={`previa-texto-${campo.key}`}>
        <FrasePrevia previa={previa} tom="creme" />
      </span>
    </motion.p>
  );
};

/** Selo "rascunho v0". */
const Selo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-prosperus-gold-dark/50 text-prosperus-gold-dark font-sans whitespace-nowrap">{children}</span>
);

interface PreviaPassoProps {
  passo: PassoScript;
  contexto: Record<string, ScriptFieldView>;
  /** O bloco que revela o passo já fechou. */
  fechado: boolean;
  max?: number;
  /** Só campos decididos (padrão). */
  soDecididos?: boolean;
}

/** Passo rascunhado em creme: as frases entram linha a linha (3 a 5), com o selo "rascunho v0". */
export const PreviaPasso: React.FC<PreviaPassoProps> = ({ passo, contexto, fechado, max = 5, soDecididos = true }) => {
  const reduzido = useReducedMotion();
  const linhas = useMemo(() => linhasDaPrevia(passo.campos, contexto, { max, soDecididos }), [passo, contexto, max, soDecididos]);
  return (
    <section
      className="space-y-2 border-t border-prosperus-navy/10 pt-3 first:border-0 first:pt-0"
      data-testid={`previa-passo-${passo.n}`}
      aria-label={`Passo ${passo.n}: ${passo.nome}`}
    >
      <header className="flex items-center justify-between gap-2">
        <p className="font-serif text-lg text-prosperus-navy">Passo {passo.n} · {passo.nome}</p>
        <Selo>{SELO_RASCUNHO}</Selo>
      </header>
      {linhas.length > 0 ? (
        <ol className="space-y-1.5">
          {linhas.map((l, i) => (
            <motion.li
              key={l.key}
              initial={{ opacity: 0, y: reduzido ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduzido ? 0 : Math.min(i * 0.12, 0.6), duration: 0.35 }}
              className="font-serif text-base text-prosperus-navy/90 leading-snug"
              data-testid={`previa-linha-${l.key}`}
            >
              <FrasePrevia previa={l.previa} />
            </motion.li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-prosperus-navy/60 font-sans">
          {fechado ? 'Este passo ainda não tem frases: os campos ficaram em branco.' : 'As frases entram aqui conforme você decide os campos do bloco.'}
        </p>
      )}
    </section>
  );
};

/** A meta (bloco 1) em uma linha no alto da prévia. */
export const PreviaMeta: React.FC<{ contexto: Record<string, ScriptFieldView>; className?: string }> = ({ contexto, className = '' }) => {
  const linhas = useMemo(() => linhasDaPrevia(META_SCRIPT.campos, contexto, { max: 2 }), [contexto]);
  if (!linhas.length) return null;
  return (
    <p className={`font-serif italic text-base text-prosperus-navy/85 leading-snug ${className}`} data-testid="previa-meta">
      {linhas.map((l, i) => (
        <React.Fragment key={l.key}>{i > 0 && ' '}<FrasePrevia previa={l.previa} /></React.Fragment>
      ))}
    </p>
  );
};

/** Os 7 capítulos: revelados (bloco fechado) com o check, trancados com o cadeado e "abre com o bloco X". */
export const CapitulosScript: React.FC<{ blocos: ScriptBlockView[]; tom?: 'navy' | 'creme'; className?: string }> = ({ blocos, tom = 'creme', className = '' }) => {
  const caps = useMemo(() => capitulosDoScript(blocos), [blocos]);
  const creme = tom === 'creme';
  return (
    <ol className={`grid grid-cols-1 sm:grid-cols-2 gap-1.5 ${className}`} aria-label="Capítulos do seu script" data-testid="capitulos-script">
      {caps.map((c) => (
        <li
          key={c.n}
          data-revelado={c.revelado ? 'true' : 'false'}
          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
            c.revelado
              ? creme ? 'border-prosperus-gold-dark/50 bg-white/70 text-prosperus-navy' : 'border-prosperus-gold-dark/50 bg-prosperus-gold-dark/10 text-white'
              : creme ? 'border-prosperus-navy/10 text-prosperus-navy/50' : 'border-white/10 text-white/45'
          }`}
        >
          <span className={`shrink-0 ${c.revelado ? 'text-prosperus-gold-dark' : ''}`}>
            {c.revelado ? <IconeCheck title="Revelado" /> : <IconeCadeado title="Trancado" />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-serif text-sm leading-tight">Passo {c.n} · {c.nome}</span>
            <span className="block text-[10px] font-sans leading-tight">{c.revelado ? 'já tem a sua voz' : `abre com o bloco ${c.bloco} · ${c.blocoNome}`}</span>
          </span>
        </li>
      ))}
    </ol>
  );
};

export const COPY_PREVIA_SCRIPT = 'Prévia do seu script';

interface PreviaCapitulosProps {
  blocos: ScriptBlockView[];
  contexto: Record<string, ScriptFieldView>;
  /** Toque num capítulo trancado leva ao bloco que o abre. */
  onIrParaBloco?: (bloco: number) => void;
  max?: number;
  className?: string;
}

/**
 * A prévia inteira em papel creme: a meta no alto, os capítulos revelados com as frases rascunhadas
 * e os trancados só com o nome e "abre com o bloco X". Usada no painel do passo a passo e na coluna lateral.
 */
export const PreviaCapitulos: React.FC<PreviaCapitulosProps> = ({ blocos, contexto, onIrParaBloco, max = 5, className = '' }) => {
  const previa = useMemo(() => previaDoScript(blocos, contexto, max), [blocos, contexto, max]);
  return (
    <div className={`space-y-3 ${className}`} data-testid="previa-capitulos" data-revelados={previa.revelados}>
      <p className="text-sm text-prosperus-navy/70 font-sans" data-testid="previa-capitulos-contagem">{textoCapitulos(previa.revelados, previa.total)}</p>
      {previa.meta.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-prosperus-navy/50 font-sans">No alto do script</p>
          <PreviaMeta contexto={contexto} />
        </div>
      )}
      {previa.capitulos.map((c) => (
        c.revelado ? (
          <PreviaPasso key={c.n} passo={c} contexto={contexto} fechado max={max} />
        ) : (
          <div key={c.n} className="flex items-center gap-2 rounded-lg border border-prosperus-navy/10 px-3 py-2 text-prosperus-navy/50" data-testid={`previa-trancada-${c.n}`}>
            <IconeCadeado title="Trancado" />
            <span className="flex-1 min-w-0">
              <span className="block font-serif text-sm">Passo {c.n} · {c.nome}</span>
              <span className="block text-[10px] font-sans">{textoTrancado(c)}</span>
            </span>
            {onIrParaBloco && (
              <button
                type="button"
                onClick={() => onIrParaBloco(c.bloco)}
                aria-label={`Ir para o bloco ${c.bloco}`}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded text-prosperus-navy/60 hover:text-prosperus-navy hover:bg-prosperus-navy/5 transition"
              >
                <IconeSeta direcao="dir" />
              </button>
            )}
          </div>
        )
      ))}
    </div>
  );
};

/** Coluna lateral (desktop largo): a prévia inteira em creme, capítulo a capítulo. */
export const PreviaLateral: React.FC<{ blocos: ScriptBlockView[]; contexto: Record<string, ScriptFieldView> }> = ({ blocos, contexto }) => (
  <aside className="hidden xl:block" aria-label={COPY_PREVIA_SCRIPT} data-testid="previa-lateral">
    <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg bg-prosperus-neutral-white text-prosperus-navy p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-prosperus-gold-dark"><IconeLivro /></span>
        <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">{COPY_PREVIA_SCRIPT}</p>
      </div>
      <PreviaCapitulos blocos={blocos} contexto={contexto} max={4} />
    </div>
  </aside>
);
