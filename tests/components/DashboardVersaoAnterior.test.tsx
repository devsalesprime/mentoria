import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
vi.mock('../../components/insights/InsightsHub', () => ({ InsightsHub: () => React.createElement('div', null, 'InsightsHub') }));
vi.mock('../../components/script/FichaScreen', () => ({ FichaScreen: () => React.createElement('div', null, 'FichaScreen') }));
vi.mock('../../components/script/MateriaisScreen', () => ({ MateriaisScreen: () => React.createElement('div', null, 'MateriaisScreen') }));
vi.mock('../../components/script/ScriptScreen', () => ({ ScriptScreen: () => React.createElement('div', null, 'ScriptScreen') }));

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));

import { Dashboard } from '../../components/Dashboard';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.assinatura`;
}
const EXP = Math.floor(Date.now() / 1000) + 3600;
const TOKEN_CLUBE = jwt({ userId: 'u1', user: 'ana@exemplo.com', name: 'Ana', role: 'member', cohort: 'exclusive', clubSlug: 'elos', exp: EXP });
const TOKEN_FORA = jwt({ userId: 'u2', user: 'bia@exemplo.com', name: 'Bia', role: 'member', exp: EXP });
const EMAIL = 'ana@exemplo.com';

const FICHA = {
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
};

type Diag = { cohort: string | null; status?: string; is_legacy?: boolean };
function mockApi({ cohort, status = 'in_progress', is_legacy = false }: Diag) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/diagnostic') {
      return { data: { success: true, data: {
        pre_module: {}, mentor: {}, mentee: {}, method: {}, offer: {},
        current_module: 'pre_module', current_step: 0, progress_percentage: 0, status, is_legacy,
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

function renderEm(rota: string, token = TOKEN_CLUBE, email = EMAIL) {
  const dash = <Dashboard userEmail={email} userName="Ana" userDescription="" onUpdateProfile={vi.fn()} onLogout={vi.fn()} token={token} />;
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/dashboard" element={dash} />
        <Route path="/dashboard/:module" element={dash} />
      </Routes>
    </MemoryRouter>
  );
}

const itensDoMenu = () =>
  Array.from(screen.getByRole('navigation', { name: 'Navegação do diagnóstico' }).querySelectorAll('button'))
    .map((b) => b.textContent?.trim() || '');

describe('Dashboard: versão anterior x Script 7 Passos', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it('clube sem a versão anterior concluída: só a seção do script, sem Visão Geral, sem O Mentor, sem barra de progresso', async () => {
    mockApi({ cohort: 'exclusive', status: 'in_progress' });
    renderEm('/dashboard');
    await screen.findByText('FichaScreen');
    expect(screen.getByText('FichaScreen')).toBeInTheDocument();
    expect(screen.getByText('SCRIPT 7 PASSOS')).toBeInTheDocument();
    expect(screen.getByText('Materiais')).toBeInTheDocument();
    expect(screen.getByText('Seu script')).toBeInTheDocument();
    expect(screen.queryByText('Visão Geral')).toBeNull();
    expect(screen.queryByText('DIAGNÓSTICO')).toBeNull();
    expect(screen.queryByText('O Mentor')).toBeNull();
    expect(screen.queryByText('Insights')).toBeNull();
    expect(screen.queryByText('Progresso')).toBeNull();
    expect(screen.queryByTestId('versao-anterior')).toBeNull();
    expect(screen.queryByText('OverviewPanel')).toBeNull();
  });

  it('clube sem a versão anterior concluída: /dashboard/mentor cai na tela inicial do script e nunca pinta o módulo antigo', async () => {
    mockApi({ cohort: 'exclusive', status: 'in_progress' });
    renderEm('/dashboard/mentor');
    expect(screen.queryByText('MentorModule')).toBeNull();
    await screen.findByText('FichaScreen');
    expect(screen.getByText('FichaScreen')).toBeInTheDocument();
    expect(screen.queryByText('MentorModule')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Ficha do Script' })).toBeInTheDocument();
    expect(screen.queryByText('O Mentor')).toBeNull();
  });

  it('clube com a versão anterior enviada: script primeiro + item "Versão anterior"; o clique revela e o rótulo vira "Ocultar"; persiste ao remontar', async () => {
    mockApi({ cohort: 'exclusive', status: 'submitted' });
    const { unmount } = renderEm('/dashboard');
    await screen.findByText('FichaScreen');
    await screen.findByTestId('versao-anterior');
    const alternar = screen.getByTestId('versao-anterior');
    expect(alternar).toHaveTextContent('Versão anterior');
    expect(alternar).toHaveTextContent('O que você respondeu antes, com os insights');
    expect(alternar).toHaveAttribute('data-secondary', 'true');
    expect(screen.queryByText('O Mentor')).toBeNull();
    expect(screen.queryByText('Insights')).toBeNull();
    expect(screen.queryByText('Visão Geral')).toBeNull();
    // Script antes do item de alternar
    const itens = itensDoMenu();
    expect(itens.indexOf('Seu script')).toBeLessThan(itens.findIndex((t) => t.startsWith('Versão anterior')));

    // O mock de framer-motion remonta o aside a cada render: consultar o botão na hora do clique
    fireEvent.click(screen.getByTestId('versao-anterior'));
    await waitFor(() => expect(screen.getByTestId('versao-anterior')).toHaveTextContent('Ocultar versão anterior'));
    expect(screen.getByText('O Mentor')).toBeInTheDocument();
    expect(screen.getByText('Insights')).toBeInTheDocument();
    expect(screen.getByText('Visão Geral')).toBeInTheDocument();
    expect(screen.getByTestId('divisor-versao-anterior')).toBeInTheDocument();
    expect(localStorage.getItem(`versao-anterior:${EMAIL}`)).toBe('1');
    // Script continua acima da versão anterior
    const depois = itensDoMenu();
    expect(depois.indexOf('Seu script')).toBeLessThan(depois.indexOf('O Mentor'));

    unmount();
    renderEm('/dashboard');
    await screen.findByText('FichaScreen');
    await screen.findByText('O Mentor');
    expect(screen.getByText('O Mentor')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('versao-anterior')).toHaveTextContent('Ocultar versão anterior'));

    // Ocultar de novo: some e o storage lembra
    fireEvent.click(screen.getByTestId('versao-anterior'));
    await waitFor(() => expect(screen.queryByText('O Mentor')).toBeNull());
    expect(localStorage.getItem(`versao-anterior:${EMAIL}`)).toBe('0');
  });

  it('clube marcado como concluído pelo admin (is_legacy): mesmo comportamento; URL antiga direta revela a versão anterior', async () => {
    mockApi({ cohort: 'exclusive', status: 'in_progress', is_legacy: true });
    renderEm('/dashboard/mentor');
    await screen.findByText('MentorModule');
    expect(screen.getByText('MentorModule')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('versao-anterior')).toHaveTextContent('Ocultar versão anterior'));
    expect(itensDoMenu()).toContain('O Mentor'); // no menu (o h1 tambem diz "O Mentor")
    expect(localStorage.getItem(`versao-anterior:${EMAIL}`)).toBe('1');
    expect(screen.getByText('SCRIPT 7 PASSOS')).toBeInTheDocument();
    expect(screen.queryByText('Progresso')).toBeNull();
  });

  it('fora do clube: menu como sempre (Visão Geral, DIAGNÓSTICO, barra de progresso) e sem item "Versão anterior"', async () => {
    mockApi({ cohort: null, status: 'in_progress' });
    renderEm('/dashboard', TOKEN_FORA, 'bia@exemplo.com');
    await screen.findByText('OverviewPanel');
    expect(screen.getByText('OverviewPanel')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Visão Geral' })).toBeInTheDocument();
    expect(screen.getByText('DIAGNÓSTICO')).toBeInTheDocument();
    expect(screen.getByText('O Mentor')).toBeInTheDocument();
    expect(screen.getByText('Progresso')).toBeInTheDocument();
    expect(screen.queryByText('SCRIPT 7 PASSOS')).toBeNull();
    expect(screen.queryByTestId('versao-anterior')).toBeNull();
  });
});
