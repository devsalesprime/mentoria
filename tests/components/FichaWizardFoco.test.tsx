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

import { FichaWizard, textoFaltamRespostas, type FocoWizard } from '../../components/script/FichaWizard';
import { COPY_GRUPO_MATERIAIS } from '../../components/script/FichaNavegador';
import { COPY_PREENCHIDO_MATERIAIS } from '../../components/script/FichaField';
import { recomputeView, type ScriptFichaData, type UseScriptFicha } from '../../hooks/useScriptFicha';
import { SCRIPT_BLOCKS, SCRIPT_FIELD_BY_KEY, type ScriptBlockView, type ScriptFieldView } from '../../data/script-ficha-fields';

function campoDe(key: string, sugerido: string, extra: Partial<ScriptFieldView> = {}): ScriptFieldView {
  const def = SCRIPT_FIELD_BY_KEY[key];
  return {
    key, bloco: def.bloco, nome: def.nome, pergunta: def.pergunta, tipo: def.tipo, tipoRaw: def.tipoRaw, obrigatorio: def.obrigatorio,
    minutos: def.minutos, opcoes: def.opcoes ?? null, widget: def.widget, template: def.template,
    sugerido, classe: sugerido ? 'Fato' : 'VZ', fonte: sugerido ? 'Exclusive Book · P1' : '', alternativas: [],
    status: sugerido ? 'sugerido' : 'vazio', valor: '', estrutura: null, valor_efetivo: '', decidido: false, atualizado_por: null, atualizado_em: null,
    ...extra,
  };
}
const automatico = (key: string, sugerido: string) => campoDe(key, sugerido, { status: 'confirmado', decidido: true, valor: sugerido, valor_efetivo: sugerido, atualizado_por: 'automatica' });

function blocoDe(numero: number, campos: ScriptFieldView[]): ScriptBlockView {
  const def = SCRIPT_BLOCKS.find((b) => b.numero === numero)!;
  return { numero, nome: def.nome, descricao: def.descricao, total: campos.length, decididos: 0, obrigatorios: campos.filter((c) => c.obrigatorio).length, obrigatorios_decididos: 0, minutos: 10, minutos_pendentes: 10, fechado: false, campos };
}

/** Ficha parcial: 1.1 e 2.1 vieram dos materiais; 3.3 (vazio) e 5.3 (vazio) faltam; 6.2 tem sugestão mas foi sinalizado. */
function dados(): ScriptFichaData {
  const blocos = [
    blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão'), campoDe('1.2', '')]),
    blocoDe(2, [campoDe('2.1', 'Sou a Paloma e ajudo donos de indústria familiar a atravessar a sucessão.')]),
    blocoDe(3, [campoDe('3.3', '')]),
    blocoDe(5, [campoDe('5.3', '')]),
    blocoDe(6, [campoDe('6.2', 'Outro; lead por indicação.')]),
  ];
  return {
    club: { slug: 'teste', nome: 'Clube de Teste' },
    ficha_status: 'pre_preenchida',
    suficiencia: { resultado: 'parcial', faltam: ['3.3', '5.3', '6.2'], motivos: [] },
    materials_status: 'pending', materials_submitted_at: null,
    materials: { links: [], observacoes: '', acessos: [], submitted_at: null },
    config: { prazo_materiais: '' }, prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [], dias: [],
    ...recomputeView(blocos),
  } as ScriptFichaData;
}

function montar(data: ScriptFichaData, foco: FocoWizard | null) {
  const decide = vi.fn();
  const ficha = { data, decide, loading: false, loaded: true, enabled: true, error: null, saveState: 'idle' } as unknown as UseScriptFicha;
  const contexto = Object.fromEntries(data.blocos.flatMap((b) => b.campos.map((c) => [c.key, c])));
  const utils = render(<FichaWizard ficha={ficha} contexto={contexto} onFecharFicha={vi.fn()} onRecarregar={vi.fn()} foco={foco} />);
  return { ...utils, decide };
}

const titulo = () => screen.getByTestId('wizard-title').textContent;
const P = (key: string) => SCRIPT_FIELD_BY_KEY[key].pergunta;
const lateral = () => screen.getByTestId('navegador-lateral');

describe('textoFaltamRespostas', () => {
  it('singular, plural e zero', () => {
    expect(textoFaltamRespostas(1)).toBe('Falta 1 resposta sua para o seu script');
    expect(textoFaltamRespostas(3)).toBe('Faltam 3 respostas suas para o seu script');
    expect(textoFaltamRespostas(0)).toBe('Suas respostas estão completas');
  });
});

describe('FichaWizard: modo "completar o que falta" (suficiência parcial)', () => {
  it('abre no primeiro campo que falta, com o cabeçalho "Faltam N respostas suas"; os outros ficam recolhidos em "Preenchido pelos seus materiais"', () => {
    const d = dados();
    montar(d, { keys: ['3.3', '5.3', '6.2'], pendentes: ['3.3', '5.3', '6.2'] });
    expect(screen.getByTestId('ficha-wizard')).toHaveAttribute('data-modo', 'completar');
    expect(titulo()).toBe(P('3.3'));
    expect(screen.getByTestId('contador-faltam')).toHaveTextContent('Faltam 3 respostas suas para o seu script');
    const nav = lateral();
    // Só os blocos com pergunta pendente aparecem como seções
    expect(within(nav).queryByRole('region', { name: 'Bloco 1: Meta' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('region', { name: 'Bloco 2: Mentor' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('region', { name: 'Bloco 3: Mentorado' })).toBeInTheDocument();
    expect(within(nav).getByRole('region', { name: 'Bloco 5: A Mentoria' })).toBeInTheDocument();
    expect(within(nav).getByRole('region', { name: 'Bloco 6: Venda' })).toBeInTheDocument();
    // O resto recolhido, com a contagem, fechado por padrão
    const outros = within(nav).getByTestId('lateral-nav-outros');
    expect(outros).toHaveTextContent(COPY_GRUPO_MATERIAIS);
    expect(within(outros).getByTestId('lateral-nav-outros-contagem')).toHaveTextContent('3');
    expect(within(outros).getByTestId('lateral-nav-outros-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(within(outros).queryByTestId('lateral-nav-passo-1.1')).not.toBeInTheDocument();
  }, 20000);

  it('o fluxo só passa pelo que falta: Pular vai de 3.3 para 5.3 (interstício) e depois 6.2; o fim não tem "Fechar ficha"', () => {
    montar(dados(), { keys: ['3.3', '5.3', '6.2'], pendentes: ['3.3', '5.3', '6.2'] });
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    const inter = screen.getByTestId('wizard-interstitial');
    expect(within(inter).getByText(/5\. A Mentoria/)).toBeInTheDocument();
    fireEvent.click(within(inter).getByRole('button', { name: 'Continuar' }));
    expect(titulo()).toBe(P('5.3'));
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    fireEvent.click(within(screen.getByTestId('wizard-interstitial')).getByRole('button', { name: 'Continuar' }));
    expect(titulo()).toBe(P('6.2'));
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    const fim = screen.getByTestId('wizard-fim');
    expect(within(fim).getByTestId('wizard-faltam')).toHaveTextContent('Faltam 3 respostas suas para o seu script');
    expect(within(fim).queryByRole('button', { name: /Fechar ficha/ })).not.toBeInTheDocument();
    expect(within(fim).getByText(/o script é gerado sozinho/)).toBeInTheDocument();
    fireEvent.click(within(fim).getByRole('button', { name: 'Ver o que falta' }));
    expect(titulo()).toBe(P('3.3'));
  }, 20000); // 5 telas do wizard renderizadas em sequência: passa dos 5 s quando a suíte inteira roda em paralelo

  it('um campo já decidido mas sinalizado conta como pendente até o mentor mexer; ao ficar sem pendência o fim diz que o script está sendo gerado', () => {
    const d = dados();
    const c62 = d.blocos[4].campos[0];
    d.blocos[4].campos[0] = { ...c62, status: 'editado', decidido: true, valor: 'Outro; lead por indicação.', valor_efetivo: 'Outro; lead por indicação.' };
    const rec = recomputeView(d.blocos);
    const data = { ...d, ...rec };
    const { rerender, decide } = montar(data, { keys: ['3.3', '5.3', '6.2'], pendentes: ['3.3', '5.3', '6.2'] });
    expect(screen.getByTestId('contador-faltam')).toHaveTextContent('Faltam 3 respostas suas');
    // O mentor abre 6.2 pelo navegador e edita: a tela chama decide (o FichaScreen tira o campo das pendências)
    fireEvent.click(within(lateral()).getByTestId('lateral-nav-bloco-6'));
    fireEvent.click(within(lateral()).getByTestId('lateral-nav-passo-6.2'));
    expect(titulo()).toBe(P('6.2'));
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(decide).toHaveBeenCalledWith('6.2', { status: 'sugerido' });
    // Sem pendências: o fim anuncia o script
    const ficha = { data, decide, loading: false, loaded: true, enabled: true, error: null, saveState: 'idle' } as unknown as UseScriptFicha;
    const contexto = Object.fromEntries(data.blocos.flatMap((b) => b.campos.map((c) => [c.key, c])));
    rerender(<FichaWizard ficha={ficha} contexto={contexto} onFecharFicha={vi.fn()} onRecarregar={vi.fn()} foco={{ keys: ['3.3', '5.3', '6.2'], pendentes: [] }} />);
    expect(screen.getByTestId('contador-faltam')).toHaveTextContent('Suas respostas estão completas');
    expect(within(lateral()).getByRole('button', { name: 'Próxima pendente' })).toBeDisabled();
  }, 20000);

  it('"Preenchido pelos seus materiais": abre a lista, toca um campo, ele aparece marcado e editável; Avançar volta ao fim', () => {
    const d = dados();
    d.blocos[0].campos[0] = automatico('1.1', 'Mentoria Sucessão');
    d.blocos[1].campos[0] = automatico('2.1', 'Sou a Paloma e ajudo donos de indústria familiar a atravessar a sucessão.');
    const data = { ...d, ...recomputeView(d.blocos) };
    const { decide } = montar(data, { keys: ['3.3', '5.3', '6.2'], pendentes: ['3.3', '5.3', '6.2'] });
    const outros = within(lateral()).getByTestId('lateral-nav-outros');
    fireEvent.click(within(outros).getByTestId('lateral-nav-outros-toggle'));
    expect(within(outros).getByTestId('lateral-nav-outros-toggle')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(outros).getByTestId('lateral-nav-passo-2.1'));
    expect(titulo()).toBe(P('2.1'));
    expect(screen.getByTestId('chip-fora-do-foco')).toHaveTextContent(COPY_PREENCHIDO_MATERIAIS);
    expect(screen.getByTestId('chip-automatica-2.1')).toHaveTextContent(COPY_PREENCHIDO_MATERIAIS);
    // Continua editável
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByTestId('wizard-editor-2.1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    expect(screen.getByTestId('wizard-fim')).toBeInTheDocument();
    expect(decide).not.toHaveBeenCalled();
  }, 20000); // varias telas do wizard em sequência: passa dos 5 s com a suíte inteira em paralelo

  it('sem foco, o wizard segue inteiro (todos os blocos, contador de campos)', () => {
    montar(dados(), null);
    expect(screen.getByTestId('ficha-wizard')).toHaveAttribute('data-modo', 'inteira');
    expect(titulo()).toBe(P('1.1'));
    expect(within(lateral()).getByRole('region', { name: 'Bloco 1: Meta' })).toBeInTheDocument();
    expect(within(lateral()).queryByTestId('lateral-nav-outros')).not.toBeInTheDocument();
    expect(screen.getByTestId('contador-faltam')).toHaveTextContent('para o seu script');
  });
});
