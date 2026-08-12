"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserDto } from "@embr/types";
import { api } from "./api";
import { ApiError } from "./api-client";

interface AuthContextValue {
  user: UserDto | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setUser(me);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        console.error(err);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Same reasoning as dashboard/page.tsx's suppression of this rule —
    // this is React's own documented fetch-on-mount pattern
    // (react.dev/learn/synchronizing-with-effects#fetching-data).
    // refresh() is also exposed via context for other callers to invoke
    // directly later, so it can't be inlined into just this effect
    // without losing that reusability.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAdmin: user?.role === "ADMIN", loading, refresh, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
