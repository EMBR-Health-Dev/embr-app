import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { router } from "expo-router";
import type { AuthSessionResponse, UserDto } from "@embr/types";
import { api } from "./api";
import { ApiError, setSessionExpiredHandler } from "./api-client";
import { clearReminder } from "./reminders";
import { tokenStorage } from "./token-storage";

/**
 * A correct password either signs her in, or, with two-step sign in on,
 * asks for the code from her authenticator app (completeMfa).
 */
export type LoginResult = { user: UserDto } | { mfaToken: string };

interface AuthContextValue {
  user: UserDto | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeMfa: (mfaToken: string, code: string) => Promise<UserDto>;
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
    // Matches React's own documented fetch-on-mount pattern
    // (react.dev/learn/synchronizing-with-effects#fetching-data); same
    // suppression as the identical case in apps/web and
    // apps/admin's auth-context.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    // api-client.ts is a plain module with no access to expo-router or
    // this component's state — this registration is what lets it hand
    // off "a real session just ended" (discovered from inside a failed
    // apiFetch call, which could be triggered by any screen) to the
    // one place that already owns both concerns. Reuses the existing
    // reason= query-param convention settings.tsx already established
    // for "password-changed" — same mechanism, new value.
    setSessionExpiredHandler(() => {
      setUser(null);
      router.replace("/login?reason=session-expired");
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const startSession = useCallback(async (session: AuthSessionResponse) => {
    await tokenStorage.set({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
    setUser(session.user);
    return session.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const result = await api.auth.login({ email, password });
      // No tokens yet: nothing is stored until the code is accepted.
      if ("mfaRequired" in result && result.mfaRequired) return { mfaToken: result.mfaToken };
      return { user: await startSession(result as AuthSessionResponse) };
    },
    [startSession],
  );

  const completeMfa = useCallback(
    async (mfaToken: string, code: string) =>
      startSession(await api.auth.completeMfa({ mfaToken, code })),
    [startSession],
  );

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
    // A reminder belongs to this person; the next account on this phone starts without one.
    await clearReminder().catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, completeMfa, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
