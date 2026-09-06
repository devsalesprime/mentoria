import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen } from '../../components/script/ScriptScreen';

/**
 * O menu "Mais" da tela "Seu script" e um <details> nativo: o navegador nao fecha no Esc nem ao clicar
 * fora, entao o menu ficava aberto por cima do script depois que a pessoa desistia. Agora fecha nos dois.
 */

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

const MD = '# Script v1\n\n**Para quem eu vendo:** o dono\n\n## Passo 1 · Conexão\n\n**Objetivo:** abrir.\n\n1. "Prazer, eu sou o Rafael."\n';

function fichaMock() {
  return {
    data: { club: { slug: 'x', nome: 'Elos Club' }, ficha_status: 'confirmada', script: { versoes: 1, ultima: null, aprovada: null, job: null } },
    gerarScript: vi.fn(async () => ({ ok: true })),
    pedirRevisao: vi.fn(async () => ({ ok: true })),
    refresh: vi.fn(),
  } as any;
}

function mockVersao() {
  const base = { id: 'v1', versao: 1, status: 'rascunho', resumo: '', created_at: '2026-09-05 09:00:00', comentarios_count: 0, entregaveis: [], slides_job: null };
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [base], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { ...base, content_md: MD }, comentarios: [] } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos: [] } };
    throw new Error('url inesperada ' + url);
  });
}

function pointerdown(el: Element | Document) {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
}

async function abrirMenu() {
  mockVersao();
  const { container } = render(<ScriptScreen ficha={fichaMock()} token="tok" />);
  expect(await screen.findByText('Script v1')).toBeInTheDocument();
  const menu = container.querySelector('details.script-mais') as HTMLDetailsElement;
  expect(menu).not.toBeNull();
  // jsdom nao abre o <details> sozinho no clique do summary
  menu.open = true;
  return { menu, container };
}

describe('menu "Mais": fechar sem escolher nada', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('fecha no Esc e devolve o foco para o botão "Mais"', async () => {
    const { menu } = await abrirMenu();
    const summary = menu.querySelector('summary') as HTMLElement;

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it('fecha ao clicar fora do menu', async () => {
    const { menu } = await abrirMenu();

    pointerdown(document.body);

    expect(menu.open).toBe(false);
  });

  it('continua aberto quando o clique é dentro do próprio menu', async () => {
    const { menu } = await abrirMenu();

    pointerdown(screen.getByRole('group', { name: 'Imprimir ou salvar em PDF' }));

    expect(menu.open).toBe(true);
  });

  it('Esc com o menu fechado não faz nada com o menu', async () => {
    const { menu } = await abrirMenu();
    menu.open = false;

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(menu.open).toBe(false);
  });
});
