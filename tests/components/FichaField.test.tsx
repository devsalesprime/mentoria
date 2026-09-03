import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

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

vi.mock('axios', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { items: [] } }), post: vi.fn(), delete: vi.fn() } }));

import { COPY_VAZIO, FichaField } from '../../components/script/FichaField';
import { SCRIPT_FIELD_BY_KEY, type ScriptFieldView } from '../../data/script-ficha-fields';

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
  widget: 'frase',
  template: { modelo: 'Eu sou … e ajudo … a …', max: 200 },
  sugerido: 'Sou especialista em organizar clínicas.',
  classe: 'Fato',
  fonte: 'Exclusive Book · P1 · Mentor',
  alternativas: [{ sugerido: 'Ajudo donos de clínica.', fonte: 'App · 1.1' }],
  status: 'sugerido',
  valor: '',
  estrutura: null,
  valor_efetivo: '',
  decidido: false,
  atualizado_por: null,
  atualizado_em: null,
};

/** Campo de teste a partir da definicao real (widget + template do JSON) com uma sugestao. */
function campoDe(key: string, sugerido: string, extra: Partial<ScriptFieldView> = {}): ScriptFieldView {
  const def = SCRIPT_FIELD_BY_KEY[key];
  return {
    ...base,
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
    alternativas: [],
    status: sugerido ? 'sugerido' : 'vazio',
    classe: sugerido ? 'Fato' : 'VZ',
    fonte: sugerido ? 'teste' : '',
    ...extra,
  };
}

function abrirEditor(campo: ScriptFieldView, contexto?: Record<string, ScriptFieldView>) {
  const onDecide = vi.fn();
  const utils = render(<FichaField campo={campo} onDecide={onDecide} contexto={contexto} />);
  if (campo.status === 'sugerido') fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  const editor = screen.getByTestId(`editor-${campo.key}`);
  return { ...utils, onDecide, editor };
}

describe('FichaField', () => {
  it('mostra pergunta, por que importa, "Sugestão encontrada" com a fonte discreta, a sugestão, a linha "no seu script" e a alternativa', () => {
    render(<FichaField campo={base} onDecide={vi.fn()} />);
    expect(screen.getByText(base.pergunta)).toBeInTheDocument();
    expect(screen.getByTestId('ajuda-2.1')).toHaveTextContent('Por que isso importa no script: Abre o Passo 1');
    expect(screen.getByText('Sugestão encontrada')).toBeInTheDocument();
    expect(screen.getAllByText(base.sugerido)[0]).toBeInTheDocument();
    expect(screen.getByTestId('fonte-2.1')).toHaveTextContent('Fonte: Exclusive Book · P1 · Mentor');
    expect(screen.getByTestId('previa-2.1')).toHaveTextContent('No seu script');
    expect(screen.getByText('Também encontramos:')).toBeInTheDocument();
    expect(screen.getByText('Ajudo donos de clínica.')).toBeInTheDocument();
  });

  it('Confirmar chama onDecide com status confirmado (um toque, sem widget)', () => {
    const onDecide = vi.fn();
    render(<FichaField campo={base} onDecide={onDecide} />);
    expect(screen.queryByTestId('editor-2.1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onDecide).toHaveBeenCalledWith('2.1', { status: 'confirmado' });
  });

  it('Editar abre o widget com o sugerido e Salvar envia editado com valor e estrutura', () => {
    const onDecide = vi.fn();
    render(<FichaField campo={base} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const input = screen.getByLabelText('Editar Frase de especialista') as HTMLInputElement;
    expect(input.value).toBe(base.sugerido);
    expect(screen.getByText(/Modelo: Eu sou/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Sou o cara das clínicas.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide).toHaveBeenCalledWith('2.1', { status: 'editado', valor: 'Sou o cara das clínicas.', estrutura: { frase: 'Sou o cara das clínicas.' } });
  });

  it('clicar numa alternativa usa o texto dela como editado', () => {
    const onDecide = vi.fn();
    render(<FichaField campo={base} onDecide={onDecide} />);
    fireEvent.click(screen.getByText('Ajudo donos de clínica.'));
    expect(onDecide).toHaveBeenCalledWith('2.1', { status: 'editado', valor: 'Ajudo donos de clínica.' });
  });

  it('campo vazio obrigatório abre o editor direto com o convite e "Deixar em branco por enquanto"; nunca "Confirmar"', () => {
    const onDecide = vi.fn();
    render(<FichaField campo={{ ...base, sugerido: '', classe: 'VZ', fonte: '', alternativas: [], status: 'vazio' }} onDecide={onDecide} />);
    expect(screen.getByText(COPY_VAZIO)).toBeInTheDocument();
    expect(screen.getByTestId('editor-2.1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    fireEvent.click(screen.getByText('Deixar em branco por enquanto'));
    expect(onDecide).toHaveBeenCalledWith('2.1', { status: 'aceito_vazio' });
  });

  it('sugestão só com "a definir" é tratada como vazia: editor direto, sem "Confirmar"', () => {
    render(<FichaField campo={{ ...base, sugerido: 'a definir', alternativas: [], status: 'sugerido' }} onDecide={vi.fn()} />);
    expect(screen.getByTestId('editor-2.1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(screen.getByText('Deixar em branco por enquanto')).toBeInTheDocument();
  });

  it('campo em revisão pela IA mostra o selo e a linha de contexto', () => {
    render(<FichaField campo={{ ...base, refinando: true } as any} onDecide={vi.fn()} />);
    // selo no cabeçalho do campo e na linha de contexto
    const selos = screen.getAllByTestId('badge-refinando');
    expect(selos.length).toBe(2);
    expect(selos[0]).toHaveTextContent('Em revisão pela IA');
    expect(screen.getByTestId('contexto-2.1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gravar áudio' })).toBeInTheDocument();
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

  it('vocabulário de estado: "Editado" e "Aceito em branco" (nunca "Editado por você" nem "Deixado em branco")', () => {
    const a = render(<FichaField campo={{ ...base, status: 'editado', valor: 'Sou eu.', valor_efetivo: 'Sou eu.', decidido: true }} onDecide={vi.fn()} />);
    expect(screen.getByText('Editado')).toBeInTheDocument();
    expect(a.container.textContent).not.toContain('Editado por você');
    a.unmount();
    const b = render(<FichaField campo={{ ...base, status: 'aceito_vazio', decidido: true }} onDecide={vi.fn()} />);
    expect(screen.getByText('Aceito em branco')).toBeInTheDocument();
    expect(b.container.textContent).not.toContain('Deixado em branco');
  });

  it('campo editado reabre com a estrutura salva (não reparseia o texto)', () => {
    const campo = campoDe('4.2', '', {
      status: 'editado', decidido: true,
      valor: 'Mapa: mostra onde o tempo vai\nProcessos: tira o dono das decisões',
      valor_efetivo: 'Mapa: mostra onde o tempo vai\nProcessos: tira o dono das decisões',
      estrutura: { pilares: [{ nome: 'Mapa', resolve: 'mostra onde o tempo vai' }, { nome: 'Processos', resolve: 'tira o dono das decisões' }, { nome: 'Ritmo', resolve: '' }] },
    });
    render(<FichaField campo={campo} onDecide={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect((screen.getByLabelText('Pilares ou etapas: nome da etapa 3') as HTMLInputElement).value).toBe('Ritmo');
  });

  it('campo sem widget conhecido cai no textarea simples', () => {
    const onDecide = vi.fn();
    render(<FichaField campo={{ ...base, widget: 'inexistente', template: null }} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const ta = screen.getByLabelText('Editar Frase de especialista');
    expect(ta.tagName).toBe('TEXTAREA');
    fireEvent.change(ta, { target: { value: 'Texto livre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide).toHaveBeenCalledWith('2.1', { status: 'editado', valor: 'Texto livre' });
  });

  it('nenhum texto visível usa travessão nem a palavra diagnóstico', () => {
    const { container } = render(<FichaField campo={base} onDecide={vi.fn()} />);
    expect(container.textContent).not.toContain('—');
    expect(container.textContent!.toLowerCase()).not.toContain('diagnóstico');
  });
});

describe('FichaField widgets (sugestão dentro do widget)', () => {
  it('1.1 escolha: chips com a sugestão e "Outra"', () => {
    const { editor, onDecide } = abrirEditor(campoDe('1.1', 'Mentoria Exemplo em Grupo', { alternativas: [{ sugerido: 'Programa Anual', fonte: 'x' }] }));
    expect(within(editor).getByRole('radio', { name: 'Mentoria Exemplo em Grupo' })).toHaveAttribute('aria-checked', 'true');
    expect(within(editor).getByRole('radio', { name: 'Programa Anual' })).toBeInTheDocument();
    fireEvent.click(within(editor).getByRole('radio', { name: 'Outra' }));
    fireEvent.change(within(editor).getByLabelText('Editar Oferta que o script vende'), { target: { value: 'Imersão' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide).toHaveBeenCalledWith('1.1', { status: 'editado', valor: 'Imersão', estrutura: { opcao: 'Outra', texto: 'Imersão' } });
  });

  it('1.2 meta: 3 entradas numa frase', () => {
    const { editor } = abrirEditor(campoDe('1.2', '10 clientes até dezembro · 3 reuniões por semana'));
    expect((within(editor).getByLabelText('Quantos clientes') as HTMLInputElement).value).toBe('10');
    expect((within(editor).getByLabelText('Até quando') as HTMLInputElement).value).toBe('dezembro');
    expect((within(editor).getByLabelText('Reuniões por semana') as HTMLInputElement).value).toBe('3');
  });

  it('1.2 meta: texto corrido vai para a observação com a nota', () => {
    const { editor } = abrirEditor(campoDe('1.2', 'Quero dobrar a carteira este ano.'));
    expect(screen.getByTestId('nota-bruto-1.2')).toBeInTheDocument();
    expect((within(editor).getByLabelText('Observação') as HTMLTextAreaElement).value).toBe('Quero dobrar a carteira este ano.');
  });

  it('2.2 historia_podio: 3 linhas viram ouro / prata / bronze', () => {
    const { editor } = abrirEditor(campoDe('2.2', 'Vinte anos de clínica própria.\nTrês unidades abertas.\nFormou cem gestores.'));
    expect((within(editor).getByLabelText('Prova Ouro') as HTMLTextAreaElement).value).toBe('Vinte anos de clínica própria.');
    expect((within(editor).getByLabelText('Prova Bronze') as HTMLTextAreaElement).value).toBe('Formou cem gestores.');
  });

  it('2.3 vs: frase única divide em mercado × eu', () => {
    const { editor } = abrirEditor(campoDe('2.3', 'O mercado vende curso gravado. Eu entro na operação com ele.'));
    expect((within(editor).getByLabelText('O mercado faz') as HTMLTextAreaElement).value).toBe('O mercado vende curso gravado.');
    expect((within(editor).getByLabelText('Editar Diferencial') as HTMLTextAreaElement).value).toBe('Eu entro na operação com ele.');
    expect(within(editor).getByText('VS')).toBeInTheDocument();
  });

  it('2.5 escolha radio: cartões com a opção marcada', () => {
    const { editor } = abrirEditor(campoDe('2.5', 'Vendi algumas'));
    const radios = within(editor).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(within(editor).getByRole('radio', { name: 'Vendi algumas' })).toHaveAttribute('aria-checked', 'true');
  });

  it('3.1 icp: 4 mini entradas + descrição livre para texto corrido', () => {
    const { editor } = abrirEditor(campoDe('3.1', 'Setor: clínicas\nPapel: dono\nTerritório: Sul'));
    expect((within(editor).getByLabelText('Setor') as HTMLInputElement).value).toBe('clínicas');
    expect((within(editor).getByLabelText('Território') as HTMLInputElement).value).toBe('Sul');
  });

  it('3.2 chips_texto: chips detectados no texto', () => {
    const { editor } = abrirEditor(campoDe('3.2', 'Sócio clínico ou cônjuge que cuida do financeiro.'));
    expect(within(editor).getByRole('button', { name: 'sócio' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(editor).getByRole('button', { name: 'cônjuge' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(editor).getByRole('button', { name: 'família' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('3.3 citacoes: uma frase por cartão, com contador', () => {
    const { editor, onDecide } = abrirEditor(campoDe('3.3', 'Não consigo sair da clínica.\nA equipe só funciona comigo olhando.\nFaturo bem, mas não sobra.'));
    expect((within(editor).getByLabelText('Dor, nas palavras dele: frase 2') as HTMLInputElement).value).toBe('A equipe só funciona comigo olhando.');
    expect(within(editor).getByText(/3 frases/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide.mock.calls[0][1].valor).toBe('"Não consigo sair da clínica."\n"A equipe só funciona comigo olhando."\n"Faturo bem, mas não sobra."');
  });

  it('3.5 antes_depois: textarea com o rótulo do template', () => {
    const { editor } = abrirEditor(campoDe('3.5', 'Mais um ano preso no balcão.'));
    expect(within(editor).getByText('Daqui a 1 ano sem resolver')).toBeInTheDocument();
    expect((within(editor).getByLabelText('Editar Consequência de não resolver') as HTMLTextAreaElement).value).toBe('Mais um ano preso no balcão.');
  });

  it('3.7 tabela: R$ na linha vai para a coluna de custo', () => {
    const { editor } = abrirEditor(campoDe('3.7', 'Consultoria genérica R$ 5.000\nCurso online'));
    expect((within(editor).getByLabelText('Soluções que ele já tentou: linha 1, O que ele já tentou') as HTMLInputElement).value).toBe('Consultoria genérica');
    expect((within(editor).getByLabelText('Soluções que ele já tentou: linha 1, Quanto custa (se souber)') as HTMLInputElement).value).toBe('5.000');
    expect((within(editor).getByLabelText('Soluções que ele já tentou: linha 2, O que ele já tentou') as HTMLInputElement).value).toBe('Curso online');
  });

  it('3.8 lista_numerada: mínimo 5 linhas e contador', () => {
    const { editor } = abrirEditor(campoDe('3.8', '1. Faturamento\n2. Equipe'));
    expect(within(editor).getAllByRole('textbox')).toHaveLength(5);
    expect(within(editor).getByText(/2 itens · 5 a 7/)).toBeInTheDocument();
  });

  it('4.1 dois_campos: "Nome: fio" divide nos dois campos', () => {
    const { editor, onDecide } = abrirEditor(campoDe('4.1', 'Método Clínica Livre: leva o dono do balcão para a cadeira de gestor.'));
    expect((within(editor).getByLabelText('Nome do método') as HTMLInputElement).value).toBe('Método Clínica Livre');
    expect((within(editor).getByLabelText('De A para B em 1 frase') as HTMLInputElement).value).toBe('leva o dono do balcão para a cadeira de gestor.');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide.mock.calls[0][1].valor).toBe('Nome do método: Método Clínica Livre\nDe A para B em 1 frase: leva o dono do balcão para a cadeira de gestor.');
  });

  it('4.2 pilares: linhas "nome: resolve" com setas de ordem', () => {
    const { editor, onDecide } = abrirEditor(campoDe('4.2', 'Mapa: mostra onde o tempo vai\nProcessos: tira o dono das decisões\nGerente: prepara quem assume\nRitmo: reuniões semanais'));
    expect((within(editor).getByLabelText('Pilares ou etapas: nome da etapa 1') as HTMLInputElement).value).toBe('Mapa');
    fireEvent.click(within(editor).getByRole('button', { name: 'Descer etapa 1' }));
    expect((within(editor).getByLabelText('Pilares ou etapas: nome da etapa 1') as HTMLInputElement).value).toBe('Processos');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide.mock.calls[0][1].valor.split('\n')[0]).toBe('Processos: tira o dono das decisões');
  });

  it('4.3 escolha_de_lista lê os pilares do 4.2 e 4.4 pré-preenche as linhas', () => {
    const p42 = campoDe('4.2', 'Mapa: onde o tempo vai\nProcessos: decisões repetidas\nRitmo: indicadores');
    const contexto = { '4.2': p42 };
    const a = abrirEditor(campoDe('4.3', ''), contexto);
    expect(within(a.editor).getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(within(a.editor).getByRole('radio', { name: 'Processos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(a.onDecide).toHaveBeenCalledWith('4.3', { status: 'editado', valor: 'Processos', estrutura: { escolhido: 'Processos', texto: '' } });
    a.unmount();

    const b = abrirEditor(campoDe('4.4', ''), contexto);
    expect((within(b.editor).getByLabelText('Obstáculos por etapa: linha 3, Etapa') as HTMLInputElement).value).toBe('Ritmo');
  });

  it('5.3 escada: 3 níveis com R$ e condição de entrada', () => {
    const { editor, onDecide } = abrirEditor(campoDe('5.3', 'Mais alta: Premium · R$ 30.000 · acompanhamento semanal\nEntrada: Básica · R$ 5.000\nCondição de entrada: 30% no ato'));
    expect((within(editor).getByLabelText('Mais alta: valor') as HTMLInputElement).value).toBe('30.000');
    expect((within(editor).getByLabelText('Entrada: nome') as HTMLInputElement).value).toBe('Básica');
    expect((within(editor).getByLabelText('Condição de entrada') as HTMLInputElement).value).toBe('30% no ato');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide.mock.calls[0][1].valor).toBe('Mais alta: Premium · R$ 30.000 · acompanhamento semanal\nEntrada: Básica · R$ 5.000\nCondição de entrada: 30% no ato');
  });

  it('5.4 checklist_condicoes: checkboxes com detalhe', () => {
    const { editor } = abrirEditor(campoDe('5.4', 'Parcelado: 12x\nContrato: 6 meses\nGarantia: 30 dias'));
    expect(within(editor).getByLabelText('Parcelado')).toBeChecked();
    expect(within(editor).getByLabelText('À vista')).not.toBeChecked();
    expect((within(editor).getByLabelText('Parcelado: detalhe') as HTMLInputElement).value).toBe('12');
    expect((within(editor).getByLabelText('Garantia: detalhe') as HTMLInputElement).value).toBe('30 dias');
  });

  it('5.5 dois_numeros: R$ em ordem + prazo', () => {
    const { editor } = abrirEditor(campoDe('5.5', 'Sozinho ele chega a R$ 10.000; com a mentoria, R$ 50.000 em 12 meses.'));
    expect((within(editor).getByLabelText('Sozinho') as HTMLInputElement).value).toBe('10.000');
    expect((within(editor).getByLabelText('Com você') as HTMLInputElement).value).toBe('50.000');
    expect((within(editor).getByLabelText('Prazo') as HTMLInputElement).value).toBe('12 meses');
  });

  it('5.6 chips_texto: os 8 chips sugeridos', () => {
    const { editor } = abrirEditor(campoDe('5.6', 'Tempo com a família.\nRede de outros donos.'));
    expect(within(editor).getAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual(['tempo', 'rede']);
    expect(within(editor).getByRole('button', { name: 'tranquilidade da família' })).toBeInTheDocument();
  });

  it('6.1 canal: radio + duração + reuniões', () => {
    const { editor, onDecide } = abrirEditor(campoDe('6.1', 'Chamada de vídeo de 1h, normalmente 2 reuniões.'));
    expect(within(editor).getByRole('radio', { name: 'Vídeo' })).toHaveAttribute('aria-checked', 'true');
    expect((within(editor).getByLabelText('Duração em minutos') as HTMLInputElement).value).toBe('60');
    expect((within(editor).getByLabelText('Número de reuniões') as HTMLInputElement).value).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide.mock.calls[0][1].valor).toBe('Canal: Vídeo · Duração: 60 min · Reuniões: 2');
  });

  it('6.2 quem_vende: quem conduz (voz do script), o nome e a origem do lead; salva o valor determinístico', () => {
    const { editor, onDecide } = abrirEditor(campoDe('6.2', 'Quem conduz: a própria Paloma\nDe onde vem o lead: indicação e Instagram'));
    expect(within(editor).getByRole('radio', { name: 'Eu mesmo(a)' })).toHaveAttribute('aria-checked', 'true');
    expect(within(editor).getByRole('radio', { name: 'Um closer ou consultor do meu time' })).toHaveAttribute('aria-checked', 'false');
    expect((within(editor).getByLabelText('Nome de quem vende') as HTMLInputElement).value).toBe('Paloma');
    expect((within(editor).getByLabelText('De onde vem o lead') as HTMLInputElement).value).toBe('indicação e Instagram');
    expect(within(editor).getByText('O script fala na sua voz, em primeira pessoa')).toBeInTheDocument();
    fireEvent.click(within(editor).getByRole('radio', { name: 'Um closer ou consultor do meu time' }));
    fireEvent.change(within(editor).getByLabelText('Nome de quem vende'), { target: { value: 'Pedro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide).toHaveBeenCalledWith('6.2', {
      status: 'editado',
      valor: 'Quem conduz: Um closer ou consultor do meu time (Pedro) / Lead: indicação e Instagram',
      estrutura: { quem: 'closer', nome: 'Pedro', origem_lead: 'indicação e Instagram' },
    });
  });

  it('6.2 quem_vende: a ajuda diz que a resposta define a voz do script', () => {
    render(<FichaField campo={campoDe('6.2', 'Eu mesma; leads por indicação.')} onDecide={vi.fn()} />);
    expect(screen.getByTestId('ajuda-6.2')).toHaveTextContent('Isso define em que voz o seu script será escrito.');
    expect(screen.getByText('Eu mesmo(a)').closest('[data-selected]')).toHaveAttribute('data-selected', 'true');
  });

  it('6.3 tabela: objeções pré-preenchidas das linhas sugeridas', () => {
    const { editor } = abrirEditor(campoDe('6.3', 'Não tenho tempo agora.\nJá tentei consultoria.'));
    expect((within(editor).getByLabelText('Objeções que já ouviu: linha 2, Objeção') as HTMLInputElement).value).toBe('Já tentei consultoria.');
    expect((within(editor).getByLabelText('Objeções que já ouviu: linha 2, O que você responde hoje') as HTMLInputElement).value).toBe('');
  });

  it('6.5 dois_textos: dois textareas rotulados', () => {
    const { editor } = abrirEditor(campoDe('6.5', 'Depois do sim: contrato e pagamento\nDepois do vou pensar: marco retorno em 48h'));
    expect((within(editor).getByLabelText('Depois do sim') as HTMLTextAreaElement).value).toBe('contrato e pagamento');
    expect((within(editor).getByLabelText("Depois do 'vou pensar'") as HTMLTextAreaElement).value).toBe('marco retorno em 48h');
  });

  it('6.6 casos: cartões com antes / depois / pode citar', () => {
    const { editor, onDecide } = abrirEditor(campoDe('6.6', 'Nome: João, clínica em Curitiba\nAntes: 100 mil/mês\nDepois: 300 mil/mês\nPode citar: sim'));
    expect((within(editor).getByLabelText('Caso 1: antes') as HTMLTextAreaElement).value).toBe('100 mil/mês');
    expect(within(editor).getByRole('radio', { name: 'Sim' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide.mock.calls[0][1].valor).toBe('Nome: João, clínica em Curitiba\nAntes: 100 mil/mês\nDepois: 300 mil/mês\nPode citar: sim');
  });

  it('6.7 dois_numeros: conversas e dias', () => {
    const { editor } = abrirEditor(campoDe('6.7', '3 conversas em 21 dias'));
    expect((within(editor).getByLabelText('Conversas') as HTMLInputElement).value).toBe('3');
    expect((within(editor).getByLabelText('Dias') as HTMLInputElement).value).toBe('21');
  });

  it('todos os 34 campos têm widget conhecido e nenhum texto de widget usa travessão', () => {
    const keys = Object.keys(SCRIPT_FIELD_BY_KEY);
    expect(keys).toHaveLength(34);
    for (const key of keys) {
      const { editor, unmount } = abrirEditor(campoDe(key, 'Texto de teste: ajuste nos campos · R$ 1.000 · 2 reuniões'));
      expect(editor.textContent).not.toContain('—');
      expect(editor.textContent!.toLowerCase()).not.toContain('diagnóstico');
      unmount();
    }
  }, 30000);
});
