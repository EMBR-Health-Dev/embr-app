import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { keyByEmailAndIp } from "../src/modules/auth/rate-limiters.js";

function fakeRequest(ip: string | undefined, email?: string): Request {
  return { ip, body: email ? { email } : {} } as unknown as Request;
}

describe("keyByEmailAndIp", () => {
  it("keys IPv4 addresses on the exact address", () => {
    const key = keyByEmailAndIp(fakeRequest("203.0.113.5", "a@example.com"));
    expect(key).toBe("203.0.113.5:a@example.com");
  });

  it("lowercases the email so case differences don't split the counter", () => {
    const key = keyByEmailAndIp(fakeRequest("203.0.113.5", "A@Example.com"));
    expect(key).toBe("203.0.113.5:a@example.com");
  });

  it("falls back to 'unknown' when no email is present on the body", () => {
    const key = keyByEmailAndIp(fakeRequest("203.0.113.5"));
    expect(key).toBe("203.0.113.5:unknown");
  });

  // The actual security property: an attacker who controls a whole IPv6
  // /56 (which residential ISPs commonly hand out per customer) has to
  // be treated as one attacker, not billions of unrelated ones. Two
  // addresses in the same /56 must collapse to the same key.
  it("collapses different IPv6 addresses in the same /56 subnet to the same key", () => {
    const keyA = keyByEmailAndIp(fakeRequest("2001:db8:1234::1", "a@example.com"));
    const keyB = keyByEmailAndIp(fakeRequest("2001:db8:1234::ffff:ffff", "a@example.com"));
    expect(keyA).toBe(keyB);
  });

  it("keeps IPv6 addresses in different /56 subnets as different keys", () => {
    const keyA = keyByEmailAndIp(fakeRequest("2001:db8:1234::1", "a@example.com"));
    const keyB = keyByEmailAndIp(fakeRequest("2001:db8:9999::1", "a@example.com"));
    expect(keyA).not.toBe(keyB);
  });
});
