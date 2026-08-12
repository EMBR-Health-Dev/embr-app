import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserDto } from "@embr/types";
import { api } from "./api";
import { ApiError } from "./api-client";
import { tokenStorage } from "./token-storage";

interface AuthContextValue {
  user: UserDto | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<UserDto>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const stored = await tokenStorage.get();
    if (!stored) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      // apiFetch transparently refreshes if the access token happens
      // to be expired (see api-client.ts) — this either succeeds with
      // a valid session, or the stored tokens are genuinely dead and
      // it throws, same as apps/web's equivalent 401-means-logged-out
      // read.
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
    void loadUser();
  }, [loadUser]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.auth.login({ email, password });
    await tokenStorage.set({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
    setUser(session.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    // Matches apps/web: registering does not log the user in — email
    // verification is required first (see Milestone 2) — so this
    // returns the created account and the caller sends them to a
    // "check your email" screen rather than into the authenticated area.
    return api.auth.register({ email, password });
  }, []);

  const logout = useCallback(async () => {
    const stored = await tokenStorage.get();
    if (stored) {
      // Best-effort — if this fails (e.g. already revoked elsewhere,
      // or no network), the local session still needs to end. Losing
      // the local session state over a server call that didn't
      // strictly need to succeed would strand the user logged in on
      // this device with no way back to the login screen.
      await api.auth.logout(stored.refreshToken).catch(() => {});
    }
    await tokenStorage.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
