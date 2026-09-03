import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

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
import { recomputeView, type ScriptFichaData, type UseScriptFicha } from '../../hooks/useScriptFicha';
import { SCRIPT_BLOCKS, SCRIPT_FIELD_BY_KEY, type ScriptBlockView, type ScriptFieldView } from '../../data/script-ficha-fields';

function campoDe(key: string, sugerido: string, extra: Partial<ScriptFieldView> & { refinando?: boolean } = {}): ScriptFieldView {
  const def = SCRIPT_FIELD_BY_KEY[key];
  return {
    key, bloco: def.bloco, nome: def.nome, pergunta: def.pergunta, tipo: def.tipo, tipoRaw: def.tipoRaw, obrigatorio: def.obrigatorio,
    minutos: def.minutos, opcoes: def.opcoes ?? null, widget: def.widget, template: def.template,
    sugerido, classe: sugerido ? 'Fato' : 'VZ', fonte: sugerido ? 'Exclusive Book · P1' : '', alternativas: [],
    status: sugerido ? 'sugerido' : 'vazio', valor: '', estrutura: null, valor_efetivo: '', decidido: false, atualizado_por: null, atualizado_em: null,
    ...extra,
  };
}

function blocoDe(numero: number, campos: ScriptFieldView[]): ScriptBlockView {
  const def = SCRIPT_BLOCKS.find((b) => b.numero === numero)!;
  return {
    numero, nome: def.nome, descricao: def.descricao,
    total: campos.length, decididos: 0, obrigatorios: campos.filter((c) => c.obrigatorio).length, obrigatorios_decididos: 0,
    minutos: 10, minutos_pendentes: 10, fechado: false, campos,
  };
}

function dados(blocos?: ScriptBlockView[]): ScriptFichaData {
  const bs = blocos || [
    blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão'), campoDe('1.2', '')]),
    blocoDe(2, [campoDe('2.1', 'Sou a Paloma.')]),
  ];
  return {
    club: { slug: 'teste', nome: 'Clube de Teste' },
    ficha_status: 'pre_preenchida',
    materials_status: 'pending',
    materials_submitted_at: null,
    materials: { links: [], observacoes: '', acessos: [], submitted_at: null },
    config: { prazo_materiais: '' },
    prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [], dias: [],
    ...recomputeView(bs),
  } as ScriptFichaData;
}

function fichaDe(data: ScriptFichaData): UseScriptFicha {
  return {
    data, decide: vi.fn(), complete: vi.fn().mockResolvedValue({ ok: true }),
    flush: vi.fn().mockResolvedValue(undefined), refresh: vi.fn().mockResolvedValue(undefined),
    loading: false, loaded: true, enabled: true, error: null, saveState: 'idle',
  } as unknown as UseScriptFicha;
}

beforeEach(() => { window.localStorage.removeItem('ficha-script-modo'); });
afterEach(() => { vi.useRealTimers(); });

describe('FichaScreen', () => {
  it('não mostra o cartão "Hoje" nem "Dia N"; abre no passo a passo com o primeiro campo pendente', () => {
    const { container } = render(<FichaScreen ficha={fichaDe(dados())} />);
    expect(screen.getByTestId('ficha-wizard')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Hoje:/);
    expect(container.textContent).not.toMatch(/\bDia \d/);
    expect(container.textContent).not.toMatch(/≈/);
    expect(screen.getByTestId('wizard-title')).toHaveTextContent(SCRIPT_FIELD_BY_KEY['1.1'].pergunta);
  });

  it('"Ver tudo" mostra os acordeões sem "≈ N min", com o contexto por campo', () => {
    const { container } = render(<FichaScreen ficha={fichaDe(dados())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo' }));
    expect(screen.queryByTestId('ficha-wizard')).not.toBeInTheDocument();
    expect(screen.getByTestId('ficha-field-1.1')).toBeInTheDocument();
    expect(screen.getByTestId('contexto-1.1')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/≈/);
    expect(container.textContent).not.toMatch(/\d+ min\b/);
    expect(container.textContent).toContain('0 de 1 obrigatórios');
  });

  it('com campo em revisão pela IA recarrega a ficha a cada 30 s e avisa quando a nova sugestão chega', async () => {
    vi.useFakeTimers();
    const d1 = dados([blocoDe(1, [campoDe('1.1', 'Mentoria', { refinando: true })])]);
    const ficha = fichaDe(d1);
    const { rerender } = render(<FichaScreen ficha={ficha} />);
    expect(screen.getAllByTestId('badge-refinando').length).toBeGreaterThan(0);
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(ficha.flush).toHaveBeenCalledTimes(1);
    expect(ficha.refresh).toHaveBeenCalledTimes(1);

    const d2 = dados([blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão v2')])]);
    rerender(<FichaScreen ficha={{ ...ficha, data: d2 }} />);
    expect(screen.getByTestId('toast-stack')).toHaveTextContent('Nova sugestão pronta em 1.1');
    expect(screen.queryByTestId('badge-refinando')).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(ficha.refresh).toHaveBeenCalledTimes(1);
  });

  it('nenhum texto visível usa travessão, emoji nem a palavra diagnóstico', () => {
    const { container } = render(<FichaScreen ficha={fichaDe(dados())} />);
    const t = container.textContent || '';
    expect(t).not.toContain('—');
    expect(t.toLowerCase()).not.toContain('diagnóstico');
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
