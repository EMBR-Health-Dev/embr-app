import { tokenStorage } from "./token-storage";

export class ApiError extends Error {
  code: string;
  status: number;
  details?: { field: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Unlike apps/web (same-origin, via next.config.ts's rewrite), a mobile
// client has no origin to be "same" as — it talks to the API directly,
// over whatever network the device is on, so the base URL has to be
// configured rather than implied. EXPO_PUBLIC_-prefixed vars are the
// only ones Expo inlines into the built app; anything else read from
// process.env here would be undefined at runtime.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

// Auth endpoints never go through the refresh-and-retry path below —
// a 401 from /auth/login is just "wrong password," not "your session
// expired," and retrying /auth/refresh itself on its own 401 would
// recurse.
const NO_REFRESH_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Internal — set on the single retry attempt after a refresh, to
   * stop a persistently-401ing request from looping. */
  _isRetry?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const searchParams = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) searchParams.set(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  return `${API_BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;
}

async function rawFetch<T>(path: string, options: RequestOptions, accessToken?: string) {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return { res, data: undefined as T };

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const err = json?.error ?? { code: "UNKNOWN", message: "Something went wrong" };
    throw new ApiError(res.status, err.code, err.message, err.details);
  }

  return { res, data: json.data as T };
}

// Concurrent requests that all 401 at once (e.g. a screen firing off
// several calls right as the access token expires) must share one
// refresh attempt, not each fire their own — refresh tokens rotate on
// use, so a second concurrent call would present an already-consumed
// token and fail even though the first one succeeded.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const stored = await tokenStorage.get();
      if (!stored) return null;
      try {
        const { data } = await rawFetch<{ accessToken: string; refreshToken: string }>(
          "/auth/refresh",
          { method: "POST", body: { refreshToken: stored.refreshToken } },
        );
        await tokenStorage.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return data.accessToken;
      } catch {
        // The stored refresh token is dead (expired, already rotated
        // away, or the session was revoked elsewhere) — nothing left
        // to do but drop it and let the caller fall back to a login
        // screen rather than keep retrying against a token that will
        // never work again.
        await tokenStorage.clear();
        return null;
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
  const stored = await tokenStorage.get();

  try {
    const { data } = await rawFetch<T>(path, options, stored?.accessToken);
    return data;
  } catch (err) {
    const shouldRetryAfterRefresh =
      err instanceof ApiError &&
      err.status === 401 &&
      !options._isRetry &&
      !NO_REFRESH_PATHS.has(path) &&
      stored !== null;

    if (!shouldRetryAfterRefresh) throw err;

    const newAccessToken = await refreshAccessToken();
    if (!newAccessToken) throw err;

    const { data } = await rawFetch<T>(path, { ...options, _isRetry: true }, newAccessToken);
    return data;
  }
}
