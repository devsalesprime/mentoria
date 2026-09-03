import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen, splitScript } from '../../components/script/ScriptScreen';

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

const MD = '# Script\n\nAbertura do script.\n\n## Passo 1: Entregar o controle\n\nTexto 1.\n\n## Passo 2: Dor\n\nTexto 2.\n\n### Sub\n\nmais\n\n## Fechamento\n\nfim';

function fichaMock(over: Partial<any> = {}) {
  return {
    data: { club: { slug: 'x', nome: 'Clube X' }, ficha_status: 'confirmada', script: { versoes: 0, ultima: null, aprovada: null, job: null } },
    gerarScript: vi.fn(async () => ({ ok: true, job: { id: 'j2', tipo: 'script', status: 'queued' }, existing: false })),
    refresh: vi.fn(),
    ...over,
  } as any;
}

describe('splitScript', () => {
  it('divide por "## Passo N" (numero do passo) e trata outros "## " como geral (0)', () => {
    const s = splitScript(MD);
    expect(s.map((x) => x.passo)).toEqual([0, 1, 2, 0]);
    expect(s[1].titulo).toBe('Passo 1: Entregar o controle');
    expect(s[2].md).toContain('### Sub');
    expect(s[2].html).toMatch(/<h3>/);
    expect(s[0].html).toMatch(/<h1>Script<\/h1>/);
    expect(splitScript('')).toEqual([]);
  });
});

describe('ScriptScreen', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sem versao: aviso de "está sendo escrito" com o status do job', async () => {
    (axios.get as any).mockResolvedValueOnce({ data: { success: true, versoes: [], job: { id: 'j1', tipo: 'script', status: 'running' } } });
    render(<ScriptScreen ficha={fichaMock()} token="t" />);
    expect(await screen.findByText('Seu script está sendo escrito.')).toBeInTheDocument();
    expect(screen.getByText('Sendo escrito agora.')).toBeInTheDocument();
    expect(screen.queryByText('Baixar (.md)')).toBeNull();
  });

  it('sem versao e ficha aberta: manda para a ficha', async () => {
    (axios.get as any).mockResolvedValueOnce({ data: { success: true, versoes: [], job: null } });
    const onNavigate = vi.fn();
    render(<ScriptScreen ficha={fichaMock({ data: { club: { slug: 'x', nome: 'Clube X' }, ficha_status: 'em_revisao' } })} token="t" onNavigate={onNavigate} />);
    fireEvent.click(await screen.findByText('Ir para a ficha'));
    expect(onNavigate).toHaveBeenCalledWith('script_ficha');
  });

  it('com versao: titulo v1, indice dos passos, comentario por passo e aprovar', async () => {
    (axios.get as any).mockImplementation(async (url: string) => {
      if (url === '/api/script/versoes') return { data: { success: true, versoes: [{ id: 'v1', versao: 1, status: 'rascunho', resumo: 'primeira', created_at: '2026-09-03 12:00:00', comentarios_count: 0 }], job: { id: 'j1', status: 'done' } } };
      if (url === '/api/script/versoes/1') return { data: { success: true, versao: { id: 'v1', versao: 1, status: 'rascunho', content_md: MD, created_at: '2026-09-03 12:00:00' }, comentarios: [{ id: 'c1', versao: 1, passo: 2, texto: 'Trocar a dor', autor_nome: 'Ana', created_at: '2026-09-03 12:10:00' }] } };
      throw new Error('url inesperada ' + url);
    });
    (axios.post as any).mockImplementation(async (url: string, body: any) => {
      if (url.endsWith('/comentarios')) return { data: { success: true, comentario: { id: 'c2', versao: 1, passo: body.passo, texto: body.texto, autor_nome: 'Ana', created_at: '2026-09-03 12:20:00' } } };
      if (url.endsWith('/aprovar')) return { data: { success: true, versao: { versao: 1, status: 'aprovado', aprovado_em: '2026-09-03 12:30:00' } } };
      throw new Error('post inesperado ' + url);
    });
    const ficha = fichaMock();
    render(<ScriptScreen ficha={ficha} token="t" />);
    expect(await screen.findByText('Script v1')).toBeInTheDocument();
    expect((await screen.findAllByText('Passo 1')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Trocar a dor')).toBeInTheDocument();
    expect(screen.getByText('Baixar (.md)')).toBeInTheDocument();
    expect(screen.getByText('Imprimir ou salvar em PDF')).toBeInTheDocument();

    const caixas = screen.getAllByPlaceholderText('O que mudar, cortar ou reforçar neste passo?');
    fireEvent.change(caixas[0], { target: { value: 'Mais direto' } });
    fireEvent.click(screen.getAllByText('Enviar comentário')[0]);
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/comentarios', { passo: 1, texto: 'Mais direto' }, expect.anything()));
    expect(await screen.findByText('Mais direto')).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText('Aprovar este script'));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/aprovar', {}, expect.anything()));
    expect(await screen.findByText('aprovado')).toBeInTheDocument();
    expect(ficha.refresh).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Pedir nova versão'));
    await waitFor(() => expect(ficha.gerarScript).toHaveBeenCalled());
    expect(await screen.findByText(/Pedido feito/)).toBeInTheDocument();
  });

  it('nenhum texto visível usa travessão nem a palavra diagnóstico', async () => {
    (axios.get as any).mockResolvedValueOnce({ data: { success: true, versoes: [], job: { id: 'j1', status: 'queued' } } });
    const { container } = render(<ScriptScreen ficha={fichaMock()} token="t" />);
    await screen.findByText('Seu script está sendo escrito.');
    const texto = container.textContent || '';
    expect(texto).not.toContain('—');
    expect(texto.toLowerCase()).not.toContain('diagnóstico');
  });
});
