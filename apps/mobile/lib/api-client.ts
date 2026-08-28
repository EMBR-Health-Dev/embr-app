import { ApiError, createApiClient } from "@embr/sdk";
import { tokenStorage } from "./token-storage";

export { ApiError };

// Unlike apps/web/apps/admin (same-origin, via next.config.ts's
// rewrite), a mobile client has no origin to be "same" as — it talks
// to the API directly, over whatever network the device is on, so
// the base URL has to be configured rather than implied. EXPO_PUBLIC_-
// prefixed vars are the only ones Expo inlines into the built app;
// anything else read from process.env here would be undefined at
// runtime.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

// Auth endpoints never go through the refresh-and-retry path in
// @embr/sdk's createApiClient — a 401 from /auth/login is just "wrong
// password," not "your session expired," and retrying /auth/refresh
// itself on its own 401 would recurse.
const NO_REFRESH_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
]);

const client = createApiClient({
  baseUrl: API_BASE_URL,
  // No cookies on mobile — auth travels as an explicit bearer token
  // below, so there's no `credentials` mode to set.

  async getRequestHeaders() {
    const stored = await tokenStorage.get();
    return {
      Accept: "application/json",
      ...(stored ? { Authorization: `Bearer ${stored.accessToken}` } : {}),
    };
  },

  async refresh() {
    const stored = await tokenStorage.get();
    if (!stored) return false;
    try {
      const data = await client.apiFetch<{ accessToken: string; refreshToken: string }>(
        "/auth/refresh",
        { method: "POST", body: { refreshToken: stored.refreshToken } },
      );
      await tokenStorage.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return true;
    } catch {
      // The stored refresh token is dead (expired, already rotated
      // away, or the session was revoked elsewhere) — nothing left to
      // do but drop it and let the caller fall back to a login screen
      // rather than keep retrying against a token that will never
      // work again.
      await tokenStorage.clear();
      return false;
    }
  },

  noRefreshPaths: NO_REFRESH_PATHS,
});

export const apiFetch = client.apiFetch;
