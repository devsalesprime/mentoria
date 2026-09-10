import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

/**
 * Tela de Início e as regras de menu decididas em 10/09.
 *
 * Três personas, um menu para cada:
 *   nova     -> Início + os 3 itens do script, e nada da versão anterior
 *   legado   -> os mesmos, mais o item "Versão anterior" (o admin marcou a conta)
 *   enviada  -> igual ao legado (a pessoa concluiu a versão anterior sozinha)
 * O ponto do item "Como funciona" só acende depois que a pessoa abre a tela.
 * Quem entra pela primeira vez passa pela explicação e cai no Início.
 */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.assinatura`;
}
const EXP = Math.floor(Date.now() / 1000) + 3600;
const EMAIL = 'ana@exemplo.com';
const TOKEN_ROSTER = jwt({ userId: 'u1', user: EMAIL, name: 'Ana', role: 'member', cohort: 'exclusive', clubSlug: 'elos', exp: EXP });
const TOKEN_CLUB = jwt({ userId: 'u2', user: EMAIL, name: 'Ana', role: 'member', cohort: 'club', clubSlug: 'u-ana-abc123', exp: EXP });

const VISTO = '2026-09-01T10:00:00.000Z';

function fichaMock(over: Record<string, unknown> = {}) {
  return {
    club: { slug: 'elos', nome: 'Elos Club' },
    ficha_status: 'pre_preenchida',
    modo: 'completo',
    confirmada_por: null,
    suficiencia: null,
    materials_status: 'submitted',
    materials_submitted_at: '2026-09-01 10:00:00',
    materials: { links: [], observacoes: '', acessos: [], submitted_at: '2026-09-01 10:00:00' },
    job: null,
    script: { versoes: 0, ultima: null, aprovada: null, job: null, entregaveis: {} },
    config: { prazo_materiais: '' },
    visto_como_funciona: VISTO,
    visto_whatsapp_lembrete: VISTO,
    prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [], blocos: [], hoje: {}, dias: [],
    progresso: { total: 34, decididos: 12, obrigatorios: 34, obrigatorios_decididos: 12, confirmados: 12, editados: 0, aceitos_vazios: 0 },
    ...over,
  };
}

type Persona = { cohort: string; status?: string; is_legacy?: boolean; ficha?: Record<string, unknown> };
function mockApi({ cohort, status = 'in_progress', is_legacy = false, ficha = {} }: Persona) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/diagnostic') {
      return { data: { success: true, data: {
        pre_module: {}, mentor: {}, mentee: {}, method: {}, offer: {},
        current_module: 'pre_module', current_step: 0, progress_percentage: 0, status, is_legacy,
        cohort, club_slug: 'elos', club_nome: 'Elos Club', club_produto: cohort,
      } } };
    }
    if (url === '/api/script/ficha') return { data: { success: true, data: fichaMock(ficha) } };
    if (url === '/api/script/tempos') return { data: { success: true, data: {} } };
    if (url === '/api/brand-brain' || url === '/api/assets' || url === '/api/insights') return { data: { success: true, data: null } };
    throw new Error('url inesperada ' + url);
  });
  (axios.put as any).mockResolvedValue({ data: { success: true } });
}

function renderEm(rota: string, token = TOKEN_ROSTER) {
  const dash = <Dashboard userEmail={EMAIL} userName="Ana" userDescription="" onUpdateProfile={vi.fn()} onLogout={vi.fn()} token={token} />;
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/dashboard" element={dash} />
        <Route path="/dashboard/:module" element={dash} />
      </Routes>
    </MemoryRouter>
  );
}

const nav = () => screen.getByRole('navigation', { name: 'Navegação do diagnóstico' });
const itensDoMenu = () => Array.from(nav().querySelectorAll('button')).map((b) => b.textContent?.trim() || '');
const itemDoMenu = (rotulo: string) =>
  Array.from(nav().querySelectorAll('button')).find((b) => (b.textContent || '').trim().startsWith(rotulo))!;

describe('menu das três personas', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it('pessoa nova do roster: Início primeiro, os 3 itens do script e nada da versão anterior', async () => {
    mockApi({ cohort: 'exclusive' });
    renderEm('/dashboard');
    await screen.findByText('FichaScreen');
    expect(itensDoMenu()).toEqual(['Início', 'Como funciona', 'Base do script', 'Seu script']);
    expect(screen.queryByTestId('versao-anterior')).toBeNull();
    expect(screen.queryByText('Visão Geral')).toBeNull();
  });

  it('pessoa nova de clube próprio (cohort "club") vê o mesmo menu', async () => {
    mockApi({ cohort: 'club' });
    renderEm('/dashboard', TOKEN_CLUB);
    await screen.findByText('FichaScreen');
    expect(itensDoMenu()).toEqual(['Início', 'Como funciona', 'Base do script', 'Seu script']);
  });

  it('conta marcada como legado: Início, os 3 itens e o item "Versão anterior"', async () => {
    mockApi({ cohort: 'exclusive', is_legacy: true });
    renderEm('/dashboard');
    await screen.findByText('FichaScreen');
    await screen.findByTestId('versao-anterior');
    const itens = itensDoMenu();
    expect(itens[0]).toBe('Início');
    expect(itens.indexOf('Seu script')).toBeLessThan(itens.findIndex((t) => t.startsWith('Versão anterior')));
  });

  it('quem concluiu a versão anterior (submitted) tem o mesmo menu do legado', async () => {
    mockApi({ cohort: 'exclusive', status: 'submitted' });
    renderEm('/dashboard');
    await screen.findByText('FichaScreen');
    await screen.findByTestId('versao-anterior');
    expect(itensDoMenu()[0]).toBe('Início');
  });
});

describe('o ponto do item "Como funciona"', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it('sem ponto enquanto a pessoa nunca abriu a explicação', async () => {
    // `visto_como_funciona` null manda a pessoa para a explicação; o item ainda não tem ponto
    mockApi({ cohort: 'exclusive', ficha: { visto_como_funciona: null } });
    renderEm('/dashboard/materiais-ficha');
    await screen.findByText('FichaScreen');
    expect(itemDoMenu('Como funciona').querySelector('span.rounded-full')).toBeNull();
  });

  it('depois de aberta, o mesmo ponto verde dos itens concluídos', async () => {
    mockApi({ cohort: 'exclusive' });
    renderEm('/dashboard');
    await screen.findByText('FichaScreen');
    const ponto = itemDoMenu('Como funciona').querySelector('span.rounded-full')!;
    expect(ponto).not.toBeNull();
    expect(ponto.getAttribute('data-dot')).toBe('green');
    expect(ponto.className).toContain('bg-green-400');
    // O ponto cinza saiu deste item: ou não há ponto, ou ele é o verde dos concluídos
    expect(itemDoMenu('Como funciona').querySelector('span[data-dot="gray"]')).toBeNull();
  });
});

describe('a entrada do membro novo termina no Início', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it('quem nunca viu a explicação cai nela e o botão leva para o Início', async () => {
    mockApi({ cohort: 'exclusive', ficha: { visto_como_funciona: null } });
    renderEm('/dashboard');
    await screen.findByTestId('como-funciona-screen');
    fireEvent.click(screen.getByTestId('comecar-script'));
    await screen.findByTestId('inicio-screen');
    expect(screen.getByRole('heading', { name: 'Bem-vindo, Ana' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument();
  });

  it('o item "Início" do menu abre a tela com os três cartões', async () => {
    mockApi({ cohort: 'exclusive' });
    renderEm('/dashboard');
    await screen.findByText('FichaScreen');
    fireEvent.click(itemDoMenu('Início'));
    await screen.findByTestId('inicio-screen');
    expect(screen.getByTestId('inicio-card-base')).toBeInTheDocument();
    expect(screen.getByTestId('inicio-card-script')).toBeInTheDocument();
    expect(screen.getByTestId('inicio-card-apresentacao')).toBeInTheDocument();
  });
});

describe('cartão "Versão anterior" do Início', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it('não aparece para quem nunca concluiu a versão anterior', async () => {
    mockApi({ cohort: 'exclusive' });
    renderEm('/dashboard/inicio');
    await screen.findByTestId('inicio-screen');
    expect(screen.queryByTestId('inicio-card-anterior')).toBeNull();
  });

  it('para o legado, o cartão revela o item no menu e abre a tela antiga', async () => {
    mockApi({ cohort: 'exclusive', is_legacy: true });
    renderEm('/dashboard/inicio');
    await screen.findByTestId('inicio-card-anterior');
    fireEvent.click(screen.getByTestId('inicio-abrir-anterior'));
    await screen.findByText('OverviewPanel');
    await waitFor(() => expect(screen.getByTestId('versao-anterior')).toHaveTextContent('Ocultar versão anterior'));
    expect(within(nav()).getByText('O Mentor')).toBeInTheDocument();
    expect(localStorage.getItem(`versao-anterior:${EMAIL}`)).toBe('1');
  });
});
