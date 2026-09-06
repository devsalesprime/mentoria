import React, { useEffect, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Acesso direto (ou F5) em /dashboard/materiais: o Dashboard monta a tela ANTES de GET /api/script/ficha
 * responder, entao o primeiro render tem `loading: true, data: null` e o seguinte ja tem a ficha.
 *
 * Regressao coberta aqui: enquanto o `useNavigate()` morava DEPOIS dos early returns de MateriaisScreen,
 * esse segundo render chamava um hook a mais que o primeiro e o React quebrava com o erro #310
 * ("rendered more hooks than during the previous render"), caindo no ModuleErrorBoundary com
 * "Algo travou ao abrir a página". Todo hook novo tem que nascer no topo do componente.
 */

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

vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { success: true, prompt: '' } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { MateriaisScreen } from '../../components/script/MateriaisScreen';
import { ModuleErrorBoundary } from '../../components/shared/ModuleErrorBoundary';
import type { ScriptFichaData, UseScriptFicha } from '../../hooks/useScriptFicha';

function dados(over: Partial<ScriptFichaData> = {}): ScriptFichaData {
  return {
    club: { slug: 'teste', nome: 'Clube de Teste' },
    ficha_status: 'vazia',
    modo: 'essencial',
    suficiencia: null,
    materials_status: 'pending', materials_submitted_at: null,
    materials: { links: [], observacoes: '', acessos: [], submitted_at: null },
    config: { prazo_materiais: '' }, prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [], dias: [], blocos: [], job: null,
    hoje: { dia: 1, titulo: '', blocos: [], blocos_abertos: [], minutos: 0, em_breve: false },
    progresso: { total: 0, decididos: 0, obrigatorios: 0, obrigatorios_decididos: 0, confirmados: 0, editados: 0, aceitos_vazios: 0 },
    ...over,
  } as ScriptFichaData;
}

/** Estado do hook enquanto GET /api/script/ficha nao voltou. */
const carregando = (): UseScriptFicha => ({
  data: null, loading: true, loaded: false, enabled: true, error: null, saveState: 'idle',
  saveMaterials: vi.fn(), submitMaterials: vi.fn(), pularMateriais: vi.fn(),
  setFiles: vi.fn(), refreshFiles: vi.fn(),
} as unknown as UseScriptFicha);

/** Estado do hook depois que a ficha chegou. */
const carregada = (data: ScriptFichaData = dados()): UseScriptFicha => ({
  data, loading: false, loaded: true, enabled: true, error: null, saveState: 'idle',
  saveMaterials: vi.fn().mockResolvedValue(true),
  submitMaterials: vi.fn().mockResolvedValue({ ok: true }),
  pularMateriais: vi.fn().mockResolvedValue({ ok: true }),
  setFiles: vi.fn(), refreshFiles: vi.fn(),
} as unknown as UseScriptFicha);

/** Reproduz a rota: monta sem ficha e troca para a ficha carregada assim que ela chega. */
const RotaMateriais: React.FC<{ ficha: UseScriptFicha }> = ({ ficha }) => {
  const [pronta, setPronta] = useState(false);
  useEffect(() => { setPronta(true); }, []);
  return (
    <ModuleErrorBoundary moduleName="Materiais" reload={() => {}}>
      <MateriaisScreen ficha={pronta ? ficha : carregando()} token="tok" onNavigate={vi.fn()} />
    </ModuleErrorBoundary>
  );
};

describe('Materiais em acesso frio (F5 direto em /dashboard/materiais)', () => {
  let erros: any[][];
  let spy: any;

  beforeEach(() => {
    erros = [];
    spy = vi.spyOn(console, 'error').mockImplementation((...args: any[]) => { erros.push(args); });
  });

  afterEach(() => { spy.mockRestore(); });

  it('monta sem ficha, recebe a ficha e NAO cai no error boundary', async () => {
    render(<MemoryRouter initialEntries={['/dashboard/materiais']}><RotaMateriais ficha={carregada()} /></MemoryRouter>);

    // a tela de verdade apareceu
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Materiais' })).toBeInTheDocument());
    expect(screen.getByText(/Mande o que você já usa para vender hoje/)).toBeInTheDocument();

    // o cartao do boundary nao apareceu
    expect(screen.queryByText('Algo travou ao abrir a página')).toBeNull();
    expect(screen.queryByText(/encontrou um problema/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();

    // e nenhum erro de ordem de hooks foi ao console
    const texto = erros.map((a) => a.map(String).join(' ')).join('\n');
    expect(texto).not.toMatch(/more hooks|Rendered fewer hooks|error #(310|300)/i);
    expect(texto).not.toMatch(/ModuleErrorBoundary/);
  });

  it('a troca de loading para loaded nao muda a quantidade de hooks', async () => {
    const { rerender } = render(
      <MemoryRouter><MateriaisScreen ficha={carregando()} token="tok" onNavigate={vi.fn()} /></MemoryRouter>,
    );
    // primeiro render: so o spinner
    expect(screen.queryByRole('heading', { name: 'Materiais' })).toBeNull();

    rerender(
      <MemoryRouter><MateriaisScreen ficha={carregada()} token="tok" onNavigate={vi.fn()} /></MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Materiais' })).toBeInTheDocument());

    const texto = erros.map((a) => a.map(String).join(' ')).join('\n');
    expect(texto).not.toMatch(/more hooks|Rendered fewer hooks/i);
  });

  it('sem acesso liberado (loaded sem data) tambem nao quebra ao trocar de estado', async () => {
    const semAcesso = {
      data: null, loading: false, loaded: true, enabled: true, error: 'sem acesso', saveState: 'idle',
      saveMaterials: vi.fn(), submitMaterials: vi.fn(), pularMateriais: vi.fn(),
      setFiles: vi.fn(), refreshFiles: vi.fn(),
    } as unknown as UseScriptFicha;

    const { rerender } = render(
      <MemoryRouter><MateriaisScreen ficha={carregando()} token="tok" onNavigate={vi.fn()} /></MemoryRouter>,
    );
    rerender(<MemoryRouter><MateriaisScreen ficha={semAcesso} token="tok" onNavigate={vi.fn()} /></MemoryRouter>);
    rerender(<MemoryRouter><MateriaisScreen ficha={carregada()} token="tok" onNavigate={vi.fn()} /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Materiais' })).toBeInTheDocument());
    const texto = erros.map((a) => a.map(String).join(' ')).join('\n');
    expect(texto).not.toMatch(/more hooks|Rendered fewer hooks/i);
  });
});
