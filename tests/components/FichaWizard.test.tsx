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

vi.mock('axios', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { items: [] } }), post: vi.fn(), delete: vi.fn() } }));

import { FichaWizard, montarPassos, passoInicial } from '../../components/script/FichaWizard';
import { recomputeView, type ScriptFichaData, type UseScriptFicha } from '../../hooks/useScriptFicha';
import { SCRIPT_BLOCKS, SCRIPT_FIELD_BY_KEY, type ScriptBlockView, type ScriptFieldView } from '../../data/script-ficha-fields';

function campoDe(key: string, sugerido: string, extra: Partial<ScriptFieldView> & { refinando?: boolean } = {}): ScriptFieldView {
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

/** Ficha de teste: blocos 1, 2 e 4 (1.1, 2.1, 2.3 e 4.1 obrigatórios; 1.2 opcional e vazio). */
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
  } as ScriptFichaData;
}

function montar(data: ScriptFichaData = dados(), extra: Partial<UseScriptFicha> = {}) {
  const decide = vi.fn();
  const ficha = { data, decide, loading: false, loaded: true, enabled: true, error: null, saveState: 'idle', ...extra } as unknown as UseScriptFicha;
  const contexto = Object.fromEntries(data.blocos.flatMap((b) => b.campos.map((c) => [c.key, c])));
  const onFecharFicha = vi.fn();
  const onRecarregar = vi.fn();
  const utils = render(<FichaWizard ficha={ficha} contexto={contexto} onFecharFicha={onFecharFicha} onRecarregar={onRecarregar} />);
  return { ...utils, decide, onFecharFicha, onRecarregar };
}

const titulo = () => screen.getByTestId('wizard-title').textContent;
const P = (key: string) => SCRIPT_FIELD_BY_KEY[key].pergunta;
const COPY_VAZIO = 'Não encontramos nos seus materiais. Conte com as suas palavras ou grave um áudio.';

describe('FichaWizard: passos', () => {
  it('montarPassos junta o par antes × depois (3.5 e 3.6) numa tela só', () => {
    const b3 = blocoDe(3, [campoDe('3.1', 'x'), campoDe('3.5', 'Mais um ano igual.'), campoDe('3.6', 'Empresa rodando sem ela.'), campoDe('3.7', 'y')]);
    const passos = montarPassos([b3]);
    expect(passos.map((p) => p.id)).toEqual(['3.1', '3.5+3.6', '3.7']);
    expect(passos[1].campos.map((c) => c.key)).toEqual(['3.5', '3.6']);
  });

  it('passoInicial é o primeiro campo sem decisão da ficha inteira, sem "hoje"; -1 com tudo decidido', () => {
    const d = dados({ blocos: [blocoDe(1, [confirmado('1.1', 'Mentoria'), campoDe('1.2', '')]), blocoDe(2, [campoDe('2.1', 'Sou eu.')])] });
    expect(passoInicial(montarPassos(d.blocos))).toBe(1);
    const d2 = dados({ blocos: [blocoDe(1, [confirmado('1.1', 'Mentoria')]), blocoDe(4, [confirmado('4.1', 'Nome do método: Corrente\nDe A para B em 1 frase: leva à sucessão')])] });
    expect(passoInicial(montarPassos(d2.blocos))).toBe(-1);
  });
});

describe('FichaWizard: navegação', () => {
  it('abre no primeiro campo sem decisão, com o título grande, a posição no bloco e o mapa de blocos; sem "Hoje" nem "Dia N"', () => {
    const { container } = montar();
    expect(titulo()).toBe(P('1.1'));
    expect(screen.getByTestId('wizard-posicao')).toHaveTextContent('Campo 1 de 2');
    expect(screen.getByTestId('bloco-pill-1')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('bloco-pill-4')).toHaveTextContent('0/1');
    expect(screen.getByText('Meta: onde você quer chegar, com número e prazo.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    // a sugestao aparece no visual do widget (chip marcado), com a fonte
    expect(screen.getByText('Mentoria Sucessão').closest('[data-selected]')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByText(/Fonte: Exclusive Book/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Hoje:/);
    expect(container.textContent).not.toMatch(/\bDia \d/);
    // contexto por pergunta embaixo do campo
    expect(screen.getByTestId('contexto-1.1')).toBeInTheDocument();
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

  it('campo vazio: editor direto com o convite, "Salvar e avançar" e nunca "Confirmar"; no fim do bloco, o interstício creme com prévia e o próximo bloco', () => {
    const { decide } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    expect(screen.getByText(COPY_VAZIO)).toBeInTheDocument();
    expect(screen.getByTestId('wizard-editor-1.2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Confirmar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar e avançar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Não se aplica' }));
    expect(decide).toHaveBeenCalledWith('1.2', { status: 'aceito_vazio' });
    const inter = screen.getByTestId('wizard-interstitial');
    expect(within(inter).getByText(/0 de 2 decididos/)).toBeInTheDocument();
    expect(within(inter).getByTestId('wizard-previa')).toHaveTextContent('Prévia do seu script');
    expect(within(inter).getByText('Próximo')).toBeInTheDocument();
    expect(within(inter).getByText(/2\. Mentor/)).toBeInTheDocument();
    expect(within(inter).getByText('Mentor: quem você é e o que te legitima a cobrar caro.')).toBeInTheDocument();
    fireEvent.click(within(inter).getByRole('button', { name: 'Continuar' }));
    expect(titulo()).toBe(P('2.1'));
    expect(screen.getByTestId('bloco-pill-2')).toHaveAttribute('aria-current', 'step');
  });

  it('sugestão "a definir" é tratada como vazia: editor direto e sem "Confirmar e avançar"', () => {
    const d = dados({ blocos: [blocoDe(1, [campoDe('1.1', 'a definir')]), blocoDe(4, [campoDe('4.1', 'Nome do método: Corrente\nDe A para B em 1 frase: leva à sucessão')])] });
    const { container } = montar(d);
    expect(titulo()).toBe(P('1.1'));
    expect(screen.getByTestId('wizard-editor-1.1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar e avançar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar e avançar' })).toBeInTheDocument();
    expect(container.textContent).not.toContain('a definir');
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

  it('entre blocos só há o interstício (sem tela de dia); o último passo leva ao fim com "Faltam N campos para o seu script" e o mapa dos blocos', () => {
    montar();
    fireEvent.click(screen.getByTestId('bloco-pill-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    expect(titulo()).toBe(P('2.3'));
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    const inter = screen.getByTestId('wizard-interstitial');
    expect(within(inter).getByText(/4\. Método/)).toBeInTheDocument();
    expect(inter.textContent).not.toMatch(/\bDia \d/);
    fireEvent.click(within(inter).getByRole('button', { name: 'Continuar' }));
    expect(titulo()).toBe(P('4.1'));
    expect(screen.getByText('Método Corrente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    const fim = screen.getByTestId('wizard-fim');
    expect(within(fim).getByTestId('wizard-faltam')).toHaveTextContent('Faltam 4 campos para o seu script');
    expect(within(fim).getByTestId('mapa-blocos')).toHaveTextContent('1. Meta');
    expect(within(fim).getByTestId('mapa-blocos')).toHaveTextContent('2 em aberto');
    expect(fim.textContent).not.toMatch(/\bDia \d/);
    expect(within(fim).queryByRole('button', { name: 'Fechar ficha' })).not.toBeInTheDocument();
    fireEvent.click(within(fim).getByRole('button', { name: 'Ver o que falta' }));
    expect(titulo()).toBe(P('1.1'));
  });

  it('no fim, tocar um bloco do mapa leva ao primeiro pendente dele', () => {
    montar();
    fireEvent.click(screen.getByTestId('bloco-pill-4'));
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    const fim = screen.getByTestId('wizard-fim');
    fireEvent.click(within(fim).getByRole('button', { name: /2\. Mentor/ }));
    expect(titulo()).toBe(P('2.1'));
  });

  it('com só um obrigatório pendente, o fim diz "Falta 1 campo" e oferece "Ver o que falta"', () => {
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
    // o mock de decide nao muda os dados: 4.1 segue pendente
    expect(within(fim).getByTestId('wizard-faltam')).toHaveTextContent('Falta 1 campo para o seu script');
    expect(within(fim).queryByRole('button', { name: 'Fechar ficha' })).not.toBeInTheDocument();
    expect(within(fim).getByRole('button', { name: 'Ver o que falta' })).toBeInTheDocument();
    expect(onFecharFicha).not.toHaveBeenCalled();
  });

  it('ficha toda decidida abre direto no fim com "Fechar ficha"', () => {
    const d = dados({
      blocos: [blocoDe(1, [confirmado('1.1', 'Mentoria')]), blocoDe(4, [confirmado('4.1', 'Nome do método: Corrente\nDe A para B em 1 frase: leva à sucessão')])],
    });
    const { onFecharFicha } = montar(d);
    const fim = screen.getByTestId('wizard-fim');
    expect(within(fim).getByTestId('wizard-faltam')).toHaveTextContent('Você decidiu tudo');
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
});

describe('FichaWizard: navegação por perguntas', () => {
  it('"Perguntas" abre a folha com as perguntas do bloco, ponto de estado e a atual marcada; tocar pula e fecha', () => {
    montar();
    expect(screen.queryByTestId('navegador-sheet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Perguntas' }));
    const sheet = screen.getByTestId('navegador-sheet');
    expect(within(sheet).getByRole('dialog', { name: 'Perguntas do bloco 1' })).toBeInTheDocument();
    const p11 = within(sheet).getByTestId('sheet-nav-passo-1.1');
    expect(p11).toHaveAttribute('aria-current', 'step');
    expect(within(p11).getByRole('img', { name: 'Sugerido' })).toBeInTheDocument();
    const p12 = within(sheet).getByTestId('sheet-nav-passo-1.2');
    expect(within(p12).getByRole('img', { name: 'Vazio' })).toBeInTheDocument();
    expect(within(sheet).queryByTestId('sheet-nav-passo-2.1')).not.toBeInTheDocument();
    fireEvent.click(p12);
    expect(titulo()).toBe(P('1.2'));
    expect(screen.queryByTestId('navegador-sheet')).not.toBeInTheDocument();
  });

  it('barra lateral: blocos como seções, perguntas como itens, estado por ponto e "Próxima pendente"', () => {
    const d = dados({
      blocos: [
        blocoDe(1, [confirmado('1.1', 'Mentoria'), campoDe('1.2', '')]),
        blocoDe(2, [campoDe('2.1', 'Sou eu.', { status: 'editado', decidido: true, valor: 'Sou eu.', valor_efetivo: 'Sou eu.' }), campoDe('2.3', 'Mercado: x\nEu: y')]),
        blocoDe(4, [campoDe('4.1', 'Nome do método: Corrente\nDe A para B em 1 frase: leva à sucessão', { refinando: true })]),
      ],
    });
    montar(d);
    expect(titulo()).toBe(P('1.2'));
    const lateral = screen.getByTestId('navegador-lateral');
    expect(within(lateral).getByRole('region', { name: 'Bloco 2: Mentor' })).toBeInTheDocument();
    expect(within(within(lateral).getByTestId('lateral-nav-passo-1.1')).getByRole('img', { name: 'Confirmado' })).toBeInTheDocument();
    expect(within(within(lateral).getByTestId('lateral-nav-passo-2.1')).getByRole('img', { name: 'Editado por você' })).toBeInTheDocument();
    expect(within(within(lateral).getByTestId('lateral-nav-passo-4.1')).getByRole('img', { name: 'Em revisão pela IA' })).toBeInTheDocument();
    expect(within(lateral).getByTestId('lateral-nav-passo-1.2')).toHaveAttribute('aria-current', 'step');
    fireEvent.click(within(lateral).getByRole('button', { name: 'Próxima pendente' }));
    expect(titulo()).toBe(P('2.3'));
    fireEvent.click(within(lateral).getByTestId('lateral-nav-passo-4.1'));
    expect(titulo()).toBe(P('4.1'));
    expect(screen.getAllByTestId('badge-refinando').length).toBeGreaterThan(0);
  });

  it('setas do teclado: direita avança, esquerda volta; dentro de um campo de texto não navega', () => {
    montar();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(titulo()).toBe(P('1.2'));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(titulo()).toBe(P('1.1'));
    fireEvent.click(screen.getByTestId('bloco-pill-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const input = screen.getByLabelText('Editar Frase de especialista');
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(titulo()).toBe(P('2.1'));
    expect(screen.getByTestId('wizard-editor-2.1')).toBeInTheDocument();
  });

  it('nenhum texto visível usa travessão, emoji, "a definir" nem a palavra diagnóstico', () => {
    const { container } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Perguntas' }));
    const t = container.textContent || '';
    expect(t).not.toContain('—');
    expect(t).not.toContain('a definir');
    expect(t.toLowerCase()).not.toContain('diagnóstico');
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
