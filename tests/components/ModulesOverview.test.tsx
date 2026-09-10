import React from 'react';
import { render } from '@testing-library/react';

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

import { ModulesOverview } from '../../components/ModulesOverview';

describe('ModulesOverview (a ficha em 5 M\'s)', () => {
  it('titula a secao como a ficha em 5 M\'s', () => {
    const { container } = render(<ModulesOverview />);
    expect(container.querySelector('h2')?.textContent).toBe("A ficha em 5 M's");
  });

  it('lista os cinco M na ordem Meta, Mentor, Mentorado, Metodo, A Mentoria', () => {
    const { container } = render(<ModulesOverview />);
    const nomes = Array.from(container.querySelectorAll('h3')).map((h) => h.textContent);
    expect(nomes).toEqual(['Meta', 'Mentor', 'Mentorado', 'Método', 'A Mentoria']);
  });

  it('da uma linha para cada M', () => {
    const { container } = render(<ModulesOverview />);
    const texto = container.textContent || '';
    expect(texto).toContain('número, prazo e cadência de venda');
    expect(texto).toContain('posicionamento que sustenta a autoridade');
    expect(texto).toContain('dor, desejo, setor, bolso e território');
    expect(texto).toContain('etapas, passos e a nomenclatura autoral');
    expect(texto).toContain('promessa, formato, entrega e preço');
  });

  it('os cartoes sao informativos, sem botao de responder', () => {
    const { container } = render(<ModulesOverview />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.textContent).not.toContain('Responder');
  });

  it('nao fala em 4 M, pilares nem modulos', () => {
    const { container } = render(<ModulesOverview />);
    const texto = (container.textContent || '').toLowerCase();
    expect(texto).not.toContain('4 m');
    expect(texto).not.toContain('pilar');
    expect(texto).not.toContain('módulo');
    expect(texto).not.toContain('diagn');
  });
});
