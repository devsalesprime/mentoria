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

import { FichaDisplay } from '../../components/script/widgets/FichaDisplay';
import { COPY_VAZIO, FichaField } from '../../components/script/FichaField';
import { SCRIPT_FIELD_BY_KEY, type ScriptFieldView } from '../../data/script-ficha-fields';
import paloma from '../fixtures/paloma-sugeridos.json';

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

/** Campo com a sugestao real do prefill da Paloma. */
const daPaloma = (key: string, extra: Partial<ScriptFieldView> = {}) => campoDe(key, fx[key].sugerido, { fonte: fx[key].fonte, ...extra });
const linhas = (key: string) => fx[key].sugerido.split('\n').map((l) => l.trim()).filter(Boolean);

describe('FichaDisplay: sugestão no visual do widget (prefill real da Paloma)', () => {
  it('2.2 historia_podio: a história em texto e o pódio ouro / prata / bronze', () => {
    render(<FichaDisplay campo={daPaloma('2.2')} />);
    expect(screen.getByTestId('display-2.2')).toBeInTheDocument();
    expect(screen.getByText(/Cinco movimentos fabricaram a sua autoridade/)).toBeInTheDocument();
    const [ouro, prata, bronze] = linhas('2.2').slice(-3);
    expect(within(screen.getByTestId('podio-ouro')).getByText('Ouro')).toBeInTheDocument();
    expect(screen.getByTestId('podio-ouro').textContent).toContain(ouro.slice(0, 30));
    expect(screen.getByTestId('podio-prata').textContent).toContain(prata.slice(0, 30));
    expect(screen.getByTestId('podio-bronze').textContent).toContain(bronze.slice(0, 30));
  });

  it('2.3 balança: o VS no pivô, um par por linha com o mercado à esquerda e "Eu faço" à direita, inclinada para o seu lado', () => {
    render(<FichaDisplay campo={daPaloma('2.3')} />);
    expect(screen.getByText('VS')).toBeInTheDocument();
    expect(screen.getAllByText('O mercado faz').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Eu faço').length).toBeGreaterThan(0);
    expect(screen.getByText(/O mercado de mentoria de gestão está saturado/)).toBeInTheDocument();
    expect(screen.getByText(/Sucessão vivida dos dois lados/)).toBeInTheDocument();
    const pares = screen.getAllByTestId(/^balanca-par-/);
    expect(pares.length).toBeGreaterThanOrEqual(2);
    expect(Number(screen.getByTestId('balanca').getAttribute('data-inclina'))).toBeGreaterThan(0);
  });

  it('3.7 prateleira: um cartão por solução já tentada, etiqueta de preço em branco (nunca "a definir")', () => {
    render(<FichaDisplay campo={daPaloma('3.7')} />);
    const cartas = screen.getAllByTestId('prateleira-carta');
    expect(cartas).toHaveLength(linhas('3.7').length);
    expect(within(cartas[1]).getByText(/Holding e documentos/)).toBeInTheDocument();
    expect(within(cartas[1]).getByText('em branco')).toBeInTheDocument();
    expect(cartas[1].textContent).not.toContain('a definir');
    expect(screen.queryByTestId('tabela-linha')).not.toBeInTheDocument();
  });

  it('5.3 escada: três degraus com o valor em R$, o total do primeiro ano (só quando o valor diz o mês) e a observação embaixo', () => {
    render(<FichaDisplay campo={daPaloma('5.3')} />);
    expect(screen.getByText('Mais alta')).toBeInTheDocument();
    expect(screen.getByText('Intermediária')).toBeInTheDocument();
    expect(screen.getByText('Entrada')).toBeInTheDocument();
    expect(screen.getByTestId('escada-alta-valor')).toHaveTextContent('R$ 14');
    expect(screen.getByTestId('escada-media-valor')).toHaveTextContent('R$ 12');
    expect(screen.getByTestId('escada-entrada-valor')).toHaveTextContent('R$ 10');
    // "R$14 mil/mês" × 12 = R$ 168 mil no ano (aritmética sobre o número dela, nada inventado)
    expect(screen.getByTestId('escada-alta-ano')).toHaveAttribute('data-total', '168000');
    expect(screen.getByTestId('escada-alta-ano')).toHaveTextContent('no ano');
    expect(screen.getByTestId('escada-entrada-ano')).toHaveAttribute('data-total', '120000');
    expect(screen.getByText(/A entrada soma cerca de R\$20 mil/)).toBeInTheDocument();
  });

  it('5.3 escada: sem periodicidade no valor não há total anual', () => {
    render(<FichaDisplay campo={campoDe('5.3', 'Mais alta: Premium · R$ 30.000\nEntrada: Básica · R$ 5.000')} />);
    expect(screen.getByTestId('escada-alta-valor')).toHaveTextContent('R$ 30.000');
    expect(screen.queryByTestId('escada-alta-ano')).not.toBeInTheDocument();
    expect(screen.queryByText('no ano')).not.toBeInTheDocument();
  });

  it('6.3 baralho: cada objeção numa carta, resposta em branco (nunca "a definir")', () => {
    render(<FichaDisplay campo={daPaloma('6.3')} />);
    const rows = screen.getAllByTestId('carta-objecao');
    expect(rows).toHaveLength(linhas('6.3').length);
    expect(within(rows[0]).getByText(/O meu caso é específico/)).toBeInTheDocument();
    expect(within(rows[0]).getByText('em branco')).toBeInTheDocument();
    expect(rows[0].textContent).not.toContain('a definir');
  });

  it('6.6 casos: sem sugestão no prefill, o cartão abre o editor de casos com o convite', () => {
    expect(fx['6.6'].sugerido).toBe('');
    render(<FichaField campo={daPaloma('6.6')} onDecide={vi.fn()} />);
    expect(screen.getByText(COPY_VAZIO)).toBeInTheDocument();
    expect(screen.getByLabelText('Casos reais (prova social): nome ou perfil do caso 1')).toBeInTheDocument();
    expect(screen.queryByTestId('display-6.6')).not.toBeInTheDocument();
  });

  it('6.6 casos: valor editado mostra cartões com antes / depois e a marca "pode citar"', () => {
    const estrutura = { casos: [{ nome: 'João, clínica em Curitiba', antes: '100 mil/mês', depois: '300 mil/mês', citar: 'sim' }] };
    const valor = 'Nome: João, clínica em Curitiba\nAntes: 100 mil/mês\nDepois: 300 mil/mês\nPode citar: sim';
    render(<FichaDisplay campo={daPaloma('6.6', { status: 'editado', decidido: true, valor, valor_efetivo: valor, estrutura })} modo="atual" />);
    const caso = screen.getByTestId('caso');
    expect(within(caso).getByText('João, clínica em Curitiba')).toBeInTheDocument();
    expect(within(caso).getByText('100 mil/mês')).toBeInTheDocument();
    expect(within(caso).getByText('300 mil/mês')).toBeInTheDocument();
    expect(within(caso).getByText('pode citar')).toBeInTheDocument();
  });

  it('3.3 citacoes: um cartão de citação por frase do cliente', () => {
    const { container } = render(<FichaDisplay campo={daPaloma('3.3')} />);
    expect(container.querySelectorAll('blockquote')).toHaveLength(linhas('3.3').length);
    expect(screen.getByText(/A empresa funciona, mas só funciona comigo/)).toBeInTheDocument();
  });

  it('4.2 pilares: linha do tempo numerada com o nome e o que cada etapa resolve', () => {
    render(<FichaDisplay campo={daPaloma('4.2')} />);
    const pilares = screen.getAllByTestId('pilar');
    expect(pilares).toHaveLength(linhas('4.2').length);
    expect(within(pilares[0]).getByText(/RAIO-X/)).toBeInTheDocument();
    expect(within(pilares[0]).getByText('1')).toBeInTheDocument();
  });

  it('6.1 canal: o cartão Vídeo marcado e o número de reuniões', () => {
    render(<FichaDisplay campo={daPaloma('6.1')} />);
    expect(screen.getByText('Vídeo').closest('[data-selected]')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByText('Presencial').closest('[data-selected]')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByText('Reuniões').parentElement?.textContent).toContain('1');
  });

  it('3.1 icp: texto corrido que não estrutura cai no bloco de citação com a nota', () => {
    render(<FichaDisplay campo={daPaloma('3.1')} />);
    expect(screen.getByTestId('display-bruto-3.1')).toBeInTheDocument();
    expect(screen.getByText('Sugestão em texto corrido.')).toBeInTheDocument();
    expect(screen.getByText(/O dono ou sucessor de uma indústria familiar/)).toBeInTheDocument();
  });

  it('1.2 mostrador: a data no mostrador "até quando"; sem reuniões não há cadência', () => {
    render(<FichaDisplay campo={daPaloma('1.2')} />);
    expect(screen.getByTestId('mostrador-ate')).toHaveTextContent('dezembro de 2026.');
    expect(screen.queryByTestId('mostrador-cadencia')).not.toBeInTheDocument();
  });

  it('1.2 mostrador: clientes, até quando e reuniões nos três mostradores, com a cadência calculada', () => {
    render(<FichaDisplay campo={campoDe('1.2', '10 clientes até dezembro · 3 reuniões por semana')} />);
    expect(screen.getByTestId('mostrador-clientes')).toHaveTextContent('10');
    expect(screen.getByTestId('mostrador-ate')).toHaveTextContent('dezembro');
    expect(screen.getByTestId('mostrador-reunioes')).toHaveTextContent('3');
    expect(screen.getByTestId('mostrador-cadencia')).toHaveTextContent('12');
  });
});

describe('FichaField em revisão usa o modo visual', () => {
  it('mostra o widget visual, a fonte e o texto original sob o toggle', () => {
    render(<FichaField campo={daPaloma('2.2')} onDecide={vi.fn()} />);
    expect(screen.getByTestId('display-2.2')).toBeInTheDocument();
    expect(screen.getByText(/Fonte: Exclusive Book/)).toBeInTheDocument();
    expect(screen.queryByTestId('texto-original-2.2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver texto original' }));
    expect(screen.getByTestId('texto-original-2.2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Esconder texto original' }));
    expect(screen.queryByTestId('texto-original-2.2')).not.toBeInTheDocument();
  });

  it('Confirmar continua sendo um toque; Editar troca o visual pelo widget editável no lugar', () => {
    const onDecide = vi.fn();
    render(<FichaField campo={daPaloma('2.3')} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onDecide).toHaveBeenCalledWith('2.3', { status: 'confirmado' });
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.queryByTestId('display-2.3')).not.toBeInTheDocument();
    expect(screen.getByTestId('editor-2.3')).toBeInTheDocument();
    expect((screen.getByLabelText('O mercado faz 1') as HTMLTextAreaElement).value).toMatch(/O mercado de mentoria de gestão está saturado/);
  });

  it('campo confirmado mostra o valor no visual do widget', () => {
    const c = daPaloma('5.3', { status: 'confirmado', decidido: true, valor: fx['5.3'].sugerido, valor_efetivo: fx['5.3'].sugerido });
    render(<FichaField campo={c} onDecide={vi.fn()} />);
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
    expect(screen.getByTestId('escada-alta-valor')).toHaveTextContent('R$ 14');
  });

  it('nenhum texto de interface usa travessão (e "diagnóstico" só aparece se vier do texto da fonte)', () => {
    for (const key of Object.keys(fx)) {
      const { container, unmount } = render(<FichaField campo={daPaloma(key)} onDecide={vi.fn()} />);
      expect(container.textContent).not.toContain('—');
      if (!fx[key].sugerido.toLowerCase().includes('diagnóstico')) {
        expect(container.textContent!.toLowerCase()).not.toContain('diagnóstico');
      }
      unmount();
    }
  });
});
