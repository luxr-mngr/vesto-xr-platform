import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Role } from "@vestoxr/shared";
import { useAuth } from "../context/AuthContext.js";

export function ProtectedRoute({ children, requireRole }: { children: ReactNode; requireRole?: Role }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (requireRole && user.role !== requireRole) return <Navigate to="/" replace />;

  return <>{children}</>;
}
