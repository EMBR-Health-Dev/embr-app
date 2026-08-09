import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

/**
 * Blocks outbound requests to private, loopback, link-local, and other
 * non-public address ranges — the standard SSRF defense for any
 * server-side request whose destination is attacker-influenced. Here,
 * that's every URL an org-configured SSO connection can cause the API
 * to fetch: not just the issuerUrl an ORG_ADMIN sets directly, but
 * every endpoint (token, userinfo, jwks) the IdP's own discovery
 * document declares — a malicious or compromised "IdP" could point
 * those at internal infrastructure just as easily as at issuerUrl
 * itself, so the guard has to cover every request the OIDC client
 * makes, not only the first one.
 *
 * Checks the *resolved* IP, not the hostname string — a hostname that
 * looks innocuous can still resolve to an internal address. This
 * doesn't defend against DNS rebinding (re-resolving to a different,
 * private IP between this check and the actual connection a moment
 * later) — closing that fully needs pinning the checked IP to the
 * connection itself, which is real additional work; flagging as a
 * known residual gap rather than overclaiming full closure. Requires
 * an authenticated ORG_ADMIN to reach at all, which meaningfully
 * narrows the practical risk versus an anonymous-facing SSRF.
 */
export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    if (a === 10) return false; // 10.0.0.0/8
    if (a === 127) return false; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return false; // 169.254.0.0/16 link-local (cloud metadata)
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a === 192 && b === 168) return false; // 192.168.0.0/16
    if (a === 0) return false; // 0.0.0.0/8
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return false; // 100.64.0.0/10 CGNAT
    return true;
  }
  if (isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized === "::1") return false; // loopback
    if (normalized.startsWith("fe80:") || normalized.startsWith("fe80::")) return false; // link-local
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false; // unique local (fc00::/7)
    if (normalized.startsWith("::ffff:")) {
      // IPv4-mapped IPv6 — unwrap and re-check as v4, rather than let
      // this shape sail through the checks above untouched.
      return isPublicAddress(normalized.slice("::ffff:".length));
    }
    return true;
  }
  return false;
}

export class SsrfBlockedError extends Error {
  constructor(url: string) {
    super(`Refusing to fetch ${url}: resolves to a non-public address`);
    this.name = "SsrfBlockedError";
  }
}

/** Drop-in replacement for the global `fetch`, for use as
 * `openid-client`'s `customFetch` — see its docs: once set during
 * discovery, it's used for every subsequent request that Configuration
 * makes, not just the discovery call itself.
 *
 * Typed as `(url: string, options) => Promise<Response>` to match
 * `CustomFetch` exactly, rather than the global `fetch`'s own
 * signature — openid-client's `CustomFetchOptions` isn't quite
 * `RequestInit` (differs on body typing), which is why their own docs
 * examples pass the args straight through with `@ts-ignore` at this
 * exact boundary rather than trying to reconcile the two types. */
export async function guardedFetch(url: string, options: unknown): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new SsrfBlockedError(url);
  }

  const { address } = await lookup(parsed.hostname);
  if (!isPublicAddress(address)) {
    throw new SsrfBlockedError(url);
  }

  return fetch(url, options);
}
