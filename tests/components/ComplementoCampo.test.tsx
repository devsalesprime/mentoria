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
    for (const nome of ['Incorporar ao meu texto', 'Editar e incorporar', 'Dispensar']) {
      expect(screen.getByRole('button', { name: nome }).className).toContain('min-h-[44px]');
    }
  });

  it('"Editar e incorporar" abre o achado em texto editável e "Cancelar" volta para as três ações', () => {
    render(<ComplementoCampo campo={campoDecidido('2.1', 'Meu texto', comp)} onIncorporar={vi.fn()} onDispensar={vi.fn()} onSalvarAjuste={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar e incorporar' }));
    const area = screen.getByTestId('complemento-editar-2.1') as HTMLTextAreaElement;
    expect(area.value).toBe('Achado novo nos materiais');
    expect(area.maxLength).toBe(4000);
    expect(screen.getByTestId('complemento-2.1')).toHaveTextContent('Ele entra no fim do que você já escreveu');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByTestId('complemento-editar-2.1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Incorporar ao meu texto' })).toBeInTheDocument();
  });

  it('"Incorporar este texto" manda o texto editado e abre o resultado para lapidar', async () => {
    const campo = campoDecidido('2.1', 'Meu texto', comp);
    const editado = 'Achado do worker, agora na minha voz.';
    const onIncorporar = vi.fn().mockResolvedValue({
      ok: true,
      campo: { ...campo, valor: `Meu texto\n\n${editado}`, valor_efetivo: `Meu texto\n\n${editado}`, complemento: null },
    });
    render(<ComplementoCampo campo={campo} onIncorporar={onIncorporar} onDispensar={vi.fn()} onSalvarAjuste={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar e incorporar' }));
    fireEvent.change(screen.getByTestId('complemento-editar-2.1'), { target: { value: editado } });
    fireEvent.click(screen.getByRole('button', { name: 'Incorporar este texto' }));
    await act(async () => {});
    expect(onIncorporar).toHaveBeenCalledWith('2.1', editado);
    // o servidor devolveu o acréscimo: o texto de antes continua no começo
    const lapidar = screen.getByTestId('complemento-ajuste-2.1') as HTMLTextAreaElement;
    expect(lapidar.value.startsWith('Meu texto')).toBe(true);
    expect(lapidar.value).toContain(editado);
  });

  it('erro no "Incorporar este texto" mantém o texto editado na tela; texto em branco não envia', async () => {
    const campo = campoDecidido('2.1', 'Meu texto', comp);
    const onIncorporar = vi.fn().mockResolvedValue({ ok: false, message: 'Este campo não tem complemento.' });
    render(<ComplementoCampo campo={campo} onIncorporar={onIncorporar} onDispensar={vi.fn()} onSalvarAjuste={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar e incorporar' }));
    fireEvent.change(screen.getByTestId('complemento-editar-2.1'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Incorporar este texto' })).toBeDisabled();

    fireEvent.change(screen.getByTestId('complemento-editar-2.1'), { target: { value: 'Uma versão minha.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Incorporar este texto' }));
    await act(async () => {});
    expect(screen.getByTestId('complemento-2.1')).toHaveTextContent('Este campo não tem complemento.');
    expect(screen.getByTestId('complemento-editar-2.1')).toHaveValue('Uma versão minha.');
  });

  it('as três ações aparecem juntas, sem travessão na copy', () => {
    const { container } = render(<ComplementoCampo campo={campoDecidido('2.1', 'Meu texto', comp)} onIncorporar={vi.fn()} onDispensar={vi.fn()} onSalvarAjuste={vi.fn()} />);
    const nomes = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    expect(nomes).toEqual(['Incorporar ao meu texto', 'Editar e incorporar', 'Dispensar']);
    expect(container.textContent || '').not.toContain('—');
  });
});
