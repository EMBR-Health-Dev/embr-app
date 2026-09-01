/**
 * Redacts sensitive query-string parameter values from a request path
 * before it's written to the structured request log.
 *
 * `httpLoggerMiddleware` logs `req.originalUrl` verbatim on every
 * request, including the query string. That's fine for most routes,
 * but a handful of query params carry values that are secrets in their
 * own right rather than ordinary request metadata — the clearest
 * example being `GET /auth/sso/callback?code=...&state=...`, where
 * `code` is a short-lived, single-use OAuth authorization code.
 * Logging it verbatim puts a real (if short-lived) credential into
 * application logs, which anyone with log access within its expiry
 * window could replay.
 *
 * Deliberately name-based rather than route-based: scrubbing every
 * query param on `/auth/sso/callback` specifically would work today,
 * but a name-based deny-list also catches the same params if they ever
 * show up on a different route (a future SSO-adjacent endpoint, a
 * webhook, etc.) without needing to remember to extend a route list —
 * same "narrow, mechanical check rather than trusting call sites to
 * remember" reasoning `params.ts` and `brief.ai.ts`'s content-safety
 * check both already use elsewhere in this codebase.
 *
 * Keeps every other query param intact (page, pageSize, category, ...)
 * so the logged path stays useful for debugging — only the matched
 * param's value is replaced, not the whole query string.
 */
const SENSITIVE_QUERY_PARAMS = new Set([
  "code",
  "state",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
]);

export function scrubSensitiveQueryParams(originalUrl: string): string {
  // originalUrl is a path + optional query string, never an absolute
  // URL — the base here is only so the WHATWG URL parser has something
  // to resolve against and is never itself reflected in the output.
  const url = new URL(originalUrl, "http://internal");

  // Collect keys before mutating — modifying URLSearchParams while its
  // own iterator is still in progress is asking for trouble.
  const keysToRedact = [...url.searchParams.keys()].filter((key) =>
    SENSITIVE_QUERY_PARAMS.has(key.toLowerCase()),
  );

  for (const key of keysToRedact) {
    url.searchParams.set(key, "[REDACTED]");
  }

  const redactedAny = keysToRedact.length > 0;

  if (!redactedAny) {
    return originalUrl;
  }

  return `${url.pathname}${url.search}`;
}
