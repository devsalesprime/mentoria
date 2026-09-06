import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

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

import { FichaScreen } from '../../components/script/FichaScreen';
import { COPY_APROFUNDAR, COPY_ESSENCIAL_CONFIRMADA, textoFaltamEssenciais } from '../../components/script/FichaWizard';
import { COPY_GRUPO_APROFUNDAR } from '../../components/script/FichaNavegador';
import { recomputeView, type ScriptFichaData, type UseScriptFicha } from '../../hooks/useScriptFicha';
import { SCRIPT_BLOCKS, SCRIPT_ESSENCIAL_KEYS, SCRIPT_FIELD_BY_KEY, ehEssencial, type ScriptBlockView, type ScriptFieldView } from '../../data/script-ficha-fields';

function campoDe(key: string, sugerido: string, extra: Partial<ScriptFieldView> = {}): ScriptFieldView {
  const def = SCRIPT_FIELD_BY_KEY[key];
  return {
    key, bloco: def.bloco, nome: def.nome, pergunta: def.pergunta, tipo: def.tipo, tipoRaw: def.tipoRaw, obrigatorio: def.obrigatorio,
    essencial: !!def.essencial,
    minutos: def.minutos, opcoes: def.opcoes ?? null, widget: def.widget, template: def.template,
    sugerido, classe: sugerido ? 'Fato' : 'VZ', fonte: sugerido ? 'Exclusive Book · P1' : '', alternativas: [],
    status: sugerido ? 'sugerido' : 'vazio', valor: '', estrutura: null, valor_efetivo: '', decidido: false, atualizado_por: null, atualizado_em: null,
    ...extra,
  };
}
const editado = (key: string, valor: string) => campoDe(key, '', { status: 'editado', decidido: true, valor, valor_efetivo: valor, atualizado_por: 'ana@x.com' });

function blocoDe(numero: number, campos: ScriptFieldView[]): ScriptBlockView {
  const def = SCRIPT_BLOCKS.find((b) => b.numero === numero)!;
  return { numero, nome: def.nome, descricao: def.descricao, total: campos.length, decididos: 0, obrigatorios: campos.filter((c) => c.obrigatorio).length, obrigatorios_decididos: 0, minutos: 10, minutos_pendentes: 10, fechado: false, campos };
}

/**
 * Ficha com 3 essenciais (3.3, 4.1, 6.2) e 3 fora das 12 (1.1, 1.2, 3.5).
 * O bloco 1 fica inteiro fora do essencial: no modo essencial ele some da navegação.
 */
function dados(over: Partial<ScriptFichaData> & { blocos?: ScriptBlockView[] } = {}): ScriptFichaData {
  const blocos = over.blocos || [
    blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão'), campoDe('1.2', '')]),
    blocoDe(3, [campoDe('3.3', ''), campoDe('3.5', '')]),
    blocoDe(4, [campoDe('4.1', '')]),
    blocoDe(6, [campoDe('6.2', '')]),
  ];
  const { blocos: _b, ...rest } = over;
  return {
    club: { slug: 'teste', nome: 'Clube de Teste' },
    ficha_status: 'pre_preenchida',
    modo: 'essencial',
    suficiencia: null,
    materials_status: 'skipped', materials_submitted_at: null,
    materials: { links: [], observacoes: '', acessos: [], submitted_at: null },
    config: { prazo_materiais: '' }, prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [], dias: [], job: null,
    script: { versoes: 0, ultima: null, aprovada: null, job: null },
    ...recomputeView(blocos),
    ...rest,
  } as ScriptFichaData;
}

function fichaDe(data: ScriptFichaData, extra: Partial<UseScriptFicha> = {}): UseScriptFicha {
  return {
    data, decide: vi.fn(), complete: vi.fn().mockResolvedValue({ ok: true, job: { id: 'j1', tipo: 'script', status: 'queued' } }),
    flush: vi.fn().mockResolvedValue(undefined), refresh: vi.fn().mockResolvedValue(undefined),
    refreshMerge: vi.fn().mockResolvedValue(true), setFieldEditing: vi.fn(), complemento: vi.fn().mockResolvedValue({ ok: true }),
    pedirRevisao: vi.fn().mockResolvedValue({ ok: true, existing: false }),
    definirModo: vi.fn().mockResolvedValue({ ok: true }),
    ultimaSincronia: null, loading: false, loaded: true, enabled: true, error: null, saveState: 'idle',
    ...extra,
  } as unknown as UseScriptFicha;
}

const lateral = () => screen.getByTestId('navegador-lateral');
const P = (key: string) => SCRIPT_FIELD_BY_KEY[key].pergunta;

beforeEach(() => { window.localStorage.clear(); });

describe('as 12 perguntas essenciais na definição do front', () => {
  it('SCRIPT_ESSENCIAL_KEYS e ehEssencial concordam com a marca do servidor', () => {
    expect(SCRIPT_ESSENCIAL_KEYS.length).toBeGreaterThan(0);
    expect(ehEssencial({ key: '3.3' })).toBe(true);
    expect(ehEssencial({ key: '1.1' })).toBe(false);
    // a marca que vem do GET vence a definição local
    expect(ehEssencial({ key: '1.1', essencial: true })).toBe(true);
  });

  it('textoFaltamEssenciais: singular, plural e zero', () => {
    expect(textoFaltamEssenciais(1)).toBe('Falta 1 pergunta essencial');
    expect(textoFaltamEssenciais(3)).toBe('Faltam 3 perguntas essenciais');
    expect(textoFaltamEssenciais(0)).toBe('As 12 perguntas essenciais estão respondidas');
  });
});

describe('FichaScreen no modo essencial', () => {
  it('a tela se chama "Ficha essencial" e o wizard abre só nas perguntas essenciais', () => {
    render(<FichaScreen ficha={fichaDe(dados())} onNavigate={vi.fn()} />);
    expect(screen.getByTestId('ficha-titulo')).toHaveTextContent('Ficha essencial');
    expect(screen.getByTestId('ficha-wizard')).toHaveAttribute('data-modo', 'essencial');
    // abre na primeira pergunta essencial pendente (3.3), não na 1.1
    expect(screen.getByTestId('wizard-title')).toHaveTextContent(P('3.3'));
    expect(screen.getByTestId('contador-faltam')).toHaveTextContent('Faltam 3 perguntas essenciais');
  });

  it('o navegador esconde o bloco sem pergunta essencial e recolhe o resto em "Aprofundar (opcional)"', () => {
    render(<FichaScreen ficha={fichaDe(dados())} onNavigate={vi.fn()} />);
    const nav = lateral();
    // bloco 1 é todo não essencial: some da lista
    expect(within(nav).queryByRole('region', { name: 'Bloco 1: Meta' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('region', { name: 'Bloco 3: Mentorado' })).toBeInTheDocument();
    expect(within(nav).getByRole('region', { name: 'Bloco 4: Método' })).toBeInTheDocument();
    expect(within(nav).getByRole('region', { name: 'Bloco 6: Venda' })).toBeInTheDocument();
    const outros = within(nav).getByTestId('lateral-nav-outros');
    expect(outros).toHaveTextContent(COPY_GRUPO_APROFUNDAR);
    // 1.1, 1.2 e 3.5 ficam guardados ali, fechados por padrão
    expect(within(outros).getByTestId('lateral-nav-outros-contagem')).toHaveTextContent('3');
    expect(within(outros).getByTestId('lateral-nav-outros-toggle')).toHaveAttribute('aria-expanded', 'false');
    // e continuam alcançáveis: abrindo o grupo, a pergunta aparece
    fireEvent.click(within(outros).getByTestId('lateral-nav-outros-toggle'));
    expect(within(outros).getByTestId('lateral-nav-passo-1.1')).toBeInTheDocument();
  });

  it('o progresso conta só as essenciais: 1 de 3 no rodapé, não os obrigatórios da ficha inteira', () => {
    const blocos = [
      blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão'), campoDe('1.2', '')]),
      blocoDe(3, [editado('3.3', 'Não consigo sair da clínica.'), campoDe('3.5', '')]),
      blocoDe(4, [campoDe('4.1', '')]),
      blocoDe(6, [campoDe('6.2', '')]),
    ];
    render(<FichaScreen ficha={fichaDe(dados({ blocos }))} onNavigate={vi.fn()} />);
    expect(screen.getByTestId('rodape-essencial')).toHaveTextContent('1 de 3 perguntas essenciais decididas');
    expect(screen.queryByText(/obrigatórios decididos/)).not.toBeInTheDocument();
  });

  it('com as essenciais decididas, o botão vira "Fechar ficha essencial" e o fim diz "Ficha essencial confirmada"', async () => {
    const blocos = [
      blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão'), campoDe('1.2', '')]),
      blocoDe(3, [editado('3.3', 'Não consigo sair da clínica.'), campoDe('3.5', '')]),
      blocoDe(4, [editado('4.1', 'Método Travessia: do balcão à mesa.')]),
      blocoDe(6, [editado('6.2', 'Eu mesma conduzo; lead por indicação.')]),
    ];
    const ficha = fichaDe(dados({ blocos }));
    render(<FichaScreen ficha={ficha} onNavigate={vi.fn()} />);
    // o botão aparece no fim do wizard e no rodapé; os dois fecham a ficha essencial
    const fechar = screen.getAllByRole('button', { name: /Fechar ficha essencial/ });
    expect(fechar).toHaveLength(2);
    fechar.forEach((b) => expect(b).toBeEnabled());
    // o wizard abre direto no fim (tudo respondido)
    expect(screen.getByTestId('wizard-progresso-essencial')).toHaveTextContent('3 de 3 perguntas essenciais decididas');
    fireEvent.click(fechar[0]);
    await waitFor(() => expect(ficha.complete).toHaveBeenCalledTimes(1));

    const fechada = fichaDe(dados({ blocos, ficha_status: 'confirmada', confirmada_por: 'mentor' }));
    render(<FichaScreen ficha={fechada} onNavigate={vi.fn()} />);
    expect(screen.getAllByTestId('wizard-faltam').some((e) => e.textContent === COPY_ESSENCIAL_CONFIRMADA)).toBe(true);
  });

  it('"Aprofundar para o completo" grava o modo completo sem perder nada do que foi respondido', async () => {
    const definirModo = vi.fn().mockResolvedValue({ ok: true });
    render(<FichaScreen ficha={fichaDe(dados(), { definirModo })} onNavigate={vi.fn()} />);
    const link = screen.getByTestId('aprofundar-completo');
    expect(link).toHaveTextContent(COPY_APROFUNDAR);
    fireEvent.click(link);
    await waitFor(() => expect(definirModo).toHaveBeenCalledWith('completo'));
  });

  it('modo completo: nada muda (título, progresso e navegação da ficha inteira)', () => {
    render(<FichaScreen ficha={fichaDe(dados({ modo: 'completo' }))} onNavigate={vi.fn()} />);
    expect(screen.getByTestId('ficha-titulo')).toHaveTextContent('Ficha do Script');
    expect(screen.getByTestId('ficha-wizard')).toHaveAttribute('data-modo', 'inteira');
    expect(screen.queryByTestId('rodape-essencial')).not.toBeInTheDocument();
    expect(screen.queryByTestId('aprofundar-ficha')).not.toBeInTheDocument();
    expect(within(lateral()).getByRole('region', { name: 'Bloco 1: Meta' })).toBeInTheDocument();
    expect(within(lateral()).queryByTestId('lateral-nav-outros')).not.toBeInTheDocument();
  });

  it('"Ver tudo": os blocos mostram só as essenciais e o resto vai para o acordeão "Aprofundar (opcional)"', () => {
    render(<FichaScreen ficha={fichaDe(dados())} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo' }));
    const aprofundar = screen.getByRole('button', { name: new RegExp(COPY_GRUPO_APROFUNDAR.replace(/[()]/g, '\\$&')) });
    expect(aprofundar).toBeInTheDocument();
    // o bloco 1 (só perguntas fora das 12) não vira seção própria
    expect(screen.queryByRole('button', { name: /1\. Meta/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3\. Mentorado/ })).toBeInTheDocument();
  });
});
