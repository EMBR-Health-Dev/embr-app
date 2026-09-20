// The API's own view of "which language" — deliberately the exact same
// values and default as apps/web/src/i18n/locale.ts and
// apps/mobile/lib/i18n/locale.ts (LOCALES = ["en", "ja"], DEFAULT_LOCALE
// "en"), not a second, independently-invented locale system. Neither
// client's locale reaches the API automatically today (web's EMBR_LOCALE
// cookie is scoped to the web app's own origin; mobile has no cookies at
// all), so both clients send it explicitly via the standard
// Accept-Language header — see apps/web/src/lib/api-client.ts and
// apps/mobile/lib/api-client.ts.
export const SUPPORTED_LOCALES = ["en", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Deliberately not a full RFC 7231 Accept-Language parser (no q-value
 * weighting, no multi-tag fallback chain) — both clients only ever send
 * a single bare value that's already exactly one of SUPPORTED_LOCALES
 * (see the client-side callers above), so this only needs to normalize
 * that one value and fall back to DEFAULT_LOCALE for anything else
 * (missing header, a browser's own full "ja-JP,ja;q=0.9,en;q=0.8" sent
 * directly by some other future caller, or an unsupported language).
 * Splitting on "," (first tag only), ";" (drop any q-value), and "-"
 * (drop a region subtag) still handles that broader shape safely, it
 * just doesn't weight the alternatives.
 */
export function resolveLocaleFromAcceptLanguage(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const primaryTag = header.split(",")[0]?.split(";")[0]?.split("-")[0]?.trim().toLowerCase();
  return primaryTag && isLocale(primaryTag) ? primaryTag : DEFAULT_LOCALE;
}
