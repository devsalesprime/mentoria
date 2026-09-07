import React, { useEffect, useState } from 'react';

/**
 * Pecas comuns dos moldes de secao (onda E2): o casulo com o rotulo em maiusculas, os icones de linha e a
 * consulta de largura que troca tabela por cartoes no celular. Nada aqui conhece o conteudo do script.
 */

export type NomeIcone = 'pessoa' | 'bussola' | 'olho' | 'setas' | 'escuta' | 'conversa' | 'alerta' | 'certo' | 'pergunta';

const TRACOS: Record<NomeIcone, React.ReactNode> = {
  pessoa: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" /></>,
  bussola: <><circle cx="12" cy="12" r="8.4" /><path d="M15.2 8.8 13.4 13.4 8.8 15.2l1.8-4.6z" /></>,
  olho: <><path d="M2.6 12S6.4 6.2 12 6.2 21.4 12 21.4 12 17.6 17.8 12 17.8 2.6 12 2.6 12z" /><circle cx="12" cy="12" r="2.6" /></>,
  setas: <><path d="M4 9h11" /><path d="m12 6 3 3-3 3" /><path d="M20 15H9" /><path d="m12 12-3 3 3 3" /></>,
  escuta: <><path d="M9.4 5.2 5.2 9H2.6v6h2.6l4.2 3.8z" /><path d="M13.6 9.6a3.4 3.4 0 0 1 0 4.8" /><path d="M16.6 6.8a7.4 7.4 0 0 1 0 10.4" /></>,
  conversa: <><path d="M20 14.4a2.6 2.6 0 0 1-2.6 2.6H8.4L4 20.4V6.6A2.6 2.6 0 0 1 6.6 4h10.8A2.6 2.6 0 0 1 20 6.6z" /></>,
  alerta: <><path d="M12 4.6 21 19.4H3z" /><path d="M12 10.4v3.8" /><circle cx="12" cy="16.8" r=".9" fill="currentColor" /></>,
  certo: <><circle cx="12" cy="12" r="8.4" /><path d="m8.2 12.2 2.6 2.6 5-5.4" /></>,
  pergunta: <><circle cx="12" cy="12" r="8.4" /><path d="M9.6 9.6a2.4 2.4 0 1 1 3.3 2.2c-.6.3-.9.8-.9 1.5v.4" /><circle cx="12" cy="16.6" r=".9" fill="currentColor" /></>,
};

export const Icone: React.FC<{ nome: NomeIcone; className?: string }> = ({ nome, className }) => (
  <svg
    className={`script-secao-icone ${className || ''}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {TRACOS[nome]}
  </svg>
);

/**
 * Casulo de uma secao: rotulo curto em maiusculas e o respiro entre secoes (24 a 32 px) vem do CSS
 * (`.script-secao`), nao de cada componente.
 */
export const Secao: React.FC<{
  rotulo: string;
  icone?: NomeIcone;
  testId?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ rotulo, icone, testId, className, children }) => (
  <section className={`script-secao ${className || ''}`} aria-label={rotulo} data-testid={testId}>
    <p className="script-nota-rotulo script-secao-rotulo">
      {icone && <Icone nome={icone} />}
      {rotulo}
    </p>
    {children}
  </section>
);

export const CONSULTA_CELULAR = '(max-width: 767.98px)';

/** true abaixo de 768 px. No jsdom, que nao tem matchMedia, devolve false (desenho de desktop). */
export function useCelular(consulta = CONSULTA_CELULAR): boolean {
  const ler = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches;
  const [celular, setCelular] = useState<boolean>(ler);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(consulta);
    const aoMudar = () => setCelular(mq.matches);
    aoMudar();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', aoMudar);
      return () => mq.removeEventListener('change', aoMudar);
    }
    if (typeof (mq as any).addListener === 'function') {
      (mq as any).addListener(aoMudar);
      return () => (mq as any).removeListener(aoMudar);
    }
    return undefined;
  }, [consulta]);
  return celular;
}
