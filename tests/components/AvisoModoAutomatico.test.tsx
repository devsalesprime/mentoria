import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * "Você está no caminho completo. Prefere o essencial?" (components/script/AvisoModoAutomatico.tsx).
 * Aparece uma vez para quem NÃO escolheu o caminho (o app escolheu, porque o material bastou antes da
 * tela de escolha) e some depois de trocar ou de dispensar, nas duas telas em que ele mora.
 */
import {
  AvisoModoAutomatico, COPY_MODO_AUTOMATICO, COPY_MUDAR_ESSENCIAL, COPY_SEGUIR_COMPLETO, chaveAvisoModo,
} from '../../components/script/AvisoModoAutomatico';

const CLUBE = 'clube-dossie';

beforeEach(() => {
  window.localStorage.clear();
});

function montar(props: Partial<React.ComponentProps<typeof AvisoModoAutomatico>> = {}) {
  const onEssencial = props.onEssencial || vi.fn().mockResolvedValue({ ok: true });
  const r = render(
    <AvisoModoAutomatico
      clubeSlug={CLUBE}
      modo="completo"
      modoOrigem="automatico"
      {...props}
      onEssencial={onEssencial}
    />,
  );
  return { ...r, onEssencial };
}

describe('quando o aviso aparece', () => {
  it('aparece para quem não escolheu o caminho, com a pergunta e as duas saídas', () => {
    montar();
    expect(screen.getByTestId('aviso-modo-automatico')).toBeTruthy();
    expect(screen.getByText(COPY_MODO_AUTOMATICO)).toBeTruthy();
    expect(screen.getByText(COPY_MUDAR_ESSENCIAL)).toBeTruthy();
    expect(screen.getByText(COPY_SEGUIR_COMPLETO)).toBeTruthy();
  });

  it('não aparece para quem escolheu (sem origem automática) nem no caminho essencial', () => {
    const { unmount } = montar({ modoOrigem: null });
    expect(screen.queryByTestId('aviso-modo-automatico')).toBeNull();
    unmount();
    montar({ modo: 'essencial' });
    expect(screen.queryByTestId('aviso-modo-automatico')).toBeNull();
  });

  it('não volta depois de a pessoa já ter lido uma vez', () => {
    window.localStorage.setItem(chaveAvisoModo(CLUBE), '1');
    montar();
    expect(screen.queryByTestId('aviso-modo-automatico')).toBeNull();
  });
});

describe('as duas saídas', () => {
  it('"Mudar para o essencial" troca o caminho e o aviso some para sempre', async () => {
    const onEssencial = vi.fn().mockResolvedValue({ ok: true });
    montar({ onEssencial });
    fireEvent.click(screen.getByText(COPY_MUDAR_ESSENCIAL));
    await waitFor(() => expect(onEssencial).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('aviso-modo-automatico')).toBeNull());
    expect(window.localStorage.getItem(chaveAvisoModo(CLUBE))).toBe('1');
  });

  it('"Continuar no completo" fecha o aviso sem chamar o servidor', () => {
    const { onEssencial } = montar();
    fireEvent.click(screen.getByText(COPY_SEGUIR_COMPLETO));
    expect(screen.queryByTestId('aviso-modo-automatico')).toBeNull();
    expect(onEssencial).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(chaveAvisoModo(CLUBE))).toBe('1');
  });

  it('se a troca falhar, o aviso continua na tela para a pessoa tentar de novo', async () => {
    const onEssencial = vi.fn().mockResolvedValue({ ok: false, message: 'Não deu agora.' });
    montar({ onEssencial });
    fireEvent.click(screen.getByText(COPY_MUDAR_ESSENCIAL));
    await waitFor(() => expect(onEssencial).toHaveBeenCalled());
    expect(screen.getByTestId('aviso-modo-automatico')).toBeTruthy();
    expect(window.localStorage.getItem(chaveAvisoModo(CLUBE))).toBeNull();
  });

  it('a memória é por clube', () => {
    window.localStorage.setItem(chaveAvisoModo('outro-clube'), '1');
    montar();
    expect(screen.getByTestId('aviso-modo-automatico')).toBeTruthy();
  });
});
