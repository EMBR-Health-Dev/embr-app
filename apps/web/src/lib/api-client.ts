export class ApiError extends Error {
  code: string;
  status: number;
  details?: Array<{ field: string; message: string }>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// A callback auth-context.tsx registers on mount, so this plain
// module (no access to Next's router or React state) can hand off
// "a real session just ended" to the one place that already owns both
// concerns. Deliberately not wired up unconditionally — only set once
// there's a real session to report losing, so this stays a no-op for
// every path that doesn't need it (SSR, before AuthProvider mounts).
let sessionExpiredHandler: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

// The one signal that distinguishes "a real session just expired" from
// "there was never a session to begin with" — both produce an
// identical 401 from the API (see auth.service.ts's refresh()), and
// embr_rt is httpOnly, so it can't be read directly to tell them apart
// client-side either. Written to localStorage (not a module-level
// variable) specifically so it survives a full page reload — a stale
// access token discovered on first load after reopening the app days
// later is exactly as real a "your session expired" event as one
// discovered mid-session, and only a persisted signal catches both.
const HAD_SESSION_KEY = "embr_had_session";

function markHadSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HAD_SESSION_KEY, "1");
}

function hadSession(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(HAD_SESSION_KEY) === "1";
}

function clearHadSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(HAD_SESSION_KEY);
}
export { clearHadSession };

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie("embr_csrf");
  if (existing) return existing;

  const res = await fetch("/api/auth/csrf");
  const body = (await res.json()) as { csrfToken: string };
  return body.csrfToken;
}

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// Auth endpoints never go through the refresh-and-retry path below — a
// 401 from /auth/login is just "wrong password," not "your session
// expired," and retrying /auth/refresh itself on its own 401 would
// recurse. Mirrors apps/mobile/lib/api-client.ts's identical set.
const NO_REFRESH_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
]);

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Internal — set on the single retry attempt after a refresh, to
   * stop a persistently-401ing request from looping. */
  _isRetry?: boolean;
}

/**
 * Every call goes through the same-origin `/api/*` path (see
 * next.config.ts's rewrite) — the browser treats the API's cookies as
 * ordinary first-party cookies, so this client never has to think about
 * CORS. Mutating requests attach the CSRF header the API's
 * double-submit-cookie check expects (see apps/api's csrf.ts);
 * GETs don't need it.
 */
async function rawFetch<T>(path: string, options: RequestOptions): Promise<T> {
  const method = options.method ?? "GET";

  const searchParams = new URLSearchParams();
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) searchParams.set(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  const url = `/api${path}${queryString ? `?${queryString}` : ""}`;

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (MUTATING_METHODS.has(method)) {
    headers["x-csrf-token"] = await ensureCsrfToken();
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: "same-origin",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const err = json?.error ?? { code: "UNKNOWN", message: "Something went wrong" };
    throw new ApiError(res.status, err.code, err.message, err.details);
  }

  return json.data as T;
}

// Concurrent requests that all 401 at once (e.g. a screen firing off
// several calls right as the 15-minute access token expires) must
// share one refresh attempt, not each fire their own — refresh tokens
// rotate on use, so a second concurrent call would present an
// already-rotated-away cookie and fail even though the first one
// succeeded. Mirrors apps/mobile/lib/api-client.ts's identical
// refreshInFlight de-duplication.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        // No body needed — the API reads the refresh token straight
        // from the (now correctly /api/auth-scoped, see cookies.ts's
        // setRefreshTokenCookie doc comment) embr_rt cookie the browser
        // attaches automatically. A successful response sets fresh
        // embr_at/embr_rt cookies on the response; there's nothing for
        // this client to store itself, unlike apps/mobile's token
        // storage.
        await rawFetch<{ user: unknown }>("/auth/refresh", { method: "POST" });
        return true;
      } catch {
        // The refresh token is dead (expired, already rotated away, or
        // the session was revoked elsewhere) — nothing left to do but
        // let the caller's original 401 propagate, same as before this
        // retry mechanism existed.
        return false;
      }
    })();
  }
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    const data = await rawFetch<T>(path, options);
    // Marked on every successful authenticated-endpoint response, not
    // just login — this is what lets a stale-token discovered on a
    // *fresh* page load (reopening the app after the refresh token
    // itself expired) be recognized as a real expiration too, not
    // just a mid-session one. NO_REFRESH_PATHS is exactly "endpoints
    // that don't require an existing session" already, so excluding
    // them here for free is what makes this specifically mean "had a
    // real session," not just "got any successful response."
    if (!NO_REFRESH_PATHS.has(path)) markHadSession();
    return data;
  } catch (err) {
    const shouldRetryAfterRefresh =
      err instanceof ApiError &&
      err.status === 401 &&
      !options._isRetry &&
      !NO_REFRESH_PATHS.has(path);

    if (!shouldRetryAfterRefresh) throw err;

    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      // Only announced when this browser is known to have had a real
      // session before — see markHadSession's own doc comment for why
      // that check exists at all. A visitor who was never logged in
      // hits this exact same branch (an unauthenticated request also
      // 401s, also fails to refresh), and must not see "your session
      // expired" for a session that never existed.
      if (hadSession()) {
        clearHadSession();
        sessionExpiredHandler?.();
      }
      throw err;
    }

    return rawFetch<T>(path, { ...options, _isRetry: true });
  }
}
