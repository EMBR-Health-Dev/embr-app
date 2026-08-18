import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import en from "../../locales/en.json";
import ja from "../../locales/ja.json";
import { DEFAULT_LOCALE, LOCALES, getStoredLocale, isLocale, type Locale } from "./locale";

const resources = {
  en: { translation: en },
  ja: { translation: ja },
};

/** Device language if it's one this app actually supports, otherwise
 * the default — getLocales() is guaranteed to return at least one
 * entry, ordered by the user's own device preference, so [0] is
 * always their most-preferred language. */
export function deviceLocale(): Locale {
  const [primary] = getLocales();
  return isLocale(primary?.languageCode) ? primary.languageCode : DEFAULT_LOCALE;
}

/** Resolves the effective starting locale (stored override, else
 * device language) and initializes i18next with it. Call once, before
 * rendering anything that uses translations — see app/_layout.tsx. */
export async function initI18n(): Promise<void> {
  const stored = await getStoredLocale();
  const locale = stored ?? deviceLocale();

  // eslint-disable-next-line import/no-named-as-default-member -- i18next's own documented usage is i18n.use(...).init(...); this isn't a mix-up with the module's separate named `use` export.
  await i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: LOCALES as unknown as string[],
    interpolation: { escapeValue: false }, // React already escapes; double-escaping breaks apostrophes in translated copy
    compatibilityJSON: "v4",
  });
}

export { i18n };
