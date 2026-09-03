/**
 * Glifos em SVG (traço fino, 1 cor) usados na ficha: sem emoji em lugar nenhum da interface.
 */
import React from 'react';
import type { ContextoTipo } from '../../../hooks/useContextoCampo';

type IconeProps = { className?: string; title?: string };

const base = (props: IconeProps, children: React.ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    aria-hidden={props.title ? undefined : true}
    role={props.title ? 'img' : undefined}
  >
    {props.title && <title>{props.title}</title>}
    {children}
  </svg>
);

export const IconeMicrofone: React.FC<IconeProps> = (p) => base(p, (
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <line x1="12" y1="18" x2="12" y2="21" />
    <line x1="9" y1="21" x2="15" y2="21" />
  </>
));

export const IconeImagem: React.FC<IconeProps> = (p) => base(p, (
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M21 16l-5-5-8 8" />
  </>
));

export const IconeVideo: React.FC<IconeProps> = (p) => base(p, (
  <>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="M16 10l5-3v10l-5-3z" />
  </>
));

export const IconeLink: React.FC<IconeProps> = (p) => base(p, (
  <>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3" />
  </>
));

export const IconeNota: React.FC<IconeProps> = (p) => base(p, (
  <>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M15 3v4h4" />
    <line x1="9" y1="12" x2="15" y2="12" />
    <line x1="9" y1="16" x2="15" y2="16" />
  </>
));

export const IconeCheck: React.FC<IconeProps> = (p) => base(p, <path d="M5 12l4.5 4.5L19 7" />);

export const IconeLixeira: React.FC<IconeProps> = (p) => base(p, (
  <>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </>
));

export const IconeSeta: React.FC<IconeProps & { direcao?: 'esq' | 'dir' | 'cima' | 'baixo' }> = ({ direcao = 'dir', ...p }) => base(p, (
  direcao === 'dir' ? <path d="M9 6l6 6-6 6" />
    : direcao === 'esq' ? <path d="M15 6l-6 6 6 6" />
    : direcao === 'cima' ? <path d="M6 15l6-6 6 6" />
    : <path d="M6 9l6 6 6-6" />
));

export const IconeX: React.FC<IconeProps> = (p) => base(p, (
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>
));

export const IconeMais: React.FC<IconeProps> = (p) => base(p, (
  <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>
));

export const IconeMenos: React.FC<IconeProps> = (p) => base(p, <line x1="5" y1="12" x2="19" y2="12" />);

/** Virar a carta (duas setas em arco). */
export const IconeVirar: React.FC<IconeProps> = (p) => base(p, (
  <>
    <path d="M4 12a8 8 0 0 1 14-5.3" />
    <path d="M18 3v4h-4" />
    <path d="M20 12a8 8 0 0 1-14 5.3" />
    <path d="M6 21v-4h4" />
  </>
));

export const IconeCadeado: React.FC<IconeProps> = (p) => base(p, (
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>
));

export const IconeLivro: React.FC<IconeProps> = (p) => base(p, (
  <>
    <path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z" />
    <path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />
  </>
));

/** Degraus: 1, 2 ou 3 (experiência vendendo). */
export const IconeDegraus: React.FC<IconeProps & { n?: 1 | 2 | 3 }> = ({ n = 3, ...p }) => base(p, (
  <>
    <path d="M3 20h18" />
    {n >= 1 && <path d="M3 20v-5h6" />}
    {n >= 2 && <path d="M9 15v-5h6" />}
    {n >= 3 && <path d="M15 10V5h6" />}
  </>
));

/** Aspas de abertura (cartão de citação). */
export const IconeAspas: React.FC<IconeProps> = (p) => base(p, (
  <>
    <path d="M10 8H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v3" />
    <path d="M20 8h-4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v3" />
  </>
));

export const ICONE_TIPO: Record<ContextoTipo, React.FC<IconeProps>> = {
  audio: IconeMicrofone,
  imagem: IconeImagem,
  video: IconeVideo,
  link: IconeLink,
  nota: IconeNota,
};
