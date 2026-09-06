import React from 'react';
import { render, screen } from '@testing-library/react';

/**
 * O balão "Grifar" não pode cobrir o trecho que a pessoa acabou de marcar (no desktop ele nascia
 * por cima da seleção quando a conta de espaço usava uma altura chutada). Regra agora:
 * embaixo da seleção quando cabe embaixo, em cima quando não cabe embaixo e sobra mais em cima,
 * e nunca invadindo o retângulo da seleção.
 */

import { posicao } from '../../components/script/grifos/GrifoBubble';
import { GrifoBubble } from '../../components/script/grifos/GrifoBubble';
import type { Captura } from '../../components/script/grifos/anchor';

const VW = 1280;
const VH = 900;

const rect = (top: number, bottom: number, left = 300) => ({ top, bottom, left, right: left + 400, width: 400, height: bottom - top });

const num = (v: any) => (typeof v === 'number' ? v : Number(String(v).replace('px', '')));

describe('posicao do balão de grifo', () => {
  it('fica embaixo da seleção quando cabe embaixo', () => {
    const r = rect(200, 230);
    const s = posicao(r, 300, VW, VH);
    expect(num(s.top)).toBeGreaterThanOrEqual(r.bottom);
    expect(num(s.top) + 300).toBeLessThanOrEqual(VH);
  });

  it('sobe quando não cabe embaixo e sobra mais espaço em cima', () => {
    const r = rect(700, 740);
    const s = posicao(r, 380, VW, VH);
    // o fundo do balão fica acima do topo da seleção: não encosta no trecho marcado
    expect(num(s.top) + 380).toBeLessThanOrEqual(r.top);
  });

  it('mesmo com o balão maior que os dois lados, nunca cobre a seleção', () => {
    for (const [top, bottom] of [[10, 40], [200, 240], [430, 470], [700, 745], [860, 890]] as const) {
      for (const altura of [120, 260, 380, 700]) {
        const r = rect(top, bottom);
        const s = posicao(r, altura, VW, VH);
        const topo = num(s.top);
        const usada = Math.min(altura, num(s.maxHeight));
        const fundo = topo + usada;
        const cobre = topo < r.bottom && fundo > r.top;
        expect(cobre, `altura ${altura}, rect ${top}-${bottom} -> top ${topo}, fundo ${fundo}`).toBe(false);
      }
    }
  });

  it('a primeira medição (altura 0) cai no caso seguro: embaixo', () => {
    const r = rect(700, 740);
    const s = posicao(r, 0, VW, VH);
    expect(num(s.top)).toBeGreaterThanOrEqual(r.bottom);
  });

  it('encosta na margem esquerda em vez de vazar pela direita', () => {
    expect(num(posicao(rect(100, 130, 1270), 200, VW, VH).left)).toBe(VW - 340 - 8);
    expect(num(posicao(rect(100, 130, -50), 200, VW, VH).left)).toBe(8);
  });

  it('o que sobrar de altura vira rolagem interna, então o balão não vaza da janela', () => {
    const s = posicao(rect(700, 740), 700, VW, VH);
    expect(s.overflowY).toBe('auto');
    expect(num(s.maxHeight)).toBeGreaterThan(0);
  });
});

describe('GrifoBubble renderizado', () => {
  const captura = {
    texto: 'O nosso objetivo nestes 40 minutos é simples: entender',
    prefixo: '', sufixo: '', tela: 1, documento: 'treinamento',
    rect: rect(700, 740),
    curto: false, longo: false,
  } as unknown as Captura;

  it('no desktop sai posicionado sem cobrir a seleção', () => {
    render(<GrifoBubble captura={captura} onSalvar={vi.fn()} onCancelar={vi.fn()} />);
    const balao = screen.getByTestId('grifo-balao');
    expect(balao.style.top).not.toBe('');
    // jsdom devolve offsetHeight 0, então a conta cai no caso seguro (embaixo da seleção)
    expect(Number(balao.style.top.replace('px', ''))).toBeGreaterThanOrEqual(captura.rect.bottom);
    expect(balao.className).not.toContain('script-grifo-balao-folha');
  });
});
