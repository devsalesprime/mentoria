import { capturarSelecao, limparPendente, limparPintura, NOME_PENDENTE, pintarPendente, suportaPintura } from '../../components/script/grifos/anchor';

class HighlightMock { ranges: Range[]; constructor(...r: Range[]) { this.ranges = r; } }

describe('grifos/anchor: marca pendente', () => {
  let highlights: { set: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    highlights = { set: vi.fn(), delete: vi.fn() };
    Object.defineProperty(globalThis, 'Highlight', { value: HighlightMock, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'CSS', { value: { highlights }, configurable: true, writable: true });
    document.body.innerHTML = '<div id="root"><div data-tela="2" data-documento="treinamento"><p>Um trecho grande o bastante para virar grifo no script.</p></div></div>';
  });
  afterEach(() => {
    delete (globalThis as any).Highlight;
    delete (globalThis as any).CSS;
    document.body.innerHTML = '';
  });

  function range() {
    const p = document.querySelector('p')!.firstChild as Text;
    const r = document.createRange();
    r.setStart(p, 0);
    r.setEnd(p, 30);
    return r;
  }

  it('capturarSelecao guarda uma copia do Range (sobrevive ao removeAllRanges)', () => {
    const root = document.getElementById('root') as HTMLElement;
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range());
    const c = capturarSelecao(root, sel)!;
    expect(c).not.toBeNull();
    expect(c.texto).toBe('Um trecho grande o bastante pa');
    sel.removeAllRanges();
    expect(c.range).toBeTruthy();
    expect(c.range!.collapsed).toBe(false);
    expect(c.range!.toString()).toBe('Um trecho grande o bastante pa');
    expect(capturarSelecao(root, sel)).toBeNull();
  });

  it('pintarPendente registra script-grifo-pendente; null ou Range recolhido apaga; limparPintura nao mexe nela', () => {
    expect(suportaPintura()).toBe(true);
    const r = range();
    pintarPendente(r);
    expect(highlights.set).toHaveBeenCalledWith(NOME_PENDENTE, expect.any(HighlightMock));
    expect((highlights.set.mock.calls[0][1] as HighlightMock).ranges).toEqual([r]);
    limparPintura();
    expect(highlights.delete).not.toHaveBeenCalledWith(NOME_PENDENTE);
    pintarPendente(null);
    expect(highlights.delete).toHaveBeenCalledWith(NOME_PENDENTE);
    highlights.delete.mockClear();
    const vazio = range();
    vazio.collapse(true);
    pintarPendente(vazio);
    expect(highlights.delete).toHaveBeenCalledWith(NOME_PENDENTE);
    highlights.delete.mockClear();
    limparPendente();
    expect(highlights.delete).toHaveBeenCalledWith(NOME_PENDENTE);
  });

  it('sem Highlight API nao quebra', () => {
    delete (globalThis as any).Highlight;
    delete (globalThis as any).CSS;
    expect(suportaPintura()).toBe(false);
    expect(() => { pintarPendente(range()); limparPendente(); }).not.toThrow();
  });
});
