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

import { RetornoDisplay, RetornoWidget } from '../../../components/script/widgets/Retorno';
import { RadarDisplay, RadarWidget } from '../../../components/script/widgets/Radar';
import { MostradorDisplay, MostradorWidget } from '../../../components/script/widgets/Mostrador';
import { DorPilarDisplay, DorPilarWidget } from '../../../components/script/widgets/DorPilar';
import { parseEstrutura, pilarNames, type Estrutura, type ParseContext, type WidgetType } from '../../../components/script/widgets/estrutura';
import { SCRIPT_FIELD_BY_KEY, type ScriptFieldView } from '../../../data/script-ficha-fields';
import paloma from '../../fixtures/paloma-sugeridos.json';

type Fixture = Record<string, { sugerido: string; fonte: string }>;
const fx = paloma as Fixture;

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

const daPaloma = (key: string) => campoDe(key, fx[key].sugerido, { fonte: fx[key].fonte });
const tpl = (key: string): Record<string, any> => (SCRIPT_FIELD_BY_KEY[key].template as Record<string, any>) || {};
/** A estrutura que sai da sugestao real do prefill da Paloma. */
const daFixture = (base: WidgetType, key: string, ctx: ParseContext = {}): Estrutura =>
  parseEstrutura(base, fx[key].sugerido, tpl(key), ctx).estrutura;

/** Nem travessao na interface, nem a palavra proibida (a menos que venha da propria sugestao). */
function semPalavraProibida(container: HTMLElement, sugerido = '') {
  expect(container.textContent).not.toContain('—');
  if (!sugerido.toLowerCase().includes('diagnóstico')) {
    expect(container.textContent!.toLowerCase()).not.toContain('diagnóstico');
  }
}

// ── 5.5 Retorno financeiro: dois mostradores de barra ────────────────────────

describe('5.5 Retorno: as duas barras, sozinho e com você', () => {
  const campo = daPaloma('5.5');
  const template = tpl('5.5');
  const cheio = { sozinho: '10.000', comigo: '50.000', prazo: '12 meses', obs: 'A conta é do ano inteiro.' };

  it('leitura: barra medida pelo maior valor, o texto do mentor como ele escreveu e o prazo em pílula', () => {
    const { container } = render(<RetornoDisplay campo={campo} template={template} value={cheio} ctx={{}} />);
    const sozinho = screen.getByTestId('retorno-sozinho');
    const comigo = screen.getByTestId('retorno-comigo');
    expect(sozinho).toHaveAttribute('data-altura', '20');
    expect(comigo).toHaveAttribute('data-altura', '100');
    expect(within(sozinho).getByText('Sozinho')).toBeInTheDocument();
    expect(within(sozinho).getByText('R$ 10.000')).toBeInTheDocument();
    expect(within(comigo).getByText('Com você')).toBeInTheDocument();
    expect(within(comigo).getByText('R$ 50.000')).toBeInTheDocument();
    expect(screen.getByTestId('retorno-prazo')).toHaveTextContent('em 12 meses');
    expect(screen.getByText('A conta é do ano inteiro.')).toBeInTheDocument();
    semPalavraProibida(container, fx['5.5'].sugerido);
  });

  it('leitura: o valor escrito por extenso continua igual e a barra menor tem piso de 8%', () => {
    const value = { sozinho: '10 mil', comigo: '3,6 milhões', prazo: '', obs: '' };
    render(<RetornoDisplay campo={campo} template={template} value={value} ctx={{}} />);
    expect(within(screen.getByTestId('retorno-sozinho')).getByText('R$ 10 mil')).toBeInTheDocument();
    expect(within(screen.getByTestId('retorno-comigo')).getByText('R$ 3,6 milhões')).toBeInTheDocument();
    expect(screen.getByTestId('retorno-sozinho')).toHaveAttribute('data-altura', '8');
    expect(screen.getByTestId('retorno-comigo')).toHaveAttribute('data-altura', '100');
    expect(screen.queryByTestId('retorno-prazo')).not.toBeInTheDocument();
  });

  it('leitura: texto sem número não vira conta, a barra fica no piso', () => {
    const value = { sozinho: 'R$ 12.000', comigo: 'o que ele decidir', prazo: '', obs: '' };
    render(<RetornoDisplay campo={campo} template={template} value={value} ctx={{}} />);
    expect(screen.getByTestId('retorno-sozinho')).toHaveAttribute('data-altura', '100');
    expect(screen.getByTestId('retorno-comigo')).toHaveAttribute('data-altura', '8');
  });

  it('leitura: sugestão em texto corrido não inventa número, as barras ficam em branco', () => {
    const value = daFixture('dois_numeros', '5.5');
    const { container } = render(<RetornoDisplay campo={campo} template={template} value={value} ctx={{}} />);
    expect(within(screen.getByTestId('retorno-sozinho')).getByText('em branco')).toBeInTheDocument();
    expect(within(screen.getByTestId('retorno-comigo')).getByText('em branco')).toBeInTheDocument();
    expect(screen.getByTestId('retorno-sozinho')).toHaveAttribute('data-altura', '0');
    expect(container.textContent).not.toContain('a definir');
  });

  it('edição: os rótulos do template viram as entradas e o prazo tem chips de um toque', () => {
    const onChange = vi.fn();
    render(<RetornoWidget campo={campo} template={template} value={cheio} onChange={onChange} ctx={{}} />);
    expect((screen.getByLabelText('Sozinho') as HTMLInputElement).value).toBe('10.000');
    expect((screen.getByLabelText('Com você') as HTMLInputElement).value).toBe('50.000');
    expect((screen.getByLabelText('Prazo') as HTMLInputElement).value).toBe('12 meses');
    expect(screen.getByRole('button', { name: '12 meses' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '90 dias' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.change(screen.getByLabelText('Com você'), { target: { value: '80.000' } });
    expect(onChange).toHaveBeenCalledWith({ ...cheio, comigo: '80.000' });

    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...cheio, prazo: '90 dias' });
  });
});

// ── 5.6 Retorno não financeiro: o radar dos 8 ganhos ─────────────────────────

describe('5.6 Radar: os oito retornos além do dinheiro', () => {
  const campo = daPaloma('5.6');
  const template = tpl('5.6');
  const EIXOS: string[] = template.chips;
  const value = daFixture('chips_texto', '5.6');

  it('a sugestão real acende tempo e rede', () => {
    expect(value.chips).toEqual(['tempo', 'rede']);
  });

  it('leitura: o radar é imagem com os eixos acesos no rótulo acessível', () => {
    const { container } = render(<RadarDisplay campo={campo} template={template} value={value} ctx={{}} />);
    const svg = screen.getByTestId('radar-svg');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-label', 'Radar: tempo, rede');
    expect(screen.getByTestId('radar-eixo-0')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('radar-eixo-1')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('radar-eixo-2')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('radar-eixo-0')).toHaveTextContent('tempo');
    expect(screen.getAllByTestId(/radar-eixo-/)).toHaveLength(EIXOS.length);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    semPalavraProibida(container, fx['5.6'].sugerido);
  });

  it('edição: só os chips carregam o estado; o SVG fica escondido do leitor de tela', () => {
    const onChange = vi.fn();
    render(<RadarWidget campo={campo} template={template} value={value} onChange={onChange} ctx={{}} />);
    expect(screen.getByTestId('radar-svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual(['tempo', 'rede']);
    expect(screen.getAllByRole('button')).toHaveLength(EIXOS.length);
    expect(screen.getByLabelText('Editar Retorno não financeiro')).toBeInTheDocument();
  });

  it('edição: marcar um eixo guarda na ordem do template, e o rótulo do radar também marca', () => {
    const onChange = vi.fn();
    render(<RadarWidget campo={campo} template={template} value={value} onChange={onChange} ctx={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'status' }));
    expect(onChange).toHaveBeenCalledWith({ ...value, chips: ['tempo', 'rede', 'status'] });

    fireEvent.click(screen.getByTestId('radar-eixo-2'));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, chips: ['tempo', 'rede', 'portas que abrem'] });

    fireEvent.click(screen.getByRole('button', { name: 'tempo' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, chips: ['rede'] });
  });

  it('edição: o texto livre entra no campo do widget', () => {
    const onChange = vi.fn();
    render(<RadarWidget campo={campo} template={template} value={{ chips: [], texto: '' }} onChange={onChange} ctx={{}} />);
    const area = screen.getByLabelText('Editar Retorno não financeiro');
    expect(area).toHaveAttribute('placeholder', 'Complete com as suas palavras');
    fireEvent.change(area, { target: { value: 'Dorme melhor.' } });
    expect(onChange).toHaveBeenCalledWith({ chips: [], texto: 'Dorme melhor.' });
  });
});

// ── 1.2 Meta e cadência: os três mostradores ─────────────────────────────────

describe('1.2 Mostrador: meta e cadência no painel', () => {
  const campo = daPaloma('1.2');
  const template = tpl('1.2');
  const cheio = { clientes: '10', ate: 'dezembro', reunioes: '3', obs: '' };

  it('leitura: três mostradores e a cadência lida dos números do mentor', () => {
    const { container } = render(<MostradorDisplay campo={campo} template={template} value={cheio} ctx={{}} />);
    expect(within(screen.getByTestId('mostrador-clientes')).getByText('10')).toBeInTheDocument();
    expect(within(screen.getByTestId('mostrador-clientes')).getByText('Clientes')).toBeInTheDocument();
    expect(within(screen.getByTestId('mostrador-ate')).getByText('dezembro')).toBeInTheDocument();
    expect(within(screen.getByTestId('mostrador-reunioes')).getByText('3')).toBeInTheDocument();
    expect(screen.getByTestId('mostrador-cadencia')).toHaveTextContent('Cadência: 3 reuniões por semana, cerca de 12 por mês');
    semPalavraProibida(container, fx['1.2'].sugerido);
  });

  it('leitura: uma reunião por semana fala no singular', () => {
    render(<MostradorDisplay campo={campo} template={template} value={{ ...cheio, reunioes: '1' }} ctx={{}} />);
    expect(screen.getByTestId('mostrador-cadencia')).toHaveTextContent('Cadência: 1 reunião por semana, cerca de 4 por mês');
  });

  it('leitura: a sugestão real só traz o prazo, o resto fica em branco e não há cadência', () => {
    const value = daFixture('meta', '1.2');
    render(<MostradorDisplay campo={campo} template={template} value={value} ctx={{}} />);
    expect(within(screen.getByTestId('mostrador-ate')).getByText('dezembro de 2026.')).toBeInTheDocument();
    expect(within(screen.getByTestId('mostrador-clientes')).getByText('em branco')).toBeInTheDocument();
    expect(within(screen.getByTestId('mostrador-reunioes')).getByText('em branco')).toBeInTheDocument();
    expect(screen.queryByTestId('mostrador-cadencia')).not.toBeInTheDocument();
  });

  it('leitura: a observação aparece embaixo dos mostradores', () => {
    const value = { clientes: '', ate: '', reunioes: '', obs: 'Quero dobrar a carteira este ano.' };
    render(<MostradorDisplay campo={campo} template={template} value={value} ctx={{}} />);
    expect(screen.getByText('Quero dobrar a carteira este ano.')).toBeInTheDocument();
    expect(screen.getAllByText('em branco')).toHaveLength(3);
  });

  it('edição: os três controles com os rótulos exatos e a cadência ao vivo', () => {
    const onChange = vi.fn();
    render(<MostradorWidget campo={campo} template={template} value={cheio} onChange={onChange} ctx={{}} />);
    expect((screen.getByLabelText('Quantos clientes') as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('Até quando') as HTMLInputElement).value).toBe('dezembro');
    expect((screen.getByLabelText('Reuniões por semana') as HTMLInputElement).value).toBe('3');
    expect(screen.getByTestId('mostrador-cadencia')).toHaveTextContent('cerca de 12 por mês');

    fireEvent.change(screen.getByLabelText('Até quando'), { target: { value: 'março de 2027' } });
    expect(onChange).toHaveBeenCalledWith({ ...cheio, ate: 'março de 2027' });

    fireEvent.click(screen.getByLabelText('Reuniões por semana: mais'));
    expect(onChange).toHaveBeenLastCalledWith({ ...cheio, reunioes: '4' });
  });
});

// ── 4.3 Pilar que resolve a dor: a linha da dor até o degrau ─────────────────

describe('4.3 DorPilar: da dor principal até o degrau que resolve', () => {
  const campo = daPaloma('4.3');
  const template = tpl('4.3');
  const PILARES = pilarNames(null, fx['4.2'].sugerido);
  const DOR = parseEstrutura('citacoes', fx['3.3'].sugerido, {}, {}).estrutura.citacoes[0] as string;
  const ctx: ParseContext = { pilares: PILARES, dor: DOR };
  const CORRENTE = PILARES.find((p) => /CORRENTE/.test(p))!;

  it('o contexto vem do 4.2 e do 3.3', () => {
    expect(PILARES.length).toBeGreaterThanOrEqual(3);
    expect(CORRENTE).toMatch(/CORRENTE/);
    expect(DOR).toMatch(/A empresa funciona, mas só funciona comigo/);
  });

  it('leitura: a dor em cima, os degraus embaixo e a linha só quando há escolha', () => {
    const value = { escolhido: CORRENTE, texto: '' };
    const { container } = render(<DorPilarDisplay campo={campo} template={template} value={value} ctx={ctx} />);
    expect(within(screen.getByTestId('dor-pilar-dor')).getByText(DOR)).toBeInTheDocument();
    expect(screen.getByText('A dor principal')).toBeInTheDocument();
    expect(screen.getByTestId('dor-pilar-linha')).toBeInTheDocument();
    const i = PILARES.indexOf(CORRENTE);
    expect(screen.getByTestId(`dor-pilar-degrau-${i}`)).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('dor-pilar-degrau-0')).toHaveAttribute('data-selected', 'false');
    expect(screen.getAllByTestId(/dor-pilar-degrau-/)).toHaveLength(PILARES.length);
    semPalavraProibida(container, fx['4.3'].sugerido);
  });

  it('leitura: sem escolha não há linha, e a sugestão em texto aparece em destaque', () => {
    const value = daFixture('escolha_de_lista', '4.3', ctx);
    render(<DorPilarDisplay campo={campo} template={template} value={value} ctx={ctx} />);
    expect(screen.queryByTestId('dor-pilar-linha')).not.toBeInTheDocument();
    expect(screen.getByText(/É a Corrente que ataca a dor central de frente/)).toBeInTheDocument();
    expect(screen.getByTestId('dor-pilar-degrau-0')).toHaveAttribute('data-selected', 'false');
  });

  it('leitura: escolha que não está no 4.2 entra como último degrau; nada preenchido fica em branco', () => {
    const a = render(<DorPilarDisplay campo={campo} template={template} value={{ escolhido: 'Sucessão viva', texto: '' }} ctx={ctx} />);
    expect(screen.getAllByTestId(/dor-pilar-degrau-/)).toHaveLength(PILARES.length + 1);
    expect(screen.getByTestId(`dor-pilar-degrau-${PILARES.length}`)).toHaveAttribute('data-selected', 'true');
    a.unmount();

    render(<DorPilarDisplay campo={campo} template={template} value={{ escolhido: '', texto: '' }} ctx={{ pilares: [], dor: '' }} />);
    expect(screen.getByText('em branco')).toBeInTheDocument();
    expect(screen.queryByTestId('dor-pilar-dor')).not.toBeInTheDocument();
  });

  it('edição: um rádio por degrau, o clique escolhe e o texto livre limpa a escolha', () => {
    const onChange = vi.fn();
    render(<DorPilarWidget campo={campo} template={template} value={{ escolhido: '', texto: '' }} onChange={onChange} ctx={ctx} />);
    const grupo = screen.getByRole('radiogroup', { name: 'Pilar que resolve a dor principal' });
    expect(within(grupo).getAllByRole('radio')).toHaveLength(PILARES.length);

    fireEvent.click(screen.getByRole('radio', { name: CORRENTE }));
    expect(onChange).toHaveBeenCalledWith({ escolhido: CORRENTE, texto: '' });

    const entrada = screen.getByLabelText('Editar Pilar que resolve a dor principal');
    expect(entrada).toHaveAttribute('placeholder', 'Ou escreva outro');
    fireEvent.change(entrada, { target: { value: 'Outro caminho' } });
    expect(onChange).toHaveBeenLastCalledWith({ escolhido: '', texto: 'Outro caminho' });
  });

  it('edição: sem pilares no 4.2, a dica manda preencher lá e o campo troca de convite', () => {
    render(<DorPilarWidget campo={campo} template={template} value={{ escolhido: '', texto: '' }} onChange={vi.fn()} ctx={{ pilares: [] }} />);
    expect(screen.getByText('Preencha os pilares no 4.2 para escolher da lista, ou escreva abaixo.')).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByLabelText('Editar Pilar que resolve a dor principal')).toHaveAttribute('placeholder', 'Qual pilar resolve a dor principal?');
  });
});
