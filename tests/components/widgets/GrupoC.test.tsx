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

import { BalancaDisplay, BalancaWidget } from '../../../components/script/widgets/Balanca';
import { LinhaTempoDisplay, LinhaTempoWidget } from '../../../components/script/widgets/LinhaTempo';
import { JanelaAnoDisplay, JanelaAnoWidget } from '../../../components/script/widgets/JanelaAno';
import { parseEstrutura, splitLines, type Estrutura, type WidgetType } from '../../../components/script/widgets/estrutura';
import { SCRIPT_FIELD_BY_KEY, type ScriptFieldView } from '../../../data/script-ficha-fields';
import paloma from '../../fixtures/paloma-sugeridos.json';

type Fixture = Record<string, { sugerido: string; fonte: string }>;
const fx = paloma as Fixture;

/**
 * Sugestões reais do prefill da Paloma para 3.5 e 3.6 (o fixture de teste só cobre outros campos).
 * Cópia literal de business/campanhas/prosperus-exclusive/ferramenta-7passos/prefill/paloma-venturelli.json.
 */
const SUG_35 = [
  'Mais um ano exatamente como está hoje: o que acontece com a empresa, com a família e com você se a travessia continuar adiada?',
  '~30% das empresas familiares chegam à segunda geração. 12% sobrevivem até a terceira geração. 3% passam da quarta geração. (Fonte: Family Business Institute, citado pela PwC Family Business Survey.) A chamada maldição da terceira geração. A empresa familiar não morre por mercado ou por máquina. Morre por briga de família.',
  'A sucessão tem prazo biológico. Cada ano adiado é um ano a menos de margem de segurança para preparar quem vem depois.',
  'Estou preso na operação, e o relógio não para. E se a margem apertar antes de eu fazer a empresa crescer? Num setor de margem comprimida, ficar parado é o mesmo que recuar.',
].join('\n');

const SUG_36 = [
  'Ponto B · a chegada: a empresa cresce com margem e roda sem depender só dele. O sucessor preparado de verdade, com legitimidade para assumir. A família alinhada e as regras de convivência de pé. O legado seguindo para a próxima geração, em vez de morrer nela.',
  'O que ele sente na renovação: orgulho e paz. Não vai ser a geração em que a corrente arrebentou, e o legado segue nas mãos de quem ele preparou.',
  'O cliente sai de tenho pavor de ser o elo que quebrou a corrente para a corrente não vai quebrar na minha geração: eu preparei a próxima, e a empresa cresceu no caminho.',
].join('\n');

/** Campo de teste a partir da definicao real (widget + template do JSON) com uma sugestao. */
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
    fonte: sugerido ? 'teste' : '',
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

const estruturaDe = (w: WidgetType, campo: ScriptFieldView, texto: string): Estrutura =>
  parseEstrutura(w, texto, campo.template, {}).estrutura;

describe('Balança (2.3 Diferencial)', () => {
  const campo = campoDe('2.3', fx['2.3'].sugerido);
  const est = estruturaDe('vs', campo, fx['2.3'].sugerido);

  it('leitura: um par por linha, o VS no pivô e a viga inclinada para o lado do mentor', () => {
    render(<BalancaDisplay campo={campo} template={campo.template} value={est} ctx={{}} />);
    const raiz = screen.getByTestId('balanca');
    const n = Math.max(splitLines(est.mercado).length, splitLines(est.eu).length);
    expect(n).toBeGreaterThan(1);
    expect(screen.getAllByTestId(/^balanca-par-/)).toHaveLength(n);
    expect(screen.getByText('VS')).toBeInTheDocument();
    expect(Number(raiz.getAttribute('data-inclina'))).toBeGreaterThan(0);
    expect(within(screen.getByTestId('balanca-par-0')).getByText(/O mercado de mentoria de gestão está saturado/)).toBeInTheDocument();
    expect(within(screen.getByTestId('balanca-par-0')).getByText(/Sucessão vivida dos dois lados/)).toBeInTheDocument();
  });

  it('leitura: sem par nenhum mostra "em branco" e a viga fica reta', () => {
    render(<BalancaDisplay campo={campo} template={campo.template} value={{ mercado: '', eu: '' }} ctx={{}} />);
    expect(screen.getByTestId('balanca')).toHaveAttribute('data-inclina', '0');
    expect(screen.getByText('em branco')).toBeInTheDocument();
    expect(screen.queryByTestId('balanca-par-0')).not.toBeInTheDocument();
  });

  it('edição: um par vazio para começar, com os dois lados rotulados', () => {
    const onChange = vi.fn();
    render(<BalancaWidget campo={campo} template={campo.template} value={{ mercado: '', eu: '' }} onChange={onChange} ctx={{}} />);
    expect(screen.getByLabelText('O mercado faz 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Eu faço 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Remover par 1')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Eu faço 1'), { target: { value: 'Sucessão vivida dos dois lados' } });
    expect(onChange).toHaveBeenCalledWith({ mercado: '', eu: 'Sucessão vivida dos dois lados' });
  });

  it('edição: o lado direito de cada par entra na linha certa dos dois textos', () => {
    const onChange = vi.fn();
    render(
      <BalancaWidget
        campo={campo}
        template={campo.template}
        value={{ mercado: 'Vende curso gravado\nCobra por hora', eu: 'Entrego sistema' }}
        onChange={onChange}
        ctx={{}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Eu faço 2'), { target: { value: 'Fico até o resultado aparecer' } });
    expect(onChange).toHaveBeenCalledWith({
      mercado: 'Vende curso gravado\nCobra por hora',
      eu: 'Entrego sistema\nFico até o resultado aparecer',
    });
  });

  it('edição: "+ Par" abre mais uma linha', () => {
    render(<BalancaWidget campo={campo} template={campo.template} value={{ mercado: '', eu: '' }} onChange={vi.fn()} ctx={{}} />);
    expect(screen.queryByLabelText('O mercado faz 2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Par' }));
    expect(screen.getByLabelText('O mercado faz 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Eu faço 2')).toBeInTheDocument();
  });
});

describe('Linha do tempo (2.2 História de autoridade e 3 provas)', () => {
  const campo = campoDe('2.2', fx['2.2'].sugerido);
  const est = estruturaDe('historia_podio', campo, fx['2.2'].sugerido);
  const ls = splitLines(fx['2.2'].sugerido);

  it('leitura: os marcos na linha do tempo e as 3 últimas linhas no pódio', () => {
    render(<LinhaTempoDisplay campo={campo} template={campo.template} value={est} ctx={{}} />);
    const marcos = screen.getAllByTestId(/^marco-/);
    expect(marcos).toHaveLength(ls.length - 3);
    expect(within(marcos[0]).getByText(/Cinco movimentos fabricaram a sua autoridade/)).toBeInTheDocument();

    const [ouro, prata, bronze] = ls.slice(-3);
    expect(within(screen.getByTestId('podio-ouro')).getByText('Ouro')).toBeInTheDocument();
    expect(within(screen.getByTestId('podio-prata')).getByText('Prata')).toBeInTheDocument();
    expect(within(screen.getByTestId('podio-bronze')).getByText('Bronze')).toBeInTheDocument();
    expect(screen.getByTestId('podio-ouro').textContent).toContain(ouro.slice(0, 30));
    expect(screen.getByTestId('podio-prata').textContent).toContain(prata.slice(0, 30));
    expect(screen.getByTestId('podio-bronze').textContent).toContain(bronze.slice(0, 30));
  });

  it('leitura: sem história não desenha a linha do tempo, e prova vazia vira "em branco"', () => {
    render(<LinhaTempoDisplay campo={campo} template={campo.template} value={{ historia: '', ouro: '', prata: '', bronze: '' }} ctx={{}} />);
    expect(screen.queryByTestId('linha-tempo')).not.toBeInTheDocument();
    expect(screen.getAllByText('em branco')).toHaveLength(3);
  });

  it('edição: cada prova no seu degrau e as setas trocam ouro com prata', () => {
    const onChange = vi.fn();
    render(<LinhaTempoWidget campo={campo} template={campo.template} value={est} onChange={onChange} ctx={{}} />);
    expect((screen.getByLabelText('Prova Ouro') as HTMLTextAreaElement).value).toBe(est.ouro);
    expect((screen.getByLabelText('Prova Prata') as HTMLTextAreaElement).value).toBe(est.prata);
    expect((screen.getByLabelText('Prova Bronze') as HTMLTextAreaElement).value).toBe(est.bronze);
    expect(screen.getByLabelText('Subir prova Ouro')).toBeDisabled();
    expect(screen.getByLabelText('Descer prova Bronze')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Descer prova Ouro' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ouro: est.prata, prata: est.ouro }));
  });

  it('edição: escrever no marco 1 reescreve a primeira linha da história', () => {
    const onChange = vi.fn();
    render(<LinhaTempoWidget campo={campo} template={campo.template} value={est} onChange={onChange} ctx={{}} />);
    const marcos = splitLines(est.historia);
    expect(screen.getByLabelText(`Marco ${marcos.length}`)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Marco 1'), { target: { value: 'Comecei no chão de fábrica' } });
    const enviado = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(splitLines(enviado.historia)[0]).toBe('Comecei no chão de fábrica');
    expect(splitLines(enviado.historia)).toHaveLength(marcos.length);
  });

  it('edição: história vazia começa com um marco só, sem remover', () => {
    render(<LinhaTempoWidget campo={campo} template={campo.template} value={{ historia: '', ouro: '', prata: '', bronze: '' }} onChange={vi.fn()} ctx={{}} />);
    expect(screen.getByLabelText('Marco 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Marco 2')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Remover marco 1')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '+ Marco' }));
    expect(screen.getByLabelText('Marco 2')).toBeInTheDocument();
  });
});

describe('Janela do ano (3.5 e 3.6)', () => {
  const c35 = campoDe('3.5', SUG_35);
  const c36 = campoDe('3.6', SUG_36);

  it('leitura 3.5: janela cinza, o nome uma vez só e a cena do ano sem resolver', () => {
    render(<JanelaAnoDisplay campo={c35} template={c35.template} value={estruturaDe('texto', c35, SUG_35)} ctx={{}} />);
    const janela = screen.getByTestId('janela-ano-3.5');
    expect(janela).toHaveAttribute('data-tom', 'cinza');
    expect(within(janela).getAllByText('Daqui a 1 ano sem resolver')).toHaveLength(1);
    expect(within(janela).getByTestId('regua-12')).toBeInTheDocument();
    expect(janela.textContent).toContain('Mais um ano exatamente como está hoje');
    expect(janela.textContent).toContain('A sucessão tem prazo biológico');
  });

  it('leitura 3.6: janela dourada com o nome do ano resolvido', () => {
    render(<JanelaAnoDisplay campo={c36} template={c36.template} value={estruturaDe('texto', c36, SUG_36)} ctx={{}} />);
    const janela = screen.getByTestId('janela-ano-3.6');
    expect(janela).toHaveAttribute('data-tom', 'ouro');
    expect(within(janela).getAllByText('Daqui a 1 ano resolvido')).toHaveLength(1);
    expect(janela.textContent).toContain('a empresa cresce com margem');
  });

  it('leitura: sem texto a janela mostra "em branco"', () => {
    render(<JanelaAnoDisplay campo={c35} template={c35.template} value={{ texto: '' }} ctx={{}} />);
    expect(within(screen.getByTestId('janela-ano-3.5')).getByText('em branco')).toBeInTheDocument();
  });

  it('edição: o campo aberto no lugar da cena devolve só o texto', () => {
    const onChange = vi.fn();
    render(<JanelaAnoWidget campo={c35} template={c35.template} value={{ texto: '' }} onChange={onChange} ctx={{}} />);
    expect(screen.getAllByText('Daqui a 1 ano sem resolver')).toHaveLength(1);
    const area = screen.getByLabelText('Editar Consequência de não resolver') as HTMLTextAreaElement;
    expect(area.rows).toBe(c35.template.rows || 4);

    fireEvent.change(area, { target: { value: 'Mais um ano exatamente igual' } });
    expect(onChange).toHaveBeenCalledWith({ texto: 'Mais um ano exatamente igual' });
  });

  it('edição 3.6: o campo do ano resolvido usa o nome do campo', () => {
    render(<JanelaAnoWidget campo={c36} template={c36.template} value={{ texto: '' }} onChange={vi.fn()} ctx={{}} />);
    expect(screen.getByLabelText('Editar Consequência de resolver')).toBeInTheDocument();
    expect(screen.getByTestId('regua-12')).toBeInTheDocument();
  });
});

describe('vocabulário da casa', () => {
  const c23 = campoDe('2.3', '');
  const c22 = campoDe('2.2', '');
  const c35 = campoDe('3.5', '');

  const telas: [string, React.ReactElement][] = [
    ['balanca leitura', <BalancaDisplay campo={c23} template={c23.template} value={{ mercado: '', eu: '' }} ctx={{}} />],
    ['balanca edicao', <BalancaWidget campo={c23} template={c23.template} value={{ mercado: '', eu: '' }} onChange={vi.fn()} ctx={{}} />],
    ['linha do tempo leitura', <LinhaTempoDisplay campo={c22} template={c22.template} value={{ historia: '', ouro: '', prata: '', bronze: '' }} ctx={{}} />],
    ['linha do tempo edicao', <LinhaTempoWidget campo={c22} template={c22.template} value={{ historia: '', ouro: '', prata: '', bronze: '' }} onChange={vi.fn()} ctx={{}} />],
    ['janela leitura', <JanelaAnoDisplay campo={c35} template={c35.template} value={{ texto: '' }} ctx={{}} />],
    ['janela edicao', <JanelaAnoWidget campo={c35} template={c35.template} value={{ texto: '' }} onChange={vi.fn()} ctx={{}} />],
  ];

  it.each(telas)('%s: sem travessão e sem a palavra proibida', (_nome, elemento) => {
    const { container } = render(elemento);
    expect(container.textContent).not.toContain('—');
    expect(container.textContent!.toLowerCase()).not.toContain('diagn');
  });

  it('a sugestão real do 2.3 e do 2.2 não traz travessão para a tela', () => {
    const campo23 = campoDe('2.3', fx['2.3'].sugerido);
    const { container, unmount } = render(
      <BalancaDisplay campo={campo23} template={campo23.template} value={estruturaDe('vs', campo23, fx['2.3'].sugerido)} ctx={{}} />,
    );
    expect(container.textContent).not.toContain('—');
    unmount();

    const campo22 = campoDe('2.2', fx['2.2'].sugerido);
    const { container: c2 } = render(
      <LinhaTempoDisplay campo={campo22} template={campo22.template} value={estruturaDe('historia_podio', campo22, fx['2.2'].sugerido)} ctx={{}} />,
    );
    expect(c2.textContent).not.toContain('—');
  });
});
