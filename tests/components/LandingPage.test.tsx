import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

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

import { LandingPage } from '../../components/routing/LandingPage';

const renderLanding = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<div>LoginPage</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('LandingPage', () => {
  it('monta as secoes do produto atual', () => {
    const { container } = renderLanding();
    const titulos = Array.from(container.querySelectorAll('h1, h2')).map((h) => h.textContent?.trim());
    expect(titulos.some((t) => t?.includes('nos 7 passos da Dani Martins'))).toBe(true);
    expect(titulos.some((t) => t?.includes('A IA lê tudo'))).toBe(true);
    expect(titulos).toContain("A ficha em 5 M's");
    expect(titulos).toContain('Como funciona');
  });

  it('lista o que a pessoa recebe', () => {
    const { container } = renderLanding();
    const texto = container.textContent || '';
    expect(texto).toContain('O Que Você Recebe');
    expect(texto).toContain('Script em duas versões');
    expect(texto).toContain('Campo sai na impressora');
    expect(texto).toContain('Falas com título');
    expect(texto).toContain('Treinamentos por passo');
    expect(texto).toContain('Preparação para baixar');
    expect(texto).toContain('checklist da Dani Martins');
    expect(texto).toContain('Apresentação comercial em PPTX');
  });

  it('descreve as quatro etapas, com os dois ajustes', () => {
    const { container } = renderLanding();
    const etapas = Array.from(container.querySelectorAll('ol li')).map((li) => li.textContent || '');
    expect(etapas).toHaveLength(4);
    expect(etapas[0]).toContain('Escolha');
    expect(etapas[1]).toContain('Base do script');
    expect(etapas[2]).toContain('Script');
    expect(etapas[3]).toContain('Ajustes');
    expect(etapas[3]).toContain('Uma atualização da ficha e uma rodada de grifos');
  });

  it('leva ao login pelo botao do topo e pelo botao do hero', () => {
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com o meu e-mail' }));
    expect(screen.getByText('LoginPage')).toBeTruthy();
  });

  it('o cabecalho tambem entra pelo e-mail', () => {
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: /Entrar com o e-mail/ }));
    expect(screen.getByText('LoginPage')).toBeTruthy();
  });

  it('nao carrega o vocabulario antigo do produto', () => {
    const { container } = renderLanding();
    const texto = (container.textContent || '').toLowerCase();
    for (const proibido of ['diagn', 'pilar', 'módulo', '4 m', 'a casa', 'a definir']) {
      expect(texto).not.toContain(proibido);
    }
  });

  it('nao usa travessao nem ponto de exclamacao na copy', () => {
    const { container } = renderLanding();
    const texto = container.textContent || '';
    expect(texto).not.toMatch(/[\u2013\u2014!]/);
  });

  it('cabe em menos de 350 palavras visiveis', () => {
    const { container } = renderLanding();
    const palavras = (container.textContent || '').trim().split(/\s+/).filter(Boolean);
    expect(palavras.length).toBeLessThan(350);
  });
});
