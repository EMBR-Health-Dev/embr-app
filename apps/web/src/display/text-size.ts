// The person's chosen text size for this device. Stored in a cookie and
// applied on the server (see the root layout), so the first paint is
// already the right size. Every size in the app is in rem, so scaling
// the root scales text, spacing and touch targets together. "standard"
// adds nothing: on iPhone and iPad it keeps following the system Text
// Size setting (see html in globals.css).
export const TEXT_SIZES = ["standard", "large", "larger"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const DEFAULT_TEXT_SIZE: TextSize = "standard";
export const TEXT_SIZE_COOKIE = "EMBR_TEXT_SIZE";

export function isTextSize(value: string | undefined): value is TextSize {
  return value !== undefined && (TEXT_SIZES as readonly string[]).includes(value);
}

/** The size to render for a cookie value; anything unknown is Standard. */
export function textSizeFromCookie(value: string | undefined): TextSize {
  return isTextSize(value) ? value : DEFAULT_TEXT_SIZE;
}
