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

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

/**
 * Every call goes through the same-origin `/api/*` path (see
 * next.config.ts's rewrite) — the browser treats the API's cookies as
 * ordinary first-party cookies, so this client never has to think about
 * CORS. Mutating requests attach the CSRF header the API's
 * double-submit-cookie check expects (see apps/api's csrf.ts);
 * GETs don't need it.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
