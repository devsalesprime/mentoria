import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
import { rotaInicialDoClube, fichaEhSecundaria } from '../../hooks/useScriptFicha';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.assinatura`;
}
const TOKEN = jwt({ userId: 'u1', user: 'ana@exemplo.com', name: 'Ana', role: 'member', cohort: 'exclusive', clubSlug: 'elos', exp: Math.floor(Date.now() / 1000) + 3600 });

function fichaMock(over: Record<string, unknown>) {
  return {
    club: { slug: 'elos', nome: 'Elos Club' },
    ficha_status: 'pre_preenchida',
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

describe('rotaInicialDoClube / fichaEhSecundaria', () => {
  it('vazia -> Materiais; suficiente ou confirmada -> Seu script; parcial / insuficiente / sem avaliação -> Ficha; reaberta -> Ficha', () => {
    expect(rotaInicialDoClube({ ficha_status: 'vazia', suficiencia: null })).toBe('script_materiais');
    expect(rotaInicialDoClube({ ficha_status: 'pre_preenchida', suficiencia: null })).toBe('script_ficha');
    expect(rotaInicialDoClube({ ficha_status: 'confirmada', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] } })).toBe('script_script');
    expect(rotaInicialDoClube({ ficha_status: 'confirmada', suficiencia: null })).toBe('script_script');
    expect(rotaInicialDoClube({ ficha_status: 'pre_preenchida', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] } })).toBe('script_script');
    expect(rotaInicialDoClube({ ficha_status: 'pre_preenchida', suficiencia: { resultado: 'parcial', faltam: ['3.3'], motivos: [] } })).toBe('script_ficha');
    expect(rotaInicialDoClube({ ficha_status: 'pre_preenchida', suficiencia: { resultado: 'insuficiente', faltam: [], motivos: [] } })).toBe('script_ficha');
    expect(rotaInicialDoClube({ ficha_status: 'em_revisao', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] } })).toBe('script_ficha');
    expect(fichaEhSecundaria({ ficha_status: 'confirmada', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] } })).toBe(true);
    expect(fichaEhSecundaria({ ficha_status: 'em_revisao', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] } })).toBe(false);
    expect(fichaEhSecundaria({ ficha_status: 'pre_preenchida', suficiencia: { resultado: 'parcial', faltam: ['3.3'], motivos: [] } })).toBe(false);
  });
});

describe('Dashboard: rota inicial pelo resultado da suficiência', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it('suficiente: cai em "Seu script" e o menu mostra "Ficha" como item secundário depois de "Seu script"', async () => {
    mockApi(fichaMock({ ficha_status: 'confirmada', confirmada_por: 'automatica', suficiencia: { resultado: 'suficiente', faltam: [], motivos: [] }, script: { versoes: 0, ultima: null, aprovada: null, job: { id: 'j1', tipo: 'script', status: 'queued' } } }));
    renderDashboard();
    expect(await screen.findByText('ScriptScreen')).toBeInTheDocument();
    expect(screen.queryByText('FichaScreen')).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Navegação do diagnóstico' });
    const itens = Array.from(nav.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(itens.indexOf('Seu script')).toBeLessThan(itens.indexOf('Ficha'));
    expect(itens).not.toContain('Ficha do Script');
    const secundario = Array.from(nav.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ficha')!;
    expect(secundario).toHaveAttribute('data-secondary', 'true');
  });

  it('parcial: cai na Ficha (o wizard abre no que falta) e "Ficha do Script" segue como etapa', async () => {
    mockApi(fichaMock({ suficiencia: { resultado: 'parcial', faltam: ['3.3', '5.3'], motivos: [] } }));
    renderDashboard();
    expect(await screen.findByText('FichaScreen')).toBeInTheDocument();
    // "Ficha do Script" aparece como item do menu (etapa) e no título da tela
    expect(screen.getByRole('heading', { name: 'Ficha do Script' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navegação do diagnóstico' });
    const itens = Array.from(nav.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(itens).toContain('Ficha do Script');
    expect(itens).not.toContain('Ficha');
    expect(screen.queryByText('ScriptScreen')).toBeNull();
  });

  it('insuficiente: cai na Ficha; ficha vazia: cai em Materiais', async () => {
    mockApi(fichaMock({ suficiencia: { resultado: 'insuficiente', faltam: [], motivos: [] } }));
    const { unmount } = renderDashboard();
    expect(await screen.findByText('FichaScreen')).toBeInTheDocument();
    unmount();
    mockApi(fichaMock({ ficha_status: 'vazia' }));
    renderDashboard();
    await waitFor(() => expect(screen.getByText('MateriaisScreen')).toBeInTheDocument());
  });
});
