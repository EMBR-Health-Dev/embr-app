import { describe, expect, it } from "vitest";
import { encryptClientSecret, decryptClientSecret } from "../src/modules/sso/sso.crypto.js";

describe("sso.crypto", () => {
  it("round-trips a secret through encryption and decryption", () => {
    const plaintext = "a very secret oidc client secret";
    const encrypted = encryptClientSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptClientSecret(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", () => {
    const a = encryptClientSecret("same secret");
    const b = encryptClientSecret("same secret");
    expect(a).not.toBe(b);
    expect(decryptClientSecret(a)).toBe("same secret");
    expect(decryptClientSecret(b)).toBe("same secret");
  });

  it("rejects a tampered ciphertext rather than silently returning garbage", () => {
    const encrypted = encryptClientSecret("secret");
    const [iv, authTag, ciphertext] = encrypted.split(".");
    const tampered = [iv, authTag, ciphertext.slice(0, -2) + "AA"].join(".");
    expect(() => decryptClientSecret(tampered)).toThrow();
  });

  it("rejects a malformed stored value", () => {
    expect(() => decryptClientSecret("not-the-right-format")).toThrow(
      "Malformed encrypted client secret",
    );
  });
});
