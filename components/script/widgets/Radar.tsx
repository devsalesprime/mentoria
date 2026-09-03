/**
 * 5.6 "Retorno não financeiro": os oito retornos como um radar. Cada eixo é um ganho além do
 * dinheiro; marcar acende o eixo e o polígono se abre até a borda.
 *
 * O SVG é a figura; quem comanda são os chips embaixo (é neles que mora o estado acessível).
 * Os rótulos do radar também respondem ao toque, mas nunca viram botão.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { norm } from './estrutura';
import { Area, Chip, lista, type DisplayProps, type WidgetProps } from './ui';

const CX = 130;
const CY = 130;
const R_BORDA = 96;
const R_DENTRO = 14;
const R_ROTULO = 118;
const ANEIS = [32, 64, 96];

function ponto(r: number, i: number, n: number): { x: number; y: number; cos: number } {
  const ang = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
  return { x: CX + r * Math.cos(ang), y: CY + r * Math.sin(ang), cos: Math.cos(ang) };
}

const coord = (p: { x: number; y: number }) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

/** Ancoragem do rótulo pelo ângulo: em cima e embaixo centraliza, à direita começa, à esquerda termina. */
function ancora(cos: number): 'middle' | 'start' | 'end' {
  if (Math.abs(cos) < 0.2) return 'middle';
  return cos > 0 ? 'start' : 'end';
}

export const RadarSVG: React.FC<{ eixos: string[]; marcados: string[]; onToggle?: (eixo: string) => void; className?: string }> = ({ eixos, marcados, onToggle, className = '' }) => {
  const reduzido = useReducedMotion();
  const n = eixos.length;
  const aceso = (e: string) => marcados.some((m) => norm(m) === norm(e));
  const pontos = eixos.map((e, i) => coord(ponto(aceso(e) ? R_BORDA : R_DENTRO, i, n))).join(' ');
  const editavel = typeof onToggle === 'function';
  const acesos = eixos.filter(aceso);
  return (
    <svg
      viewBox="0 0 260 260"
      className={`w-full h-auto max-w-[320px] mx-auto overflow-visible text-white ${className}`}
      data-testid="radar-svg"
      aria-hidden={editavel ? 'true' : undefined}
      role={editavel ? undefined : 'img'}
      aria-label={editavel ? undefined : `Radar: ${acesos.length ? acesos.join(', ') : 'em branco'}`}
    >
      {ANEIS.map((r) => (
        <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />
      ))}
      {eixos.map((e, i) => {
        const p = ponto(R_BORDA, i, n);
        return <line key={`eixo-${i}`} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="currentColor" strokeOpacity={0.14} strokeWidth={1} />;
      })}
      {n > 2 && (
        <motion.polygon
          initial={false}
          points={pontos}
          animate={{ points: pontos }}
          transition={{ duration: reduzido ? 0 : 0.4, ease: 'easeOut' }}
          fill="#CA9A43"
          fillOpacity={0.25}
          stroke="#CA9A43"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      {eixos.map((e, i) => {
        const p = ponto(R_ROTULO, i, n);
        const on = aceso(e);
        return (
          <text
            key={`rotulo-${i}`}
            data-testid={`radar-eixo-${i}`}
            data-selected={on ? 'true' : 'false'}
            x={p.x}
            y={p.y}
            fontSize={10}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            textAnchor={ancora(p.cos)}
            dominantBaseline="middle"
            fill={on ? '#FFDA71' : 'rgba(255,255,255,0.6)'}
            className={editavel ? 'cursor-pointer select-none' : 'select-none'}
            onClick={editavel ? () => onToggle!(e) : undefined}
          >
            {e}
          </text>
        );
      })}
    </svg>
  );
};

/** Chip só de leitura: aceso em dourado, os demais apagados. */
const ChipLido: React.FC<{ selected: boolean; children: React.ReactNode }> = ({ selected, children }) => (
  <span
    data-selected={selected ? 'true' : 'false'}
    className={`inline-flex items-center min-h-[36px] px-3.5 py-1.5 rounded-full text-sm font-sans border ${
      selected ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark font-semibold' : 'border-white/10 text-white/35'
    }`}
  >
    {children}
  </span>
);

export const RadarDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const fixos: string[] = Array.isArray(template?.chips) ? template.chips : [];
  const marcados = lista<string>(value?.chips).filter(Boolean);
  const todos = [...fixos, ...marcados.filter((c) => !fixos.includes(c))];
  const texto = typeof value?.texto === 'string' ? value.texto.trim() : '';
  return (
    <div className="space-y-3">
      {todos.length > 0 && <RadarSVG eixos={fixos.length ? fixos : todos} marcados={marcados} />}
      {todos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {todos.map((c) => <ChipLido key={c} selected={marcados.includes(c)}>{c}</ChipLido>)}
        </div>
      )}
      {texto && <p className="text-sm sm:text-base text-white/90 font-sans leading-relaxed whitespace-pre-line">{texto}</p>}
    </div>
  );
};

export const RadarWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const eixos: string[] = Array.isArray(template?.chips) ? template.chips : [];
  const marcados = lista<string>(value?.chips).filter(Boolean);
  const toggle = (c: string) => {
    const proximos = new Set(marcados);
    if (proximos.has(c)) proximos.delete(c); else proximos.add(c);
    const extras = marcados.filter((x) => !eixos.includes(x) && proximos.has(x));
    onChange({ ...value, chips: eixos.filter((e) => proximos.has(e)).concat(extras) });
  };
  return (
    <div className="space-y-3">
      {eixos.length > 0 && <RadarSVG eixos={eixos} marcados={marcados} onToggle={toggle} />}
      {eixos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {eixos.map((c) => <Chip key={c} selected={marcados.includes(c)} onClick={() => toggle(c)}>{c}</Chip>)}
        </div>
      )}
      <Area
        value={value?.texto || ''}
        onChange={(e) => onChange({ ...value, texto: e.target.value })}
        rows={3}
        aria-label={`Editar ${campo.nome}`}
        placeholder="Complete com as suas palavras"
      />
    </div>
  );
};
