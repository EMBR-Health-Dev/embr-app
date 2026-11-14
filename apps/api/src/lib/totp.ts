import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one time passwords (RFC 6238, over HOTP RFC 4226): the
 * 6 digit codes authenticator apps show, changing every 30 seconds.
 * SHA-1, 6 digits and a 30 second step are what every common app
 * (Google Authenticator, Microsoft Authenticator, 1Password, Authy)
 * expects by default, so they are fixed here rather than configurable.
 */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** One step either side: a phone clock a little off still works. */
export const TOTP_WINDOW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160 bit secret, base32 encoded, as RFC 4226 recommends. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
}

export function hotp(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * The step a code matches, within the window, or null. Steps at or
 * before `lastUsedStep` never match, so an accepted code (or an older
 * one) cannot be replayed.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { now?: Date; lastUsedStep?: number | null } = {},
): number | null {
  const candidate = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(candidate)) return null;
  const current = totpStep(options.now);
  let matched: number | null = null;
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step++) {
    if (options.lastUsedStep != null && step <= options.lastUsedStep) continue;
    const expected = Buffer.from(hotp(secretBase32, step));
    // Compare every candidate step, so timing says nothing about which matched.
    if (timingSafeEqual(expected, Buffer.from(candidate)) && matched === null) matched = step;
  }
  return matched;
}

/** The otpauth:// URI an authenticator app reads from a QR code. */
export function totpUri(secretBase32: string, accountEmail: string, issuer = "EMBR"): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
