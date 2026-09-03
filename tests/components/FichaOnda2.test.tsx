/**
 * Onda 2 e 3 da ficha por campo: as metáforas refinadas no lugar (escada com total anual, mesa de
 * condições em cartas, lista de bolso com "o que faço com a resposta", retrato do cliente com chips,
 * régua de dias, cenas do canal, citação assinada) e o contexto derivado (a dor do 3.3 no 4.3, as
 * objeções do 6.3 no 5.7), montados pelo FichaDisplay / FichaField com as sugestões reais da Paloma.
 */
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
  useReducedMotion: () => true,
}));

vi.mock('axios', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { items: [] } }), post: vi.fn(), delete: vi.fn() } }));

import { FichaDisplay } from '../../components/script/widgets/FichaDisplay';
import { FichaField } from '../../components/script/FichaField';
import { buildContext, parseEstrutura, renderEstrutura } from '../../components/script/widgets';
import { moedaNumero, periodicidade, totalAnual } from '../../components/script/widgets/numero';
import { previaDoCampo, previaDoScript, textoCapitulos } from '../../components/script/widgets/previa';
import { SCRIPT_BLOCKS, SCRIPT_FIELD_BY_KEY, type ScriptBlockView, type ScriptFieldView } from '../../data/script-ficha-fields';
import paloma from '../fixtures/paloma-sugeridos.json';

type Fixture = Record<string, { sugerido: string; fonte: string }>;
const fx = paloma as Fixture;

function campoDe(key: string, sugerido: string, extra: Partial<ScriptFieldView> = {}): ScriptFieldView {
  const def = SCRIPT_FIELD_BY_KEY[key];
  return {
    key, bloco: def.bloco, nome: def.nome, pergunta: def.pergunta, tipo: def.tipo, tipoRaw: def.tipoRaw, obrigatorio: def.obrigatorio,
    minutos: def.minutos, opcoes: def.opcoes ?? null, widget: def.widget, template: def.template,
    sugerido, classe: sugerido ? 'Fato' : 'VZ', fonte: sugerido ? 'teste' : '', alternativas: [],
    status: sugerido ? 'sugerido' : 'vazio', valor: '', estrutura: null, valor_efetivo: '', decidido: false,
    atualizado_por: null, atualizado_em: null, ...extra,
  };
}
const daPaloma = (key: string, extra: Partial<ScriptFieldView> = {}) => campoDe(key, fx[key].sugerido, { fonte: fx[key].fonte, ...extra });
const confirmado = (key: string, sugerido: string) => campoDe(key, sugerido, { status: 'confirmado', decidido: true, valor: sugerido, valor_efetivo: sugerido });

function abrirEditor(campo: ScriptFieldView, contexto?: Record<string, ScriptFieldView>) {
  const onDecide = vi.fn();
  const utils = render(<FichaField campo={campo} onDecide={onDecide} contexto={contexto} />);
  if (campo.status === 'sugerido') fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  const editor = screen.getByTestId(`editor-${campo.key}`);
  return { ...utils, onDecide, editor };
}

describe('números: periodicidade e total do primeiro ano', () => {
  it('lê o mês e o ano ditos no texto e nunca inventa a conta', () => {
    expect(periodicidade('R$ 14 mil/mês')).toBe('mes');
    expect(periodicidade('8.000 por mês')).toBe('mes');
    expect(periodicidade('120 mil por ano')).toBe('ano');
    expect(periodicidade('R$ 30.000')).toBeNull();
    expect(moedaNumero('14 mil/mês: degrau 3')).toBe(14000);
    expect(totalAnual('14', 'mil/mês: degrau 3, o topo.')).toBe(168000);
    expect(totalAnual('8.000', 'por mês')).toBe(96000);
    expect(totalAnual('120 mil', 'ao ano')).toBe(120000);
    expect(totalAnual('30.000', 'Premium', 'acompanhamento semanal')).toBeNull();
    expect(totalAnual('', 'por mês')).toBeNull();
  });
});

describe('3.8 lista de bolso com "o que faço com a resposta"', () => {
  it('estrutura: o uso vai e volta no valor ("1. item · para: uso") e uma linha só com uso é um item', () => {
    const e = parseEstrutura('lista_numerada', '1. Faturamento · para: dimensionar a proposta\n2. Equipe', {}, {}).estrutura;
    expect(e.itens).toEqual(['Faturamento', 'Equipe']);
    expect(e.usos).toEqual(['dimensionar a proposta', '']);
    expect(renderEstrutura('lista_numerada', e)).toBe('1. Faturamento · para: dimensionar a proposta\n2. Equipe');
    const um = parseEstrutura('lista_numerada', '1. Faturamento · para: dimensionar', {}, {}).estrutura;
    expect(um.itens).toEqual(['Faturamento']);
    expect(um.usos).toEqual(['dimensionar']);
    // a prévia lê só os itens
    const c = campoDe('3.8', '', { status: 'editado', decidido: true, valor: renderEstrutura('lista_numerada', e), estrutura: e });
    expect(previaDoCampo(c)?.texto).toBe('Para montar a sua proposta, preciso saber: Faturamento, Equipe.');
  });

  it('display: itens numerados com o uso em dourado; sugestão real da Paloma vira lista', () => {
    const valor = '1. Faturamento · para: dimensionar a proposta\n2. Equipe';
    const e = parseEstrutura('lista_numerada', valor, {}, {}).estrutura;
    render(<FichaDisplay campo={campoDe('3.8', '', { status: 'editado', decidido: true, valor, valor_efetivo: valor, estrutura: e })} modo="atual" />);
    const itens = screen.getAllByTestId('lista-item');
    expect(itens).toHaveLength(2);
    expect(within(itens[0]).getByTestId('lista-uso')).toHaveTextContent('o que faço com a resposta: dimensionar a proposta');
    expect(within(itens[1]).queryByTestId('lista-uso')).not.toBeInTheDocument();
  });

  it('edição: setas reordenam, o uso abre num toque e o valor salvo carrega os dois', () => {
    const { editor, onDecide } = abrirEditor(campoDe('3.8', '1. Faturamento\n2. Equipe\n3. Margem\n4. Conselho\n5. Sucessor'));
    expect(within(editor).getAllByRole('textbox')).toHaveLength(5);
    fireEvent.click(within(editor).getByRole('button', { name: 'Descer item 1' }));
    expect((within(editor).getByLabelText('As 5 a 7 informações da proposta: item 1') as HTMLInputElement).value).toBe('Equipe');
    fireEvent.click(within(editor).getAllByRole('button', { name: '+ o que faço com a resposta' })[0]);
    fireEvent.change(within(editor).getByLabelText('As 5 a 7 informações da proposta: o que faço com a resposta 1'), { target: { value: 'saber quem executa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const d = onDecide.mock.calls[0][1];
    expect(d.valor.split('\n')[0]).toBe('1. Equipe · para: saber quem executa');
    expect(d.estrutura.itens[1]).toBe('Faturamento');
  });
});

describe('5.4 mesa de negociação em cartas', () => {
  it('display: cinco cartas, as marcadas em dourado com o valor', () => {
    render(<FichaDisplay campo={campoDe('5.4', 'Parcelado: 12x\nContrato: 6 meses\nGarantia: 30 dias')} />);
    expect(screen.getByTestId('mesa-condicoes')).toBeInTheDocument();
    expect(screen.getByTestId('condicao-parcelado')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('condicao-parcelado')).toHaveTextContent('12x');
    expect(screen.getByTestId('condicao-contrato')).toHaveTextContent('6 meses');
    expect(screen.getByTestId('condicao-avista')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('condicao-garantia')).toHaveTextContent('30 dias');
  });

  it('edição: tocar a carta marca e o detalhe entra nela', () => {
    const { editor, onDecide } = abrirEditor(campoDe('5.4', 'Parcelado: 12x'));
    expect(within(editor).getByTestId('condicao-editor-parcelado')).toHaveAttribute('data-selected', 'true');
    fireEvent.click(within(editor).getByLabelText('À vista'));
    fireEvent.change(within(editor).getByLabelText('À vista: detalhe'), { target: { value: '10% de desconto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide.mock.calls[0][1].valor).toBe('À vista: 10% de desconto\nParcelado: 12x');
  });
});

describe('3.1 retrato do cliente em 4 cortes', () => {
  it('display: quatro células, as vazias em branco (nunca "a definir")', () => {
    render(<FichaDisplay campo={campoDe('3.1', 'Setor: indústria familiar\nPapel: sucessor\nTerritório: norte do Paraná')} />);
    expect(screen.getByTestId('retrato-icp')).toBeInTheDocument();
    expect(screen.getByTestId('retrato-setor')).toHaveTextContent('indústria familiar');
    expect(screen.getByTestId('retrato-tamanho')).toHaveAttribute('data-preenchido', 'false');
    expect(screen.getByTestId('retrato-tamanho')).toHaveTextContent('em branco');
    expect(screen.getByTestId('retrato-icp').textContent).not.toContain('a definir');
  });

  it('edição: os chips de cada corte preenchem a célula num toque e escrever continua valendo', () => {
    const { editor, onDecide } = abrirEditor(campoDe('3.1', 'Setor: indústria familiar\nPapel: sucessor'));
    fireEvent.click(within(editor).getByRole('button', { name: '50 a 500 milhões/ano' }));
    expect((within(editor).getByLabelText('Tamanho ou bolso') as HTMLInputElement).value).toBe('50 a 500 milhões/ano');
    fireEvent.change(within(editor).getByLabelText('Território'), { target: { value: 'Londrina e região' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide.mock.calls[0][1].valor).toBe('Setor: indústria familiar\nPapel: sucessor\nTamanho ou bolso: 50 a 500 milhões/ano\nTerritório: Londrina e região');
  });
});

describe('6.7 régua de dias e 6.1 cenas do canal', () => {
  it('6.7: as conversas num mostrador e os dias numa régua com o ponteiro no valor', () => {
    render(<FichaDisplay campo={campoDe('6.7', '3 conversas em 21 dias')} />);
    expect(screen.getByText('Conversas').parentElement?.textContent).toContain('3');
    expect(screen.getByTestId('regua-dias')).toHaveAttribute('data-valor', '21');
    expect(screen.getByTestId('regua-dias')).toHaveAttribute('aria-label', 'Dias: 21');
  });

  it('6.1: cada canal é uma carta com a cena em glifo, a marcada em dourado', () => {
    render(<FichaDisplay campo={daPaloma('6.1')} />);
    const video = screen.getByText('Vídeo').closest('[data-selected]') as HTMLElement;
    expect(video).toHaveAttribute('data-selected', 'true');
    expect(video.querySelector('svg')).not.toBeNull();
    expect((screen.getByText('Presencial').closest('[data-selected]') as HTMLElement).querySelector('svg')).not.toBeNull();
  });
});

describe('2.4 propósito como citação assinada', () => {
  it('display: cartão com aspas e assinatura; a prévia fala em primeira pessoa', () => {
    render(<FichaDisplay campo={campoDe('2.4', 'Eu faço isso porque nenhuma empresa familiar deveria morrer na passagem de bastão.')} />);
    const carta = screen.getByTestId('citacao-assinada');
    expect(carta).toHaveTextContent('nenhuma empresa familiar deveria morrer');
    expect(carta).toHaveTextContent('na sua voz');
    expect(previaDoCampo(campoDe('2.4', 'Eu faço isso porque nenhuma empresa familiar deveria morrer na passagem de bastão.'))?.texto)
      .toBe('Eu faço isso porque nenhuma empresa familiar deveria morrer na passagem de bastão.');
  });
});

describe('3.3 e 3.4: cartões de citação com a voz do cliente', () => {
  it('display: um cartão por frase, cada um assinado "nas palavras dele"', () => {
    render(<FichaDisplay campo={daPaloma('3.3')} />);
    const cartas = screen.getAllByTestId('citacao-lida');
    expect(cartas).toHaveLength(5);
    cartas.forEach((c) => expect(c).toHaveTextContent('nas palavras dele'));
    expect(cartas[0]).toHaveTextContent('A empresa funciona, mas só funciona comigo');
  });
});

describe('contexto derivado: a dor do 3.3 no 4.3 e as objeções do 6.3 no 5.7', () => {
  it('buildContext traz a dor principal e as objeções (linhas + clássicas), sem repetição', () => {
    const contexto = { '3.3': daPaloma('3.3'), '4.2': daPaloma('4.2'), '6.3': daPaloma('6.3') };
    const ctx43 = buildContext(campoDe('4.3', ''), contexto);
    expect(ctx43.dor).toBe('A empresa funciona, mas só funciona comigo: se eu sair, trava.');
    expect(ctx43.pilares.length).toBeGreaterThanOrEqual(5);
    const ctx57 = buildContext(campoDe('5.7', ''), contexto);
    expect(ctx57.objecoes![0]).toMatch(/O meu caso é específico/);
    expect(ctx57.objecoes).toContain('Está caro');
    expect(new Set(ctx57.objecoes!.map((o) => o.toLowerCase())).size).toBe(ctx57.objecoes!.length);
  });

  it('4.3: a linha dor → pilar aparece com a dor do 3.3 e o pilar sugerido aceso', () => {
    const contexto = { '3.3': daPaloma('3.3'), '4.2': daPaloma('4.2') };
    render(<FichaDisplay campo={daPaloma('4.3')} contexto={contexto} />);
    expect(screen.getByTestId('dor-pilar-dor')).toHaveTextContent('só funciona comigo');
    const degraus = screen.getAllByTestId(/^dor-pilar-degrau-/);
    expect(degraus.length).toBeGreaterThanOrEqual(5);
    // a sugestão "CORRENTE. É a Corrente que ataca..." não casa com um nome de pilar: vai como texto
    expect(screen.getByText(/É a Corrente que ataca a dor central/)).toBeInTheDocument();
  });

  it('5.7: cada bônus é uma chave e a objeção escolhida, a fechadura; edição oferece as objeções do 6.3', () => {
    const contexto = { '6.3': daPaloma('6.3') };
    render(<FichaDisplay campo={daPaloma('5.7')} contexto={contexto} />);
    expect(screen.getAllByTestId(/^chave-\d+$/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/Mesa do Fundador/)).toBeInTheDocument();
  });

  it('5.7 edição: a fechadura lista as objeções do 6.3 como chips e o toque escolhe', () => {
    const contexto = { '6.3': daPaloma('6.3') };
    const { editor, onDecide } = abrirEditor(campoDe('5.7', 'Sessão 1:1 com o sucessor'), contexto);
    fireEvent.click(within(editor).getByRole('radio', { name: 'Está caro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onDecide.mock.calls[0][1].valor).toBe('Sessão 1:1 com o sucessor · Está caro');
  });
});

describe('a prévia inteira (capítulos revelados × trancados)', () => {
  const blocoDe = (numero: number, campos: ScriptFieldView[], fechado = false): ScriptBlockView => {
    const def = SCRIPT_BLOCKS.find((b) => b.numero === numero)!;
    return { numero, nome: def.nome, descricao: def.descricao, total: campos.length, decididos: fechado ? campos.length : 0, obrigatorios: campos.length, obrigatorios_decididos: fechado ? campos.length : 0, minutos: 5, minutos_pendentes: 0, fechado, campos };
  };

  it('previaDoScript: a meta no alto, o capítulo do bloco fechado com as frases, os outros trancados', () => {
    const c11 = confirmado('1.1', 'Elos Club');
    const c21 = confirmado('2.1', 'Sou a Paloma e ajudo herdeiros a virar sucessores.');
    const c23 = confirmado('2.3', 'O mercado faz: holding.\nEu faço: preparo a pessoa.');
    const blocos = [blocoDe(1, [c11], true), blocoDe(2, [c21, c23], true), blocoDe(3, [campoDe('3.3', fx['3.3'].sugerido)])];
    const contexto = { '1.1': c11, '2.1': c21, '2.3': c23 };
    const p = previaDoScript(blocos, contexto);
    expect(p.meta[0].previa.texto).toBe('Hoje vou te apresentar Elos Club.');
    expect(p.revelados).toBe(1);
    expect(p.total).toBe(7);
    const passo1 = p.capitulos.find((c) => c.n === 1)!;
    expect(passo1.revelado).toBe(true);
    expect(passo1.linhas.map((l) => l.key)).toEqual(['2.1', '2.3']);
    expect(passo1.linhas[1].previa.texto).toBe('Enquanto o mercado holding, eu preparo a pessoa.');
    expect(p.capitulos.find((c) => c.n === 2)!.revelado).toBe(false);
    expect(p.capitulos.find((c) => c.n === 2)!.linhas).toEqual([]);
    expect(textoCapitulos(0)).toBe('nenhum capítulo aberto ainda');
    expect(textoCapitulos(1)).toBe('1 de 7 capítulos aberto');
    expect(textoCapitulos(3)).toBe('3 de 7 capítulos abertos');
    expect(textoCapitulos(7)).toBe('os 7 capítulos abertos');
  });
});

describe('higiene das metáforas', () => {
  it('nenhum campo da Paloma mostra travessão, "a definir" ou emoji no visual, nem "diagnóstico" fora da fonte', () => {
    const contexto = Object.fromEntries(Object.keys(fx).filter((k) => fx[k].sugerido).map((k) => [k, daPaloma(k)]));
    for (const key of Object.keys(fx)) {
      const { container, unmount } = render(<FichaField campo={daPaloma(key)} onDecide={vi.fn()} contexto={contexto} />);
      const t = container.textContent || '';
      expect(t).not.toContain('—');
      expect(t).not.toContain('a definir');
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
      if (!fx[key].sugerido.toLowerCase().includes('diagnóstico')) expect(t.toLowerCase()).not.toContain('diagnóstico');
      unmount();
    }
  }, 30000);
});
