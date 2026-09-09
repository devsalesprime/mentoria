import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen } from '../../components/script/ScriptScreen';

/**
 * Selecao -> balao "Grifar" -> marca pendente. Reproduz o bug "eu marco o texto e a selecao some": a selecao nativa recolhe
 * (toque no balao, foco na nota, celular) e nada mais mostrava o trecho. Agora a captura pinta `script-grifo-pendente`
 * e sobrevive ao selectionchange recolhido; so pointerdown fora do balao, Esc, Cancelar ou salvar fecham.
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

const FIXTURE = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/script-exemplo.md'), 'utf8');
/** A fixture com os quatro tipos do CNCS no Passo 2, que é onde vive a folha de perguntas. */
const FIXTURE_CNCS = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/script-secoes-v4.md'), 'utf8');

function fichaMock() {
  return {
    data: { club: { slug: 'x', nome: 'Elos Club' }, ficha_status: 'confirmada', script: { versoes: 0, ultima: null, aprovada: null, job: null } },
    gerarScript: vi.fn(async () => ({ ok: true, job: null, existing: false })),
    pedirRevisao: vi.fn(async () => ({ ok: true, job: null, existing: false })),
    refresh: vi.fn(),
  } as any;
}

function mockVersao(md: string, grifosSalvos: any[] = []) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [{ id: 'v1', versao: 1, status: 'rascunho', resumo: 'primeira', created_at: '2026-09-03 12:00:00', comentarios_count: 0 }], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { id: 'v1', versao: 1, status: 'rascunho', content_md: md, created_at: '2026-09-03 12:00:00' }, comentarios: [] } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos: grifosSalvos } };
    throw new Error('url inesperada ' + url);
  });
  (axios.post as any).mockImplementation(async (url: string, body: any) => {
    if (url === '/api/script/versoes/1/grifos') {
      return { data: { success: true, grifo: { id: 'g1', versao: 1, passo: body.passo, documento: body.documento, texto: body.texto, prefixo: body.prefixo, sufixo: body.sufixo, cor: body.cor, nota: body.nota, autor_email: null, autor_nome: 'Ana', created_at: '2026-09-04 10:00:00', resolvido_em: null } } };
    }
    throw new Error('post inesperado ' + url);
  });
}

class HighlightMock { ranges: Range[]; constructor(...r: Range[]) { this.ranges = r; } }
let highlights: { set: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
const NOME = 'script-grifo-pendente';
const chamadas = (fn: ReturnType<typeof vi.fn>, nome: string) => fn.mock.calls.filter((c) => c[0] === nome);
const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim();

function pointer(el: Element | Document, tipo: 'pointerdown' | 'pointerup', pointerType = 'mouse') {
  const ev = new Event(tipo, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  el.dispatchEvent(ev);
}

/** Seleciona de verdade (Selection + Range) o primeiro no de texto com 30+ caracteres de `raiz`. */
function selecionarEm(raiz: Element) {
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node && node.data.trim().length < 30) node = walker.nextNode() as Text | null;
  if (!node) throw new Error('sem texto para selecionar');
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, Math.min(node.data.length, 60));
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  return { range, texto: normalizar(range.toString()), el: node.parentElement! };
}

/** O mesmo, na tela aberta do leitor. */
function selecionarTrecho(reader: HTMLElement) {
  return selecionarEm(reader.querySelector('[data-tela]')!);
}

async function irParaPasso(n: number) {
  const nav = await screen.findByRole('navigation', { name: 'Índice do script' });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^Passo ${n}:`) }));
  await screen.findByText(`Passo ${n} de 7`);
}

/** Abre o script no passo 1, seleciona um trecho com o mouse e espera o balao. */
async function abrirBalao() {
  mockVersao(FIXTURE);
  render(<ScriptScreen ficha={fichaMock()} token="t" />);
  const reader = await screen.findByTestId('script-reader');
  await irParaPasso(1);
  const sel = selecionarTrecho(reader);
  act(() => pointer(sel.el, 'pointerdown'));
  act(() => pointer(document, 'pointerup'));
  const balao = await screen.findByTestId('grifo-balao');
  return { reader, balao, ...sel };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ScriptScreen: selecao -> balao "Grifar" -> marca pendente', () => {
  const larguraOriginal = window.innerWidth;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    highlights = { set: vi.fn(), delete: vi.fn() };
    Object.defineProperty(globalThis, 'Highlight', { value: HighlightMock, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'CSS', { value: { highlights }, configurable: true, writable: true });
  });
  afterEach(() => {
    delete (globalThis as any).Highlight;
    delete (globalThis as any).CSS;
    window.getSelection()?.removeAllRanges();
    Object.defineProperty(window, 'innerWidth', { value: larguraOriginal, configurable: true, writable: true });
  });

  it('a captura pinta o trecho como pendente e o balao nao rouba o foco ao montar', async () => {
    const { balao, texto } = await abrirBalao();
    const previa = texto.length > 90 ? `${texto.slice(0, 89)}…` : texto;
    expect(within(balao).getByText(`«${previa}»`)).toBeInTheDocument();
    await waitFor(() => expect(chamadas(highlights.set, NOME).length).toBeGreaterThan(0));
    const pintado = chamadas(highlights.set, NOME).at(-1)![1] as HighlightMock;
    expect(pintado).toBeInstanceOf(HighlightMock);
    expect(pintado.ranges).toHaveLength(1);
    expect(normalizar(pintado.ranges[0].toString())).toBe(texto);
    // sem autoFocus: o foco fica onde estava (a selecao nativa nao vai para um campo do balao)
    expect(balao.contains(document.activeElement)).toBe(false);
    expect(document.activeElement).toBe(document.body);
    // as 3 cores
    expect(within(balao).getByRole('button', { name: 'Ajustar' })).toBeInTheDocument();
    expect(within(balao).getByRole('button', { name: 'Manter' })).toBeInTheDocument();
    expect(within(balao).getByRole('button', { name: 'Tirar' })).toBeInTheDocument();
  });

  it('selectionchange com a selecao recolhida NAO derruba a captura nem apaga a marca pendente', async () => {
    const { balao } = await abrirBalao();
    await waitFor(() => expect(chamadas(highlights.set, NOME).length).toBeGreaterThan(0));
    const apagadasAntes = chamadas(highlights.delete, NOME).length;
    // o toque no balao (ou o foco na nota) recolhe a selecao nativa
    act(() => { window.getSelection()!.removeAllRanges(); document.dispatchEvent(new Event('selectionchange')); });
    await act(async () => { await dormir(350); });
    expect(screen.getByTestId('grifo-balao')).toBe(balao);
    expect(chamadas(highlights.delete, NOME).length).toBe(apagadasAntes);
    // escolher a cor e tocar na nota tambem nao derruba
    fireEvent.click(within(balao).getByRole('button', { name: 'Ajustar' }));
    const nota = within(balao).getByPlaceholderText(/Nota \(opcional\)/);
    act(() => pointer(nota, 'pointerdown'));
    act(() => pointer(nota, 'pointerup'));
    await act(async () => { await dormir(20); });
    expect(screen.getByTestId('grifo-balao')).toBe(balao);
    expect(chamadas(highlights.delete, NOME).length).toBe(apagadasAntes);
  });

  it('"fechar" apaga a marca pendente; Esc fecha; pointerdown fora do balao fecha', async () => {
    const { balao, reader } = await abrirBalao();
    await waitFor(() => expect(chamadas(highlights.set, NOME).length).toBeGreaterThan(0));
    fireEvent.click(within(balao).getByRole('button', { name: 'Fechar o balão de grifo' }));
    await waitFor(() => expect(screen.queryByTestId('grifo-balao')).toBeNull());
    expect(chamadas(highlights.delete, NOME).length).toBeGreaterThan(0);

    // Esc
    const sel2 = selecionarTrecho(reader);
    act(() => pointer(sel2.el, 'pointerdown'));
    act(() => pointer(document, 'pointerup'));
    await screen.findByTestId('grifo-balao');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('grifo-balao')).toBeNull());

    // toque fora do balao (no texto)
    const sel3 = selecionarTrecho(reader);
    act(() => pointer(sel3.el, 'pointerdown'));
    act(() => pointer(document, 'pointerup'));
    await screen.findByTestId('grifo-balao');
    const antes = chamadas(highlights.delete, NOME).length;
    act(() => pointer(sel3.el, 'pointerdown', 'touch'));
    await waitFor(() => expect(screen.queryByTestId('grifo-balao')).toBeNull());
    expect(chamadas(highlights.delete, NOME).length).toBeGreaterThan(antes);
  });

  it('celular: cor + salvar grava pelo POST, a marca pendente some e a cor salva entra no lugar', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
    const { balao, texto } = await abrirBalao();
    expect(balao.className).toContain('script-grifo-balao-folha');
    await waitFor(() => expect(chamadas(highlights.set, NOME).length).toBeGreaterThan(0));
    // no celular o toque no balao recolhe a selecao antes do clique
    act(() => { window.getSelection()!.removeAllRanges(); document.dispatchEvent(new Event('selectionchange')); });
    fireEvent.click(within(balao).getByRole('button', { name: 'Manter' }));
    fireEvent.click(within(balao).getByRole('button', { name: /Salvar grifo|^Grifar$/ }));
    await waitFor(() => expect(screen.queryByTestId('grifo-balao')).toBeNull());
    expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/grifos', expect.objectContaining({ texto, cor: 'verde', documento: 'treinamento' }), expect.anything());
    expect(chamadas(highlights.delete, NOME).length).toBeGreaterThan(0);
    await waitFor(() => {
      const verde = chamadas(highlights.set, 'script-grifo-verde').at(-1)![1] as HighlightMock;
      expect(verde.ranges).toHaveLength(1);
      expect(normalizar(verde.ranges[0].toString())).toBe(texto);
    });
    // onda J (item 7): a lista abre pela pastilha flutuante, no celular e no desktop
    fireEvent.click(screen.getByTestId('grifos-flutuante'));
    expect(screen.getByTestId('grifos-painel')).toHaveTextContent(texto.slice(0, 40));
  });
});

/**
 * Item 4a do pedido de 09/09: grifar DENTRO da folha de perguntas do Passo 2 (o CNCS). Antes a folha ia por
 * portal para o `document.body`, fora da raiz que escuta a selecao e sem `[data-tela]` por perto: selecionar
 * ali nao abria balao nenhum. Agora ela nasce dentro da tela do passo, entao o grifo nasce com o passo e o
 * documento certos, e os grifos ja salvos sao pintados la dentro.
 */
describe('ScriptScreen: grifo dentro da folha de perguntas (CNCS)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    highlights = { set: vi.fn(), delete: vi.fn() };
    Object.defineProperty(globalThis, 'Highlight', { value: HighlightMock, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'CSS', { value: { highlights }, configurable: true, writable: true });
  });
  afterEach(() => {
    delete (globalThis as any).Highlight;
    delete (globalThis as any).CSS;
    window.getSelection()?.removeAllRanges();
  });

  async function abrirFolhaDoPasso2(grifosSalvos: any[] = []) {
    mockVersao(FIXTURE_CNCS, grifosSalvos);
    render(<ScriptScreen ficha={fichaMock()} token="t" />);
    const reader = await screen.findByTestId('script-reader');
    await irParaPasso(2);
    fireEvent.click(screen.getAllByTestId('perguntas-botao')[0]);
    const folha = await screen.findByTestId('perguntas-folha');
    return { reader, folha };
  }

  it('a folha abre dentro da tela do passo e a selecao la dentro abre o balao', async () => {
    const { reader, folha } = await abrirFolhaDoPasso2();
    // a folha esta dentro da raiz do leitor e dentro do `[data-tela]` do Passo 2 (coordenada de conteudo 3)
    expect(reader.contains(folha)).toBe(true);
    expect(folha.closest('[data-tela]')!.getAttribute('data-tela')).toBe('3');

    const sel = selecionarEm(folha);
    act(() => pointer(sel.el, 'pointerdown'));
    act(() => pointer(document, 'pointerup'));
    const balao = await screen.findByTestId('grifo-balao');
    expect(balao).toBeInTheDocument();
    // o trecho selecionado dentro da folha fica marcado como pendente, como em qualquer lugar da pagina
    await waitFor(() => expect(chamadas(highlights.set, NOME).length).toBeGreaterThan(0));
    const pendente = chamadas(highlights.set, NOME).at(-1)![1] as HighlightMock;
    expect(normalizar(pendente.ranges[0].toString())).toBe(sel.texto);
  });

  it('salvar dentro da folha grava o grifo no passo e no documento certos, e ele e pintado la dentro', async () => {
    const { folha } = await abrirFolhaDoPasso2();
    const sel = selecionarEm(folha);
    act(() => pointer(sel.el, 'pointerdown'));
    act(() => pointer(document, 'pointerup'));
    const balao = await screen.findByTestId('grifo-balao');
    fireEvent.click(within(balao).getByRole('button', { name: 'Ajustar' }));
    fireEvent.click(await within(balao).findByRole('button', { name: /Salvar grifo|^Grifar$/ }));
    await waitFor(() => expect(screen.queryByTestId('grifo-balao')).toBeNull());
    expect(axios.post).toHaveBeenCalledWith(
      '/api/script/versoes/1/grifos',
      expect.objectContaining({ texto: sel.texto, cor: 'dourado', passo: 3, documento: 'treinamento' }),
      expect.anything()
    );
    // com a folha aberta, o grifo salvo e reencontrado e pintado dentro dela
    await waitFor(() => {
      const dourado = chamadas(highlights.set, 'script-grifo-dourado').at(-1)![1] as HighlightMock;
      expect(dourado.ranges).toHaveLength(1);
      expect(normalizar(dourado.ranges[0].toString())).toBe(sel.texto);
      expect(screen.getByTestId('perguntas-folha').contains(dourado.ranges[0].startContainer)).toBe(true);
    });
  });

  it('grifo que ja existia numa fala da folha e pintado assim que ela abre', async () => {
    const texto = 'o que te fez estar aqui hoje?';
    const salvo = {
      id: 'g9', versao: 1, passo: 3, documento: 'treinamento', texto, prefixo: '', sufixo: '',
      cor: 'verde', nota: '', autor_email: null, autor_nome: 'Ana', created_at: '2026-09-08 10:00:00', resolvido_em: null,
    };
    mockVersao(FIXTURE_CNCS, [salvo]);
    render(<ScriptScreen ficha={fichaMock()} token="t" />);
    // antes de abrir a folha o trecho nao esta na tela: nada de verde pintado
    await screen.findByTestId('script-reader');
    await irParaPasso(2);
    await waitFor(() => expect(chamadas(highlights.set, 'script-grifo-verde').length).toBeGreaterThan(0));
    expect((chamadas(highlights.set, 'script-grifo-verde').at(-1)![1] as HighlightMock).ranges).toHaveLength(0);
    // a folha entra e o texto dela entra junto no indice: o grifo aparece marcado la dentro
    fireEvent.click(screen.getAllByTestId('perguntas-botao')[0]);
    const folha = await screen.findByTestId('perguntas-folha');
    await waitFor(() => {
      const verde = chamadas(highlights.set, 'script-grifo-verde').at(-1)![1] as HighlightMock;
      expect(verde.ranges).toHaveLength(1);
      expect(normalizar(verde.ranges[0].toString())).toBe(texto);
      expect(folha.contains(verde.ranges[0].startContainer)).toBe(true);
    });
    // e sai do indice quando a folha fecha
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      const verde = chamadas(highlights.set, 'script-grifo-verde').at(-1)![1] as HighlightMock;
      expect(verde.ranges).toHaveLength(0);
    });
  });
});
