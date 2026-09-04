import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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

// Mock heavy child modules to keep Dashboard test as a smoke test
vi.mock('../../components/modules/PreModule', () => ({
  PreModule: () => React.createElement('div', null, 'PreModule'),
}));
vi.mock('../../components/modules/MentorModule', () => ({
  MentorModule: () => React.createElement('div', null, 'MentorModule'),
}));
vi.mock('../../components/modules/MenteeModule', () => ({
  MenteeModule: () => React.createElement('div', null, 'MenteeModule'),
}));
vi.mock('../../components/modules/MethodModule', () => ({
  MethodModule: () => React.createElement('div', null, 'MethodModule'),
}));
vi.mock('../../components/modules/OfferModule', () => ({
  OfferModule: () => React.createElement('div', null, 'OfferModule'),
}));
vi.mock('../../components/OverviewPanel', () => ({
  OverviewPanel: () => React.createElement('div', null, 'OverviewPanel'),
}));
// Script 7 Passos (cohort) — heavy screens mocked; the hook itself is a no-op without cohort
vi.mock('../../components/script/FichaScreen', () => ({
  FichaScreen: () => React.createElement('div', null, 'FichaScreen'),
}));
vi.mock('../../components/script/MateriaisScreen', () => ({
  MateriaisScreen: () => React.createElement('div', null, 'MateriaisScreen'),
}));
vi.mock('../../components/script/ScriptScreen', () => ({
  ScriptScreen: () => React.createElement('div', null, 'ScriptScreen'),
}));

const mockFetch = vi.fn((_url: string, _init?: RequestInit) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
);
vi.stubGlobal('fetch', mockFetch);

import { Dashboard } from '../../components/Dashboard';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.assinatura`;
}
const EXP = Math.floor(Date.now() / 1000) + 3600;
/** Token de antes da claim `cohort` (ate 03/09): so userId/user/name. */
const TOKEN_SEM_COHORT = jwt({ userId: 'u1', user: 'ana@exemplo.com', name: 'Ana', role: 'member', exp: EXP });
const TOKEN_COM_COHORT = jwt({ userId: 'u1', user: 'ana@exemplo.com', name: 'Ana', role: 'member', cohort: 'exclusive', clubSlug: 'elos', exp: EXP });

const FICHA = {
  club: { slug: 'elos', nome: 'Elos Club' },
  ficha_status: 'pre_preenchida',
  materials_status: 'submitted',
  materials_submitted_at: '2026-09-01 10:00:00',
  materials: { links: [], observacoes: '', acessos: [], submitted_at: '2026-09-01 10:00:00' },
  job: null,
  script: { versoes: 1, ultima: { versao: 1, status: 'rascunho', created_at: '2026-09-02 10:00:00' }, aprovada: null, job: null },
  config: { prazo_materiais: '' },
  prefilled_at: null,
  reviewed_at: null,
  last_user_activity_at: null,
  categorias: [],
  files: [],
  blocos: [],
  hoje: {},
  progresso: {},
  dias: [],
};

function mockApi({ cohort }: { cohort: string | null }) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/diagnostic') {
      return { data: { success: true, data: {
        pre_module: {}, mentor: {}, mentee: {}, method: {}, offer: {},
        current_module: 'pre_module', current_step: 0, progress_percentage: 0, status: 'in_progress',
        cohort, club_slug: cohort ? 'elos' : null, club_nome: cohort ? 'Elos Club' : null,
      } } };
    }
    if (url === '/api/script/ficha') {
      if (!cohort) { const e: any = new Error('403'); e.response = { status: 403 }; throw e; }
      return { data: { success: true, data: FICHA } };
    }
    if (url === '/api/brand-brain' || url === '/api/assets' || url === '/api/insights') {
      return { data: { success: true, data: null } };
    }
    throw new Error('url inesperada ' + url);
  });
}

function renderDashboard(props: Partial<React.ComponentProps<typeof Dashboard>> = {}) {
  return render(
    <MemoryRouter>
      <Dashboard
        userEmail="ana@exemplo.com"
        userName="Ana"
        userDescription=""
        onUpdateProfile={vi.fn()}
        onLogout={vi.fn()}
        token={TOKEN_SEM_COHORT}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    mockFetch.mockClear();
    mockFetch.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    mockApi({ cohort: null });
  });

  it('renders without crashing with required props', async () => {
    const { container } = renderDashboard({ initialModule: 'preModule' });
    expect(container).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.getByRole('navigation', { name: 'Navegação do diagnóstico' })).toBeInTheDocument();
  });

  it('renders with all string props provided', async () => {
    const { container } = renderDashboard({ userDescription: 'A description', initialModule: 'mentor' });
    expect(container).toBeTruthy();
    expect(await screen.findByText('MentorModule')).toBeInTheDocument();
  });

  it('holds the shell (spinner) until GET /api/diagnostic answers when the token has no cohort claim', async () => {
    renderDashboard();
    expect(screen.getByRole('status')).toHaveTextContent('Abrindo a plataforma');
    expect(screen.queryByRole('heading', { name: 'Visão Geral' })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Visão Geral' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not show the Script 7 Passos section for non-cohort users', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Visão Geral' })).toBeInTheDocument();
    expect(screen.queryByText('SCRIPT 7 PASSOS')).toBeNull();
    expect(screen.queryByText('Ficha do Script')).toBeNull();
    // Sem cohort no banco, nao renova token
    expect(mockFetch).not.toHaveBeenCalledWith('/auth/verify-member', expect.anything());
  });

  it('token WITHOUT cohort: the section appears as soon as /api/diagnostic answers with cohort (first paint, no F5)', async () => {
    mockApi({ cohort: 'exclusive' });
    renderDashboard();
    // Enquanto o diagnostic nao responde, nem o menu e pintado (nada de secao entrando depois)
    expect(screen.queryByRole('heading', { name: 'Visão Geral' })).toBeNull();
    await screen.findByText('SCRIPT 7 PASSOS');
    // Re-consulta dentro do nav: o mock de framer-motion remonta o aside a cada render (o elemento do findBy fica
    // destacado) e, depois do redirecionamento para a Ficha, o h1 tambem diz "Ficha do Script"
    const nav = within(screen.getByRole('navigation', { name: 'Navegação do diagnóstico' }));
    expect(nav.getByText('SCRIPT 7 PASSOS')).toBeInTheDocument();
    expect(nav.getByText('Materiais')).toBeInTheDocument();
    expect(nav.getByText('Ficha do Script')).toBeInTheDocument();
    expect(nav.getByText('Seu script')).toBeInTheDocument();
    // O hook buscou a ficha quando enabled virou true (false -> true)
    expect(axios.get).toHaveBeenCalledWith('/api/script/ficha', expect.anything());
  });

  it('token WITHOUT cohort but cohort in the DB: refreshes the token silently once (POST /auth/verify-member)', async () => {
    mockApi({ cohort: 'exclusive' });
    mockFetch.mockImplementation((url: string) => {
      if (url === '/auth/verify-member') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, allowed: true, token: TOKEN_COM_COHORT, user: { email: 'ana@exemplo.com', name: 'Ana', cohort: 'exclusive' } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    const onTokenRefresh = vi.fn();
    const { unmount } = renderDashboard({ onTokenRefresh });

    await waitFor(() => expect(onTokenRefresh).toHaveBeenCalledWith(TOKEN_COM_COHORT));
    expect(localStorage.getItem('memberToken')).toBe(TOKEN_COM_COHORT);
    const chamadas = mockFetch.mock.calls.filter(([url]) => url === '/auth/verify-member');
    expect(chamadas).toHaveLength(1);
    expect(JSON.parse(String((chamadas[0][1] as RequestInit).body))).toEqual({ email: 'ana@exemplo.com' });

    // Segunda montagem na mesma sessao: guard no sessionStorage, nao renova de novo
    unmount();
    renderDashboard({ onTokenRefresh });
    await screen.findByText('SCRIPT 7 PASSOS');
    expect(mockFetch.mock.calls.filter(([url]) => url === '/auth/verify-member')).toHaveLength(1);
  });

  it('token WITH cohort claim: the section is on the very first paint, before /api/diagnostic', () => {
    mockApi({ cohort: 'exclusive' });
    renderDashboard({ token: TOKEN_COM_COHORT });
    expect(screen.getByText('SCRIPT 7 PASSOS')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
