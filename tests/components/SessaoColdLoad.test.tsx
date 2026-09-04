import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';

/**
 * Acesso frio (token no localStorage) direto numa rota protegida.
 * Regressao da tela em branco: a sessao era restaurada num useEffect, o AuthGuard mandava para
 * /login e o LoginPage montava ja autenticado com navigate() durante o render (descartado) + null.
 */

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

vi.mock('../../components/Dashboard', async () => {
  const rr = await import('react-router-dom');
  return {
    Dashboard: (props: any) => {
      const { module } = rr.useParams<{ module?: string }>();
      return React.createElement('div', null, `Dashboard:${module || props.initialModule || 'raiz'}`);
    },
  };
});
vi.mock('../../components/LoginModal', () => ({
  LoginModal: () => React.createElement('div', null, 'LoginModal'),
}));
vi.mock('../../components/Header', () => ({ Header: () => React.createElement('div', null, 'Header') }));
vi.mock('../../components/Hero', () => ({ Hero: () => React.createElement('div', null, 'Hero') }));
vi.mock('../../components/Footer', () => ({ Footer: () => React.createElement('div', null, 'Footer') }));

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));

import App from '../../App';
import { LoginPage, destinoMembro } from '../../components/routing/LoginPage';
import { lerSessaoMembro, decodeJwtPayload } from '../../components/routing/session';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.assinatura`;
}

const AGORA = Math.floor(Date.now() / 1000);
const TOKEN_VALIDO = jwt({ userId: 'u1', user: 'ana@exemplo.com', name: 'Ana', role: 'member', exp: AGORA + 3600 });
const TOKEN_VENCIDO = jwt({ userId: 'u1', user: 'ana@exemplo.com', name: 'Ana', role: 'member', exp: AGORA - 60 });

describe('sessao: acesso frio em rota protegida', () => {
  const originalError = console.error;
  beforeAll(() => { console.error = vi.fn(); });
  afterAll(() => { console.error = originalError; });
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('com token valido em /dashboard/ficha, o PRIMEIRO render ja mostra o Dashboard na ficha (sem passar por /login)', () => {
    localStorage.setItem('memberToken', TOKEN_VALIDO);
    window.history.replaceState({}, '', '/dashboard/ficha');

    render(<App />);

    // Sincrono: nada de useEffect entre o mount e o Dashboard
    expect(screen.getByText('Dashboard:ficha')).toBeInTheDocument();
    expect(screen.queryByText('LoginModal')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard/ficha');
  });

  it('com token valido, /dashboard/ficha continua na ficha depois dos effects (sem bounce para /login)', async () => {
    localStorage.setItem('memberToken', TOKEN_VALIDO);
    window.history.replaceState({}, '', '/dashboard/ficha');

    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard/ficha'));
    expect(screen.getByText('Dashboard:ficha')).toBeInTheDocument();
  });

  it('sem token, /dashboard/ficha vai para o login guardando a origem', async () => {
    window.history.replaceState({}, '', '/dashboard/ficha');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.getByText('LoginModal')).toBeInTheDocument();
    expect((window.history.state?.usr ?? {}).from).toBe('/dashboard/ficha');
  });

  it('token vencido e descartado e cai no login', async () => {
    localStorage.setItem('memberToken', TOKEN_VENCIDO);
    window.history.replaceState({}, '', '/dashboard');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(localStorage.getItem('memberToken')).toBeNull();
  });

  it('lerSessaoMembro le o payload base64url e decodeJwtPayload tolera token ilegivel', () => {
    localStorage.setItem('memberToken', TOKEN_VALIDO);
    expect(lerSessaoMembro()).toMatchObject({ name: 'Ana', email: 'ana@exemplo.com', token: TOKEN_VALIDO });
    expect(decodeJwtPayload('nao-e-jwt')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });
});

describe('LoginPage montado ja autenticado', () => {
  const Sonda: React.FC = () => {
    const { module } = useParams<{ module?: string }>();
    return <div>Sonda:{module}</div>;
  };

  it('redireciona de forma declarativa para a rota de origem (nao devolve null para sempre)', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/dashboard/ficha' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage onLoginSuccess={vi.fn()} onAdminLogin={vi.fn()} isAuthenticated isAdmin={false} />} />
          <Route path="/dashboard/:module" element={<Sonda />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Sonda:ficha')).toBeInTheDocument();
  });

  it('sem origem, cai no modulo pedido (overview por padrao)', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage onLoginSuccess={vi.fn()} onAdminLogin={vi.fn()} isAuthenticated isAdmin={false} />} />
          <Route path="/dashboard/:module" element={<Sonda />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Sonda:overview')).toBeInTheDocument();
  });

  it('destinoMembro ignora origem invalida ou /login', () => {
    expect(destinoMembro('/dashboard/ficha', 'overview')).toBe('/dashboard/ficha');
    expect(destinoMembro('/login', 'overview')).toBe('/dashboard/overview');
    expect(destinoMembro('javascript:alert(1)', 'mentor')).toBe('/dashboard/mentor');
    expect(destinoMembro(undefined, 'mentor')).toBe('/dashboard/mentor');
  });
});
