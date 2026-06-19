"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { setToken } from "../lib/api";
import type { AuthState, AuthUser } from "../types/auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);

  // Restore session from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("vl_token");
    const storedUser = sessionStorage.getItem("vl_user");
    if (stored && storedUser) {
      try {
        const u = JSON.parse(storedUser) as AuthUser;
        setTokenState(stored);
        setUser(u);
        setToken(stored);
      } catch {
        sessionStorage.removeItem("vl_token");
        sessionStorage.removeItem("vl_user");
      }
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail ?? "Login failed");
    }
    const data = (await res.json()) as {
      access_token: string;
      role: string;
      email: string;
    };
    // Decode user from token payload (safe — we trust our own backend)
    const [, payloadB64] = data.access_token.split(".");
    const payload = JSON.parse(atob(payloadB64)) as {
      sub: string;
      email: string;
      role: string;
    };
    const u: AuthUser = {
      id: parseInt(payload.sub, 10),
      email: data.email,
      role: data.role as AuthUser["role"],
    };
    setTokenState(data.access_token);
    setUser(u);
    setToken(data.access_token);
    sessionStorage.setItem("vl_token", data.access_token);
    sessionStorage.setItem("vl_user", JSON.stringify(u));
  }, []);

  const logout = useCallback(() => {
    setTokenState(null);
    setUser(null);
    setToken(null);
    sessionStorage.removeItem("vl_token");
    sessionStorage.removeItem("vl_user");
  }, []);

  const value = useMemo(
    () => ({ user, token, login, logout }),
    [user, token, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
