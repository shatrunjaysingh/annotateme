import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface Props {
  children: React.ReactNode;
  roles: string[];
}

export default function RoleRoute({ children, roles }: Props) {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (!user || !roles.includes(user.role)) return <Navigate to="/projects" replace />;
  return <>{children}</>;
}
