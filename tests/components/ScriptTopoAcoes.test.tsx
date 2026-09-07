import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen } from '../../components/script/ScriptScreen';
import { COPY_PPTX_BAIXAR, COPY_PPTX_GERAR } from '../../components/script/script/ScriptReader';

/**
 * Onda E1 (SPEC-workflow-v3-decisoes-07-09 §2, itens 1, 2, 4, 5 e 8): a barra de cima de "Seu script".
 * - esquerda: a pílula da versão (com a troca) e "O que mudou"
 * - direita: "Baixar" (cartão em imagem, PDFs, texto e a apresentação) e a chave Treinamento | Campo,
 *   na mesma altura e hierarquia do "Baixar"
 * - o topo não tem mais "Aprovar o script", "Pedir nova versão", "Escrever do zero", "Revisar a ficha"
 *   nem "Aprofundar para o completo": as três primeiras viraram o bloco "Ações", no fim do leitor, e as
 *   duas últimas ficam no menu do Dashboard (Ficha)
 * - "Baixar cartão" baixa uma imagem (PNG) do cartão de bolso
 * - a vista Campo é global e esconde os treinamentos e o "Por que funciona"
 */

const toPng = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,QUJD'));
vi.mock('html-to-image', () => ({ toPng }));
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

/** Dois documentos (Treinamento e Campo), cartão de bolso e a anatomia da fala no treinamento. */
const MD = [
  '# Script · Os 7 Passos · Elos Club',
  '',
  '**Para quem eu vendo:** o dono',
  '',
  '# Documento 1 · Script completo para treinamento',
  '',
  '## Passo 1 · Conexão',
  '',
  '**Objetivo estratégico:** abrir a conversa.',
  '',
  '**Fala sugerida:**',
  '',
  '1. "[FALA DO VENDEDOR] Prazer, eu sou o Rafael, do time da Paloma."',
  '> Anatomia da fala',
  '> - [Conexão] «Prazer, eu sou o Rafael» · por que: a pessoa antes da empresa',
  '',
  '# Documento 2 · Script de campo',
  '',
  '## Passo 1 · Conexão',
  '',
  '1. "[FALA DO VENDEDOR] Fala de campo do passo 1." [Pausa.]',
  '',
  '## Mapa de preparação',
  '',
  '| Passo | O que o passo pede |',
  '|--|--|',
  '| 1 | a pessoa antes da empresa |',
  '',
  '## Cartão de bolso',
  '',
  '### Os 7 passos em 7 linhas',
  '',
  '1. Conexão: a pessoa antes da empresa.',
  '',
].join('\n');

const ENTREGAVEL_SLIDES = {
  tipo: 'slides',
  versao: 1,
  created_at: '2026-09-07 10:00:00',
  arquivos: [
    { campo: 'pptx', nome: 'apresentacao.pptx', bytes: 120, url: '/api/script/versoes/1/entregaveis/slides/pptx' },
    { campo: 'pdf', nome: 'apresentacao.pdf', bytes: 90, url: '/api/script/versoes/1/entregaveis/slides/pdf' },
  ],
};

function fichaMock(over: Record<string, unknown> = {}) {
  return {
    data: { club: { slug: 'elos', nome: 'Elos Club' }, ficha_status: 'confirmada', modo: 'essencial', script: { versoes: 1, ultima: null, aprovada: null, job: null }, ...over },
    gerarScript: vi.fn(async () => ({ ok: true })),
    pedirRevisao: vi.fn(async () => ({ ok: true })),
    definirModo: vi.fn(async () => ({ ok: true })),
    refresh: vi.fn(),
  } as any;
}

function mockVersao({ entregaveis = [] as any[], slidesJob = null as any, status = 'rascunho' } = {}) {
  const base = { id: 'v1', versao: 1, status, resumo: 'trocamos a abertura', created_at: '2026-09-07 09:00:00', comentarios_count: 0, entregaveis, slides_job: slidesJob };
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [base], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { ...base, content_md: MD }, comentarios: [] } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos: [] } };
    if (url === '/api/script/versoes/1/tarefas') return { data: { success: true, versao: 1, tarefas: [] } };
    throw new Error('url inesperada ' + url);
  });
}

/** jsdom não abre o <details> no clique do summary: abrir na mão, como o resto da suíte faz. */
function abrirMenuBaixar(container: HTMLElement) {
  const menu = container.querySelector('details.script-mais') as HTMLDetailsElement;
  menu.open = true;
  return menu;
}

async function irParaTela(nome: string | RegExp) {
  const nav = await screen.findByRole('navigation', { name: 'Índice do script' });
  fireEvent.click(within(nav).getByRole('button', { name: nome }));
  return nav;
}

describe('Seu script · barra de cima', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('esquerda: versão e "O que mudou"; direita: "Baixar" e a chave Treinamento | Campo', async () => {
    mockVersao();
    const { container } = render(<ScriptScreen ficha={fichaMock()} token="tok" onNavigate={vi.fn()} />);
    await screen.findByTestId('mudou-botao');
    const topo = screen.getByTestId('script-topo');
    const [esquerda, direita] = Array.from(topo.querySelectorAll('.script-topo-lado')) as HTMLElement[];

    expect(within(esquerda).getByTestId('versao-pilula')).toHaveTextContent('v1');
    expect(within(esquerda).getByTestId('mudou-botao')).toHaveTextContent('O que mudou');
    expect(within(direita).getByTestId('baixar-botao')).toHaveTextContent('Baixar');
    const modo = within(direita).getByRole('group', { name: 'Modo de leitura' });
    expect(within(modo).getByTestId('modo-treinamento')).toHaveAttribute('aria-pressed', 'true');
    expect(within(modo).getByTestId('modo-campo')).toHaveAttribute('aria-pressed', 'false');

    // "O que mudou" abre o resumo da versão
    const mudou = container.querySelector('details.script-mudou') as HTMLDetailsElement;
    mudou.open = true;
    expect(within(screen.getByTestId('mudou-folha')).getByText('trocamos a abertura')).toBeInTheDocument();

    // o topo perdeu as ações de decisão e os atalhos da ficha
    expect(within(topo).queryByText('Aprovar o script')).toBeNull();
    expect(within(topo).queryByText('Pedir nova versão')).toBeNull();
    expect(within(topo).queryByText('Escrever do zero')).toBeNull();
    expect(screen.queryByTestId('link-revisar-ficha')).toBeNull();
    expect(screen.queryByTestId('aprofundar-completo')).toBeNull();
    expect(screen.queryByText('Mais')).toBeNull();

    // alvos de toque de 44 px na barra de cima
    for (const el of [screen.getByTestId('versao-pilula'), screen.getByTestId('mudou-botao'), screen.getByTestId('baixar-botao')]) {
      expect(el.className).toMatch(/script-topo-btn|script-versao-pilula/);
    }
  });

  it('o menu "Baixar" traz cartão em imagem, os PDFs, o texto e a apresentação quando ela existe', async () => {
    mockVersao({ entregaveis: [ENTREGAVEL_SLIDES] });
    const { container } = render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    await screen.findByTestId('script-reader');
    abrirMenuBaixar(container);

    const menu = screen.getByRole('group', { name: 'Baixar' });
    expect(within(menu).getByTestId('baixar-cartao')).toHaveTextContent('Cartão de bolso (imagem)');
    expect(within(menu).getByTestId('pdf-campo')).toHaveTextContent('Script de campo (PDF)');
    expect(within(menu).getByTestId('pdf-treinamento')).toHaveTextContent('Treinamento (PDF)');
    expect(within(menu).getByTestId('pdf-ambos')).toHaveTextContent('Os dois (PDF)');
    expect(within(menu).getByTestId('baixar-md')).toHaveTextContent('Texto (.md)');
    expect(within(menu).getByTestId('slides-pptx')).toHaveTextContent('Apresentação (PPTX)');

    const open = vi.fn().mockReturnValue({});
    Object.defineProperty(window, 'open', { value: open, configurable: true, writable: true });
    fireEvent.click(within(menu).getByTestId('pdf-campo'));
    expect(open).toHaveBeenLastCalledWith(expect.stringMatching(/doc=campo&versao=1$/), '_blank', 'noopener');
    fireEvent.click(within(menu).getByTestId('slides-pptx'));
    expect(open).toHaveBeenLastCalledWith('/api/script/versoes/1/entregaveis/slides/pptx?token=tok', '_blank', 'noopener');
  });

  it('sem apresentação pronta, o menu "Baixar" não oferece o PPTX', async () => {
    mockVersao();
    const { container } = render(<ScriptScreen ficha={fichaMock()} token="tok" pollMs={100000} />);
    await screen.findByTestId('script-topo');
    abrirMenuBaixar(container);
    expect(screen.queryByTestId('slides-pptx')).toBeNull();
  });
});

describe('Seu script · baixar o cartão de bolso como imagem', () => {
  const baixados: Array<{ href: string; download: string }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    baixados.length = 0;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      baixados.push({ href: this.href, download: this.download });
    });
  });

  it('o Cartão de bolso tem um botão só: "Baixar cartão", que gera o PNG', async () => {
    mockVersao();
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    const reader = await screen.findByTestId('script-reader');
    // onda E4: o script novo abre no Início; o cartão é a tela seguinte
    fireEvent.click(await within(reader).findByTestId('inicio-cartao'));
    expect(await within(reader).findByText('Cartão de bolso')).toBeInTheDocument();
    expect(within(reader).queryByRole('button', { name: 'Copiar cartão de bolso' })).toBeNull();
    expect(within(reader).queryByRole('button', { name: 'Imprimir cartão de bolso' })).toBeNull();

    fireEvent.click(within(reader).getByTestId('baixar-cartao-tela'));
    await waitFor(() => expect(toPng).toHaveBeenCalled());
    const [alvo, opcoes] = toPng.mock.calls[0] as unknown as [HTMLElement, Record<string, unknown>];
    expect(alvo.id).toBe('script-cartao-export');
    expect(opcoes).toMatchObject({ pixelRatio: 2, backgroundColor: '#FCF7F0' });
    await waitFor(() => expect(baixados).toHaveLength(1));
    expect(baixados[0].download).toBe('cartao-de-bolso-elos-club-v1.png');
    expect(baixados[0].href).toContain('data:image/png');
  });

  it('o menu "Baixar" gera o mesmo PNG de qualquer tela do leitor', async () => {
    mockVersao();
    const { container } = render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    await screen.findByTestId('script-reader');
    await irParaTela('Preparação e métricas');
    abrirMenuBaixar(container);
    fireEvent.click(screen.getByTestId('baixar-cartao'));
    await waitFor(() => expect(baixados).toHaveLength(1));
    expect(baixados[0].download).toBe('cartao-de-bolso-elos-club-v1.png');
  });
});

describe('Seu script · Treinamento e Campo global', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('a vista Campo esconde os treinamentos e o "Por que funciona"; a escolha vale para o leitor inteiro e fica lembrada', async () => {
    mockVersao();
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    const reader = await screen.findByTestId('script-reader');
    await irParaTela(/^Passo 1:/);

    // Treinamento: tem gravação recomendada e a anatomia da fala
    expect(await within(reader).findByTestId('treinamentos-passo')).toBeInTheDocument();
    expect(within(reader).getByRole('button', { name: 'Por que funciona' })).toBeInTheDocument();
    // dentro do passo não existe mais escolha de documento
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();

    fireEvent.click(screen.getByTestId('modo-campo'));
    await waitFor(() => expect(screen.getByTestId('modo-campo')).toHaveAttribute('aria-pressed', 'true'));
    expect(await within(reader).findByText(/Fala de campo do passo 1/)).toBeInTheDocument();
    expect(within(reader).queryByTestId('treinamentos-passo')).toBeNull();
    expect(within(reader).queryByRole('button', { name: 'Por que funciona' })).toBeNull();
    expect(sessionStorage.getItem('script-aba')).toBe('campo');
    expect(screen.getByTestId('modo-legenda')).toHaveTextContent('Campo');
  });

  it('a sessão lembra a vista Campo quando a tela abre de novo', async () => {
    sessionStorage.setItem('script-aba', 'campo');
    mockVersao();
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    await screen.findByTestId('script-reader');
    await waitFor(() => expect(screen.getByTestId('modo-campo')).toHaveAttribute('aria-pressed', 'true'));
    await irParaTela(/^Passo 1:/);
    expect(screen.queryByTestId('treinamentos-passo')).toBeNull();
  });
});

describe('Seu script · bloco "Ações" no fim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('aprovar, pedir nova versão, escrever do zero e a apresentação ficam depois do Passo 7, na Preparação', async () => {
    mockVersao();
    (axios.post as any).mockImplementation(async (url: string) => {
      if (url === '/api/script/versoes/1/slides') return { data: { success: true, versao: 1, job: { id: 'js2', tipo: 'slides', status: 'queued', existing: false } } };
      if (url === '/api/script/versoes/1/aprovar') return { data: { success: true, versao: { versao: 1, status: 'aprovado', aprovado_em: '2026-09-07 12:00:00' } } };
      throw new Error('post inesperado ' + url);
    });
    render(<ScriptScreen ficha={fichaMock()} token="tok" pollMs={100000} />);
    const reader = await screen.findByTestId('script-reader');

    // nas outras telas o bloco não aparece
    expect(within(reader).queryByTestId('acoes-fim')).toBeNull();
    await irParaTela(/^Passo 1:/);
    expect(within(reader).queryByTestId('acoes-fim')).toBeNull();

    await irParaTela('Preparação e métricas');
    const acoes = await within(reader).findByTestId('acoes-fim');
    expect(within(acoes).getByText('Aprovar o script')).toBeInTheDocument();
    expect(within(acoes).getByText('Pedir nova versão')).toBeInTheDocument();
    expect(within(acoes).getByTestId('escrever-do-zero')).toHaveTextContent('Escrever do zero');
    // a apresentação saiu do Cartão de bolso e mora aqui
    const bloco = within(acoes).getByTestId('cartao-apresentacao');
    expect(within(bloco).getByTestId('cartao-pptx-gerar')).toHaveTextContent(COPY_PPTX_GERAR);
    fireEvent.click(within(bloco).getByTestId('cartao-pptx-gerar'));
    // onda E4: duas etapas antes do pedido sair
    fireEvent.click(await screen.findByTestId('apres-avancar'));
    fireEvent.click(await screen.findByTestId('apres-confirmar'));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/slides', {}, expect.anything()));
    await waitFor(() => expect(screen.getByTestId('cartao-pptx-montando')).toBeInTheDocument());
  });

  it('o Cartão de bolso não tem mais o bloco da apresentação', async () => {
    mockVersao({ entregaveis: [ENTREGAVEL_SLIDES] });
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    const reader = await screen.findByTestId('script-reader');
    fireEvent.click(await within(reader).findByTestId('inicio-cartao'));
    expect(await within(reader).findByText('Cartão de bolso')).toBeInTheDocument();
    expect(screen.queryByTestId('cartao-apresentacao')).toBeNull();

    await irParaTela('Preparação e métricas');
    const bloco = await screen.findByTestId('cartao-apresentacao');
    expect(within(bloco).getByTestId('cartao-pptx-baixar')).toHaveTextContent(COPY_PPTX_BAIXAR);
    expect(within(bloco).getByTestId('slides-pdf')).toHaveTextContent('Ver em PDF');
  });

  it('a copy do bloco segue as regras da casa: sem travessão, sem a palavra vetada e sem emoji', async () => {
    mockVersao({ entregaveis: [ENTREGAVEL_SLIDES] });
    render(<ScriptScreen ficha={fichaMock()} token="tok" />);
    await screen.findByTestId('script-reader');
    await irParaTela('Preparação e métricas');
    const texto = (await screen.findByTestId('acoes-fim')).textContent || '';
    expect(texto).toContain('Ações');
    expect(texto).not.toContain('—');
    expect(texto).not.toMatch(/diagn[oó]stic/i);
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
