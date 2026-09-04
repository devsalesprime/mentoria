import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AulaDani, AulaFolha, AULA_ALLOW, FRASE_AULA } from '../../components/script/script/AulaDani';
import { AULA_7_PASSOS, capituloDoPasso, urlDaAula, type AulaReferencia } from '../../data/aula-7-passos';

/**
 * O cartao da aula da Dani (components/script/script/AulaDani.tsx):
 * - poster primeiro (sem iframe); "Assistir" carrega o player com autoplay e as permissoes que a Bunny pede
 * - aparece na tela (IntersectionObserver) -> carrega sem toque, sem autoplay
 * - passo com marcacao: legenda "Passo N · nome" e `t=` na URL; sem marcacao: URL base
 * - a folha (AulaFolha) abre com o player ja carregado e fecha pelo botao
 * - copy: sem travessao, sem a palavra proibida, com acento
 */

const COM_MARCACAO: AulaReferencia = {
  ...AULA_7_PASSOS,
  capitulos: AULA_7_PASSOS.capitulos.map((c) => (c.passo === 2 ? { ...c, inicioSegundos: 754 } : c)),
};

describe('AulaDani · cartao da aula', () => {
  afterEach(() => {
    delete (window as any).IntersectionObserver;
  });

  it('poster primeiro; "Assistir" carrega o player com autoplay, allow e allowfullscreen', () => {
    const { container } = render(<AulaDani />);
    expect(screen.getByText('Aprenda a lógica por trás do script')).toBeInTheDocument();
    expect(screen.getByText('Os 7 passos da venda, com Dani Martins')).toBeInTheDocument();
    expect(screen.getByText(FRASE_AULA)).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
    const link = screen.getByRole('link', { name: /Abrir em tela cheia/ });
    expect(link).toHaveAttribute('href', AULA_7_PASSOS.embedUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');

    fireEvent.click(screen.getByRole('button', { name: `Assistir: ${AULA_7_PASSOS.titulo}` }));
    const iframe = container.querySelector('iframe')!;
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('src')).toBe(`${AULA_7_PASSOS.embedUrl}?autoplay=true`);
    expect(iframe.getAttribute('allow')).toBe(AULA_ALLOW);
    expect(iframe.getAttribute('allow')).toContain('autoplay');
    expect(iframe.getAttribute('allow')).toContain('picture-in-picture');
    expect(iframe).toHaveAttribute('allowfullscreen');
    expect(iframe.getAttribute('title')).toBe(AULA_7_PASSOS.titulo);
    expect(screen.queryByRole('button', { name: /^Assistir:/ })).toBeNull();
  });

  it('carrega sozinho quando entra na tela (IntersectionObserver), sem autoplay', async () => {
    const observados: Element[] = [];
    let callback: IntersectionObserverCallback = () => undefined;
    (window as any).IntersectionObserver = class {
      constructor(cb: IntersectionObserverCallback) { callback = cb; }
      observe(el: Element) { observados.push(el); }
      disconnect() { /* nada */ }
      unobserve() { /* nada */ }
    };
    const { container } = render(<AulaDani />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(observados).toHaveLength(1);
    callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await waitFor(() => expect(container.querySelector('iframe')).not.toBeNull());
    expect(container.querySelector('iframe')!.getAttribute('src')).toBe(AULA_7_PASSOS.embedUrl);
  });

  it('urlDaAula: base sem marcacao; t= com marcacao; autoplay; base com query usa &', () => {
    expect(urlDaAula(AULA_7_PASSOS)).toBe(AULA_7_PASSOS.embedUrl);
    expect(urlDaAula(AULA_7_PASSOS, { passo: 3 })).toBe(AULA_7_PASSOS.embedUrl);
    expect(urlDaAula(COM_MARCACAO, { passo: 2 })).toBe(`${AULA_7_PASSOS.embedUrl}?t=754`);
    expect(urlDaAula(COM_MARCACAO, { passo: 2, autoplay: true })).toBe(`${AULA_7_PASSOS.embedUrl}?t=754&autoplay=true`);
    expect(urlDaAula({ ...COM_MARCACAO, embedUrl: 'https://x/embed?preload=true' }, { passo: 2 })).toBe('https://x/embed?preload=true&t=754');
    expect(capituloDoPasso(AULA_7_PASSOS, 7)?.rotulo).toBe('Recomendação');
    expect(capituloDoPasso(AULA_7_PASSOS, 8)).toBeNull();
    expect(capituloDoPasso(AULA_7_PASSOS, null)).toBeNull();
    expect(AULA_7_PASSOS.capitulos.map((c) => c.passo)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(AULA_7_PASSOS.embedUrl).toContain('iframe.mediadelivery.net/embed/716048/');
  });

  it('passo com marcacao: legenda e src com t=; sem marcacao: legenda sem o aviso e src base', () => {
    const { container, unmount } = render(<AulaDani aula={COM_MARCACAO} passo={2} autoCarregar />);
    expect(screen.getByTestId('aula-capitulo')).toHaveTextContent('Passo 2 · Investigação · a aula abre neste passo');
    expect(container.querySelector('iframe')!.getAttribute('src')).toBe(`${AULA_7_PASSOS.embedUrl}?t=754&autoplay=true`);
    expect(screen.getByRole('link', { name: /Abrir em tela cheia/ })).toHaveAttribute('href', `${AULA_7_PASSOS.embedUrl}?t=754`);
    // os capitulos marcados viram atalhos
    expect(screen.getByRole('group', { name: 'Ir para o passo na aula' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 · Investigação' })).toHaveAttribute('aria-pressed', 'true');
    unmount();

    const { container: c2 } = render(<AulaDani passo={5} autoCarregar />);
    expect(screen.getByTestId('aula-capitulo')).toHaveTextContent('Passo 5 · Negociação e fechamento');
    expect(screen.getByTestId('aula-capitulo')).not.toHaveTextContent('abre neste passo');
    expect(c2.querySelector('iframe')!.getAttribute('src')).toBe(`${AULA_7_PASSOS.embedUrl}?autoplay=true`);
    expect(screen.queryByRole('group', { name: 'Ir para o passo na aula' })).toBeNull();
  });

  it('AulaFolha: abre com o player ja carregado e fecha pelo botao', async () => {
    const onFechar = vi.fn();
    const { rerender } = render(<AulaFolha aberta={false} onFechar={onFechar} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<AulaFolha aberta passo={4} onFechar={onFechar} />);
    const folha = await screen.findByRole('dialog', { name: 'Aula de referência' });
    expect(folha.querySelector('iframe')).not.toBeNull();
    expect(folha.querySelector('iframe')!.getAttribute('src')).toContain('mediadelivery');
    expect(screen.getByTestId('aula-capitulo')).toHaveTextContent('Passo 4 · Validação e antecipação de objeções');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar a aula' }));
    expect(onFechar).toHaveBeenCalled();
  });

  it('copy: sem travessao, sem a palavra proibida, alvos de toque com 44px', () => {
    const { container } = render(<AulaDani passo={1} />);
    const texto = container.textContent || '';
    expect(texto).not.toContain('—');
    expect(texto).not.toMatch(/diagn/i);
    expect(texto).toContain('lógica');
    const alvos = container.querySelectorAll('button, a');
    expect(alvos.length).toBeGreaterThan(0);
    alvos.forEach((el) => {
      const cls = el.className;
      expect(cls.includes('min-h-[44px]') || cls.includes('inset-0')).toBe(true);
    });
  });
});
