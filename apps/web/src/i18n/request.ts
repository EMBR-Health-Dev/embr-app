import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./locale";

// "Without i18n routing" mode — locale lives in a cookie, not the URL
// (/dashboard stays /dashboard in any language). Deliberately chosen
// over locale-prefixed routing (/en/dashboard, /ja/dashboard): this
// app already has a real, multi-page route tree (onboarding, dashboard,
// settings, brief, ...), and prefixed routing requires moving every
// existing page under an app/[locale]/ segment before anything works
// again. Cookie-based detection gets working translation infrastructure
// in place without that wide, all-at-once restructure — routing can
// still be added later if URL-visible locale (for SEO on public pages,
// for instance) becomes a real need.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
