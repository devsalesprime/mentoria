import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('axios');
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_: any, tag: string) => React.forwardRef((props: any, ref: any) => {
      const { children, initial, animate, exit, transition, whileHover, whileTap, variants, ...rest } = props;
      return React.createElement(tag, { ...rest, ref }, children);
    }),
  }),
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));
vi.mock('html2pdf.js', () => ({ default: {} }));

import { ProdutoBadge } from '../../components/admin/CohortOverview';

/**
 * Crachá do produto do clube (migração 028): a equipe precisa distinguir, na lista e no detalhe,
 * o clube do roster do Exclusive do clube próprio que o login cria sozinho.
 */
describe('ProdutoBadge', () => {
  it('clube do roster aparece como Exclusive', () => {
    render(<ProdutoBadge produto="exclusive" />);
    expect(screen.getByTestId('produto-badge')).toHaveTextContent('Exclusive');
    expect(screen.getByTestId('produto-badge')).toHaveAttribute('data-produto', 'exclusive');
  });

  it('clube próprio aparece como Club', () => {
    render(<ProdutoBadge produto="club" />);
    expect(screen.getByTestId('produto-badge')).toHaveTextContent('Club');
    expect(screen.getByTestId('produto-badge')).toHaveAttribute('data-produto', 'club');
  });

  it('clube de antes da migração, sem produto gravado, conta como roster', () => {
    render(<ProdutoBadge produto={undefined} />);
    expect(screen.getByTestId('produto-badge')).toHaveTextContent('Exclusive');
  });
});
