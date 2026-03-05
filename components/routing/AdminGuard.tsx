import React from 'react';
import { Navigate } from 'react-router-dom';

interface AdminGuardProps {
  isAdmin: boolean;
  isAuthenticated: boolean;
  children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ isAdmin, isAuthenticated, children }) => {
  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/login" state={{ adminRequired: true }} replace />;
  }

  return <>{children}</>;
};
