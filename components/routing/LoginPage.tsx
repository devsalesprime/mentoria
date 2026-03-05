import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  onAdminLogin,
  isAuthenticated,
  isAdmin,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);

  const state = location.state as { targetModule?: string; adminRequired?: boolean } | null;
  const isAdminMode = state?.adminRequired ?? false;
  const targetModule = state?.targetModule || 'overview';

  // If already authenticated, redirect
  if (isAuthenticated) {
    if (isAdmin) {
      navigate('/admin', { replace: true });
      return null;
    }
    navigate(`/dashboard/${targetModule}`, { replace: true });
    return null;
  }

  const handleMemberLogin = (data: UserData) => {
    onLoginSuccess(data);
    navigate(`/dashboard/${targetModule}`, { replace: true });
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
