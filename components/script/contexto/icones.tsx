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

export const IconeSeta: React.FC<IconeProps & { direcao?: 'esq' | 'dir' }> = ({ direcao = 'dir', ...p }) => base(p, (
  direcao === 'dir' ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />
));

export const ICONE_TIPO: Record<ContextoTipo, React.FC<IconeProps>> = {
  audio: IconeMicrofone,
  imagem: IconeImagem,
  video: IconeVideo,
  link: IconeLink,
  nota: IconeNota,
};
