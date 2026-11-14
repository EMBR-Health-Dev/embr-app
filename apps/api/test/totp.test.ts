import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  totpStep,
  totpUri,
  verifyTotp,
} from "../src/lib/totp.js";

// The RFC 4226 / RFC 6238 SHA-1 test key: ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("HOTP (RFC 4226 appendix D)", () => {
  it.each([
    [0, "755224"],
    [1, "287082"],
    [2, "359152"],
    [3, "969429"],
    [9, "520489"],
  ])("counter %i gives %s", (counter, code) => {
    expect(hotp(RFC_SECRET, counter)).toBe(code);
  });
});

describe("TOTP (RFC 6238 appendix B, SHA-1, last 6 digits)", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("at %i seconds the code is %s", (seconds, code) => {
    const now = new Date(seconds * 1000);
    expect(hotp(RFC_SECRET, totpStep(now))).toBe(code);
    expect(verifyTotp(RFC_SECRET, code, { now })).toBe(totpStep(now));
  });
});

describe("verifyTotp", () => {
  const now = new Date(1_700_000_000_000);
  const step = totpStep(now);

  it("accepts the previous and next step, but not two away", () => {
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), { now })).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), { now })).toBeNull();
  });

  it("refuses a code already used, and anything older", () => {
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, { now, lastUsedStep: step })).toBeNull();
    expect(
      verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), { now, lastUsedStep: step - 1 }),
    ).toBeNull();
  });

  it("ignores spaces, and refuses anything that is not 6 digits", () => {
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { now })).toBe(step);
    expect(verifyTotp(RFC_SECRET, "12345", { now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", { now })).toBeNull();
  });
});

describe("secrets and URIs", () => {
  it("makes a fresh 160 bit base32 secret each time that round-trips", () => {
    const a = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(a)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(a);
    expect(base32Encode(base32Decode(a))).toBe(a);
  });

  it("builds the otpauth URI authenticator apps scan", () => {
    const uri = totpUri("JBSWY3DPEHPK3PXP", "maya@example.com");
    expect(uri).toBe(
      "otpauth://totp/EMBR%3Amaya%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=EMBR&algorithm=SHA1&digits=6&period=30",
    );
  });
});
