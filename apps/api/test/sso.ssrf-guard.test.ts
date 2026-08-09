import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));

vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

const { isPublicAddress, guardedFetch, SsrfBlockedError } =
  await import("../src/modules/sso/sso.ssrf-guard.js");

describe("isPublicAddress", () => {
  it.each([
    ["8.8.8.8", true],
    ["1.1.1.1", true],
    ["93.184.216.34", true],
    ["10.0.0.1", false],
    ["127.0.0.1", false],
    ["169.254.169.254", false], // cloud metadata endpoint
    ["172.16.0.1", false],
    ["172.31.255.255", false],
    ["172.32.0.1", true], // just outside the 172.16.0.0/12 range
    ["192.168.1.1", false],
    ["0.0.0.0", false],
    ["100.64.0.1", false], // CGNAT
  ])("%s -> public=%s (IPv4)", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });

  it.each([
    ["2606:4700:4700::1111", true], // Cloudflare DNS, public
    ["::1", false],
    ["fe80::1", false],
    ["fc00::1", false],
    ["fd12:3456:789a::1", false],
    ["::ffff:127.0.0.1", false], // IPv4-mapped loopback
    ["::ffff:8.8.8.8", true], // IPv4-mapped public
  ])("%s -> public=%s (IPv6)", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

describe("guardedFetch", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    lookupMock.mockReset();
    global.fetch = vi.fn().mockResolvedValue(new Response("ok"));
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  it("rejects non-https URLs without even resolving DNS", async () => {
    await expect(
      guardedFetch("http://example.com/.well-known/openid-configuration", {}),
    ).rejects.toThrow(SsrfBlockedError);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("blocks a URL that resolves to a private address", async () => {
    lookupMock.mockResolvedValue({ address: "169.254.169.254", family: 4 });
    await expect(guardedFetch("https://sneaky-idp.example.com/token", {})).rejects.toThrow(
      SsrfBlockedError,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows a URL that resolves to a public address", async () => {
    lookupMock.mockResolvedValue({ address: "8.8.8.8", family: 4 });
    await guardedFetch("https://real-idp.example.com/token", {});
    expect(global.fetch).toHaveBeenCalledOnce();
  });
});
