'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export interface User {
  id: string;
  nome: string;
  email: string;
  matricula: string;
  role: 'admin' | 'colaborador' | 'root';
  ativo: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isLoading: boolean;
  isAdmin: boolean;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
  isAdmin: false,
  authFetch: async () => new Response(null, { status: 401 }),
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } catch {
        // ignore
      }
    }
    router.push('/login');
  }, [router]);

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
      if (activeToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${activeToken}`);
      }
      const res = await fetch(input, { ...init, headers });
      if (res.status === 401) {
        logout();
      }
      return res;
    },
    [token, logout]
  );

  useEffect(() => {
    let isMounted = true;

    const validateSession = async () => {
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const storedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;

      if (!storedToken) {
        if (isMounted) {
          setToken(null);
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (isMounted) {
            setUser(parsed);
            setToken(storedToken);
          }
        } catch {
          // ignore
        }
      } else if (isMounted) {
        setToken(storedToken);
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` },
        });

        if (!isMounted) return;

        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.user) {
            setUser(data.user);
            setToken(storedToken);
            localStorage.setItem('user', JSON.stringify(data.user));
          } else {
            logout();
          }
        } else if (res.status === 401 || res.status === 403) {
          logout();
        }
      } catch (err) {
        console.error('Falha ao validar sessão:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    validateSession();

    return () => {
      isMounted = false;
    };
  }, [logout]);

  useEffect(() => {
    if (!isLoading) {
      const publicRoutes = ['/login', '/forgot-password', '/reset-password'];
      const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

      if (!token && !isPublicRoute) {
        router.push('/login');
      }
    }
  }, [isLoading, token, pathname, router]);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
    }
    router.push('/');
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'root';

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading, isAdmin, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
