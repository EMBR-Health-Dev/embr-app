"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { TEXT_SIZE_COOKIE, isTextSize } from "./text-size";
import { THEME_COOKIE, isTheme } from "./theme";

// Same cookie + revalidatePath pattern as setLocale (i18n/actions.ts):
// the root layout reads the cookie on the next render, and the client
// control calls router.refresh() right after this resolves.
export async function setTextSize(size: string): Promise<void> {
  if (!isTextSize(size)) return;
  const cookieStore = await cookies();
  cookieStore.set(TEXT_SIZE_COOKIE, size, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export async function setTheme(theme: string): Promise<void> {
  if (!isTheme(theme)) return;
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
