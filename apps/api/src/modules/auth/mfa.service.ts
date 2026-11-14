import type { Request } from "express";
import { randomInt } from "node:crypto";
import { AppError } from "@embr/shared";
import type { User } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";
import { decryptText, encryptText } from "../../lib/field-crypto.js";
import { generateTotpSecret, totpUri, verifyTotp } from "../../lib/totp.js";
import { verifyPassword } from "./password.js";
import { generateOpaqueToken, hashToken } from "./tokens.js";
import { writeAuditLog } from "./audit.js";

/**
 * Two-step sign in with an authenticator app (TOTP), plus one time
 * recovery codes for a lost phone.
 *
 * - The secret is stored encrypted with the field key (never in plain
 *   text, never logged) and only ever shown once, during setup.
 * - Setup is two steps: a secret is held as pending until a first code
 *   from the app proves the app has it, so a half finished setup can
 *   never lock anyone out.
 * - A correct password or sign in link, with two-step on, gives a short
 *   lived challenge instead of a session. The session comes only after a
 *   valid code: 5 minutes, 5 attempts.
 * - An accepted code's 30 second step is remembered, so the same code
 *   cannot be used twice. Recovery codes are stored as hashes and each
 *   works once. Both checks are single conditional writes, so two
 *   requests racing with the same code cannot both succeed.
 */
export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MFA_MAX_CHALLENGE_ATTEMPTS = 5;
export const MFA_PENDING_TTL_MS = 15 * 60 * 1000;
export const RECOVERY_CODE_COUNT = 10;

const SECRET_CONTEXT = "User.mfaSecret";
// No 0/O, 1/I/L: read aloud or copied from paper without mistakes.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function mfaEnabled(user: Pick<User, "mfaEnabledAt" | "mfaSecret">): boolean {
  return Boolean(user.mfaEnabledAt && user.mfaSecret);
}

function newRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < 10; i++) raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Case, spaces and dashes don't matter when typing a recovery code back. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashRecoveryCode(userId: string, code: string): string {
  return hashToken(`${userId}:${normalizeRecoveryCode(code)}`);
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(userId, code) })),
    }),
  ]);
  return codes;
}

type Factor = "totp" | "recovery";

/**
 * Checks a 6 digit app code, or else a recovery code, against her
 * enabled two-step sign in, and uses it up. Null when neither matches.
 */
async function consumeFactor(user: User, input: string): Promise<Factor | null> {
  if (!user.mfaSecret) return null;
  const trimmed = input.trim();
  if (/^\d{3}\s?\d{3}$/.test(trimmed)) {
    const secret = decryptText(user.mfaSecret, SECRET_CONTEXT);
    const step = verifyTotp(secret, trimmed, { lastUsedStep: user.mfaLastUsedStep });
    if (step === null) return null;
    const { count } = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }],
      },
      data: { mfaLastUsedStep: step },
    });
    return count === 1 ? "totp" : null;
  }
  const { count } = await prisma.mfaRecoveryCode.updateMany({
    where: { userId: user.id, codeHash: hashRecoveryCode(user.id, trimmed), usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? "recovery" : null;
}

async function requireUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.unauthorized();
  return user;
}

function wrongCode(): AppError {
  return AppError.validation("That code is not right", [
    { field: "code", message: "That code is not right" },
  ]);
}

export const mfaService = {
  /** A short lived ticket for the second step; the token is returned once. */
  async startChallenge(userId: string, method: "password" | "email_link"): Promise<string> {
    const token = generateOpaqueToken();
    await prisma.mfaChallenge.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        method,
        expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
      },
    });
    return token;
  },

  /**
   * The second step of sign in. Returns the account on a valid code,
   * after which the caller issues the session. Wrong codes count against
   * the challenge; after the fifth it is gone and sign in starts again.
   */
  async completeChallenge(
    req: Request,
    token: string,
    code: string,
  ): Promise<{ user: User; factor: Factor; method: string }> {
    const tokenHash = hashToken(token);
    const { count } = await prisma.mfaChallenge.updateMany({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
        attempts: { lt: MFA_MAX_CHALLENGE_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    const challenge =
      count === 1 ? await prisma.mfaChallenge.findUnique({ where: { tokenHash } }) : null;
    if (!challenge) {
      throw AppError.unauthorized("This sign in has expired. Please sign in again.");
    }

    const user = await requireUser(challenge.userId);
    const factor = await consumeFactor(user, code);
    if (!factor) {
      await writeAuditLog(req, "MFA_CHALLENGE_FAILED", user.id, {
        method: challenge.method,
        attempt: challenge.attempts,
      });
      if (challenge.attempts >= MFA_MAX_CHALLENGE_ATTEMPTS) {
        await prisma.mfaChallenge.deleteMany({ where: { id: challenge.id } });
        throw AppError.unauthorized("Too many wrong codes. Please sign in again.");
      }
      throw wrongCode();
    }

    await prisma.mfaChallenge.deleteMany({ where: { id: challenge.id } });
    if (factor === "recovery") await writeAuditLog(req, "MFA_RECOVERY_CODE_USED", user.id);
    return { user, factor, method: challenge.method };
  },

  /** Step one of setup: a new secret, held as pending. */
  async beginSetup(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const user = await requireUser(userId);
    if (mfaEnabled(user)) throw AppError.conflict("Two-step sign in is already on");
    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: userId },
      data: { mfaPendingSecret: encryptText(secret, SECRET_CONTEXT), mfaPendingAt: new Date() },
    });
    return { secret, otpauthUri: totpUri(secret, user.email) };
  },

  /** Step two: a first code from the app turns it on and returns recovery codes, once. */
  async confirmSetup(
    req: Request,
    userId: string,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await requireUser(userId);
    if (mfaEnabled(user)) throw AppError.conflict("Two-step sign in is already on");
    const fresh =
      user.mfaPendingSecret &&
      user.mfaPendingAt &&
      Date.now() - user.mfaPendingAt.getTime() < MFA_PENDING_TTL_MS;
    if (!fresh) throw AppError.validation("Setup has expired. Please start again.");

    const secret = decryptText(user.mfaPendingSecret!, SECRET_CONTEXT);
    const step = verifyTotp(secret, code);
    if (step === null) throw wrongCode();

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: user.mfaPendingSecret,
        mfaEnabledAt: new Date(),
        mfaLastUsedStep: step,
        mfaPendingSecret: null,
        mfaPendingAt: null,
      },
    });
    const recoveryCodes = await replaceRecoveryCodes(userId);
    await writeAuditLog(req, "MFA_ENABLED", userId);
    return { recoveryCodes };
  },

  /** Turning it off takes the password and a current code (or a recovery code). */
  async disable(req: Request, userId: string, password: string, code: string): Promise<void> {
    const user = await requireUser(userId);
    if (!mfaEnabled(user)) return;
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw AppError.validation("Password is incorrect", [
        { field: "password", message: "Password is incorrect" },
      ]);
    }
    if (!(await consumeFactor(user, code))) throw wrongCode();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          mfaSecret: null,
          mfaEnabledAt: null,
          mfaLastUsedStep: null,
          mfaPendingSecret: null,
          mfaPendingAt: null,
        },
      }),
      prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      prisma.mfaChallenge.deleteMany({ where: { userId } }),
    ]);
    await writeAuditLog(req, "MFA_DISABLED", userId);
  },

  /** New recovery codes; the old ones stop working. Needs a current code. */
  async regenerateRecoveryCodes(
    req: Request,
    userId: string,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await requireUser(userId);
    if (!mfaEnabled(user)) throw AppError.validation("Two-step sign in is not on");
    if (!(await consumeFactor(user, code))) throw wrongCode();
    const recoveryCodes = await replaceRecoveryCodes(userId);
    await writeAuditLog(req, "MFA_RECOVERY_CODES_REGENERATED", userId);
    return { recoveryCodes };
  },

  async status(userId: string): Promise<{ enabled: boolean; recoveryCodesLeft: number }> {
    const user = await requireUser(userId);
    if (!mfaEnabled(user)) return { enabled: false, recoveryCodesLeft: 0 };
    const recoveryCodesLeft = await prisma.mfaRecoveryCode.count({
      where: { userId, usedAt: null },
    });
    return { enabled: true, recoveryCodesLeft };
  },
};
