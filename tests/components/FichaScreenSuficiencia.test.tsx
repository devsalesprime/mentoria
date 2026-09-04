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

import { FichaScreen, COPY_INSUFICIENTE, COPY_AUTOMATICA, COPY_SCRIPT_GERANDO } from '../../components/script/FichaScreen';
import { recomputeView, type ScriptFichaData, type UseScriptFicha, type Suficiencia } from '../../hooks/useScriptFicha';
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
const editado = (key: string, valor: string) => campoDe(key, '', { status: 'editado', decidido: true, valor, valor_efetivo: valor, atualizado_por: 'ana@x.com' });

function blocoDe(numero: number, campos: ScriptFieldView[]): ScriptBlockView {
  const def = SCRIPT_BLOCKS.find((b) => b.numero === numero)!;
  return { numero, nome: def.nome, descricao: def.descricao, total: campos.length, decididos: 0, obrigatorios: campos.filter((c) => c.obrigatorio).length, obrigatorios_decididos: 0, minutos: 10, minutos_pendentes: 10, fechado: false, campos };
}

function dados(over: Partial<ScriptFichaData> & { blocos?: ScriptBlockView[] } = {}): ScriptFichaData {
  const blocos = over.blocos || [
    blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão')]),
    blocoDe(3, [campoDe('3.3', '')]),
    blocoDe(6, [campoDe('6.2', 'Eu mesma conduzo; lead por indicação.')]),
  ];
  const { blocos: _b, ...rest } = over;
  return {
    club: { slug: 'teste', nome: 'Clube de Teste' },
    ficha_status: 'pre_preenchida',
    materials_status: 'pending', materials_submitted_at: null,
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
    ultimaSincronia: null, loading: false, loaded: true, enabled: true, error: null, saveState: 'idle',
    ...extra,
  } as unknown as UseScriptFicha;
}

const parcial = (faltam: string[]): Suficiencia => ({ resultado: 'parcial', faltam, motivos: ['Dor, nas palavras dele: não encontramos nos seus materiais.'] });

beforeEach(() => { window.localStorage.clear(); });

describe('FichaScreen: suficiência parcial ("completar o que falta")', () => {
  it('mostra "Falta 1 resposta sua", abre o wizard só no que falta e esconde "Fechar ficha"', () => {
    const ficha = fichaDe(dados({ suficiencia: parcial(['3.3']) }));
    render(<FichaScreen ficha={ficha} onNavigate={vi.fn()} />);
    const banner = screen.getByTestId('banner-completar');
    expect(banner).toHaveTextContent('Falta 1 resposta sua para o seu script');
    expect(screen.getByTestId('ficha-wizard')).toHaveAttribute('data-modo', 'completar');
    expect(screen.getByTestId('wizard-title')).toHaveTextContent(SCRIPT_FIELD_BY_KEY['3.3'].pergunta);
    expect(screen.queryByRole('button', { name: /Fechar ficha/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('rodape-completar')).toHaveTextContent('Falta 1 resposta sua');
    expect(ficha.complete).not.toHaveBeenCalled();
    expect(screen.queryByTestId('banner-insuficiente')).not.toBeInTheDocument();
  });

  it('decidida a última resposta, fecha a ficha sozinha (sem botão) e mostra o estado do script', async () => {
    const onNavigate = vi.fn();
    const d1 = dados({ suficiencia: parcial(['3.3']) });
    const ficha1 = fichaDe(d1);
    const { rerender } = render(<FichaScreen ficha={ficha1} onNavigate={onNavigate} />);
    expect(ficha1.complete).not.toHaveBeenCalled();
    // A decisão chega pelo hook (otimista): 3.3 vira editado
    const blocos = d1.blocos.map((b) => (b.numero === 3 ? { ...b, campos: [editado('3.3', 'Não consigo sair da clínica.')] } : b));
    const d2 = dados({ suficiencia: parcial(['3.3']), blocos });
    const ficha2 = fichaDe(d2, { complete: ficha1.complete });
    rerender(<FichaScreen ficha={ficha2} onNavigate={onNavigate} />);
    await waitFor(() => expect(ficha1.complete).toHaveBeenCalledTimes(1));
    const painel = await screen.findByTestId('ficha-fechada');
    expect(painel).toHaveTextContent(COPY_SCRIPT_GERANDO);
    fireEvent.click(within(painel).getByRole('button', { name: 'Ver o script' }));
    expect(onNavigate).toHaveBeenCalledWith('script_script');
    // Nao fecha duas vezes
    rerender(<FichaScreen ficha={fichaDe({ ...d2, ficha_status: 'confirmada', confirmada_por: 'mentor' }, { complete: ficha1.complete })} onNavigate={onNavigate} />);
    expect(ficha1.complete).toHaveBeenCalledTimes(1);
  });

  it('campo em faltam já decidido (sinalizado) só sai da pendência quando o mentor mexe nele', async () => {
    const blocos = [blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão')]), blocoDe(6, [editado('6.2', 'Outro; lead por indicação.')])];
    const d = dados({ suficiencia: parcial(['6.2']), blocos });
    const ficha = fichaDe(d);
    render(<FichaScreen ficha={ficha} onNavigate={vi.fn()} />);
    expect(screen.getByTestId('banner-completar')).toHaveTextContent('Falta 1 resposta sua');
    expect(ficha.complete).not.toHaveBeenCalled();
    expect(screen.getByTestId('wizard-title')).toHaveTextContent(SCRIPT_FIELD_BY_KEY['6.2'].pergunta);
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(ficha.decide).toHaveBeenCalledWith('6.2', { status: 'vazio' });
    // Tocado: sai da pendência e (com o campo decidido nos dados) a ficha fecha sozinha
    await waitFor(() => expect(ficha.complete).toHaveBeenCalledTimes(1));
  });

  it('parcial sem faltam (só conferência): ficha inteira, com "Fechar ficha"', () => {
    const ficha = fichaDe(dados({ suficiencia: { resultado: 'parcial', faltam: [], motivos: ['A leitura dos seus materiais pediu uma conferência sua antes do script.'] } }));
    render(<FichaScreen ficha={ficha} onNavigate={vi.fn()} />);
    expect(screen.queryByTestId('banner-completar')).not.toBeInTheDocument();
    expect(screen.getByTestId('ficha-wizard')).toHaveAttribute('data-modo', 'inteira');
    expect(screen.getByRole('button', { name: /Fechar ficha/ })).toBeInTheDocument();
  });
});

describe('FichaScreen: insuficiente e suficiente', () => {
  it('insuficiente: wizard completo + aviso com link para Materiais', () => {
    const onNavigate = vi.fn();
    const ficha = fichaDe(dados({ suficiencia: { resultado: 'insuficiente', faltam: ['3.3', '6.2'], motivos: [] } }));
    render(<FichaScreen ficha={ficha} onNavigate={onNavigate} />);
    const banner = screen.getByTestId('banner-insuficiente');
    expect(banner).toHaveTextContent(COPY_INSUFICIENTE);
    fireEvent.click(within(banner).getByRole('button', { name: 'Enviar mais materiais' }));
    expect(onNavigate).toHaveBeenCalledWith('script_materiais');
    expect(screen.getByTestId('ficha-wizard')).toHaveAttribute('data-modo', 'inteira');
    expect(screen.queryByTestId('banner-completar')).not.toBeInTheDocument();
  });

  it('suficiente (fechada pelos materiais): nota "Preenchida pelos seus materiais", campos marcados e editáveis', () => {
    const blocos = [
      blocoDe(1, [campoDe('1.1', 'Mentoria Sucessão', { status: 'confirmado', decidido: true, valor: 'Mentoria Sucessão', valor_efetivo: 'Mentoria Sucessão', atualizado_por: 'automatica' })]),
      blocoDe(6, [campoDe('6.2', 'Eu mesma conduzo.', { status: 'confirmado', decidido: true, valor: 'Eu mesma conduzo.', valor_efetivo: 'Eu mesma conduzo.', atualizado_por: 'automatica' })]),
    ];
    const ficha = fichaDe(dados({ ficha_status: 'confirmada', confirmada_por: 'automatica', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] }, blocos }));
    render(<FichaScreen ficha={ficha} onNavigate={vi.fn()} />);
    expect(screen.getByTestId('nota-automatica')).toHaveTextContent(COPY_AUTOMATICA);
    expect(screen.queryByTestId('banner-completar')).not.toBeInTheDocument();
    // Tudo decidido: o wizard abre no fim; abrindo 1.1 pelo navegador, o chip e o Editar estão lá
    fireEvent.click(within(screen.getByTestId('navegador-lateral')).getByTestId('lateral-nav-bloco-1'));
    fireEvent.click(within(screen.getByTestId('navegador-lateral')).getByTestId('lateral-nav-passo-1.1'));
    expect(screen.getByTestId('chip-automatica-1.1')).toHaveTextContent('Preenchido pelos seus materiais');
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('ficha reaberta depois de o script existir sugere "Pedir nova versão" (mesmo fluxo da tela do script)', async () => {
    const ficha = fichaDe(dados({
      ficha_status: 'em_revisao', confirmada_por: null,
      suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] },
      script: { versoes: 1, ultima: { versao: 1, status: 'rascunho', created_at: '2026-09-04 10:00:00' }, aprovada: null, job: null },
    }));
    render(<FichaScreen ficha={ficha} onNavigate={vi.fn()} />);
    const s = screen.getByTestId('sugestao-nova-versao');
    fireEvent.click(within(s).getByRole('button', { name: 'Pedir nova versão' }));
    await waitFor(() => expect(ficha.pedirRevisao).toHaveBeenCalledWith(1));
  });

  it('nenhum texto visível usa travessão nem jargão (job, cohort, gate)', () => {
    const ficha = fichaDe(dados({ suficiencia: parcial(['3.3']) }));
    const { container } = render(<FichaScreen ficha={ficha} onNavigate={vi.fn()} />);
    const t = container.textContent || '';
    expect(t).not.toContain('—');
    expect(t).not.toMatch(/\b(job|cohort|gate|prefill)\b/i);
  });
});
