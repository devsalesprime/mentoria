import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen } from '../../components/script/ScriptScreen';
import {
  COPY_CONECTOR_ABRIR, COPY_CONECTOR_BAIXAR, COPY_CONECTOR_COPIAR, COPY_CONECTOR_COPIADO,
  COPY_CONECTOR_COPIAR_CURTO, COPY_CONECTOR_FOLHA_TITULO, COPY_CONECTOR_PAGINA, COPY_CONECTOR_SENHA,
  COPY_CONECTOR_TEXTO, COPY_CONECTOR_TITULO,
} from '../../components/script/script/ScriptReader';

/**
 * Cartao "Seu conector de IA" no bloco "Ações": ele so existe quando a versao traz o entregavel `conector`
 * publicado pelo worker. Clube sem esse entregavel nao ve nada.
 *
 * "Ver como conectar" abre a folha "Como conectar": o endereco do conector num cartao de codigo, o aviso de
 * que ele e a senha, o passo a passo lido do instalacao.md (axios com o token, `?inline=1`) e, no rodape, as
 * ancoras de baixar e da pagina publicada. A pagina so aparece quando `meta.pagina` vem preenchida: caindo
 * para `meta.url`, o mentor abria o proprio endereco do conector no navegador e levava um 406.
 * Nada de window.open: no celular ele disparava duas vezes e baixava o arquivo em dobro.
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

/** O instalacao.md que o servidor devolve: cabeçalho, parágrafo, lista numerada, lista de pontos, negrito, código e link. */
const MD_INSTALACAO = [
  '# Passo a passo do conector',
  '',
  'Leva **dois minutos** e vale para o ChatGPT e para o Claude.',
  '',
  '1. Abra as configurações.',
  '2. Cole o endereço em `Conectores`.',
  '',
  '- Funciona no celular também.',
  '- [Veja o guia completo](https://prosperus.app/guia)',
  '',
].join('\n');

const URL_CONECTOR = 'https://conector.prosperus.app/clube-x/mcp';
const URL_INSTALACAO = '/api/script/versoes/1/entregaveis/conector/instalacao';

const ENTREGAVEL_CONECTOR = {
  tipo: 'conector',
  versao: 1,
  created_at: '2026-09-10 10:00:00',
  meta: {
    url: URL_CONECTOR,
    pagina: 'https://conector.prosperus.app/clube-x/instalar',
    tools: 7,
    atualizado_em: '2026-09-10T10:00:00.000Z',
  },
  arquivos: [
    { campo: 'instalacao', nome: 'instalacao.md', bytes: 320, url: URL_INSTALACAO },
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

function mockVersao(entregaveis: any[], instalacao: { erro?: boolean } = {}) {
  const base = { id: 'v1', versao: 1, status: 'rascunho', resumo: '', created_at: '2026-09-10 09:00:00', comentarios_count: 0, entregaveis, slides_job: null };
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [base], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { ...base, content_md: MD }, comentarios: [] } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos: [] } };
    if (url.startsWith(URL_INSTALACAO)) {
      if (instalacao.erro) throw new Error('500');
      return { data: MD_INSTALACAO };
    }
    throw new Error('url inesperada ' + url);
  });
}

/** O bloco "Ações" (com o conector) fica na última tela do leitor. */
async function irParaAcoes() {
  const nav = await screen.findByRole('navigation', { name: 'Índice do script' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Preparação e métricas' }));
  return await screen.findByTestId('acoes-fim');
}

/** Abre a folha "Como conectar" e espera o passo a passo chegar do servidor. */
async function abrirFolha() {
  const acoes = await irParaAcoes();
  fireEvent.click(within(acoes).getByRole('button', { name: COPY_CONECTOR_ABRIR }));
  return await screen.findByTestId('conector-folha');
}

describe('ScriptScreen: o cartão "Seu conector de IA"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('com o entregável publicado: título, o que ele entrega e os dois botões', async () => {
    mockVersao([ENTREGAVEL_CONECTOR]);
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    const acoes = await irParaAcoes();
    const cartao = within(acoes).getByTestId('cartao-conector');
    expect(within(cartao).getByText(COPY_CONECTOR_TITULO)).toBeInTheDocument();
    expect(within(cartao).getByText(COPY_CONECTOR_TEXTO)).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: COPY_CONECTOR_ABRIR })).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: COPY_CONECTOR_COPIAR })).toBeInTheDocument();
  });

  it('a frase do cartão é exatamente a que foi aprovada', () => {
    expect(COPY_CONECTOR_TITULO).toBe('Seu conector de IA');
    expect(COPY_CONECTOR_TEXTO).toBe('O seu ChatGPT ou Claude passa a conhecer a sua ficha, o seu script e o método dos 7 passos. Prepare reuniões, avalie uma venda pela transcrição e treine objeções por voz.');
    expect(COPY_CONECTOR_ABRIR).toBe('Ver como conectar');
    expect(COPY_CONECTOR_COPIAR).toBe('Copiar o endereço do conector');
    expect(COPY_CONECTOR_SENHA).toBe('Este endereço é a sua senha. Não compartilhe.');
  });

  it('sem o entregável: nada de conector na tela', async () => {
    mockVersao([]);
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    const acoes = await irParaAcoes();
    expect(within(acoes).queryByTestId('cartao-conector')).toBeNull();
    expect(screen.queryByText(COPY_CONECTOR_TITULO)).toBeNull();
    expect(screen.queryByRole('button', { name: COPY_CONECTOR_ABRIR })).toBeNull();
  });

  it('nenhum botão do conector usa window.open', async () => {
    mockVersao([ENTREGAVEL_CONECTOR]);
    const open = vi.fn(() => ({} as any));
    vi.stubGlobal('open', open);
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    const folha = await abrirFolha();
    await screen.findByTestId('conector-instrucoes');
    fireEvent.click(within(folha).getByRole('button', { name: COPY_CONECTOR_COPIAR_CURTO }));
    expect(open).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  describe('a folha "Como conectar"', () => {
    it('abre com o endereço, o aviso da senha e o passo a passo vindo do servidor', async () => {
      mockVersao([ENTREGAVEL_CONECTOR]);
      render(<ScriptScreen ficha={fichaMock()} token="tok" />);
      const folha = await abrirFolha();
      expect(within(folha).getByRole('heading', { name: COPY_CONECTOR_FOLHA_TITULO })).toBeInTheDocument();
      expect(within(folha).getByTestId('conector-url')).toHaveTextContent(URL_CONECTOR);
      expect(within(folha).getByText(COPY_CONECTOR_SENHA)).toBeInTheDocument();

      const passo = await within(folha).findByTestId('conector-instrucoes');
      expect(passo.querySelector('h1')).toHaveTextContent('Passo a passo do conector');
      expect(passo.querySelector('strong')).toHaveTextContent('dois minutos');
      expect(passo.querySelector('code')).toHaveTextContent('Conectores');
      expect(Array.from(passo.querySelectorAll('ol > li')).map((li) => li.textContent)).toEqual([
        'Abra as configurações.',
        'Cole o endereço em Conectores.',
      ]);
      expect(passo.querySelectorAll('ul > li').length).toBe(2);
    });

    it('busca o instalacao.md com o token da sessão e `?inline=1`, uma vez só', async () => {
      mockVersao([ENTREGAVEL_CONECTOR]);
      render(<ScriptScreen ficha={fichaMock()} token="tok" />);
      const folha = await abrirFolha();
      await within(folha).findByTestId('conector-instrucoes');

      const chamada = (axios.get as any).mock.calls.find((c: any[]) => String(c[0]).startsWith(URL_INSTALACAO));
      expect(chamada[0]).toBe(`${URL_INSTALACAO}?inline=1`);
      expect(chamada[1].headers.Authorization).toBe('Bearer tok');
      expect(chamada[0]).not.toContain('token=');

      fireEvent.click(within(folha).getByRole('button', { name: 'Fechar Como conectar' }));
      fireEvent.click(screen.getByRole('button', { name: COPY_CONECTOR_ABRIR }));
      await screen.findByTestId('conector-instrucoes');
      expect((axios.get as any).mock.calls.filter((c: any[]) => String(c[0]).startsWith(URL_INSTALACAO)).length).toBe(1);
    });

    it('link do passo a passo abre numa aba nova', async () => {
      mockVersao([ENTREGAVEL_CONECTOR]);
      render(<ScriptScreen ficha={fichaMock()} token="tok" />);
      const folha = await abrirFolha();
      await within(folha).findByTestId('conector-instrucoes');
      const link = within(folha).getByRole('link', { name: 'Veja o guia completo' });
      expect(link).toHaveAttribute('href', 'https://prosperus.app/guia');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener');
    });

    it('servidor fora do ar: avisa e mantém o download à mão', async () => {
      mockVersao([ENTREGAVEL_CONECTOR], { erro: true });
      render(<ScriptScreen ficha={fichaMock()} token="tok" />);
      const folha = await abrirFolha();
      await within(folha).findByTestId('conector-erro');
      expect(within(folha).queryByTestId('conector-instrucoes')).toBeNull();
      expect(within(folha).getByRole('link', { name: COPY_CONECTOR_BAIXAR })).toBeInTheDocument();
    });

    it('"Baixar as instruções" é âncora com o token e o atributo download', async () => {
      mockVersao([ENTREGAVEL_CONECTOR]);
      render(<ScriptScreen ficha={fichaMock()} token="tok" />);
      const folha = await abrirFolha();
      const baixar = within(folha).getByRole('link', { name: COPY_CONECTOR_BAIXAR });
      expect(baixar).toHaveAttribute('href', `${URL_INSTALACAO}?token=tok`);
      expect(baixar).toHaveAttribute('download');
      expect(baixar).toHaveAttribute('target', '_blank');
      expect(baixar).toHaveAttribute('rel', 'noopener');
    });

    it('com meta.pagina: a âncora da página publicada aparece, sem o token', async () => {
      mockVersao([ENTREGAVEL_CONECTOR]);
      render(<ScriptScreen ficha={fichaMock()} token="tok" />);
      const folha = await abrirFolha();
      const pagina = within(folha).getByRole('link', { name: COPY_CONECTOR_PAGINA });
      expect(pagina).toHaveAttribute('href', 'https://conector.prosperus.app/clube-x/instalar');
      expect(pagina).toHaveAttribute('target', '_blank');
      expect(pagina.getAttribute('href')).not.toContain('token');
    });

    it('sem meta.pagina: nada de página, e o endereço do conector não vira link', async () => {
      mockVersao([{ ...ENTREGAVEL_CONECTOR, meta: { url: URL_CONECTOR } }]);
      render(<ScriptScreen ficha={fichaMock()} token="tok" />);
      const folha = await abrirFolha();
      expect(within(folha).queryByRole('link', { name: COPY_CONECTOR_PAGINA })).toBeNull();
      expect(within(folha).queryByTestId('conector-pagina')).toBeNull();
      expect(within(folha).getByTestId('conector-url')).toHaveTextContent(URL_CONECTOR);
      expect(within(folha).queryByRole('link', { name: URL_CONECTOR })).toBeNull();
    });
  });

  describe('copiar o endereço', () => {
    it('o botão do cartão manda o endereço para a área de transferência e confirma', async () => {
      mockVersao([ENTREGAVEL_CONECTOR]);
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      render(<ScriptScreen ficha={fichaMock()} token="tok" />);
      const acoes = await irParaAcoes();
      fireEvent.click(within(acoes).getByRole('button', { name: COPY_CONECTOR_COPIAR }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_CONECTOR));
      expect(await screen.findByTestId('conector-copiado')).toHaveTextContent(COPY_CONECTOR_COPIADO);
    });

    it('o botão da folha copia o mesmo endereço', async () => {
      mockVersao([ENTREGAVEL_CONECTOR]);
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      render(<ScriptScreen ficha={fichaMock()} token="tok" />);
      const folha = await abrirFolha();
      fireEvent.click(within(folha).getByRole('button', { name: COPY_CONECTOR_COPIAR_CURTO }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_CONECTOR));
      expect(await within(folha).findByTestId('conector-copiado-folha')).toHaveTextContent(COPY_CONECTOR_COPIADO);
    });

    it('sem área de transferência, cai na seleção escondida', async () => {
      mockVersao([ENTREGAVEL_CONECTOR]);
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      const execCommand = vi.fn(() => true);
      Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
      render(<ScriptScreen ficha={fichaMock()} token="tok" />);
      const acoes = await irParaAcoes();
      fireEvent.click(within(acoes).getByRole('button', { name: COPY_CONECTOR_COPIAR }));
      await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
      expect(await screen.findByTestId('conector-copiado')).toHaveTextContent(COPY_CONECTOR_COPIADO);
    });
  });

  it('a cópia do cartão não usa travessão nem ponto de exclamação', () => {
    const PROIBIDOS = new RegExp('[\u2014\u2013!]'); // travessão, meia risca e exclamação
    const textos = [
      COPY_CONECTOR_TITULO, COPY_CONECTOR_TEXTO, COPY_CONECTOR_ABRIR, COPY_CONECTOR_COPIAR,
      COPY_CONECTOR_FOLHA_TITULO, COPY_CONECTOR_COPIAR_CURTO, COPY_CONECTOR_SENHA, COPY_CONECTOR_COPIADO,
      COPY_CONECTOR_BAIXAR, COPY_CONECTOR_PAGINA,
    ];
    for (const texto of textos) expect(texto).not.toMatch(PROIBIDOS);
  });
});
