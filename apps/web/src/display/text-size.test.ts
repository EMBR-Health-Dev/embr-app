import { describe, expect, it } from "vitest";
import { isTextSize, textSizeFromCookie } from "./text-size";

describe("text size cookie", () => {
  it("accepts the three sizes", () => {
    expect(textSizeFromCookie("standard")).toBe("standard");
    expect(textSizeFromCookie("large")).toBe("large");
    expect(textSizeFromCookie("larger")).toBe("larger");
  });

  it("falls back to Standard when the cookie is missing or unknown", () => {
    expect(textSizeFromCookie(undefined)).toBe("standard");
    expect(textSizeFromCookie("")).toBe("standard");
    expect(textSizeFromCookie("huge")).toBe("standard");
    expect(textSizeFromCookie("LARGE")).toBe("standard");
    expect(isTextSize("huge")).toBe(false);
  });
});
