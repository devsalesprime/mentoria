import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen } from '../../components/script/ScriptScreen';

/**
 * Apresentacao comercial depois da onda E1: ela vive no bloco "Ações", no fim do leitor (depois do Passo 7 e da
 * Preparacao), nos 3 estados: pronta (baixar o PPTX, ver o PDF, notas do apresentador) · sendo montada · nada
 * ainda ("Gerar apresentação"). O menu "Baixar" da barra de cima oferece o PPTX quando ele existe.
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

const ENTREGAVEL_SLIDES = {
  tipo: 'slides',
  versao: 1,
  created_at: '2026-09-05 10:00:00',
  arquivos: [
    { campo: 'pptx', nome: 'apresentacao.pptx', bytes: 120, url: '/api/script/versoes/1/entregaveis/slides/pptx' },
    { campo: 'pdf', nome: 'apresentacao.pdf', bytes: 90, url: '/api/script/versoes/1/entregaveis/slides/pdf' },
    { campo: 'notas', nome: 'notas.md', bytes: 40, url: '/api/script/versoes/1/entregaveis/slides/notas' },
    { campo: 'contact', nome: 'contato.png', bytes: 30, url: '/api/script/versoes/1/entregaveis/slides/contact' },
  ],
};

function fichaMock() {
  return {
    data: { club: { slug: 'x', nome: 'Elos Club' }, ficha_status: 'confirmada', script: { versoes: 1, ultima: null, aprovada: null, job: null } },
    gerarScript: vi.fn(async () => ({ ok: true })),
    pedirRevisao: vi.fn(async () => ({ ok: true })),
    refresh: vi.fn(),
  } as any;
}

/** Uma versao com (ou sem) apresentacao pronta e com (ou sem) pedido na fila. */
function mockVersao({ entregaveis = [] as any[], slidesJob = null as any } = {}) {
  const base = { id: 'v1', versao: 1, status: 'rascunho', resumo: '', created_at: '2026-09-05 09:00:00', comentarios_count: 0, entregaveis, slides_job: slidesJob };
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [base], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { ...base, content_md: MD }, comentarios: [] } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos: [] } };
    throw new Error('url inesperada ' + url);
  });
}

/** O bloco "Ações" (com a apresentação) fica na última tela do leitor. */
async function irParaAcoes() {
  const nav = await screen.findByRole('navigation', { name: 'Índice do script' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Preparação e métricas' }));
  return within(await screen.findByTestId('acoes-fim'));
}

describe('ScriptScreen: apresentação comercial no bloco "Ações"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('com a apresentação pronta: baixar o PPTX, ver em PDF e as notas do apresentador', async () => {
    mockVersao({ entregaveis: [ENTREGAVEL_SLIDES] });
    const { container } = render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    expect(await screen.findByText('Script v1')).toBeInTheDocument();
    const acoes = await irParaAcoes();

    expect(acoes.getByRole('region', { name: 'Apresentação comercial' })).toBeInTheDocument();
    expect(acoes.getByTestId('cartao-pptx-baixar')).toHaveTextContent('Baixar apresentação (PPTX)');
    expect(acoes.getByTestId('slides-pdf')).toHaveTextContent('Ver em PDF');
    expect(acoes.getByTestId('slides-notas')).toHaveTextContent('Notas do apresentador');
    expect(acoes.queryByTestId('cartao-pptx-gerar')).toBeNull();
    expect(acoes.queryByTestId('cartao-pptx-montando')).toBeNull();

    const open = vi.fn().mockReturnValue({});
    Object.defineProperty(window, 'open', { value: open, configurable: true, writable: true });
    fireEvent.click(acoes.getByTestId('cartao-pptx-baixar'));
    expect(open).toHaveBeenLastCalledWith('/api/script/versoes/1/entregaveis/slides/pptx?token=tok', '_blank', 'noopener');
    // o PDF abre no navegador em vez de baixar
    fireEvent.click(acoes.getByTestId('slides-pdf'));
    expect(open).toHaveBeenLastCalledWith('/api/script/versoes/1/entregaveis/slides/pdf?token=tok&inline=1', '_blank', 'noopener');
    fireEvent.click(acoes.getByTestId('slides-notas'));
    expect(open).toHaveBeenLastCalledWith('/api/script/versoes/1/entregaveis/slides/notas?token=tok', '_blank', 'noopener');

    // o menu "Baixar" da barra de cima também oferece o PPTX
    const menu = container.querySelector('details.script-mais') as HTMLDetailsElement;
    menu.open = true;
    fireEvent.click(screen.getByTestId('slides-pptx'));
    expect(open).toHaveBeenLastCalledWith('/api/script/versoes/1/entregaveis/slides/pptx?token=tok', '_blank', 'noopener');
  });

  it('com o pedido na fila: "Apresentação sendo montada", sem botão', async () => {
    mockVersao({ slidesJob: { id: 'js1', tipo: 'slides', status: 'running', attempts: 1 } });
    render(<ScriptScreen ficha={fichaMock()} token="tok" pollMs={100000} />);
    expect(await screen.findByText('Script v1')).toBeInTheDocument();
    const acoes = await irParaAcoes();

    expect(acoes.getByTestId('cartao-pptx-montando')).toHaveTextContent('Apresentação sendo montada');
    expect(acoes.queryByTestId('cartao-pptx-gerar')).toBeNull();
    expect(acoes.queryByTestId('cartao-pptx-baixar')).toBeNull();
    expect(screen.queryByTestId('slides-pptx')).toBeNull();
  });

  it('sem apresentação: "Gerar apresentação" pede a montagem e avisa que o aviso vem depois', async () => {
    mockVersao();
    (axios.post as any).mockImplementation(async (url: string) => {
      if (url === '/api/script/versoes/1/slides') return { data: { success: true, versao: 1, job: { id: 'js2', tipo: 'slides', status: 'queued', existing: false } } };
      throw new Error('post inesperado ' + url);
    });
    render(<ScriptScreen ficha={fichaMock()} token="tok" pollMs={100000} />);
    await screen.findByTestId('script-reader');
    const acoes = await irParaAcoes();

    const gerar = acoes.getByTestId('cartao-pptx-gerar');
    expect(gerar).toHaveTextContent('Gerar apresentação');
    expect(gerar).not.toBeDisabled();
    fireEvent.click(gerar);

    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/slides', {}, expect.anything()));
    expect(await screen.findByText('Vamos montar a sua apresentação com as falas do script nas notas. Avisamos quando ficar pronta.')).toBeInTheDocument();
    // o bloco já mostra que a apresentação está sendo montada
    await waitFor(() => expect(screen.getByTestId('cartao-pptx-montando')).toBeInTheDocument());
  });
});
