import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "@vestoxr/shared";
import { apiFetch } from "../lib/api.js";

export interface SessionUser {
  id: string;
  email: string;
  role: Role | null;
  organizationId: string | null;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { user } = await apiFetch<{ user: SessionUser | null }>("/auth/me");
    setUser(user);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const loggedIn = await apiFetch<SessionUser>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(loggedIn);
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider.");
  return ctx;
}
