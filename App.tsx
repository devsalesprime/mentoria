import React, { useCallback, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { AdminPanel } from './components/AdminPanel';
import { AuthGuard } from './components/routing/AuthGuard';
import { AdminGuard } from './components/routing/AdminGuard';
import { NotFound } from './components/routing/NotFound';
import { LandingPage } from './components/routing/LandingPage';
import { LoginPage } from './components/routing/LoginPage';
import { lerSessaoAdmin, lerSessaoMembro } from './components/routing/session';

interface UserData {
  name: string;
  email: string;
  description?: string;
  token: string;
}

function App() {
  // Sessao restaurada de forma SINCRONA (lazy initializer): o PRIMEIRO render ja sai autenticado.
  // Antes era um useEffect: o primeiro render de um acesso frio em /dashboard/... caia no AuthGuard
  // (-> /login) e o LoginPage montava ja autenticado com navigate() durante o render (descartado
  // pelo React Router 7) devolvendo null = tela em branco ate o F5, alem de perder a rota pedida.
  const [sessaoInicial] = useState(() => ({ membro: lerSessaoMembro(), admin: lerSessaoAdmin() }));
  const [isAuthenticated, setIsAuthenticated] = useState(!!sessaoInicial.membro || !!sessaoInicial.admin);
  const [userData, setUserData] = useState<UserData | null>(sessaoInicial.membro);
  const [isAdmin, setIsAdmin] = useState(!!sessaoInicial.admin);
  const [adminToken, setAdminToken] = useState<string>(sessaoInicial.admin);

  const handleLoginSuccess = (data: UserData) => {
    setUserData({ ...data, description: '' });
    setIsAuthenticated(true);
    setIsAdmin(false);
  };

  const handleAdminLogin = (token: string) => {
    setAdminToken(token);
    localStorage.setItem('adminToken', token);
    setIsAuthenticated(true);
    setIsAdmin(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('memberToken');
    localStorage.removeItem('adminToken');
    setIsAuthenticated(false);
    setUserData(null);
    setIsAdmin(false);
    setAdminToken('');
  };

  const handleUpdateProfile = (data: { name: string; description: string }) => {
    if (userData) {
      setUserData({ ...userData, name: data.name, description: data.description });
    }
  };

  // Token renovado em silencio pelo Dashboard (JWT antigo sem a claim `cohort`): troca so o token,
  // a pessoa continua logada. O localStorage ja foi atualizado por quem renovou.
  const handleTokenRefresh = useCallback((token: string) => {
    setUserData((prev) => (prev ? { ...prev, token } : prev));
  }, []);

  // Determine if member (non-admin) is authenticated
  const isMemberAuthenticated = isAuthenticated && !isAdmin && !!userData;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        {/* Landing page */}
        <Route path="/" element={
          isMemberAuthenticated ? <Navigate to="/dashboard" replace /> :
          isAdmin ? <Navigate to="/admin" replace /> :
          <LandingPage />
        } />

        {/* Login */}
        <Route path="/login" element={
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
            onAdminLogin={handleAdminLogin}
            isAuthenticated={isAuthenticated}
            isAdmin={isAdmin}
          />
        } />

        {/* Dashboard routes (member auth required) */}
        <Route path="/dashboard" element={
          <AuthGuard isAuthenticated={isMemberAuthenticated}>
            <Dashboard
              userEmail={userData?.email || ''}
              userName={userData?.name || 'Membro'}
              userDescription={userData?.description || ''}
              onUpdateProfile={handleUpdateProfile}
              onLogout={handleLogout}
              token={userData?.token || ''}
              onTokenRefresh={handleTokenRefresh}
            />
          </AuthGuard>
        } />
        <Route path="/dashboard/:module" element={
          <AuthGuard isAuthenticated={isMemberAuthenticated}>
            <Dashboard
              userEmail={userData?.email || ''}
              userName={userData?.name || 'Membro'}
              userDescription={userData?.description || ''}
              onUpdateProfile={handleUpdateProfile}
              onLogout={handleLogout}
              token={userData?.token || ''}
              onTokenRefresh={handleTokenRefresh}
            />
          </AuthGuard>
        } />

        {/* Brand Brain (member auth required) */}
        <Route path="/brand-brain" element={
          <AuthGuard isAuthenticated={isMemberAuthenticated}>
            <Dashboard
              userEmail={userData?.email || ''}
              userName={userData?.name || 'Membro'}
              userDescription={userData?.description || ''}
              onUpdateProfile={handleUpdateProfile}
              onLogout={handleLogout}
              token={userData?.token || ''}
              onTokenRefresh={handleTokenRefresh}
              initialModule="brand_brain_review"
            />
          </AuthGuard>
        } />

        {/* Assets (member auth required) */}
        <Route path="/assets" element={
          <AuthGuard isAuthenticated={isMemberAuthenticated}>
            <Dashboard
              userEmail={userData?.email || ''}
              userName={userData?.name || 'Membro'}
              userDescription={userData?.description || ''}
              onUpdateProfile={handleUpdateProfile}
              onLogout={handleLogout}
              token={userData?.token || ''}
              onTokenRefresh={handleTokenRefresh}
              initialModule="deliverables"
            />
          </AuthGuard>
        } />

        {/* Admin panel (admin auth required) */}
        <Route path="/admin" element={
          <AdminGuard isAdmin={isAdmin} isAuthenticated={isAuthenticated}>
            <AdminPanel token={adminToken} onLogout={handleLogout} />
          </AdminGuard>
        } />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
