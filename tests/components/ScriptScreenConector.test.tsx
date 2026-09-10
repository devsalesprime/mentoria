import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen } from '../../components/script/ScriptScreen';
import {
  COPY_CONECTOR_ABRIR, COPY_CONECTOR_BAIXAR, COPY_CONECTOR_TEXTO, COPY_CONECTOR_TITULO,
} from '../../components/script/script/ScriptReader';

/**
 * Cartao "Seu conector" no bloco "Ações": ele so existe quando a versao traz o entregavel `conector`
 * publicado pelo worker. Clube sem esse entregavel nao ve nada. "Abrir a página de instalação" leva para
 * meta.pagina (ou meta.url quando ela nao vier) e "Baixar as instruções" baixa o instalacao.md pela rota
 * de download dos entregaveis, com o token na URL.
 */

vi.mock('axios');

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_: any, tag: string) => React.forwardRef((props: any, ref: any) => {
      const { children, initial, animate, exit, transition, whileHover, whileTap, variants, custom, ...rest } = props;
      return React.createElement(tag, { ...rest, ref }, children);
    }),
  }),
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

const MD = [
  '# Script v1',
  '',
  '**Para quem eu vendo:** o dono',
  '',
  '## Passo 1 · Conexão',
  '',
  '**Objetivo:** abrir.',
  '',
  '1. "Prazer, eu sou a Ana."',
  '',
].join('\n');

const ENTREGAVEL_CONECTOR = {
  tipo: 'conector',
  versao: 1,
  created_at: '2026-09-10 10:00:00',
  meta: {
    url: 'https://conector.prosperus.app/clube-x/mcp',
    pagina: 'https://conector.prosperus.app/clube-x/instalar',
    tools: 7,
    atualizado_em: '2026-09-10T10:00:00.000Z',
  },
  arquivos: [
    { campo: 'instalacao', nome: 'instalacao.md', bytes: 320, url: '/api/script/versoes/1/entregaveis/conector/instalacao' },
  ],
};

function fichaMock(over: Record<string, unknown> = {}) {
  return {
    data: { club: { slug: 'x', nome: 'Elos Club' }, ficha_status: 'confirmada', modo: 'completo', script: { versoes: 1, ultima: null, aprovada: null, job: null }, ...over },
    gerarScript: vi.fn(async () => ({ ok: true })),
    pedirRevisao: vi.fn(async () => ({ ok: true })),
    definirModo: vi.fn(async () => ({ ok: true })),
    refresh: vi.fn(),
  } as any;
}

function mockVersao(entregaveis: any[]) {
  const base = { id: 'v1', versao: 1, status: 'rascunho', resumo: '', created_at: '2026-09-10 09:00:00', comentarios_count: 0, entregaveis, slides_job: null };
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [base], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { ...base, content_md: MD }, comentarios: [] } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos: [] } };
    throw new Error('url inesperada ' + url);
  });
}

/** O bloco "Ações" (com o conector) fica na última tela do leitor. */
async function irParaAcoes() {
  const nav = await screen.findByRole('navigation', { name: 'Índice do script' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Preparação e métricas' }));
  return await screen.findByTestId('acoes-fim');
}

describe('ScriptScreen: o cartão "Seu conector"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('com o entregável publicado: título, frase e os dois botões', async () => {
    mockVersao([ENTREGAVEL_CONECTOR]);
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    const acoes = await irParaAcoes();
    const cartao = within(acoes).getByTestId('cartao-conector');
    expect(within(cartao).getByText(COPY_CONECTOR_TITULO)).toBeInTheDocument();
    expect(within(cartao).getByText(COPY_CONECTOR_TEXTO)).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: COPY_CONECTOR_ABRIR })).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: COPY_CONECTOR_BAIXAR })).toBeInTheDocument();
  });

  it('sem o entregável: nada de conector na tela', async () => {
    mockVersao([]);
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    const acoes = await irParaAcoes();
    expect(within(acoes).queryByTestId('cartao-conector')).toBeNull();
    expect(screen.queryByText(COPY_CONECTOR_TITULO)).toBeNull();
  });

  it('"Abrir a página de instalação" abre meta.pagina numa aba nova, sem o token', async () => {
    mockVersao([ENTREGAVEL_CONECTOR]);
    const open = vi.fn(() => ({} as any));
    vi.stubGlobal('open', open);
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    const acoes = await irParaAcoes();
    fireEvent.click(within(acoes).getByRole('button', { name: COPY_CONECTOR_ABRIR }));
    expect(open).toHaveBeenCalledWith('https://conector.prosperus.app/clube-x/instalar', '_blank', 'noopener');
    expect(open.mock.calls[0][0]).not.toContain('token');
    vi.unstubAllGlobals();
  });

  it('sem meta.pagina o botão usa meta.url', async () => {
    mockVersao([{ ...ENTREGAVEL_CONECTOR, meta: { url: 'https://conector.prosperus.app/clube-x/mcp' } }]);
    const open = vi.fn(() => ({} as any));
    vi.stubGlobal('open', open);
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    const acoes = await irParaAcoes();
    fireEvent.click(within(acoes).getByRole('button', { name: COPY_CONECTOR_ABRIR }));
    expect(open).toHaveBeenCalledWith('https://conector.prosperus.app/clube-x/mcp', '_blank', 'noopener');
    vi.unstubAllGlobals();
  });

  it('"Baixar as instruções" baixa o instalacao.md pela rota dos entregáveis, com o token', async () => {
    mockVersao([ENTREGAVEL_CONECTOR]);
    const open = vi.fn(() => ({} as any));
    vi.stubGlobal('open', open);
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    const acoes = await irParaAcoes();
    fireEvent.click(within(acoes).getByRole('button', { name: COPY_CONECTOR_BAIXAR }));
    expect(open).toHaveBeenCalledWith('/api/script/versoes/1/entregaveis/conector/instalacao?token=tok', '_blank', 'noopener');
    vi.unstubAllGlobals();
  });

  it('a cópia do cartão não usa travessão nem ponto de exclamação', () => {
    const PROIBIDOS = new RegExp('[\u2014\u2013!]'); // travessão, meia risca e exclamação
    for (const texto of [COPY_CONECTOR_TITULO, COPY_CONECTOR_TEXTO, COPY_CONECTOR_ABRIR, COPY_CONECTOR_BAIXAR]) {
      expect(texto).not.toMatch(PROIBIDOS);
    }
  });
});
