import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

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

import { Header } from '../../components/Header';

describe('Header', () => {
  it('renders without crashing', () => {
    const { container } = render(<Header onOpenLogin={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it('o botao diz o que faz: entrar com o e-mail', () => {
    const { container } = render(<Header onOpenLogin={vi.fn()} />);
    const texto = container.textContent || '';
    expect(texto).toContain('Entrar com o e-mail');
    expect(texto).not.toContain('Área do Membro');
  });

  it('dispara onOpenLogin no clique', () => {
    const onOpenLogin = vi.fn();
    render(<Header onOpenLogin={onOpenLogin} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpenLogin).toHaveBeenCalledTimes(1);
  });
});
