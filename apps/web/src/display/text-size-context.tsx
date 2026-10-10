"use client";

import { createContext, useContext } from "react";
import { DEFAULT_TEXT_SIZE, type TextSize } from "./text-size";

const TextSizeContext = createContext<TextSize>(DEFAULT_TEXT_SIZE);

/** Carries the size the root layout read from the cookie to client UI. */
export function TextSizeProvider({
  value,
  children,
}: {
  value: TextSize;
  children: React.ReactNode;
}) {
  return <TextSizeContext.Provider value={value}>{children}</TextSizeContext.Provider>;
}

export function useTextSize(): TextSize {
  return useContext(TextSizeContext);
}
