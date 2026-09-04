import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Slider, ReguaLida, posicaoNoTrilho, REGUA_FOLGA_PX } from '../../components/script/widgets/ui';

// Régua de dias do 6.7 (widget dois_numeros): min 1, max 90, marcas 1, 7, 14, 30, 60, 90
const MARCAS = [1, 7, 14, 30, 60, 90];

describe('posicaoNoTrilho', () => {
  it('0% no mínimo, 100% no máximo, proporcional no meio, sem sair do trilho', () => {
    expect(posicaoNoTrilho(1, 1, 90)).toBe(0);
    expect(posicaoNoTrilho(90, 1, 90)).toBe(100);
    expect(posicaoNoTrilho(30, 1, 90)).toBeCloseTo((29 / 89) * 100, 6);
    expect(posicaoNoTrilho(-5, 1, 90)).toBe(0);
    expect(posicaoNoTrilho(500, 1, 90)).toBe(100);
  });
});

describe('Slider (régua de dias do 6.7)', () => {
  it('botão, preenchido e marca ficam na MESMA posição percentual do valor', () => {
    render(<Slider value={30} min={1} max={90} marcas={MARCAS} onChange={vi.fn()} label="Dias (régua)" />);
    const pct = `${posicaoNoTrilho(30, 1, 90)}%`;
    expect(screen.getByTestId('regua-botao').style.left).toBe(pct);
    expect(screen.getByTestId('regua-preenchido').style.width).toBe(pct);
    expect(screen.getByTestId('regua-marca-30').style.left).toBe(pct);
    expect(screen.getByText('30').style.left).toBe(pct);
    // marcas irregulares (7 fica em 6,7%, nao em 20%): cada uma no lugar do proprio valor
    expect(screen.getByTestId('regua-marca-7').style.left).toBe(`${posicaoNoTrilho(7, 1, 90)}%`);
    expect(screen.getByTestId('regua-marca-1').style.left).toBe('0%');
    expect(screen.getByTestId('regua-marca-90').style.left).toBe('100%');
    const input = screen.getByLabelText('Dias (régua)') as HTMLInputElement;
    expect(input.value).toBe('30');
    expect(input.getAttribute('aria-valuetext')).toBe('30');
  });

  it('botão centrado no trilho (translate -50% nos dois eixos) e trilho com a folga de meio botão', () => {
    render(<Slider value={90} min={1} max={90} marcas={MARCAS} onChange={vi.fn()} label="Dias (régua)" />);
    const botao = screen.getByTestId('regua-botao');
    expect(botao.className).toContain('top-1/2');
    expect(botao.className).toContain('-translate-y-1/2');
    expect(botao.className).toContain('-translate-x-1/2');
    expect(botao.style.left).toBe('100%');
    expect(screen.getByTestId('regua-preenchido').className).toContain('top-1/2');
    const trilhoPai = screen.getByTestId('regua-trilho').parentElement as HTMLElement;
    expect(trilhoPai.style.paddingLeft).toBe(`${REGUA_FOLGA_PX}px`);
    expect(trilhoPai.style.paddingRight).toBe(`${REGUA_FOLGA_PX}px`);
    // o range nativo cobre a area toda (folga inclusa) e fica invisivel: o polegar de 16 px casa com a folga de 8 px
    const input = screen.getByLabelText('Dias (régua)');
    expect(input.className).toContain('regua-nativa');
    expect(input.className).toContain('opacity-0');
    expect(input.className).toContain('inset-0');
  });

  it('sem valor: botão no mínimo e apagado; arrastar e tocar na marca chamam onChange', () => {
    const onChange = vi.fn();
    render(<Slider value={null} min={1} max={90} marcas={MARCAS} onChange={onChange} label="Dias (régua)" />);
    expect(screen.getByTestId('regua-botao').style.left).toBe('0%');
    expect(screen.getByTestId('regua-botao').className).toContain('bg-white/40');
    fireEvent.change(screen.getByLabelText('Dias (régua)'), { target: { value: '14' } });
    expect(onChange).toHaveBeenCalledWith(14);
    fireEvent.click(screen.getByText('60'));
    expect(onChange).toHaveBeenCalledWith(60);
  });
});

describe('ReguaLida', () => {
  it('ponteiro e marcas com a mesma conta da régua editável', () => {
    render(<ReguaLida value={14} min={1} max={90} marcas={MARCAS} label="Dias" testId="regua-dias" />);
    expect(screen.getByTestId('regua-dias-ponteiro').style.left).toBe(`${posicaoNoTrilho(14, 1, 90)}%`);
    expect(screen.getByTestId('regua-dias')).toHaveAttribute('data-valor', '14');
  });
});
