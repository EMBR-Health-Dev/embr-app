// The person's chosen colour theme for this device, stored in a cookie
// and applied on the server (see the root layout) so the first paint is
// already right. "light" is the default, so nobody's app changes until
// they choose; "system" follows the device's light or dark setting.
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "light";
export const THEME_COOKIE = "EMBR_THEME";

export function isTheme(value: string | undefined): value is Theme {
  return value !== undefined && (THEMES as readonly string[]).includes(value);
}

/** The theme to render for a cookie value; anything unknown is Light. */
export function themeFromCookie(value: string | undefined): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}
