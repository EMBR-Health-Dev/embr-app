import { ApiError, createApiClient } from "@embr/sdk";

export { ApiError };

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

// Same cookie-based auth architecture as apps/web (same next.config.ts
// /api/* rewrite, same embr_at/embr_rt/embr_csrf cookies) — previously
// this file had no refresh-and-retry path at all, meaning an admin
// session would surface a hard 401 the moment the 15-minute access
// token expired, rather than transparently refreshing the way web
// already did. That was a gap from the two files having been
// hand-written separately, not an intentional difference between the
// two apps' session models.
const NO_REFRESH_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
]);

const client = createApiClient({
  // Every call goes through the same-origin /api/* path (see
  // next.config.ts's rewrite) — the browser treats the API's cookies
  // as ordinary first-party cookies, so this client never has to
  // think about CORS.
  baseUrl: "/api",
  credentials: "same-origin",

  async getRequestHeaders(method): Promise<Record<string, string>> {
    if (!MUTATING_METHODS.has(method)) return {};
    // GETs don't need the CSRF header; the API's double-submit-cookie
    // check (see apps/api's csrf.ts) only applies to mutations.
    return { "x-csrf-token": await ensureCsrfToken() };
  },

  async refresh() {
    try {
      // No body needed — the API reads the refresh token straight
      // from the (embr_rt) cookie the browser attaches automatically.
      // A successful response sets fresh embr_at/embr_rt cookies on
      // the response; there's nothing for this client to store
      // itself.
      await client.apiFetch<{ user: unknown }>("/auth/refresh", { method: "POST" });
      return true;
    } catch {
      // The refresh token is dead (expired, already rotated away, or
      // the session was revoked elsewhere) — nothing left to do but
      // let the caller's original 401 propagate.
      return false;
    }
  },

  noRefreshPaths: NO_REFRESH_PATHS,
});

export const apiFetch = client.apiFetch;
