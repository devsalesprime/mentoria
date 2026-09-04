import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

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
    refreshMerge: vi.fn().mockResolvedValue(true), setFieldEditing: vi.fn(), complemento: vi.fn().mockResolvedValue({ ok: true }),
    ultimaSincronia: null,
    loading: false, loaded: true, enabled: true, error: null, saveState: 'idle',
  } as unknown as UseScriptFicha;
}

function jobDe(status: 'queued' | 'running' | 'done' | 'error' | 'needs_human', progresso: any = null) {
  return {
    id: 'job-1', tipo: 'prefill', status, attempts: 1, progresso, error: null,
    created_at: '2026-09-04 10:00:00', started_at: status === 'queued' ? null : '2026-09-04 10:00:05', finished_at: status === 'done' ? '2026-09-04 10:05:00' : null,
  };
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

  it('job de pré-preenchimento rodando: painel de marcos no topo e sincronização a cada 20 s (merge, não refresh) sem trocar o passo', async () => {
    vi.useFakeTimers();
    const progresso = { fase: 'bloco', etapa_atual: 3, etapas_total: 7, rotulo: 'Montando o bloco Mentor', blocos_concluidos: [1], atualizado_em: new Date().toISOString() };
    const ficha = fichaDe({ ...dados(), job: jobDe('running', progresso) } as ScriptFichaData);
    const { container } = render(<FichaScreen ficha={ficha} />);
    const painel = screen.getByTestId('progresso-preenchimento');
    expect(painel).toHaveTextContent('Estamos lendo os seus materiais');
    expect(painel).toHaveTextContent('Montando o bloco Mentor');
    expect(container.textContent).not.toMatch(/\b(job|worker|cohort|prefill|gate)\b/i);
    expect(screen.getByTestId('etapa-0')).toHaveAttribute('data-estado', 'concluido');
    expect(screen.getByTestId('etapa-1')).toHaveAttribute('data-estado', 'concluido');
    expect(screen.getByTestId('etapa-2')).toHaveAttribute('data-estado', 'andamento');
    expect(screen.getByTestId('etapa-6')).toHaveAttribute('data-estado', 'pendente');
    await act(async () => { vi.advanceTimersByTime(20000); });
    expect(ficha.flush).toHaveBeenCalledTimes(1);
    expect(ficha.refreshMerge).toHaveBeenCalledTimes(1);
    expect(ficha.refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId('wizard-title')).toHaveTextContent(SCRIPT_FIELD_BY_KEY['1.1'].pergunta);
    const t = container.textContent || '';
    expect(t).not.toContain('—');
    expect(t.toLowerCase()).not.toContain('diagnóstico');
  });

  it('na fila: painel "Na fila"; sem job: sem painel', () => {
    const { rerender } = render(<FichaScreen ficha={fichaDe({ ...dados(), job: jobDe('queued') } as ScriptFichaData)} />);
    expect(screen.getByTestId('progresso-preenchimento')).toHaveTextContent('Na fila');
    rerender(<FichaScreen ficha={fichaDe(dados())} />);
    expect(screen.queryByTestId('progresso-preenchimento')).not.toBeInTheDocument();
  });

  it('job concluído: "Pronto: N sugestões chegaram" e o painel some depois de 60 s', async () => {
    vi.useFakeTimers();
    render(<FichaScreen ficha={fichaDe({ ...dados(), job: jobDe('done') } as ScriptFichaData)} />);
    expect(screen.getByTestId('progresso-preenchimento')).toHaveTextContent('Pronto: 2 sugestões chegaram');
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(screen.queryByTestId('progresso-preenchimento')).not.toBeInTheDocument();
  });

  it('job concluído some quando o mentor interage com a ficha', () => {
    render(<FichaScreen ficha={fichaDe({ ...dados(), job: jobDe('done') } as ScriptFichaData)} />);
    expect(screen.getByTestId('progresso-preenchimento')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('wizard-title'));
    expect(screen.queryByTestId('progresso-preenchimento')).not.toBeInTheDocument();
  });

  it('campo com sugestão nova aparece listado no painel e com a etiqueta no "Ver tudo"', () => {
    const d = dados([blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão', { nova_sugestao: true }), campoDe('1.2', '')])]);
    render(<FichaScreen ficha={fichaDe({ ...d, job: jobDe('running', { fase: 'bloco', etapa_atual: 2, blocos_concluidos: [] }) } as ScriptFichaData)} />);
    expect(screen.getByTestId('progresso-novas')).toHaveTextContent('1.1 · ' + SCRIPT_FIELD_BY_KEY['1.1'].nome);
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo' }));
    expect(within(screen.getByTestId('ficha-field-1.1')).getByTestId('badge-nova-sugestao')).toBeInTheDocument();
  });

  it('campo decidido com complemento: painel "Encontramos mais nos seus materiais" no topo (passo a passo) e sob o campo (Ver tudo); incorporar chama o hook', async () => {
    const comp = { sugerido: 'Achado novo nos materiais', fonte: 'Reunião de 12/08', classe: 'Fato' as const, alternativas: [], recebido_em: '2026-09-04T10:00:00.000Z' };
    const c11 = campoDe('1.1', 'Mentoria Sucessão', { status: 'editado', decidido: true, valor: 'Meu texto', valor_efetivo: 'Meu texto', complemento: comp, nova_sugestao: true });
    const ficha = fichaDe(dados([blocoDe(1, [c11, campoDe('1.2', '')])]));
    (ficha as any).complemento = vi.fn().mockResolvedValue({ ok: true, campo: { ...c11, valor: 'Meu texto\n\nAchado novo nos materiais', valor_efetivo: 'Meu texto\n\nAchado novo nos materiais', complemento: null } });
    render(<FichaScreen ficha={ficha} />);
    const topo = screen.getByTestId('complementos-topo');
    expect(topo).toHaveTextContent('Encontramos mais nos seus materiais');
    expect(topo).toHaveTextContent('Achado novo nos materiais');
    expect(topo).toHaveTextContent('Reunião de 12/08');
    expect(topo).toHaveTextContent('1.1 · ' + SCRIPT_FIELD_BY_KEY['1.1'].nome);
    fireEvent.click(within(topo).getByRole('button', { name: 'Incorporar ao meu texto' }));
    await act(async () => {});
    expect((ficha as any).complemento).toHaveBeenCalledWith('1.1', 'incorporar');
    expect(screen.getByTestId('complemento-ajuste-1.1')).toHaveValue('Meu texto\n\nAchado novo nos materiais');

    // "Ver tudo": o painel fica sob o campo e o campo leva a etiqueta "Nova sugestão"
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo' }));
    expect(screen.queryByTestId('complementos-topo')).not.toBeInTheDocument();
    expect(screen.getByTestId('complemento-1.1')).toBeInTheDocument();
    expect(within(screen.getByTestId('ficha-field-1.1')).getByTestId('badge-nova-sugestao')).toBeInTheDocument();
  });
});
