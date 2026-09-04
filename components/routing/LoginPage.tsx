import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginModal } from '../LoginModal';

interface UserData {
  name: string;
  email: string;
  token: string;
}

interface LoginPageProps {
  onLoginSuccess: (data: UserData) => void;
  onAdminLogin: (token: string) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

/** Destino pos-login do membro: a rota protegida de origem (o AuthGuard manda `from`) ou o modulo pedido. */
export function destinoMembro(from: string | undefined | null, targetModule: string): string {
  if (from && from.startsWith('/') && !from.startsWith('/login')) return from;
  return `/dashboard/${targetModule}`;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  onAdminLogin,
  isAuthenticated,
  isAdmin,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);

  const state = location.state as { targetModule?: string; adminRequired?: boolean; from?: string } | null;
  const isAdminMode = state?.adminRequired ?? false;
  const targetModule = state?.targetModule || 'overview';
  const destino = destinoMembro(state?.from, targetModule);

  // Ja autenticado: redireciona de forma DECLARATIVA (<Navigate> navega num effect).
  // navigate() chamado durante o PRIMEIRO render e descartado pelo React Router 7 (o hook so
  // fica ativo depois do layout effect); o antigo `navigate(); return null` deixava a tela em
  // branco quando esta pagina montava ja autenticada (acesso frio em /dashboard/... -> /login).
  if (isAuthenticated) {
    return <Navigate to={isAdmin ? '/admin' : destino} replace />;
  }

  const handleMemberLogin = (data: UserData) => {
    onLoginSuccess(data);
    navigate(destino, { replace: true });
  };

  const handleAdminAccess = (token?: string) => {
    if (token) {
      onAdminLogin(token);
      navigate('/admin', { replace: true });
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-prosperus-navy flex items-center justify-center">
      <LoginModal
        isOpen={isOpen}
        onClose={handleClose}
        onLoginSuccess={handleMemberLogin}
        onAdminAccess={handleAdminAccess}
        initialAdminMode={isAdminMode}
      />
    </div>
  );
};
