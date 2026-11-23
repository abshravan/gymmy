"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokens } from "./api";
import type { Me } from "./types";

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (body: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  can: (perm: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!tokens.access) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api<Me>("/auth/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = async (email: string, password: string) => {
    const t = await api<{ access_token: string; refresh_token: string }>("/auth/login", {
      body: { email, password },
    });
    tokens.set(t.access_token, t.refresh_token);
    await loadMe();
  };

  const signup = async (body: Record<string, string>) => {
    const t = await api<{ access_token: string; refresh_token: string }>("/auth/signup", { body });
    tokens.set(t.access_token, t.refresh_token);
    await loadMe();
  };

  const logout = async () => {
    const rt = tokens.refresh;
    if (rt) await api("/auth/logout", { body: { refresh_token: rt } }).catch(() => undefined);
    tokens.clear();
    setMe(null);
  };

  const can = (perm: string) => !!me?.permissions.includes(perm);

  return (
    <AuthContext.Provider value={{ me, loading, login, signup, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
