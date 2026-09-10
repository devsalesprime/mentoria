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

import { Hero } from '../../components/Hero';

describe('Hero', () => {
  it('anuncia o script de venda nos 7 passos da Dani Martins', () => {
    const { container } = render(<Hero onEntrar={vi.fn()} />);
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toContain('O script de venda da sua mentoria');
    expect(h1?.textContent).toContain('nos 7 passos da Dani Martins');
  });

  it('resume a promessa: manda o que ja tem, confere a ficha, recebe o script', () => {
    const { container } = render(<Hero onEntrar={vi.fn()} />);
    const texto = container.textContent || '';
    expect(texto).toContain('o que já tem');
    expect(texto).toContain('confere a ficha e recebe o script');
  });

  it('entra por e-mail, sem senha e sem prazo prometido em horas', () => {
    const { container } = render(<Hero onEntrar={vi.fn()} />);
    const texto = container.textContent || '';
    expect(texto).toContain('Sem senha');
    expect(texto).toContain('WhatsApp');
    expect(texto).not.toMatch(/48h|40 min/);
  });

  it('nao usa mais o vocabulario antigo do produto', () => {
    const { container } = render(<Hero onEntrar={vi.fn()} />);
    const texto = (container.textContent || '').toLowerCase();
    expect(texto).not.toContain('diagn');
    expect(texto).not.toContain('pilar');
    expect(texto).not.toContain('módulo');
  });

  it('dispara onEntrar no botao de entrada', () => {
    const onEntrar = vi.fn();
    render(<Hero onEntrar={onEntrar} />);
    const botao = screen.getByRole('button', { name: 'Entrar com o meu e-mail' });
    fireEvent.click(botao);
    expect(onEntrar).toHaveBeenCalledTimes(1);
  });
});
