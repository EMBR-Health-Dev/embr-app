import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role } from "@embr/types";
import { env } from "../../config/env.js";

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  role: Role;
}

/**
 * Short-lived, stateless JWT. Kept deliberately thin (just enough to
 * authorize a request without a DB round-trip) — anything that can
 * change mid-session (role changes, bans) is re-checked at the
 * refresh boundary, not trusted forever from the token alone.
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: "embr-api",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "embr-api" });
  return decoded as unknown as AccessTokenPayload;
}

/**
 * Refresh tokens are opaque random values, never JWTs — the server is
 * the only party that needs to interpret them, and storing only a hash
 * (see hashToken below) means a stolen database dump can't be replayed
 * as a valid session the way a leaked JWT signing key could.
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

/** SHA-256 is sufficient here (not a password) — the token itself already
 * has 384 bits of entropy; this hash only prevents plaintext-in-database
 * exposure, not brute-forcing. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}
