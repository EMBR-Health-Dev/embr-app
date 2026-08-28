import { ApiError } from "./api-error.js";

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

/**
 * Everything about *how* a request authenticates and gets refreshed
 * differs by platform (cookie + CSRF for the two Next.js apps, a
 * stored bearer token for mobile) — everything about *what happens*
 * around that (URL/query building, JSON parsing, the ApiError shape,
 * the refresh-once-and-retry flow with concurrent-request dedup) was
 * identical across all three, just copy-pasted. This factory owns the
 * identical part; each app supplies only the platform-specific
 * transport below.
 */
export interface ApiClientTransport {
  /** Prepended to every request path — e.g. "/api" for the two
   * Next.js apps proxying same-origin, or a full origin for mobile,
   * which has no "same-origin" to proxy through. */
  baseUrl: string;

  /** fetch()'s `credentials` mode. The two cookie-based apps need
   * "same-origin" so the API's Set-Cookie response is honored; mobile
   * has no cookies and omits this entirely. Typed as the string
   * union fetch() itself accepts, rather than the DOM lib's
   * `RequestCredentials`, since this package intentionally builds
   * without the DOM lib (see tsconfig.base.json) — it has no browser-
   * only code otherwise. */
  credentials?: "omit" | "same-origin" | "include";

  /** Extra headers to attach for this attempt (CSRF token, Authorization
   * bearer token, etc). Called fresh on every attempt, including the
   * post-refresh retry, so it must read current auth state rather than
   * being computed once — the retry after a refresh needs the new
   * token/cookie, not the one that just 401'd. */
  getRequestHeaders(method: string): Promise<Record<string, string>> | Record<string, string>;

  /**
   * Attempts to refresh the session in place (rotating cookies for the
   * cookie-based apps, or storing a new token pair for mobile).
   * Returns whether the caller should retry the original request.
   * Concurrent 401s are deduplicated by the factory, not by this
   * function — refresh tokens rotate on use, so two concurrent refresh
   * attempts would race and one would fail against an already-rotated
   * token even though the other succeeded.
   */
  refresh(): Promise<boolean>;

  /**
   * Paths that must never trigger the refresh-and-retry path below.
   * A 401 from /auth/login is just "wrong password," not "your
   * session expired" — and retrying /auth/refresh itself on its own
   * 401 would recurse.
   */
  noRefreshPaths: ReadonlySet<string>;
}

export interface ApiClient {
  apiFetch<T>(path: string, options?: ApiRequestOptions): Promise<T>;
}

export function createApiClient(transport: ApiClientTransport): ApiClient {
  function buildUrl(path: string, query?: ApiRequestOptions["query"]): string {
    const searchParams = new URLSearchParams();
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) searchParams.set(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    return `${transport.baseUrl}${path}${queryString ? `?${queryString}` : ""}`;
  }

  async function rawFetch<T>(path: string, options: ApiRequestOptions): Promise<T> {
    const method = options.method ?? "GET";

    const headers: Record<string, string> = await transport.getRequestHeaders(method);
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      ...(transport.credentials ? { credentials: transport.credentials } : {}),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 204) return undefined as T;

    const json = (await res.json().catch(() => null)) as {
      data?: T;
      error?: {
        code: string;
        message: string;
        details?: Array<{ field: string; message: string }>;
      };
    } | null;

    if (!res.ok) {
      const err = json?.error ?? { code: "UNKNOWN", message: "Something went wrong" };
      throw new ApiError(res.status, err.code, err.message, err.details);
    }

    return json?.data as T;
  }

  // Concurrent requests that all 401 at once (e.g. a screen firing off
  // several calls right as a token expires) must share one refresh
  // attempt, not each fire their own — see transport.refresh()'s doc
  // comment for why a second concurrent attempt would fail even when
  // the first succeeds.
  let refreshInFlight: Promise<boolean> | null = null;

  async function refreshOnce(): Promise<boolean> {
    if (!refreshInFlight) {
      refreshInFlight = transport.refresh();
    }
    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }

  async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    try {
      return await rawFetch<T>(path, options);
    } catch (err) {
      const shouldRetryAfterRefresh =
        err instanceof ApiError && err.status === 401 && !transport.noRefreshPaths.has(path);

      if (!shouldRetryAfterRefresh) throw err;

      const refreshed = await refreshOnce();
      if (!refreshed) throw err;

      return rawFetch<T>(path, options);
    }
  }

  return { apiFetch };
}
