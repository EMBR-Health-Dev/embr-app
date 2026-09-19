import { describe, expect, it } from "vitest";
import { formatDeviceLabel } from "./user-agent";

describe("formatDeviceLabel", () => {
  it("returns null for a missing user agent, letting the caller supply its own fallback copy", () => {
    expect(formatDeviceLabel(null)).toBeNull();
    expect(formatDeviceLabel(undefined)).toBeNull();
    expect(formatDeviceLabel("")).toBeNull();
  });

  it("never returns the raw string verbatim for a real user agent", () => {
    const raw =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36";
    expect(formatDeviceLabel(raw)).not.toBe(raw);
  });

  it("identifies Chrome on Mac", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(formatDeviceLabel(ua)).toBe("Chrome on Mac");
  });

  it("identifies Chrome on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(formatDeviceLabel(ua)).toBe("Chrome on Windows");
  });

  it("identifies Chrome on Linux (headless Chromium included)", () => {
    const ua =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36";
    expect(formatDeviceLabel(ua)).toBe("Chrome on Linux");
  });

  it("identifies Safari on iPhone, not Chrome (Safari UAs also contain the word 'Safari' in Chrome UAs)", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(formatDeviceLabel(ua)).toBe("Safari on iPhone");
  });

  it("identifies Safari on iPad separately from iPhone", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(formatDeviceLabel(ua)).toBe("Safari on iPad");
  });

  it("identifies Chrome on Android", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
    expect(formatDeviceLabel(ua)).toBe("Chrome on Android");
  });

  it("identifies Firefox on Windows", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
    expect(formatDeviceLabel(ua)).toBe("Firefox on Windows");
  });

  it("identifies Edge on Windows, not Chrome (Edge UAs also contain 'Chrome')", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0";
    expect(formatDeviceLabel(ua)).toBe("Edge on Windows");
  });

  it("falls back to just the platform when the browser can't be identified", () => {
    const ua = "SomeUnknownBot/1.0 (Macintosh; Intel Mac OS X 10_15_7)";
    expect(formatDeviceLabel(ua)).toBe("Mac");
  });

  it("returns null when nothing recognizable is found at all", () => {
    expect(formatDeviceLabel("curl/8.4.0")).toBeNull();
  });
});
