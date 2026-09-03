import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

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

import { CONFIRMADO_MS, FichaWizard, montarPassos, passoInicial } from '../../components/script/FichaWizard';
import { COPY_VAZIO } from '../../components/script/FichaField';
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

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const titulo = () => screen.getByTestId('wizard-title').textContent;
const P = (key: string) => SCRIPT_FIELD_BY_KEY[key].pergunta;
/** Toca o botão principal e deixa passar o tempo do estado "Confirmado". */
const tocarEAvancar = (nome: string) => {
  fireEvent.click(screen.getByRole('button', { name: nome }));
  act(() => { vi.advanceTimersByTime(CONFIRMADO_MS + 50); });
};
const lateral = () => screen.getByTestId('navegador-lateral');
/** Abre o bloco no navegador lateral (se ainda fechado) e toca a pergunta. */
const irPelaLateral = (bloco: number, id: string) => {
  if (!within(lateral()).queryByTestId(`lateral-nav-passo-${id}`)) fireEvent.click(within(lateral()).getByTestId(`lateral-nav-bloco-${bloco}`));
  fireEvent.click(within(lateral()).getByTestId(`lateral-nav-passo-${id}`));
};

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

describe('FichaWizard: a tela de uma pergunta', () => {
  it('lê de cima para baixo: chip do bloco + número, a pergunta grande, por que importa, "Sugestão encontrada" com a fonte discreta, a linha "no seu script" e o contexto; sem "Hoje" nem "Dia N"', () => {
    const { container } = montar();
    // (a) chip do bloco + número da pergunta
    expect(screen.getByTestId('chip-bloco')).toHaveTextContent('Bloco 1 · Meta');
    expect(screen.getByTestId('wizard-posicao')).toHaveTextContent('Pergunta 1 de 2');
    expect(screen.getByText('Meta: onde você quer chegar, com número e prazo.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    // (b) a pergunta é o título
    expect(titulo()).toBe(P('1.1'));
    // (c) por que isso importa no script (o que alimenta)
    expect(screen.getByTestId('ajuda-1.1')).toHaveTextContent('Por que isso importa no script: Entra no Passo 3');
    // (d) a sugestão dentro do widget, com o cabeçalho e a fonte sem negrito nem colchetes
    expect(screen.getByText('Sugestão encontrada')).toBeInTheDocument();
    expect(screen.getAllByText('Mentoria Sucessão')[0].closest('[data-selected]')).toHaveAttribute('data-selected', 'true');
    const fonte = screen.getByTestId('fonte-1.1');
    expect(fonte).toHaveTextContent('Fonte: Exclusive Book · P1');
    expect(fonte.querySelector('b, strong')).toBeNull();
    expect(fonte.textContent).not.toMatch(/[\[\]]/);
    // (e) a linha "no seu script" em itálico
    const previa = screen.getByTestId('previa-1.1');
    expect(previa).toHaveTextContent('No seu script');
    expect(previa).toHaveTextContent('Mentoria Sucessão');
    expect(previa.className).toContain('italic');
    // (f) contexto por pergunta embaixo do campo
    expect(screen.getByTestId('contexto-1.1')).toBeInTheDocument();
    // (g) um só botão principal, largo e dourado, com o check
    const principal = screen.getByRole('button', { name: 'Confirmar e avançar' });
    expect(principal.className).toContain('w-full');
    expect(principal.querySelector('svg')).not.toBeNull();
    expect(container.textContent).not.toMatch(/Hoje:/);
    expect(container.textContent).not.toMatch(/\bDia \d/);
  });

  it('fonte entre colchetes aparece limpa', () => {
    montar(dados({ blocos: [blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão', { fonte: '[Exclusive Book · P2]' })])] }));
    expect(screen.getByTestId('fonte-1.1')).toHaveTextContent('Fonte: Exclusive Book · P2');
    expect(screen.getByTestId('fonte-1.1').textContent).not.toMatch(/[\[\]]/);
  });

  it('Confirmar e avançar: decide, recolhe o valor na linha "Confirmado" por 400 ms e só então a próxima pergunta entra', () => {
    const { decide } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e avançar' }));
    expect(decide).toHaveBeenCalledWith('1.1', { status: 'confirmado' });
    // estado "Confirmado": o valor virou uma linha compacta e o botão principal trocou de cara
    const resumo = screen.getByTestId('resumo-confirmado');
    expect(resumo).toHaveTextContent('Confirmado');
    expect(resumo).toHaveTextContent('Mentoria Sucessão');
    expect(screen.getByTestId('principal-feito')).toHaveTextContent('Confirmado');
    expect(screen.queryByRole('button', { name: 'Confirmar e avançar' })).not.toBeInTheDocument();
    expect(titulo()).toBe(P('1.1'));
    act(() => { vi.advanceTimersByTime(CONFIRMADO_MS - 50); });
    expect(titulo()).toBe(P('1.1'));
    act(() => { vi.advanceTimersByTime(100); });
    expect(titulo()).toBe(P('1.2'));
    expect(screen.getByTestId('wizard-posicao')).toHaveTextContent('Pergunta 2 de 2');
    expect(screen.queryByTestId('resumo-confirmado')).not.toBeInTheDocument();
  });

  it('as ações secundárias são botões de texto embaixo do principal: Editar, Deixar em branco, Pular por agora, Voltar', () => {
    montar();
    const barra = screen.getByTestId('barra-acoes');
    for (const nome of ['Editar', 'Deixar em branco por enquanto', 'Pular por agora', 'Voltar']) {
      const b = within(barra).getByRole('button', { name: nome });
      expect(b.className).not.toContain('bg-prosperus-gold-dark');
    }
    expect(within(barra).getAllByRole('button').filter((b) => b.className.includes('bg-prosperus-gold-dark'))).toHaveLength(1);
  });

  it('Voltar retorna ao campo anterior', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    expect(titulo()).toBe(P('1.2'));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(titulo()).toBe(P('1.1'));
  });

  it('campo vazio: editor direto com o convite, "Salvar e avançar" e nunca "Confirmar"; no fim do bloco, o interstício creme com a prévia e o próximo bloco', () => {
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
    expect(within(inter).queryByTestId('mapa-blocos')).not.toBeInTheDocument();
    fireEvent.click(within(inter).getByRole('button', { name: 'Continuar' }));
    expect(titulo()).toBe(P('2.1'));
    expect(screen.getByTestId('chip-bloco')).toHaveTextContent('Bloco 2 · Mentor');
    expect(within(lateral()).getByTestId('lateral-nav-bloco-2')).toHaveAttribute('aria-current', 'true');
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

  it('Editar troca o visual pelo widget no lugar; "Salvar e avançar" envia valor e estrutura, mostra "Salvo" e avança', () => {
    const { decide } = montar();
    irPelaLateral(2, '2.1');
    expect(titulo()).toBe(P('2.1'));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByTestId('wizard-editor-2.1')).toBeInTheDocument();
    const input = screen.getByLabelText('Frase de especialista: quem é você') as HTMLInputElement;
    expect(input.value).toMatch(/Paloma/);
    fireEvent.change(input, { target: { value: 'Paloma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e avançar' }));
    expect(decide).toHaveBeenCalledTimes(1);
    const [key, decisao] = decide.mock.calls[0];
    expect(key).toBe('2.1');
    expect(decisao.status).toBe('editado');
    expect(decisao.valor).toMatch(/Paloma/);
    expect(decisao.estrutura.lacunas.sou).toBe('Paloma');
    expect(screen.getByTestId('resumo-confirmado')).toHaveTextContent('Salvo');
    act(() => { vi.advanceTimersByTime(CONFIRMADO_MS + 50); });
    expect(titulo()).toBe(P('2.3'));
    expect(screen.getByText('VS')).toBeInTheDocument();
  });

  it('entre blocos só há o interstício (sem tela de dia); o último passo leva ao fim com "Faltam N campos", "Ver o que falta" e sem mapa de blocos', () => {
    montar();
    irPelaLateral(2, '2.1');
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    expect(titulo()).toBe(P('2.3'));
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    const inter = screen.getByTestId('wizard-interstitial');
    expect(within(inter).getByText(/4\. Método/)).toBeInTheDocument();
    expect(inter.textContent).not.toMatch(/\bDia \d/);
    fireEvent.click(within(inter).getByRole('button', { name: 'Continuar' }));
    expect(titulo()).toBe(P('4.1'));
    expect(screen.getAllByText('Método Corrente').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    const fim = screen.getByTestId('wizard-fim');
    expect(within(fim).getByTestId('wizard-faltam')).toHaveTextContent('Faltam 4 campos para o seu script');
    expect(within(fim).queryByTestId('mapa-blocos')).not.toBeInTheDocument();
    expect(within(fim).queryByText(/1\. Meta/)).not.toBeInTheDocument();
    expect(fim.textContent).not.toMatch(/\bDia \d/);
    expect(within(fim).queryByRole('button', { name: 'Fechar ficha' })).not.toBeInTheDocument();
    fireEvent.click(within(fim).getByRole('button', { name: 'Ver o que falta' }));
    expect(titulo()).toBe(P('1.1'));
  });

  it('no fim, o navegador lateral segue sendo o único mapa: abrir um bloco e tocar a pergunta leva até ela', () => {
    montar();
    irPelaLateral(4, '4.1');
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    expect(screen.getByTestId('wizard-fim')).toBeInTheDocument();
    irPelaLateral(2, '2.1');
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
    tocarEAvancar('Confirmar e avançar');
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
    expect(screen.getByTestId('contador-faltam')).toHaveTextContent('tudo decidido para o seu script');
    fireEvent.click(within(fim).getByRole('button', { name: 'Fechar ficha' }));
    expect(onFecharFicha).toHaveBeenCalled();
  });

  it('par antes × depois é uma tela só com "Confirmar os dois e avançar" e a mesma confirmação recolhida', () => {
    const d = dados({
      blocos: [blocoDe(3, [campoDe('3.5', 'Mais um ano preso na operação.'), campoDe('3.6', 'A empresa roda sem ela.')])],
    });
    const { decide } = montar(d);
    expect(titulo()).toBe('Daqui a 1 ano: sem resolver e resolvido');
    expect(screen.getByText('Daqui a 1 ano sem resolver')).toBeInTheDocument();
    expect(screen.getByText('Daqui a 1 ano resolvido')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-posicao')).toHaveTextContent('Perguntas 1 e 2 de 2');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar os dois e avançar' }));
    expect(decide).toHaveBeenCalledWith('3.5', { status: 'confirmado' });
    expect(decide).toHaveBeenCalledWith('3.6', { status: 'confirmado' });
    expect(screen.getByTestId('resumo-confirmado')).toHaveTextContent('Confirmado');
    act(() => { vi.advanceTimersByTime(CONFIRMADO_MS + 50); });
    expect(screen.getByTestId('wizard-fim')).toBeInTheDocument();
  });
});

describe('FichaWizard: um navegador só, hierárquico', () => {
  it('não há pílulas dos blocos em cima nem mapa dos blocos no fim: os 6 blocos aparecem uma vez, como seções do navegador', () => {
    montar();
    expect(screen.queryByTestId('bloco-pill-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mapa-blocos')).not.toBeInTheDocument();
    const nav = lateral();
    expect(within(nav).getByRole('region', { name: 'Bloco 1: Meta' })).toBeInTheDocument();
    expect(within(nav).getByRole('region', { name: 'Bloco 2: Mentor' })).toBeInTheDocument();
    expect(within(nav).getByRole('region', { name: 'Bloco 4: Método' })).toBeInTheDocument();
    expect(screen.getAllByText('Mentor')).toHaveLength(1);
    // o bloco atual está aberto com as perguntas dentro; os outros, fechados
    expect(within(nav).getByTestId('lateral-nav-bloco-1')).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).getByTestId('lateral-nav-passo-1.1')).toHaveAttribute('aria-current', 'step');
    expect(within(nav).getByTestId('lateral-nav-bloco-2')).toHaveAttribute('aria-expanded', 'false');
    expect(within(nav).queryByTestId('lateral-nav-passo-2.1')).not.toBeInTheDocument();
    // a contagem por bloco
    expect(within(nav).getByTestId('lateral-nav-bloco-4-contagem')).toHaveTextContent('0/1');
  });

  it('"Perguntas" abre a folha com a mesma hierarquia (bloco aberto > perguntas com ponto de estado), a atual marcada; tocar pula e fecha', () => {
    montar();
    expect(screen.queryByTestId('navegador-sheet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Perguntas' }));
    const sheet = screen.getByTestId('navegador-sheet');
    expect(within(sheet).getByRole('dialog', { name: 'Perguntas da ficha' })).toBeInTheDocument();
    expect(within(sheet).getByTestId('navegador-sheet-lista').className).toContain('ficha-scroll');
    expect(within(sheet).getByTestId('sheet-nav-bloco-1')).toHaveAttribute('aria-expanded', 'true');
    const p11 = within(sheet).getByTestId('sheet-nav-passo-1.1');
    expect(p11).toHaveAttribute('aria-current', 'step');
    expect(within(p11).getByRole('img', { name: 'Sugerido' })).toBeInTheDocument();
    const p12 = within(sheet).getByTestId('sheet-nav-passo-1.2');
    expect(within(p12).getByRole('img', { name: 'Em branco' })).toBeInTheDocument();
    expect(within(sheet).queryByTestId('sheet-nav-passo-2.1')).not.toBeInTheDocument();
    fireEvent.click(within(sheet).getByTestId('sheet-nav-bloco-2'));
    expect(within(sheet).getByTestId('sheet-nav-passo-2.1')).toBeInTheDocument();
    fireEvent.click(p12);
    expect(titulo()).toBe(P('1.2'));
    expect(screen.queryByTestId('navegador-sheet')).not.toBeInTheDocument();
  });

  it('coluna lateral: blocos como seções, perguntas como itens, estado no vocabulário único e "Próxima pendente"; a contagem sobe com a ficha', () => {
    const d = dados({
      blocos: [
        blocoDe(1, [confirmado('1.1', 'Mentoria'), campoDe('1.2', '')]),
        blocoDe(2, [campoDe('2.1', 'Sou eu.', { status: 'editado', decidido: true, valor: 'Sou eu.', valor_efetivo: 'Sou eu.' }), campoDe('2.3', 'Mercado: x\nEu: y')]),
        blocoDe(4, [campoDe('4.1', 'Nome do método: Corrente\nDe A para B em 1 frase: leva à sucessão', { refinando: true })]),
      ],
    });
    montar(d);
    expect(titulo()).toBe(P('1.2'));
    const nav = lateral();
    expect(within(nav).getByTestId('lateral-nav-bloco-1-contagem')).toHaveTextContent('1/2');
    expect(within(nav).getByTestId('lateral-nav-bloco-2-contagem')).toHaveTextContent('1/2');
    expect(within(within(nav).getByTestId('lateral-nav-passo-1.1')).getByRole('img', { name: 'Confirmado' })).toBeInTheDocument();
    expect(within(nav).getByTestId('lateral-nav-passo-1.2')).toHaveAttribute('aria-current', 'step');
    fireEvent.click(within(nav).getByTestId('lateral-nav-bloco-2'));
    expect(within(within(nav).getByTestId('lateral-nav-passo-2.1')).getByRole('img', { name: 'Editado' })).toBeInTheDocument();
    fireEvent.click(within(nav).getByTestId('lateral-nav-bloco-4'));
    expect(within(within(nav).getByTestId('lateral-nav-passo-4.1')).getByRole('img', { name: 'Em revisão pela IA' })).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole('button', { name: 'Próxima pendente' }));
    expect(titulo()).toBe(P('2.3'));
    // ao trocar de bloco, só o atual fica aberto
    expect(within(nav).getByTestId('lateral-nav-bloco-2')).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).getByTestId('lateral-nav-bloco-4')).toHaveAttribute('aria-expanded', 'false');
    irPelaLateral(4, '4.1');
    expect(titulo()).toBe(P('4.1'));
    expect(screen.getAllByTestId('badge-refinando').length).toBeGreaterThan(0);
    expect(within(nav).getAllByRole('listitem').map((li) => li.textContent).join(' ')).not.toMatch(/Editado por você|Deixado em branco|Vazio\b/);
  });

  it('setas do teclado: direita avança, esquerda volta; dentro de um campo de texto não navega', () => {
    montar();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(titulo()).toBe(P('1.2'));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(titulo()).toBe(P('1.1'));
    irPelaLateral(2, '2.1');
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const input = screen.getByLabelText('Frase de especialista: quem é você');
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(titulo()).toBe(P('2.1'));
    expect(screen.getByTestId('wizard-editor-2.1')).toBeInTheDocument();
  });

  it('a barra de rolagem discreta: o wizard e a lista da folha levam a classe ficha-scroll', () => {
    montar();
    expect(screen.getByTestId('ficha-wizard').className).toContain('ficha-scroll');
    fireEvent.click(screen.getByRole('button', { name: 'Perguntas' }));
    expect(screen.getByTestId('navegador-sheet-lista').className).toContain('ficha-scroll');
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

describe('FichaWizard: a prévia com capítulos trancados', () => {
  /** Bloco 2 fechado (2.1 e 2.3 confirmados), bloco 1 e 4 abertos. */
  const comBlocoFechado = () => {
    const b2 = blocoDe(2, [
      confirmado('2.1', 'Sou a Paloma e ajudo donos de indústria familiar a atravessar a sucessão.'),
      confirmado('2.3', 'O mercado faz: holding e organograma.\nEu faço: preparo quem assume.'),
    ]);
    return dados({ blocos: [blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão')]), b2, blocoDe(4, [campoDe('4.1', 'Nome do método: Método Corrente\nDe A para B em 1 frase: leva o dono da operação à sucessão preparada')])] });
  };

  it('o fim do navegador lateral é "Prévia do script" com a contagem de capítulos; tocar abre o painel creme com o capítulo revelado rascunhado e os trancados com "abre com o bloco"', () => {
    montar(comBlocoFechado());
    const botao = within(lateral()).getByTestId('lateral-previa');
    expect(within(lateral()).getByTestId('lateral-previa-capitulos')).toHaveTextContent('1 de 7 capítulos aberto');
    fireEvent.click(botao);
    const painel = screen.getByTestId('wizard-previa-script');
    expect(painel).toHaveTextContent('Prévia do seu script');
    expect(within(painel).getByTestId('previa-capitulos')).toHaveAttribute('data-revelados', '1');
    // Passo 1 (Conexão) abre com o bloco 2, fechado: as frases dos campos decididos entram
    const passo1 = within(painel).getByTestId('previa-passo-1');
    expect(passo1).toHaveTextContent('Passo 1 · Conexão');
    expect(passo1).toHaveTextContent('rascunho v0');
    expect(within(passo1).getByTestId('previa-linha-2.1')).toHaveTextContent('Paloma');
    expect(within(passo1).getByTestId('previa-linha-2.3')).toHaveTextContent('Enquanto o mercado');
    // os outros seguem trancados, só com o nome e o bloco que os abre
    expect(within(painel).getByTestId('previa-trancada-2')).toHaveTextContent('abre com o bloco 3 · Mentorado');
    expect(within(painel).getByTestId('previa-trancada-3')).toHaveTextContent('abre com o bloco 4 · Método');
    expect(within(painel).queryByTestId('previa-passo-3')).not.toBeInTheDocument();
    expect(within(lateral()).getByTestId('lateral-previa')).toHaveAttribute('aria-current', 'true');
    // tocar num capítulo trancado leva à primeira pergunta pendente do bloco que o abre
    fireEvent.click(within(painel).getByRole('button', { name: 'Ir para o bloco 4' }));
    expect(titulo()).toBe(P('4.1'));
    expect(screen.queryByTestId('wizard-previa-script')).not.toBeInTheDocument();
  });

  it('o fim da ficha oferece "Ver a prévia do script"; sem bloco fechado nenhum capítulo abre e Voltar retorna à pergunta', () => {
    montar();
    irPelaLateral(4, '4.1');
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    const fim = screen.getByTestId('wizard-fim');
    fireEvent.click(within(fim).getByRole('button', { name: 'Ver a prévia do script' }));
    const painel = screen.getByTestId('wizard-previa-script');
    expect(within(painel).getByTestId('previa-capitulos-contagem')).toHaveTextContent('nenhum capítulo aberto ainda');
    for (let n = 1; n <= 7; n++) expect(within(painel).getByTestId(`previa-trancada-${n}`)).toBeInTheDocument();
    expect(painel.textContent).not.toContain('—');
    expect(painel.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    fireEvent.click(within(painel).getByRole('button', { name: 'Voltar' }));
    expect(screen.queryByTestId('wizard-previa-script')).not.toBeInTheDocument();
    expect(titulo()).toBe(P('4.1'));
  });

  it('a folha "Perguntas" no celular também termina na prévia e fecha ao abrir o painel', () => {
    montar(comBlocoFechado());
    fireEvent.click(screen.getByRole('button', { name: 'Perguntas' }));
    const sheet = screen.getByTestId('navegador-sheet');
    fireEvent.click(within(sheet).getByTestId('sheet-previa'));
    expect(screen.queryByTestId('navegador-sheet')).not.toBeInTheDocument();
    expect(screen.getByTestId('wizard-previa-script')).toBeInTheDocument();
  });

  it('o par 3.5 × 3.6 aparece como duas janelas, cinza e dourada, cada uma com o próprio rótulo uma vez só', () => {
    const d = dados({
      blocos: [blocoDe(3, [campoDe('3.5', 'Mais um ano preso na operação.'), campoDe('3.6', 'A empresa roda sem ela.')])],
    });
    montar(d);
    expect(screen.getByTestId('janela-ano-3.5')).toHaveAttribute('data-tom', 'cinza');
    expect(screen.getByTestId('janela-ano-3.6')).toHaveAttribute('data-tom', 'ouro');
    expect(screen.getAllByText('Daqui a 1 ano sem resolver')).toHaveLength(1);
    expect(screen.getAllByText('Daqui a 1 ano resolvido')).toHaveLength(1);
    expect(screen.getAllByTestId('regua-12').length).toBe(2);
  });
});
