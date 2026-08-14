"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "./locale";

// Cookie + revalidatePath is the documented pattern for changing locale
// under "without i18n routing" mode — getRequestConfig re-reads the
// cookie on the next render, but only if something forces that render
// to actually happen. The client-side LanguageSwitcher also calls
// router.refresh() right after this resolves, for the same reason:
// revalidatePath alone invalidates the cache but a client component
// won't necessarily re-render from it without an explicit nudge.
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
