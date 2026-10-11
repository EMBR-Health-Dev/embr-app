import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, themeFromCookie } from "./theme";

describe("themeFromCookie", () => {
  it("defaults to Light, so nobody's app changes until they choose", () => {
    expect(DEFAULT_THEME).toBe("light");
    expect(themeFromCookie(undefined)).toBe("light");
  });

  it("accepts the three themes and nothing else", () => {
    expect(themeFromCookie("system")).toBe("system");
    expect(themeFromCookie("dark")).toBe("dark");
    expect(themeFromCookie("light")).toBe("light");
    expect(themeFromCookie("purple")).toBe("light");
  });
});
