import React, { useState } from 'react';
import { COMO_FUNCIONA_PASSOS, COMO_FUNCIONA_FRASE } from './categorias';

const STORAGE_KEY = 'script_materiais_como_funciona_fechado';

function readClosed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeClosed(closed: boolean) {
  try {
    if (typeof window === 'undefined') return;
    if (closed) window.localStorage.setItem(STORAGE_KEY, '1');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch { /* sem localStorage */ }
}

interface ComoFuncionaProps {
  /** Texto livre configurado pelo admin (cohort_config.prazo_materiais). Vazio = linha some. */
  prazo?: string;
}

/** Bloco "Como funciona" no topo de Materiais: aberto na primeira visita, lembra se a pessoa fechou. */
export const ComoFunciona: React.FC<ComoFuncionaProps> = ({ prazo }) => {
  const [open, setOpen] = useState<boolean>(() => !readClosed());

  const toggle = () => {
    setOpen((prev) => {
      writeClosed(prev);
      return !prev;
    });
  };

  return (
    <section className="bg-prosperus-navy-panel border border-white/5 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-3 text-left hover:bg-white/[0.03] transition"
      >
        <span className="font-serif text-lg text-white">Como funciona</span>
        <span className="text-xs text-white/50 font-sans">{open ? 'Fechar' : 'Abrir'}</span>
      </button>
      {open && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-5 space-y-3">
          <ol className="space-y-1.5">
            {COMO_FUNCIONA_PASSOS.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm text-white/80 font-sans leading-relaxed">
                <span className="text-prosperus-gold-dark font-semibold flex-shrink-0">{i + 1}.</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-white/60 font-sans leading-relaxed">{COMO_FUNCIONA_FRASE}</p>
          {prazo && prazo.trim() && (
            <p className="text-sm font-sans text-prosperus-gold-light">
              <span className="font-semibold">Prazo:</span> {prazo.trim()}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
