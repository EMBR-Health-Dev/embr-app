"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { UserDto } from "@embr/types";
import { api } from "./api";
import {
  ApiError,
  clearHadSession,
  setConsentRequiredHandler,
  setSessionExpiredHandler,
} from "./api-client";
import { consentHref, isConsentExempt, needsConsentReview } from "./consent";

interface AuthContextValue {
  user: UserDto | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setUser(me);
    } catch (err) {
      // A 401 here just means "not logged in" — not a failure worth
      // surfacing, every unauthenticated page load hits this once.
      if (!(err instanceof ApiError && err.status === 401)) {
        console.error(err);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Same reasoning as apps/admin/src/lib/auth-context.tsx's identical
    // suppression — React's own documented fetch-on-mount pattern,
    // and refresh() is also exposed via context for other callers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // api-client.ts is a plain module with no access to Next's router
    // or this component's state — this registration is what lets it
    // hand off "a real session just ended" (discovered from inside a
    // failed apiFetch call, which could be triggered by any page) to
    // the one place that already owns both concerns. Reuses the
    // existing reason= query-param convention settings/page.tsx
    // already established for "password-changed" — same mechanism,
    // new value, not a new one invented for this.
    setSessionExpiredHandler(() => {
      setUser(null);
      router.replace("/login?reason=session-expired");
    });
    return () => setSessionExpiredHandler(null);
  }, [router]);

  // Consent gate, UI side. The API is the real control (403
  // CONSENT_REQUIRED on every health route); this keeps people from
  // landing on pages that would only fail. Covers every way into the
  // app in one place: login, SSO sign-in (which never passes through
  // the registration form), existing users when a version is raised,
  // and a bookmarked deep link.
  useEffect(() => {
    if (loading || !pathname || isConsentExempt(pathname)) return;
    if (needsConsentReview(user)) router.replace(consentHref(pathname));
  }, [loading, user, pathname, router]);

  useEffect(() => {
    setConsentRequiredHandler(() => {
      const here = window.location.pathname;
      if (!isConsentExempt(here)) router.replace(consentHref(here));
    });
    return () => setConsentRequiredHandler(null);
  }, [router]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    clearHadSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
