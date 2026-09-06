import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen } from '../../components/script/ScriptScreen';

/**
 * A pilula da versao ("v2 05/09/2026 ▾") da barra da tela "Seu script" e um <details> nativo, igual ao
 * menu "Mais". O "Mais" ja fechava no Esc e no clique fora; a lista de versoes nao, e ficava aberta por
 * cima do script depois que a pessoa desistia de trocar de versao. Agora os dois fecham do mesmo jeito.
 *
 * O <details> "O que mudou nesta versao" fica de fora de proposito: e um texto que a pessoa abre para
 * ler enquanto mexe no script, nao um menu, e nao pode sumir sozinho.
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

const MD = '# Script v2\n\n**Para quem eu vendo:** o dono\n\n## Passo 1 · Conexão\n\n**Objetivo:** abrir.\n\n1. "Prazer, eu sou o Rafael."\n';

function fichaMock() {
  return {
    data: { club: { slug: 'x', nome: 'Elos Club' }, ficha_status: 'confirmada', script: { versoes: 2, ultima: null, aprovada: null, job: null } },
    gerarScript: vi.fn(async () => ({ ok: true })),
    pedirRevisao: vi.fn(async () => ({ ok: true })),
    refresh: vi.fn(),
  } as any;
}

/** Duas versoes: e o que faz a lista da pilula existir (com uma so, a pilula nao abre nada). */
function mockVersoes() {
  const comum = { status: 'rascunho', resumo: 'trocamos a abertura', comentarios_count: 0, entregaveis: [], slides_job: null };
  const v1 = { ...comum, id: 'v1', versao: 1, created_at: '2026-09-03 09:00:00' };
  const v2 = { ...comum, id: 'v2', versao: 2, created_at: '2026-09-05 09:00:00' };
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [v2, v1], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/2') return { data: { success: true, versao: { ...v2, content_md: MD }, comentarios: [] } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { ...v1, content_md: MD }, comentarios: [] } };
    if (url === '/api/script/versoes/2/grifos') return { data: { success: true, grifos: [] } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos: [] } };
    throw new Error('url inesperada ' + url);
  });
}

function pointerdown(el: Element | Document) {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
}

async function abrirMenu() {
  mockVersoes();
  const { container } = render(<ScriptScreen ficha={fichaMock()} token="tok" />);
  expect(await screen.findByText('Script v2')).toBeInTheDocument();
  const menu = container.querySelector('details.script-versao-menu') as HTMLDetailsElement;
  expect(menu).not.toBeNull();
  // jsdom nao abre o <details> sozinho no clique do summary
  menu.open = true;
  return { menu, container };
}

describe('menu de versões: fechar sem trocar de versão', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('a lista de versões existe quando há mais de uma versão', async () => {
    const { menu } = await abrirMenu();
    expect(screen.getByRole('menu', { name: 'Versões do script' })).toBeInTheDocument();
    expect(menu.open).toBe(true);
  });

  it('fecha no Esc e devolve o foco para a pílula da versão', async () => {
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

  it('continua aberto quando o clique é dentro da própria lista', async () => {
    const { menu } = await abrirMenu();

    pointerdown(screen.getByRole('menu', { name: 'Versões do script' }));

    expect(menu.open).toBe(true);
  });

  it('o texto "O que mudou nesta versão" não fecha junto: não é menu', async () => {
    const { container } = await abrirMenu();
    const mudou = container.querySelector('details.script-mudou') as HTMLDetailsElement;
    expect(mudou).not.toBeNull();
    mudou.open = true;

    fireEvent.keyDown(document, { key: 'Escape' });
    pointerdown(document.body);

    expect(mudou.open).toBe(true);
  });
});
