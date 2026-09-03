import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

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

import { FichaField } from '../../components/script/FichaField';
import type { ScriptFieldView } from '../../data/script-ficha-fields';

const base: ScriptFieldView = {
  key: '2.1',
  bloco: 2,
  nome: 'Frase de especialista',
  pergunta: 'Em uma frase, quem é você e no que é especialista?',
  tipo: 'tc',
  tipoRaw: 'tc',
  obrigatorio: true,
  minutos: 2,
  opcoes: null,
  sugerido: 'Sou especialista em organizar clínicas.',
  classe: 'Fato',
  fonte: 'Exclusive Book · P1 · Mentor',
  alternativas: [{ sugerido: 'Ajudo donos de clínica.', fonte: 'App · 1.1' }],
  status: 'sugerido',
  valor: '',
  valor_efetivo: '',
  decidido: false,
  atualizado_por: null,
  atualizado_em: null,
};

describe('FichaField', () => {
  it('mostra pergunta, sugestão, fonte e alternativa', () => {
    render(<FichaField campo={base} onDecide={vi.fn()} />);
    expect(screen.getByText(base.pergunta)).toBeInTheDocument();
    expect(screen.getByText(base.sugerido)).toBeInTheDocument();
    expect(screen.getByText(/Fonte: Exclusive Book/)).toBeInTheDocument();
    expect(screen.getByText('Também encontramos:')).toBeInTheDocument();
    expect(screen.getByText('Ajudo donos de clínica.')).toBeInTheDocument();
  });

  it('Confirmar chama onDecide com status confirmado', () => {
    const onDecide = vi.fn();
    render(<FichaField campo={base} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onDecide).toHaveBeenCalledWith('2.1', { status: 'confirmado' });
  });

  it('Editar abre o editor com o sugerido e Salvar envia editado', () => {
    const onDecide = vi.fn();
    render(<FichaField campo={base} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const textarea = screen.getByLabelText('Editar Frase de especialista') as HTMLTextAreaElement;
    expect(textarea.value).toBe(base.sugerido);
    fireEvent.change(textarea, { target: { value: 'Sou o cara das clínicas.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide).toHaveBeenCalledWith('2.1', { status: 'editado', valor: 'Sou o cara das clínicas.' });
  });

  it('clicar numa alternativa usa o texto dela como editado', () => {
    const onDecide = vi.fn();
    render(<FichaField campo={base} onDecide={onDecide} />);
    fireEvent.click(screen.getByText('Ajudo donos de clínica.'));
    expect(onDecide).toHaveBeenCalledWith('2.1', { status: 'editado', valor: 'Ajudo donos de clínica.' });
  });

  it('campo vazio obrigatório mostra "Não encontramos, você preenche" e "Deixar em branco por enquanto"', () => {
    const onDecide = vi.fn();
    render(<FichaField campo={{ ...base, sugerido: '', classe: 'VZ', fonte: '', alternativas: [], status: 'vazio' }} onDecide={onDecide} />);
    expect(screen.getByText('Não encontramos, você preenche.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Deixar em branco por enquanto'));
    expect(onDecide).toHaveBeenCalledWith('2.1', { status: 'aceito_vazio' });
  });

  it('campo vazio opcional oferece "Não se aplica / deixar vazio"', () => {
    render(<FichaField campo={{ ...base, obrigatorio: false, sugerido: '', classe: 'VZ', fonte: '', alternativas: [], status: 'vazio' }} onDecide={vi.fn()} />);
    expect(screen.getByText('Não se aplica / deixar vazio')).toBeInTheDocument();
  });

  it('campo confirmado mostra o valor e permite desfazer', () => {
    const onDecide = vi.fn();
    render(<FichaField campo={{ ...base, status: 'confirmado', valor: base.sugerido, valor_efetivo: base.sugerido, decidido: true }} onDecide={onDecide} />);
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onDecide).toHaveBeenCalledWith('2.1', { status: 'sugerido' });
  });

  it('nenhum texto visível usa travessão nem a palavra diagnóstico', () => {
    const { container } = render(<FichaField campo={base} onDecide={vi.fn()} />);
    expect(container.textContent).not.toContain('—');
    expect(container.textContent!.toLowerCase()).not.toContain('diagnóstico');
  });
});
