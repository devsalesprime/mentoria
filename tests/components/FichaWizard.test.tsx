import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_: any, tag: string) => React.forwardRef((props: any, ref: any) => {
      const { children, initial, animate, exit, transition, whileHover, whileTap, variants, custom, ...rest } = props;
      return React.createElement(tag, { ...rest, ref }, children);
    }),
  }),
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

import { FichaWizard, montarPassos, passoInicial } from '../../components/script/FichaWizard';
import { recomputeView, type ScriptFichaData, type UseScriptFicha } from '../../hooks/useScriptFicha';
import { SCRIPT_BLOCKS, SCRIPT_FIELD_BY_KEY, type ScriptBlockView, type ScriptFieldView } from '../../data/script-ficha-fields';

function campoDe(key: string, sugerido: string, extra: Partial<ScriptFieldView> = {}): ScriptFieldView {
  const def = SCRIPT_FIELD_BY_KEY[key];
  return {
    key,
    bloco: def.bloco,
    nome: def.nome,
    pergunta: def.pergunta,
    tipo: def.tipo,
    tipoRaw: def.tipoRaw,
    obrigatorio: def.obrigatorio,
    minutos: def.minutos,
    opcoes: def.opcoes ?? null,
    widget: def.widget,
    template: def.template,
    sugerido,
    classe: sugerido ? 'Fato' : 'VZ',
    fonte: sugerido ? 'Exclusive Book · P1' : '',
    alternativas: [],
    status: sugerido ? 'sugerido' : 'vazio',
    valor: '',
    estrutura: null,
    valor_efetivo: '',
    decidido: false,
    atualizado_por: null,
    atualizado_em: null,
    ...extra,
  };
}

const confirmado = (key: string, sugerido: string) => campoDe(key, sugerido, { status: 'confirmado', decidido: true, valor: sugerido, valor_efetivo: sugerido });

function blocoDe(numero: number, campos: ScriptFieldView[]): ScriptBlockView {
  const def = SCRIPT_BLOCKS.find((b) => b.numero === numero)!;
  return {
    numero, nome: def.nome, descricao: def.descricao,
    total: campos.length, decididos: 0, obrigatorios: campos.filter((c) => c.obrigatorio).length, obrigatorios_decididos: 0,
    minutos: 10, minutos_pendentes: 10, fechado: false, campos,
  };
}

/** Ficha de teste: blocos 1 e 2 (dia 1) e bloco 4 (dia 2). */
function dados(overrides: { blocos?: ScriptBlockView[]; ficha_status?: ScriptFichaData['ficha_status'] } = {}): ScriptFichaData {
  const blocos = overrides.blocos || [
    blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão'), campoDe('1.2', '')]),
    blocoDe(2, [campoDe('2.1', 'Sou a Paloma e ajudo donos de indústria familiar a atravessar a sucessão.'), campoDe('2.3', 'O mercado faz: holding e organograma.\nEu faço: preparo quem assume.')]),
    blocoDe(4, [campoDe('4.1', 'Nome do método: Método Corrente\nDe A para B em 1 frase: leva o dono da operação à sucessão preparada')]),
  ];
  const rec = recomputeView(blocos);
  return {
    club: { slug: 'teste', nome: 'Clube de Teste' },
    ficha_status: overrides.ficha_status || 'pre_preenchida',
    materials_status: 'pending',
    materials_submitted_at: null,
    materials: { links: [], observacoes: '', acessos: [], submitted_at: null },
    config: { prazo_materiais: '' },
    prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [], dias: [],
    ...rec,
  };
}

function montar(data: ScriptFichaData = dados(), extra: Partial<UseScriptFicha> = {}) {
  const decide = vi.fn();
  const ficha = { data, decide, loading: false, loaded: true, enabled: true, error: null, saveState: 'idle', ...extra } as unknown as UseScriptFicha;
  const contexto = Object.fromEntries(data.blocos.flatMap((b) => b.campos.map((c) => [c.key, c])));
  const onFecharFicha = vi.fn();
  const utils = render(<FichaWizard ficha={ficha} contexto={contexto} onFecharFicha={onFecharFicha} />);
  return { ...utils, decide, onFecharFicha };
}

const titulo = () => screen.getByTestId('wizard-title').textContent;
const P = (key: string) => SCRIPT_FIELD_BY_KEY[key].pergunta;

describe('FichaWizard: passos', () => {
  it('montarPassos junta o par antes × depois (3.5 e 3.6) numa tela só', () => {
    const b3 = blocoDe(3, [campoDe('3.1', 'x'), campoDe('3.5', 'Mais um ano igual.'), campoDe('3.6', 'Empresa rodando sem ela.'), campoDe('3.7', 'y')]);
    const passos = montarPassos([b3]);
    expect(passos.map((p) => p.id)).toEqual(['3.1', '3.5+3.6', '3.7']);
    expect(passos[1].campos.map((c) => c.key)).toEqual(['3.5', '3.6']);
  });

  it('passoInicial começa no primeiro campo sem decisão dos blocos abertos de hoje', () => {
    const d = dados({ blocos: [blocoDe(1, [confirmado('1.1', 'Mentoria'), campoDe('1.2', '')]), blocoDe(2, [campoDe('2.1', 'Sou eu.')])] });
    const passos = montarPassos(d.blocos);
    // bloco 1 ja fechou (o unico obrigatorio esta decidido): hoje abre no bloco 2
    expect(d.hoje.blocos_abertos).toEqual([2]);
    expect(passoInicial(passos, d.hoje)).toBe(2);
    expect(passoInicial(passos, { ...d.hoje, blocos_abertos: [1] })).toBe(1);
    expect(passoInicial(passos, { ...d.hoje, blocos_abertos: [] })).toBe(1);
  });
});

describe('FichaWizard: navegação', () => {
  it('abre no primeiro campo sem decisão, com o título grande, a posição no bloco e o mapa de blocos', () => {
    montar();
    expect(titulo()).toBe(P('1.1'));
    expect(screen.getByTestId('wizard-posicao')).toHaveTextContent('Campo 1 de 2');
    expect(screen.getByTestId('bloco-pill-1')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('bloco-pill-4')).toHaveTextContent('0/1');
    expect(screen.getByText('Meta: onde você quer chegar, com número e prazo.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    // a sugestao aparece no visual do widget (chip marcado), com a fonte
    expect(screen.getByText('Mentoria Sucessão').closest('[data-selected]')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByText(/Fonte: Exclusive Book/)).toBeInTheDocument();
  });

  it('Confirmar e avançar decide o campo e vai para o próximo', () => {
    const { decide } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e avançar' }));
    expect(decide).toHaveBeenCalledWith('1.1', { status: 'confirmado' });
    expect(titulo()).toBe(P('1.2'));
    expect(screen.getByTestId('wizard-posicao')).toHaveTextContent('Campo 2 de 2');
  });

  it('Voltar retorna ao campo anterior', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    expect(titulo()).toBe(P('1.2'));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(titulo()).toBe(P('1.1'));
  });

  it('campo vazio opcional: "Não se aplica" decide e, no fim do bloco, mostra o interstício com o próximo bloco', () => {
    const { decide } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    expect(screen.getByText('Não encontramos, você preenche.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Não se aplica' }));
    expect(decide).toHaveBeenCalledWith('1.2', { status: 'aceito_vazio' });
    const inter = screen.getByTestId('wizard-interstitial');
    expect(within(inter).getByText('Próximo')).toBeInTheDocument();
    expect(within(inter).getByText(/2\. Mentor/)).toBeInTheDocument();
    expect(within(inter).getByText('Mentor: quem você é e o que te legitima a cobrar caro.')).toBeInTheDocument();
    fireEvent.click(within(inter).getByRole('button', { name: 'Continuar' }));
    expect(titulo()).toBe(P('2.1'));
    expect(screen.getByTestId('bloco-pill-2')).toHaveAttribute('aria-current', 'step');
  });

  it('Editar troca o visual pelo widget no lugar e "Salvar e avançar" envia valor e estrutura', () => {
    const { decide } = montar();
    fireEvent.click(screen.getByTestId('bloco-pill-2'));
    expect(titulo()).toBe(P('2.1'));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByTestId('wizard-editor-2.1')).toBeInTheDocument();
    const input = screen.getByLabelText('Editar Frase de especialista') as HTMLInputElement;
    expect(input.value).toMatch(/Sou a Paloma/);
    fireEvent.change(input, { target: { value: 'Sou a Paloma.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e avançar' }));
    expect(decide).toHaveBeenCalledWith('2.1', { status: 'editado', valor: 'Sou a Paloma.', estrutura: { frase: 'Sou a Paloma.' } });
    expect(titulo()).toBe(P('2.3'));
    expect(screen.getByText('VS')).toBeInTheDocument();
  });

  it('fim do dia mostra a tela do dia e "Continuar para o bloco 4" leva ao dia 2', () => {
    montar();
    fireEvent.click(screen.getByTestId('bloco-pill-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    expect(titulo()).toBe(P('2.3'));
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    const fim = screen.getByTestId('wizard-fim');
    expect(within(fim).getByText(/Dia 1: Meta, Mentor e Mentorado/)).toBeInTheDocument();
    expect(within(fim).getByText(/Ainda faltam 3 obrigatórios de hoje/)).toBeInTheDocument();
    expect(within(fim).queryByRole('button', { name: 'Fechar ficha' })).not.toBeInTheDocument();
    fireEvent.click(within(fim).getByRole('button', { name: 'Continuar para o bloco 4' }));
    expect(titulo()).toBe(P('4.1'));
    expect(screen.getByText('Método Corrente')).toBeInTheDocument();
  });

  it('"Ver o que falta" volta ao primeiro obrigatório pendente do dia', () => {
    montar();
    fireEvent.click(screen.getByTestId('bloco-pill-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    fireEvent.click(within(screen.getByTestId('wizard-fim')).getByRole('button', { name: 'Ver o que falta' }));
    expect(titulo()).toBe(P('1.1'));
  });

  it('com tudo decidido, o último passo leva ao estado "Fechar ficha"', () => {
    const d = dados({
      blocos: [
        blocoDe(1, [confirmado('1.1', 'Mentoria'), campoDe('1.2', '', { status: 'aceito_vazio', decidido: true })]),
        blocoDe(4, [campoDe('4.1', 'Nome do método: Corrente\nDe A para B em 1 frase: leva à sucessão')]),
      ],
    });
    const { decide, onFecharFicha } = montar(d);
    expect(titulo()).toBe(P('4.1'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e avançar' }));
    expect(decide).toHaveBeenCalledWith('4.1', { status: 'confirmado' });
    const fim = screen.getByTestId('wizard-fim');
    expect(within(fim).getByText(/Dia 2: Método, A Mentoria e Venda/)).toBeInTheDocument();
    // o mock de decide nao muda os dados: 4.1 segue pendente, entao "Fechar ficha" ainda nao aparece
    expect(within(fim).queryByRole('button', { name: 'Fechar ficha' })).not.toBeInTheDocument();
    expect(within(fim).getByRole('button', { name: 'Ver o que falta' })).toBeInTheDocument();
    expect(onFecharFicha).not.toHaveBeenCalled();
  });

  it('ficha toda decidida abre direto no estado de fechar', () => {
    const d = dados({
      blocos: [blocoDe(1, [confirmado('1.1', 'Mentoria')]), blocoDe(4, [confirmado('4.1', 'Nome do método: Corrente\nDe A para B em 1 frase: leva à sucessão')])],
    });
    const { onFecharFicha } = montar(d);
    expect(d.hoje.em_breve).toBe(true);
    const fim = screen.getByTestId('wizard-fim');
    fireEvent.click(within(fim).getByRole('button', { name: 'Fechar ficha' }));
    expect(onFecharFicha).toHaveBeenCalled();
  });

  it('par antes × depois é uma tela só com "Confirmar os dois e avançar"', () => {
    const d = dados({
      blocos: [blocoDe(3, [campoDe('3.5', 'Mais um ano preso na operação.'), campoDe('3.6', 'A empresa roda sem ela.')])],
    });
    const { decide } = montar(d);
    expect(titulo()).toBe('Daqui a 1 ano: sem resolver e resolvido');
    expect(screen.getByText('Daqui a 1 ano sem resolver')).toBeInTheDocument();
    expect(screen.getByText('Daqui a 1 ano resolvido')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-posicao')).toHaveTextContent('Campos 1 e 2 de 2');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar os dois e avançar' }));
    expect(decide).toHaveBeenCalledWith('3.5', { status: 'confirmado' });
    expect(decide).toHaveBeenCalledWith('3.6', { status: 'confirmado' });
  });

  it('nenhum texto visível usa travessão nem a palavra diagnóstico', () => {
    const { container } = montar();
    expect(container.textContent).not.toContain('—');
    expect(container.textContent!.toLowerCase()).not.toContain('diagnóstico');
  });
});
