import { describe, expect, it } from "vitest";
import { extractToken } from "./reset-token";

describe("extractToken", () => {
  it("returns a raw token unchanged", () => {
    expect(extractToken("abc123def456")).toBe("abc123def456");
  });

  it("trims surrounding whitespace from a raw token", () => {
    expect(extractToken("  abc123def456  \n")).toBe("abc123def456");
  });

  it("extracts the token query parameter from a full reset-password URL", () => {
    expect(extractToken("https://app.embr.health/reset-password?token=abc123def456")).toBe(
      "abc123def456",
    );
  });

  it("extracts the token from a URL with other query params present too", () => {
    expect(
      extractToken("https://app.embr.health/reset-password?utm_source=email&token=abc123&x=1"),
    ).toBe("abc123");
  });

  it("extracts a URL-encoded token correctly", () => {
    expect(extractToken("https://app.embr.health/reset-password?token=abc%2B123%2Fxyz")).toBe(
      "abc+123/xyz",
    );
  });

  it("trims surrounding whitespace from a pasted URL before parsing", () => {
    expect(extractToken("  https://app.embr.health/reset-password?token=abc123  \n")).toBe(
      "abc123",
    );
  });

  it("falls back to the raw pasted value when it's a URL with no token param", () => {
    const noToken = "https://app.embr.health/reset-password";
    expect(extractToken(noToken)).toBe(noToken);
  });

  it("falls back to the raw pasted value when it isn't a valid URL at all", () => {
    // Not a URL by any reasonable reading — treated as the token itself,
    // same as any other raw token.
    expect(extractToken("not a url at all, just some text")).toBe(
      "not a url at all, just some text",
    );
  });

  it("returns an empty string unchanged when nothing was pasted", () => {
    expect(extractToken("")).toBe("");
    expect(extractToken("   ")).toBe("");
  });
});
