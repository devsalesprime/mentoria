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

function fichaMock() {
  return {
    data: { club: { slug: 'x', nome: 'Elos Club' }, ficha_status: 'confirmada', script: { versoes: 0, ultima: null, aprovada: null, job: null } },
    gerarScript: vi.fn(async () => ({ ok: true, job: null, existing: false })),
    pedirRevisao: vi.fn(async () => ({ ok: true, job: null, existing: false })),
    refresh: vi.fn(),
  } as any;
}

function mockVersao(md: string) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [{ id: 'v1', versao: 1, status: 'rascunho', resumo: 'primeira', created_at: '2026-09-03 12:00:00', comentarios_count: 0 }], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { id: 'v1', versao: 1, status: 'rascunho', content_md: md, created_at: '2026-09-03 12:00:00' }, comentarios: [] } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos: [] } };
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

/** Seleciona de verdade (Selection + Range) o primeiro no de texto com 30+ caracteres da tela atual. */
function selecionarTrecho(reader: HTMLElement) {
  const tela = reader.querySelector('[data-tela]')!;
  const walker = document.createTreeWalker(tela, NodeFilter.SHOW_TEXT);
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
    expect(screen.getByTestId('grifos-painel')).toHaveTextContent(texto.slice(0, 40));
  });
});
