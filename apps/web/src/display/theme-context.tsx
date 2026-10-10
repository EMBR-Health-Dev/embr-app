"use client";

import { createContext, useContext } from "react";
import { DEFAULT_THEME, type Theme } from "./theme";

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

/** Carries the theme the root layout read from the cookie to client UI. */
export function ThemeProvider({ value, children }: { value: Theme; children: React.ReactNode }) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
