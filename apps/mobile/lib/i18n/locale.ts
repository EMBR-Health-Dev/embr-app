import * as SecureStore from "expo-secure-store";

export const LOCALES = ["en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

const LOCALE_KEY = "embr_locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/** Explicit user override, if they've ever picked one via the language
 * switcher — null means "follow the device's own language," which is
 * the default until someone actively chooses otherwise. */
export async function getStoredLocale(): Promise<Locale | null> {
  const stored = await SecureStore.getItemAsync(LOCALE_KEY);
  return isLocale(stored) ? stored : null;
}

export async function setStoredLocale(locale: Locale): Promise<void> {
  await SecureStore.setItemAsync(LOCALE_KEY, locale);
}
