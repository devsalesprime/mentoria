import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ComplementoCampo } from '../../components/script/ComplementoCampo';
import { SCRIPT_FIELD_BY_KEY, type ScriptFieldView } from '../../data/script-ficha-fields';

function campoDecidido(key: string, valor: string, complemento: ScriptFieldView['complemento']): ScriptFieldView {
  const def = SCRIPT_FIELD_BY_KEY[key];
  return {
    key, bloco: def.bloco, nome: def.nome, pergunta: def.pergunta, tipo: def.tipo, tipoRaw: def.tipoRaw, obrigatorio: def.obrigatorio,
    minutos: def.minutos, opcoes: def.opcoes ?? null, widget: def.widget, template: def.template,
    sugerido: 'Sugestão antiga', classe: 'Fato', fonte: 'materiais', alternativas: [],
    status: 'editado', valor, estrutura: null, valor_efetivo: valor, decidido: true, atualizado_por: 'a@x.com', atualizado_em: null,
    complemento,
  };
}

const comp = { sugerido: 'Achado novo nos materiais', fonte: 'Reunião de 12/08', classe: 'Fato' as const, alternativas: [{ sugerido: 'Outra variação', fonte: 'site' }], recebido_em: '2026-09-04T10:00:00.000Z' };

describe('ComplementoCampo', () => {
  it('mostra o achado, a fonte e as alternativas; sem travessão nem diagnóstico', () => {
    const { container } = render(
      <ComplementoCampo campo={campoDecidido('2.1', 'Meu texto', comp)} mostrarNome onIncorporar={vi.fn()} onDispensar={vi.fn()} onSalvarAjuste={vi.fn()} />,
    );
    const painel = screen.getByTestId('complemento-2.1');
    expect(painel).toHaveTextContent('Encontramos mais nos seus materiais');
    expect(painel).toHaveTextContent('2.1 · ' + SCRIPT_FIELD_BY_KEY['2.1'].nome);
    expect(screen.getByTestId('complemento-texto-2.1')).toHaveTextContent('Achado novo nos materiais');
    expect(painel).toHaveTextContent('Fonte: Reunião de 12/08');
    expect(painel).toHaveTextContent('Também achamos: Outra variação (site)');
    expect(painel).toHaveTextContent('O que você escreveu continua valendo');
    const t = container.textContent || '';
    expect(t).not.toContain('—');
    expect(t.toLowerCase()).not.toContain('diagnóstico');
  });

  it('sem complemento não renderiza', () => {
    const { container } = render(<ComplementoCampo campo={campoDecidido('2.1', 'Meu texto', null)} onIncorporar={vi.fn()} onDispensar={vi.fn()} onSalvarAjuste={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('"Incorporar ao meu texto" chama a rota e abre o texto anexado para lapidar; "Salvar ajustes" decide editado', async () => {
    const campo = campoDecidido('2.1', 'Meu texto', comp);
    const onIncorporar = vi.fn().mockResolvedValue({ ok: true, campo: { ...campo, valor: 'Meu texto\n\nAchado novo nos materiais', valor_efetivo: 'Meu texto\n\nAchado novo nos materiais', complemento: null } });
    const onSalvarAjuste = vi.fn();
    render(<ComplementoCampo campo={campo} onIncorporar={onIncorporar} onDispensar={vi.fn()} onSalvarAjuste={onSalvarAjuste} />);
    fireEvent.click(screen.getByRole('button', { name: 'Incorporar ao meu texto' }));
    await act(async () => {});
    expect(onIncorporar).toHaveBeenCalledWith('2.1');
    const area = screen.getByTestId('complemento-ajuste-2.1') as HTMLTextAreaElement;
    expect(area.value).toBe('Meu texto\n\nAchado novo nos materiais');
    fireEvent.change(area, { target: { value: 'Meu texto, agora com o achado lapidado.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar ajustes' }));
    expect(onSalvarAjuste).toHaveBeenCalledWith('2.1', 'Meu texto, agora com o achado lapidado.');
    expect(screen.queryByTestId('complemento-ajuste-2.1')).not.toBeInTheDocument();
  });

  it('"Manter como está" fecha sem decidir de novo; erro da rota aparece', async () => {
    const campo = campoDecidido('2.1', 'Meu texto', comp);
    const onIncorporar = vi.fn().mockResolvedValue({ ok: true, campo: { ...campo, valor: 'Meu texto\n\nAchado novo nos materiais', complemento: null } });
    const onSalvarAjuste = vi.fn();
    const onDispensar = vi.fn().mockResolvedValue({ ok: false, message: 'Este campo não tem complemento.' });
    const { rerender } = render(<ComplementoCampo campo={campo} onIncorporar={onIncorporar} onDispensar={onDispensar} onSalvarAjuste={onSalvarAjuste} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    await act(async () => {});
    expect(onDispensar).toHaveBeenCalledWith('2.1');
    expect(screen.getByTestId('complemento-2.1')).toHaveTextContent('Este campo não tem complemento.');

    fireEvent.click(screen.getByRole('button', { name: 'Incorporar ao meu texto' }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Manter como está' }));
    expect(onSalvarAjuste).not.toHaveBeenCalled();
    // Depois de incorporar o campo vem sem complemento: o painel some
    rerender(<ComplementoCampo campo={{ ...campo, complemento: null }} onIncorporar={onIncorporar} onDispensar={onDispensar} onSalvarAjuste={onSalvarAjuste} />);
    expect(screen.queryByTestId('complemento-2.1')).not.toBeInTheDocument();
  });

  it('botões com área de toque de 44 px', () => {
    render(<ComplementoCampo campo={campoDecidido('2.1', 'Meu texto', comp)} onIncorporar={vi.fn()} onDispensar={vi.fn()} onSalvarAjuste={vi.fn()} />);
    for (const nome of ['Incorporar ao meu texto', 'Dispensar']) {
      expect(screen.getByRole('button', { name: nome }).className).toContain('min-h-[44px]');
    }
  });
});
