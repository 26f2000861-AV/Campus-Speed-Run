'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { UserRole, DepartmentCode } from './types';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  department_code?: DepartmentCode | null;
  full_name?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  /** Call after /api/auth/login or /register succeeded (the API already set httpOnly cookies). */
  login: (userData: AuthUser) => void;
  logout: () => Promise<void>;
  /** Re-fetch the server-verified session from /api/auth/me. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
  refresh: async () => {},
});

/** Spec 01 §4 post-login destination. */
export function homePathForRole(role: UserRole): string {
  return role === 'STUDENT' ? '/student/submit' : `/dashboard?role=${role}`;
}

function clearLegacyClientSession() {
  // Remove the old JS-writable session (pre-Contract B) if a browser still has it.
  try {
    localStorage.removeItem('csr_user');
    document.cookie = 'csr_user=; path=/; max-age=0; SameSite=Lax';
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data?.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearLegacyClientSession();
    refresh();

    const handleSync = () => {
      refresh();
    };
    window.addEventListener('focus', handleSync);
    window.addEventListener('pageshow', handleSync);
    window.addEventListener('csr_auth_change', handleSync);
    return () => {
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('pageshow', handleSync);
      window.removeEventListener('csr_auth_change', handleSync);
    };
  }, [refresh]);

  const login = useCallback(
    (userData: AuthUser) => {
      // Optimistic state from the API response; confirmed against /api/auth/me.
      setUser(userData);
      setLoading(false);
      refresh();
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      /* cookies may remain until expiry; state is still cleared locally */
    }
    setUser(null);
    window.dispatchEvent(new Event('csr_auth_change'));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
