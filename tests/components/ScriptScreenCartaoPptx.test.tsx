import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen } from '../../components/script/ScriptScreen';
import { COPY_PPTX_BAIXAR, COPY_PPTX_COMO_USAR, COPY_PPTX_GERAR, COPY_PPTX_MONTANDO } from '../../components/script/script/ScriptReader';

/**
 * Apresentacao comercial NO FIM DE TUDO (SPEC-workflow-v3-decisoes-07-09 §2, item 1): ela saiu do Cartao de
 * bolso e virou parte do bloco "Ações", depois do Passo 7 e da Preparacao, com a instrucao de modo apresentador
 * e duas telas. Tres estados: pronta (baixar + como usar) · sendo montada · nada ainda ("Gerar apresentação").
 * "Revisar a ficha" e "Aprofundar para o completo" nao vivem mais aqui: quem leva ate elas e o menu do Dashboard.
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
  '## Cartão de bolso',
  '',
  '- Abertura: "Prazer, eu sou o Rafael."',
  '- Investimento total: R$ 24 mil',
  '',
  '## Passo 1 · Conexão',
  '',
  '**Objetivo:** abrir.',
  '',
  '1. "Prazer, eu sou o Rafael."',
  '',
].join('\n');

const ENTREGAVEL_SLIDES = {
  tipo: 'slides',
  versao: 1,
  created_at: '2026-09-05 10:00:00',
  arquivos: [
    { campo: 'pptx', nome: 'apresentacao.pptx', bytes: 120, url: '/api/script/versoes/1/entregaveis/slides/pptx' },
    { campo: 'pdf', nome: 'apresentacao.pdf', bytes: 90, url: '/api/script/versoes/1/entregaveis/slides/pdf' },
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
  return await screen.findByTestId('acoes-fim');
}

describe('ScriptScreen: a apresentação no bloco "Ações"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('com o PPTX pronto: botão de baixar e a instrução de modo apresentador com duas telas', async () => {
    mockVersao({ entregaveis: [ENTREGAVEL_SLIDES] });
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    await screen.findByTestId('script-reader');
    // o script novo abre no Cartão de bolso (tela 0) e o cartão não tem mais o bloco
    expect(screen.queryByTestId('cartao-apresentacao')).toBeNull();
    await irParaAcoes();
    const bloco = screen.getByTestId('cartao-apresentacao');
    expect(bloco.closest('[data-tela="9"]')).not.toBeNull();

    const baixar = screen.getByTestId('cartao-pptx-baixar');
    expect(baixar).toHaveTextContent(COPY_PPTX_BAIXAR);
    expect(COPY_PPTX_BAIXAR).toBe('Baixar apresentação (PPTX)');
    expect(screen.getByTestId('cartao-pptx-como-usar')).toHaveTextContent(COPY_PPTX_COMO_USAR);
    expect(COPY_PPTX_COMO_USAR).toBe('Abra no PowerPoint, escolha Modo de apresentador e conecte uma segunda tela: os slides vão para o cliente e o roteiro do script fica com você, nas notas.');
    expect(screen.queryByTestId('cartao-pptx-montando')).toBeNull();
    expect(screen.queryByTestId('cartao-pptx-gerar')).toBeNull();

    const open = vi.fn().mockReturnValue({});
    Object.defineProperty(window, 'open', { value: open, configurable: true, writable: true });
    fireEvent.click(baixar);
    expect(open).toHaveBeenLastCalledWith('/api/script/versoes/1/entregaveis/slides/pptx?token=tok', '_blank', 'noopener');
  });

  it('com o pedido na fila: "Apresentação sendo montada", sem botão', async () => {
    mockVersao({ slidesJob: { id: 'js1', tipo: 'slides', status: 'queued', attempts: 0 } });
    render(<ScriptScreen ficha={fichaMock()} token="tok" pollMs={100000} />);
    await screen.findByTestId('script-reader');
    await irParaAcoes();
    expect(screen.getByTestId('cartao-pptx-montando')).toHaveTextContent(COPY_PPTX_MONTANDO);
    expect(screen.queryByTestId('cartao-pptx-baixar')).toBeNull();
    expect(screen.queryByTestId('cartao-pptx-gerar')).toBeNull();
  });

  it('sem apresentação: "Gerar apresentação" pede a montagem', async () => {
    mockVersao();
    (axios.post as any).mockImplementation(async (url: string) => {
      if (url === '/api/script/versoes/1/slides') return { data: { success: true, versao: 1, job: { id: 'js2', tipo: 'slides', status: 'queued', existing: false } } };
      throw new Error('post inesperado ' + url);
    });
    render(<ScriptScreen ficha={fichaMock()} token="tok" pollMs={100000} />);
    await screen.findByTestId('script-reader');
    await irParaAcoes();
    const gerar = screen.getByTestId('cartao-pptx-gerar');
    expect(gerar).toHaveTextContent(COPY_PPTX_GERAR);
    fireEvent.click(gerar);
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/slides', {}, expect.anything()));
    // o bloco passa a mostrar que está sendo montada
    await waitFor(() => expect(screen.getByTestId('cartao-pptx-montando')).toBeInTheDocument());
  });

  it('a copy do bloco segue as regras da casa: sem travessão, sem "diagnóstico", sem emoji', async () => {
    mockVersao({ entregaveis: [ENTREGAVEL_SLIDES] });
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    await screen.findByTestId('script-reader');
    await irParaAcoes();
    const texto = screen.getByTestId('cartao-apresentacao').textContent || '';
    expect(texto).not.toMatch(/—/);
    expect(texto).not.toMatch(/diagn[oó]stico/i);
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('modo essencial: "Seu script" não oferece mais "Revisar a ficha" nem "Aprofundar para o completo" (isso é do menu do Dashboard)', async () => {
    mockVersao({ entregaveis: [ENTREGAVEL_SLIDES] });
    const ficha = fichaMock({ modo: 'essencial' });
    const { container } = render(<ScriptScreen ficha={ficha} token="tok" onNavigate={vi.fn()} />);
    await screen.findByTestId('script-reader');
    const menu = container.querySelector('details.script-mais') as HTMLDetailsElement;
    menu.open = true;
    expect(screen.queryByTestId('link-revisar-ficha')).toBeNull();
    expect(screen.queryByTestId('aprofundar-completo')).toBeNull();
    expect(ficha.definirModo).not.toHaveBeenCalled();
  });
});
