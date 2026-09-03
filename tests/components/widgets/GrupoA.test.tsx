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

import { PrateleiraDisplay, PrateleiraWidget } from '../../../components/script/widgets/Prateleira';
import { ChaveFechaduraDisplay, ChaveFechaduraWidget } from '../../../components/script/widgets/ChaveFechadura';
import { DoisCaminhosDisplay, DoisCaminhosWidget } from '../../../components/script/widgets/DoisCaminhos';
import { CapaLivroDisplay, CapaLivroWidget } from '../../../components/script/widgets/CapaLivro';
import { parseEstrutura, type Estrutura, type WidgetTemplate, type WidgetType } from '../../../components/script/widgets/estrutura';
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
const templateDe = (key: string): WidgetTemplate => (SCRIPT_FIELD_BY_KEY[key].template || {}) as WidgetTemplate;
/** A estrutura que o parse da sugestao real produz para o campo. */
const estruturaDe = (key: string, base: WidgetType, ctx: any = {}): Estrutura =>
  parseEstrutura(base, fx[key].sugerido, templateDe(key), ctx).estrutura;

/** Nenhum texto de interface usa travessao nem a palavra proibida. */
function semProibidos(container: HTMLElement, sugerido: string) {
  expect(container.textContent).not.toContain('—');
  if (!sugerido.toLowerCase().includes('diagnóstico')) {
    expect(container.textContent!.toLowerCase()).not.toContain('diagnóstico');
  }
}

// ── 3.7 Prateleira ───────────────────────────────────────────────────────────

describe('3.7 Prateleira: as soluções que ele já tentou, com etiqueta de preço', () => {
  const campo = daPaloma('3.7');
  const template = templateDe('3.7');
  const value = estruturaDe('3.7', 'tabela');

  it('modo leitura: uma carta por solução e a etiqueta "em branco" quando ninguém sabe o custo', () => {
    const { container } = render(<PrateleiraDisplay campo={campo} template={template} value={value} ctx={{}} />);
    const cartas = screen.getAllByTestId('prateleira-carta');
    expect(cartas).toHaveLength(4);
    expect(within(cartas[0]).getByText(/o advogado que fez a holding/)).toBeInTheDocument();
    expect(within(cartas[1]).getByText(/Holding e documentos/)).toBeInTheDocument();
    expect(screen.getAllByText('em branco')).toHaveLength(4);
    expect(container.textContent).not.toContain('a definir');
    semProibidos(container, fx['3.7'].sugerido);
  });

  it('modo leitura: sem linhas, mostra "em branco" e nenhuma carta', () => {
    render(<PrateleiraDisplay campo={campo} template={template} value={{ linhas: [] }} ctx={{}} />);
    expect(screen.getByText('em branco')).toBeInTheDocument();
    expect(screen.queryByTestId('prateleira-carta')).not.toBeInTheDocument();
  });

  it('modo edição: os dois campos por carta, digitar o custo devolve a estrutura inteira', () => {
    const onChange = vi.fn();
    const { container } = render(<PrateleiraWidget campo={campo} template={template} value={value} onChange={onChange} ctx={{}} />);
    expect(screen.getByTestId('prateleira-editor-carta-0')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^prateleira-editor-carta-/)).toHaveLength(4);
    expect(screen.getByLabelText('Soluções que ele já tentou: linha 1, O que ele já tentou')).toBeInTheDocument();
    expect(screen.getByLabelText('Soluções que ele já tentou: linha 4, Quanto custa (se souber)')).toBeInTheDocument();
    expect(screen.getByLabelText('Remover linha 2')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Soluções que ele já tentou: linha 1, Quanto custa (se souber)'), { target: { value: '30.000' } });
    expect(onChange).toHaveBeenCalledWith({
      linhas: value.linhas.map((r: any, i: number) => (i === 0 ? { ...r, custo: '30.000' } : { ...r })),
    });
    semProibidos(container, fx['3.7'].sugerido);
  });

  it('modo edição: o chip da alternativa clássica põe uma solução nova na prateleira', () => {
    const onChange = vi.fn();
    const comChips = { ...template, chips: ['um concorrente', 'um consultor', 'sozinho, por conta própria', 'esperar'] };
    render(<PrateleiraWidget campo={campo} template={comChips} value={value} onChange={onChange} ctx={{}} />);
    expect(screen.getByText('Toque para pôr na prateleira')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'esperar' }));
    expect(onChange).toHaveBeenLastCalledWith({
      linhas: [...value.linhas, { tentou: 'esperar', custo: '' }],
    });
  });

  it('modo edição: sem linhas, começa com uma carta vazia e o botão de remover desligado', () => {
    render(<PrateleiraWidget campo={campo} template={template} value={{ linhas: [] }} onChange={vi.fn()} ctx={{}} />);
    expect(screen.getAllByTestId(/^prateleira-editor-carta-/)).toHaveLength(1);
    expect(screen.getByLabelText('Remover linha 1')).toBeDisabled();
  });
});

// ── 5.7 Chave e fechadura ────────────────────────────────────────────────────

describe('5.7 Chave e fechadura: o bônus que abre a objeção', () => {
  const campo = daPaloma('5.7');
  const template = templateDe('5.7');
  const value = estruturaDe('5.7', 'tabela');
  /** As objeções do 6.3 como o contexto entrega: a fala do cliente, antes do "Acolhe:". */
  const objecoes = parseEstrutura('tabela', fx['6.3'].sugerido, templateDe('6.3'), {}).estrutura.linhas
    .map((r: any) => String(r.objecao || '').split('Acolhe:')[0].trim())
    .filter(Boolean)
    .slice(0, 2);

  it('modo leitura: chave, elo e fechadura por linha; objeção vazia fica "em branco"', () => {
    const { container } = render(<ChaveFechaduraDisplay campo={campo} template={template} value={value} ctx={{}} />);
    expect(container.querySelectorAll('[data-testid^="chave-"]')).toHaveLength(6);
    expect(within(screen.getByTestId('chave-1')).getByText(/Mesa do Fundador/)).toBeInTheDocument();
    expect(within(screen.getByTestId('chave-1')).getByText('em branco')).toBeInTheDocument();
    expect(within(screen.getByTestId('chave-5')).getByText(/podem tornar a oferta única/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('a definir');
    semProibidos(container, fx['5.7'].sugerido);
  });

  it('modo leitura: sem linhas, mostra "em branco"', () => {
    render(<ChaveFechaduraDisplay campo={campo} template={template} value={{ linhas: [] }} ctx={{}} />);
    expect(screen.getByText('em branco')).toBeInTheDocument();
    expect(screen.queryByTestId('chave-0')).not.toBeInTheDocument();
  });

  it('modo edição: o bônus, os chips das objeções já listadas e o campo livre', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChaveFechaduraWidget campo={campo} template={template} value={value} onChange={onChange} ctx={{ objecoes }} />
    );
    expect(screen.getByTestId('chave-editor-0')).toBeInTheDocument();
    expect(screen.getByLabelText('Bônus e objeção que mata: linha 1, Bônus')).toBeInTheDocument();
    expect(screen.getByLabelText('Bônus e objeção que mata: linha 1, Objeção que mata')).toBeInTheDocument();
    expect(screen.getAllByText('Que objeção esse bônus derruba')).toHaveLength(6);
    expect(screen.getAllByPlaceholderText('Ou escreva a objeção')).toHaveLength(6);
    expect(screen.getByLabelText('Remover linha 3')).toBeInTheDocument();

    // o primeiro chip da primeira linha guarda a objeção inteira, não o texto encurtado
    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect(onChange).toHaveBeenCalledWith({
      linhas: value.linhas.map((r: any, i: number) => (i === 0 ? { ...r, objecao: objecoes[0] } : { ...r })),
    });
    semProibidos(container, fx['5.7'].sugerido);
  });

  it('modo edição: escrever a objeção à mão devolve a estrutura inteira', () => {
    const onChange = vi.fn();
    render(<ChaveFechaduraWidget campo={campo} template={template} value={value} onChange={onChange} ctx={{}} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Bônus e objeção que mata: linha 2, Objeção que mata'), { target: { value: 'E se eu travar sozinho?' } });
    expect(onChange).toHaveBeenCalledWith({
      linhas: value.linhas.map((r: any, i: number) => (i === 1 ? { ...r, objecao: 'E se eu travar sozinho?' } : { ...r })),
    });
  });
});

// ── 6.5 Dois caminhos ────────────────────────────────────────────────────────

describe('6.5 Dois caminhos: depois do sim e depois do "vou pensar"', () => {
  const campo = daPaloma('6.5');
  const template = templateDe('6.5');
  const value = estruturaDe('6.5', 'dois_textos');

  it('modo leitura: o sim em passos numerados e o "vou pensar" no cartão do calendário', () => {
    const { container } = render(<DoisCaminhosDisplay campo={campo} template={template} value={value} ctx={{}} />);
    expect(screen.getByTestId('caminho-sim')).toBeInTheDocument();
    expect(screen.getByTestId('caminho-pensar')).toBeInTheDocument();
    const passos = screen.getAllByTestId('caminho-sim-passo');
    expect(passos).toHaveLength(1);
    expect(within(passos[0]).getByText(/E depois disso trabalha/)).toBeInTheDocument();
    expect(within(passos[0]).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Depois do sim')).toBeInTheDocument();
    expect(screen.getByText("Depois do 'vou pensar'")).toBeInTheDocument();
    expect(within(screen.getByTestId('caminho-pensar')).getByText(/Em novembro eu quero lançar/)).toBeInTheDocument();
    semProibidos(container, fx['6.5'].sugerido);
  });

  it('modo leitura: os dois lados vazios mostram "em branco"', () => {
    render(<DoisCaminhosDisplay campo={campo} template={template} value={{ sim: '', pensar: '' }} ctx={{}} />);
    expect(screen.getAllByText('em branco')).toHaveLength(2);
    expect(screen.queryByTestId('caminho-sim-passo')).not.toBeInTheDocument();
  });

  it('modo edição: editar o passo 1 devolve o texto do sim inteiro', () => {
    const onChange = vi.fn();
    const { container } = render(<DoisCaminhosWidget campo={campo} template={template} value={value} onChange={onChange} ctx={{}} />);
    expect(screen.getByLabelText('Depois do sim: passo 1')).toHaveValue(value.sim);
    expect(screen.getByLabelText("Depois do 'vou pensar'")).toHaveValue(value.pensar);
    expect(screen.getByLabelText('Subir passo 1')).toBeDisabled();
    expect(screen.getByLabelText('Remover passo 1')).toBeDisabled();
    expect(screen.getByLabelText('Descer passo 1')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Depois do sim: passo 1'), { target: { value: 'contrato assinado' } });
    expect(onChange).toHaveBeenCalledWith({ ...value, sim: 'contrato assinado' });
    semProibidos(container, fx['6.5'].sugerido);
  });

  it('modo edição: o chip do passo clássico entra como passo novo', () => {
    const onChange = vi.fn();
    render(<DoisCaminhosWidget campo={campo} template={template} value={value} onChange={onChange} ctx={{}} />);
    expect(screen.getByText('Toque para adicionar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'pagamento' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, sim: `${value.sim}\npagamento` });
  });

  it('modo edição: "+ Passo" abre um passo em branco e o reordenar aparece com dois', () => {
    const onChange = vi.fn();
    render(<DoisCaminhosWidget campo={campo} template={template} value={value} onChange={onChange} ctx={{}} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Passo' }));
    expect(screen.getByLabelText('Depois do sim: passo 2')).toBeInTheDocument();
    // passo em branco no fim nao entra no texto salvo
    expect(onChange).toHaveBeenLastCalledWith({ ...value, sim: value.sim });

    fireEvent.change(screen.getByLabelText('Depois do sim: passo 2'), { target: { value: 'contrato' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, sim: `${value.sim}\ncontrato` });

    fireEvent.click(screen.getByLabelText('Subir passo 2'));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, sim: `contrato\n${value.sim}` });
    expect(screen.getByLabelText('Depois do sim: passo 1')).toHaveValue('contrato');
    expect(screen.getByLabelText('Depois do sim: passo 2')).toHaveValue(value.sim);
  });

  it('modo edição: o "vou pensar" é uma área de texto com o convite de data e hora', () => {
    const onChange = vi.fn();
    render(<DoisCaminhosWidget campo={campo} template={template} value={{ sim: '', pensar: '' }} onChange={onChange} ctx={{}} />);
    const area = screen.getByLabelText("Depois do 'vou pensar'");
    expect(area).toHaveAttribute('placeholder', 'data e hora do retorno');
    fireEvent.change(area, { target: { value: 'ligo quinta às 10h' } });
    expect(onChange).toHaveBeenCalledWith({ sim: '', pensar: 'ligo quinta às 10h' });
  });
});

// ── 4.1 Capa do livro ────────────────────────────────────────────────────────

describe('4.1 Capa do livro: o nome do método e o fio condutor', () => {
  const campo = daPaloma('4.1');
  const template = templateDe('4.1');
  // o parse do dois_campos parte a sugestao em prosa: nome = 1a linha, fio = o resto
  const value = estruturaDe('4.1', 'dois_campos');

  it('modo leitura: a capa com o selo, o nome e o fio condutor', () => {
    const { container } = render(<CapaLivroDisplay campo={campo} template={template} value={value} ctx={{}} />);
    const capa = screen.getByTestId('capa-livro');
    expect(within(capa).getByText('Método')).toBeInTheDocument();
    expect(within(capa).getByText(/o Método Elos, do Raio-X à Corrente/)).toBeInTheDocument();
    expect(within(capa).getByText(/é o seu fio condutor/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('a definir');
    semProibidos(container, fx['4.1'].sugerido);
  });

  it('modo leitura: sem nome mostra "em branco" e sem fio não inventa linha', () => {
    render(<CapaLivroDisplay campo={campo} template={template} value={{ nome: '', fio: '' }} ctx={{}} />);
    const capa = screen.getByTestId('capa-livro');
    expect(within(capa).getByText('em branco')).toBeInTheDocument();
    expect(capa.textContent).toBe('Métodoem branco');
  });

  it('modo edição: os dois campos com os rótulos exatos e o onChange com a estrutura inteira', () => {
    const onChange = vi.fn();
    const { container } = render(<CapaLivroWidget campo={campo} template={template} value={value} onChange={onChange} ctx={{}} />);
    expect(screen.getByLabelText('Nome do método')).toHaveValue(value.nome);
    expect(screen.getByLabelText('De A para B em 1 frase')).toHaveValue(value.fio);

    fireEvent.change(screen.getByLabelText('Nome do método'), { target: { value: 'Método Elos' } });
    expect(onChange).toHaveBeenCalledWith({ ...value, nome: 'Método Elos' });

    fireEvent.change(screen.getByLabelText('De A para B em 1 frase'), { target: { value: 'do raio-x à corrente' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, fio: 'do raio-x à corrente' });
    semProibidos(container, fx['4.1'].sugerido);
  });

  it('modo edição: campos vazios usam os convites do template', () => {
    render(<CapaLivroWidget campo={campo} template={template} value={{ nome: '', fio: '' }} onChange={vi.fn()} ctx={{}} />);
    expect(screen.getByLabelText('Nome do método')).toHaveAttribute('placeholder', 'Ex.: Método Clínica Livre');
    expect(screen.getByLabelText('De A para B em 1 frase')).toHaveAttribute('placeholder', 'leva o dono do balcão para a cadeira de gestor');
  });
});
