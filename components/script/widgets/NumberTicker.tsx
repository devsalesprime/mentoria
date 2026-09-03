/**
 * Contador que "roda" até o número novo (faltam 12 → 11). Sem dependência: requestAnimationFrame
 * com easing, ≤ 600 ms; com `prefers-reduced-motion` (ou sem rAF) troca na hora.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export const TICKER_MS = 500;

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useNumberTicker(value: number, duracaoMs = TICKER_MS): number {
  const reduzido = useReducedMotion();
  const [mostrado, setMostrado] = useState(value);
  const anteriorRef = useRef(value);

  useEffect(() => {
    const de = anteriorRef.current;
    anteriorRef.current = value;
    if (de === value) return;
    const raf = typeof window !== 'undefined' ? window.requestAnimationFrame : undefined;
    if (reduzido || typeof raf !== 'function' || duracaoMs <= 0) { setMostrado(value); return; }
    let id = 0;
    let inicio = 0;
    const passo = (agora: number) => {
      if (!inicio) inicio = agora;
      const t = Math.min(1, (agora - inicio) / duracaoMs);
      const atual = Math.round(de + (value - de) * easeOut(t));
      setMostrado(atual);
      if (t < 1) id = window.requestAnimationFrame(passo); else setMostrado(value);
    };
    id = window.requestAnimationFrame(passo);
    return () => { if (id && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(id); };
  }, [value, duracaoMs, reduzido]);

  return mostrado;
}

export const NumberTicker: React.FC<{ value: number; duracaoMs?: number; className?: string; testId?: string }> = ({ value, duracaoMs = TICKER_MS, className = '', testId }) => {
  const n = useNumberTicker(value, duracaoMs);
  return <span className={`tabular-nums ${className}`} data-testid={testId} data-alvo={value}>{n}</span>;
};
