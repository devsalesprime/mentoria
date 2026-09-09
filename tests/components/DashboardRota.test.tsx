import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';

vi.mock('axios');

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

vi.mock('html2pdf.js', () => ({ default: {} }));
vi.mock('../../components/modules/PreModule', () => ({ PreModule: () => React.createElement('div', null, 'PreModule') }));
vi.mock('../../components/modules/MentorModule', () => ({ MentorModule: () => React.createElement('div', null, 'MentorModule') }));
vi.mock('../../components/modules/MenteeModule', () => ({ MenteeModule: () => React.createElement('div', null, 'MenteeModule') }));
vi.mock('../../components/modules/MethodModule', () => ({ MethodModule: () => React.createElement('div', null, 'MethodModule') }));
vi.mock('../../components/modules/OfferModule', () => ({ OfferModule: () => React.createElement('div', null, 'OfferModule') }));
vi.mock('../../components/OverviewPanel', () => ({ OverviewPanel: () => React.createElement('div', null, 'OverviewPanel') }));
vi.mock('../../components/script/FichaScreen', () => ({ FichaScreen: () => React.createElement('div', null, 'FichaScreen') }));
vi.mock('../../components/script/MateriaisScreen', () => ({ MateriaisScreen: () => React.createElement('div', null, 'MateriaisScreen') }));
vi.mock('../../components/script/ScriptScreen', () => ({ ScriptScreen: () => React.createElement('div', null, 'ScriptScreen') }));

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));

import { Dashboard } from '../../components/Dashboard';
import { rotaInicialDoClube, fichaEhSecundaria, etapaInicialMateriaisFicha } from '../../hooks/useScriptFicha';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.assinatura`;
}
const TOKEN = jwt({ userId: 'u1', user: 'ana@exemplo.com', name: 'Ana', role: 'member', cohort: 'exclusive', clubSlug: 'elos', exp: Math.floor(Date.now() / 1000) + 3600 });

function fichaMock(over: Record<string, unknown>) {
  return {
    club: { slug: 'elos', nome: 'Elos Club' },
    ficha_status: 'pre_preenchida',
    // Quem já escolheu o caminho na entrada; sem `modo` a rota inicial é a tela de escolha
    modo: 'completo',
    confirmada_por: null,
    suficiencia: null,
    materials_status: 'submitted',
    materials_submitted_at: '2026-09-01 10:00:00',
    materials: { links: [], observacoes: '', acessos: [], submitted_at: '2026-09-01 10:00:00' },
    job: null,
    script: { versoes: 0, ultima: null, aprovada: null, job: null },
    config: { prazo_materiais: '' },
    prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [], blocos: [], hoje: {}, progresso: {}, dias: [],
    ...over,
  };
}

function mockApi(ficha: Record<string, unknown>) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/diagnostic') {
      return { data: { success: true, data: {
        pre_module: {}, mentor: {}, mentee: {}, method: {}, offer: {},
        current_module: 'pre_module', current_step: 0, progress_percentage: 0, status: 'in_progress',
        cohort: 'exclusive', club_slug: 'elos', club_nome: 'Elos Club',
      } } };
    }
    if (url === '/api/script/ficha') return { data: { success: true, data: ficha } };
    if (url === '/api/brand-brain' || url === '/api/assets' || url === '/api/insights') return { data: { success: true, data: null } };
    throw new Error('url inesperada ' + url);
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard userEmail="ana@exemplo.com" userName="Ana" userDescription="" onUpdateProfile={vi.fn()} onLogout={vi.fn()} token={TOKEN} />
    </MemoryRouter>
  );
}

describe('rotaInicialDoClube / etapaInicialMateriaisFicha / fichaEhSecundaria', () => {
  it('suficiente ou confirmada -> Seu script; o resto -> Base do script (onda J, item 4)', () => {
    const c = { modo: 'completo' as const };
    expect(rotaInicialDoClube({ ...c, ficha_status: 'vazia', suficiencia: null })).toBe('script_materiais_ficha');
    expect(rotaInicialDoClube({ ...c, ficha_status: 'pre_preenchida', suficiencia: null })).toBe('script_materiais_ficha');
    expect(rotaInicialDoClube({ ...c, ficha_status: 'confirmada', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] } })).toBe('script_script');
    expect(rotaInicialDoClube({ ...c, ficha_status: 'confirmada', suficiencia: null })).toBe('script_script');
    expect(rotaInicialDoClube({ ...c, ficha_status: 'pre_preenchida', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] } })).toBe('script_script');
    expect(rotaInicialDoClube({ ...c, ficha_status: 'pre_preenchida', suficiencia: { resultado: 'parcial', faltam: ['3.3'], motivos: [] } })).toBe('script_materiais_ficha');
    expect(rotaInicialDoClube({ ...c, ficha_status: 'pre_preenchida', suficiencia: { resultado: 'insuficiente', faltam: [], motivos: [] } })).toBe('script_materiais_ficha');
    expect(rotaInicialDoClube({ ...c, ficha_status: 'em_revisao', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] } })).toBe('script_materiais_ficha');
    expect(fichaEhSecundaria({ ficha_status: 'confirmada', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] } })).toBe(true);
    expect(fichaEhSecundaria({ ficha_status: 'em_revisao', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] } })).toBe(false);
    expect(fichaEhSecundaria({ ficha_status: 'pre_preenchida', suficiencia: { resultado: 'parcial', faltam: ['3.3'], motivos: [] } })).toBe(false);
  });

  it('a etapa de entrada segue as regras de antes: vazia -> Materiais; enviados ou pulados -> Ficha', () => {
    const c = { modo: 'completo' as const };
    expect(etapaInicialMateriaisFicha({ ...c, ficha_status: 'vazia', suficiencia: null, materials_status: 'pending' })).toBe('materiais');
    // "Não tenho materiais, ir para a ficha" fecha a etapa dos materiais igual a "Enviei o que tinha"
    expect(etapaInicialMateriaisFicha({ ...c, ficha_status: 'vazia', suficiencia: null, materials_status: 'skipped' })).toBe('ficha');
    expect(etapaInicialMateriaisFicha({ ...c, ficha_status: 'vazia', suficiencia: null, materials_status: 'submitted' })).toBe('ficha');
    expect(etapaInicialMateriaisFicha({ ...c, ficha_status: 'pre_preenchida', suficiencia: null })).toBe('ficha');
    // a leitura rodando sem nenhuma sugestão ainda: a espera (item I5)
    expect(etapaInicialMateriaisFicha({
      ...c,
      ficha_status: 'vazia',
      suficiencia: null,
      materials_status: 'submitted',
      job: { id: 'j1', tipo: 'prefill', status: 'running' } as any,
      blocos: [{ id: 'b1', titulo: 'B', campos: [{ id: '1.1', status: 'vazio' }] }] as any,
    })).toBe('espera');
  });

  it('sem `modo`: a tela de escolha vem antes de tudo; com modo, o fluxo segue para Base do script', () => {
    // Ninguém escolheu o caminho: a escolha vence até a ficha confirmada
    expect(rotaInicialDoClube({ ficha_status: 'vazia', suficiencia: null })).toBe('script_escolha');
    expect(rotaInicialDoClube({ ficha_status: 'confirmada', suficiencia: null })).toBe('script_escolha');
    expect(rotaInicialDoClube({ ficha_status: 'pre_preenchida', suficiencia: { resultado: 'parcial', faltam: ['3.3'], motivos: [] } })).toBe('script_escolha');
    // Escolheu: segue o fluxo normal (base do script -> script)
    expect(rotaInicialDoClube({ modo: 'essencial', ficha_status: 'vazia', suficiencia: null, materials_status: 'pending' })).toBe('script_materiais_ficha');
    expect(rotaInicialDoClube({ modo: 'essencial', ficha_status: 'vazia', suficiencia: null, materials_status: 'skipped' })).toBe('script_materiais_ficha');
    expect(rotaInicialDoClube({ modo: 'completo', ficha_status: 'vazia', suficiencia: null, materials_status: 'submitted' })).toBe('script_materiais_ficha');
    expect(rotaInicialDoClube({ modo: 'essencial', ficha_status: 'confirmada', suficiencia: null })).toBe('script_script');
  });
});

describe('Dashboard: rota inicial pelo resultado da suficiência', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it('suficiente: cai em "Seu script"; o menu tem sempre os mesmos 3 itens (onda J, item 3)', async () => {
    mockApi(fichaMock({ ficha_status: 'confirmada', confirmada_por: 'automatica', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] }, script: { versoes: 0, ultima: null, aprovada: null, job: { id: 'j1', tipo: 'script', status: 'queued' } } }));
    renderDashboard();
    expect(await screen.findByText('ScriptScreen')).toBeInTheDocument();
    expect(screen.queryByText('FichaScreen')).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Navegação do diagnóstico' });
    const itens = Array.from(nav.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(itens).toEqual(['Como funciona', 'Base do script', 'Seu script']);
  });

  it('parcial: cai em "Base do script", na etapa da Ficha', async () => {
    mockApi(fichaMock({ suficiencia: { resultado: 'parcial', faltam: ['3.3', '5.3'], motivos: [] } }));
    renderDashboard();
    expect(await screen.findByText('FichaScreen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Base do script' })).toBeInTheDocument();
    expect(screen.getByTestId('materiais-ficha-screen')).toHaveAttribute('data-etapa', 'ficha');
    const nav = screen.getByRole('navigation', { name: 'Navegação do diagnóstico' });
    const itens = Array.from(nav.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(itens).toEqual(['Como funciona', 'Base do script', 'Seu script']);
    expect(screen.queryByText('ScriptScreen')).toBeNull();
  });

  it('o seletor troca de etapa sem sair da tela', async () => {
    mockApi(fichaMock({ suficiencia: { resultado: 'parcial', faltam: ['3.3'], motivos: [] } }));
    renderDashboard();
    expect(await screen.findByText('FichaScreen')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('etapa-materiais'));
    expect(await screen.findByText('MateriaisScreen')).toBeInTheDocument();
    expect(screen.queryByText('FichaScreen')).toBeNull();
    expect(screen.getByTestId('etapa-materiais')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('etapa-ficha'));
    expect(await screen.findByText('FichaScreen')).toBeInTheDocument();
  });

  it('sem `modo`: abre a tela de escolha (Essencial ou Completo) antes de Materiais', async () => {
    mockApi(fichaMock({ modo: null, ficha_status: 'vazia', materials_status: 'pending', materials_submitted_at: null }));
    renderDashboard();
    expect(await screen.findByTestId('escolha-caminho')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Como você quer construir o seu script?' })).toBeInTheDocument();
    expect(screen.getByTestId('escolher-essencial')).toHaveTextContent('Começar pelo essencial');
    expect(screen.getByTestId('escolher-completo')).toHaveTextContent('Construir o completo');
    expect(screen.queryByText('MateriaisScreen')).toBeNull();
    expect(screen.queryByText('FichaScreen')).toBeNull();
  });

  it('modo essencial: materiais pulados abrem direto na etapa da ficha', async () => {
    mockApi(fichaMock({ modo: 'essencial', ficha_status: 'vazia', materials_status: 'skipped', materials_submitted_at: null }));
    renderDashboard();
    expect(await screen.findByText('FichaScreen')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navegação do diagnóstico' });
    const itens = Array.from(nav.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(itens).toEqual(['Como funciona', 'Base do script', 'Seu script']);
  });

  it('insuficiente: abre na etapa da Ficha; ficha vazia: abre na etapa dos Materiais', async () => {
    mockApi(fichaMock({ suficiencia: { resultado: 'insuficiente', faltam: [], motivos: [] } }));
    const { unmount } = renderDashboard();
    expect(await screen.findByText('FichaScreen')).toBeInTheDocument();
    unmount();
    // Ficha vazia e materiais ainda não enviados nem pulados: a etapa dos materiais vem primeiro
    mockApi(fichaMock({ ficha_status: 'vazia', materials_status: 'pending', materials_submitted_at: null }));
    renderDashboard();
    await waitFor(() => expect(screen.getByText('MateriaisScreen')).toBeInTheDocument());
  });

  it('endereço antigo (/dashboard/ficha) cai na tela única, na etapa da ficha', async () => {
    mockApi(fichaMock({ suficiencia: { resultado: 'parcial', faltam: ['3.3'], motivos: [] } }));
    render(
      <MemoryRouter initialEntries={['/dashboard/ficha']}>
        <Routes>
          <Route
            path="/dashboard/:module"
            element={<Dashboard userEmail="ana@exemplo.com" userName="Ana" userDescription="" onUpdateProfile={vi.fn()} onLogout={vi.fn()} token={TOKEN} />}
          />
        </Routes>
      </MemoryRouter>
    );
    // o mock de framer-motion remonta a árvore a cada render: consultar de novo em vez de guardar o nó
    await waitFor(() => expect(screen.getByText('FichaScreen')).toBeInTheDocument());
    expect(screen.getByTestId('materiais-ficha-screen')).toHaveAttribute('data-etapa', 'ficha');
  });
});
