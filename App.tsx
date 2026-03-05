import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { AdminPanel } from './components/AdminPanel';
import { AuthGuard } from './components/routing/AuthGuard';
import { AdminGuard } from './components/routing/AdminGuard';
import { NotFound } from './components/routing/NotFound';
import { LandingPage } from './components/routing/LandingPage';
import { LoginPage } from './components/routing/LoginPage';

interface UserData {
  name: string;
  email: string;
  description?: string;
  token: string;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState<string>('');

  // Restore member session from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('memberToken');
    if (savedToken) {
      try {
        const payload = JSON.parse(atob(savedToken.split('.')[1]));
        if (payload.exp && payload.exp * 1000 > Date.now()) {
          setUserData({
            name: payload.name || 'Membro',
            email: payload.user || '',
            description: '',
            token: savedToken,
          });
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('memberToken');
        }
      } catch {
        localStorage.removeItem('memberToken');
      }
    }

    // Restore admin session from localStorage
    const savedAdminToken = localStorage.getItem('adminToken');
    if (savedAdminToken) {
      try {
        const payload = JSON.parse(atob(savedAdminToken.split('.')[1]));
        if (payload.exp && payload.exp * 1000 > Date.now()) {
          setAdminToken(savedAdminToken);
          setIsAuthenticated(true);
          setIsAdmin(true);
        } else {
          localStorage.removeItem('adminToken');
        }
      } catch {
        localStorage.removeItem('adminToken');
      }
    }
  }, []);

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
