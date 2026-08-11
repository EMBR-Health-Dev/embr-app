import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "embr_access_token";
const REFRESH_TOKEN_KEY = "embr_refresh_token";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * expo-secure-store backs onto Keychain (iOS) / Keystore-backed
 * EncryptedSharedPreferences (Android) — appropriate for a refresh
 * token, which is long-lived and equivalent to a password if it leaks.
 * Reads/writes are done together as a pair everywhere in this app
 * (never just one), so a partial write can't leave a stale access
 * token paired with a rotated-away refresh token.
 */
export const tokenStorage = {
  async get(): Promise<StoredTokens | null> {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  },

  async set(tokens: StoredTokens): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
    ]);
  },

  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
  },
};
