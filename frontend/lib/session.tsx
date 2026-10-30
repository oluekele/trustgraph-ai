'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, setUnauthorizedHandler } from './api';
import { type Action, can as canRole, hasRole } from './permissions';
import type { Role, SessionUser } from './types';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

interface SessionValue {
  status: SessionStatus;
  user: SessionUser | null;
  /** Set when /auth/me failed for a reason other than 401 (e.g. gateway down). */
  error: ApiError | null;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (action: Action) => boolean;
  atLeast: (role: Role) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await api.me();
      setUser(me);
      setError(null);
      setStatus('authenticated');
    } catch (err) {
      setUser(null);
      if (err instanceof ApiError && err.status === 401) {
        setError(null);
        setStatus('unauthenticated');
      } else {
        setError(err instanceof ApiError ? err : new ApiError(0, 'Unable to verify session.'));
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('unauthenticated');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: signedIn } = await api.login(email, password);
    setUser(signedIn);
    setError(null);
    setStatus('authenticated');
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Clearing local state is enough if the gateway is unreachable.
    }
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      error,
      login,
      logout,
      refresh,
      can: (action) => canRole(user?.role, action),
      atLeast: (role) => hasRole(user?.role, role),
    }),
    [status, user, error, login, logout, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
