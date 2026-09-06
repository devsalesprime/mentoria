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

/**
 * Palavras de tempo relativo: no texto do admin elas envelhecem sozinhas ("amanhã" salvo na quinta vira
 * mentira no sábado). Sem `\b`, que não funciona depois de letra acentuada; a borda vai na mão.
 */
const RELATIVOS = /(^|[^\p{L}])(depois\s+de\s+amanh[ãa]|anteontem|amanh[ãa]|hoje|ontem)(?![\p{L}])/giu;

/** Data no texto: DD/MM, DD/MM/AA ou DD/MM/AAAA. */
const DATA_BR = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/;

/**
 * O prazo é texto livre do admin, então ele estraga com o tempo. Duas regras:
 *   1. tem data e a data já passou -> a linha inteira some (nada de cobrar prazo vencido);
 *   2. palavra de tempo relativo ("amanhã", "hoje") nunca vai para a tela, porque foi escrita
 *      em outro dia e não é recalculada.
 * Sem data legível a linha continua aparecendo, só sem os relativos. Devolve null quando não há o que mostrar.
 */
export function prazoParaExibir(prazo: string | null | undefined, hoje: Date = new Date()): string | null {
  const bruto = (prazo || '').trim();
  if (!bruto) return null;

  const m = DATA_BR.exec(bruto);
  if (m) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let ano = m[3] ? Number(m[3]) : hoje.getFullYear();
    if (m[3] && m[3].length === 2) ano += 2000;
    const alvo = new Date(ano, mes - 1, dia);
    const valida = alvo.getFullYear() === ano && alvo.getMonth() === mes - 1 && alvo.getDate() === dia;
    const inicioDeHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    if (valida && alvo.getTime() < inicioDeHoje.getTime()) return null;
  }

  const limpo = bruto
    .replace(RELATIVOS, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;.:·-]+/, '')
    .replace(/\s+([,;.:])/g, '$1')
    .replace(/[\s,;:·-]+$/, '')
    .trim();

  return limpo || null;
}

interface ComoFuncionaProps {
  /** Texto livre configurado pelo admin (cohort_config.prazo_materiais). Vazio ou vencido = linha some. */
  prazo?: string;
}

/** Bloco "Como funciona" no topo de Materiais: aberto na primeira visita, lembra se a pessoa fechou. */
export const ComoFunciona: React.FC<ComoFuncionaProps> = ({ prazo }) => {
  const [open, setOpen] = useState<boolean>(() => !readClosed());
  const prazoVisivel = prazoParaExibir(prazo);

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
          {prazoVisivel && (
            <p className="text-sm font-sans text-prosperus-gold-light" data-testid="prazo-materiais">
              <span className="font-semibold">Prazo:</span> {prazoVisivel}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
