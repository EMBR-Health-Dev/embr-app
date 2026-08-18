import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  createUser(data: { email: string; passwordHash: string }) {
    return prisma.user.create({ data });
  },

  markEmailVerified(userId: string) {
    return prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  },

  updatePassword(userId: string, passwordHash: string) {
    return prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  },

  // ---- Sessions (device / refresh tokens) ----

  createSession(data: {
    userId: string;
    refreshTokenHash: string;
    userAgent: string | null;
    ipAddress: string | null;
    expiresAt: Date;
  }) {
    return prisma.session.create({ data });
  },

  findActiveSessionByTokenHash(refreshTokenHash: string) {
    return prisma.session.findUnique({ where: { refreshTokenHash } });
  },

  /** Rotates a session: marks the old one revoked + linked to its
   * replacement in a single transaction so a crash mid-rotation can
   * never leave two simultaneously-valid tokens for the same session. */
  async rotateSession(
    oldSessionId: string,
    newSession: {
      userId: string;
      refreshTokenHash: string;
      userAgent: string | null;
      ipAddress: string | null;
      expiresAt: Date;
    },
  ) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.session.create({ data: newSession });
      await tx.session.update({
        where: { id: oldSessionId },
        data: { revokedAt: new Date(), replacedBySessionId: created.id },
      });
      return created;
    });
  },

  revokeSession(sessionId: string) {
    return prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllSessionsForUser(userId: string) {
    return prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  listActiveSessionsForUser(userId: string) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  },

  // ---- Email verification tokens ----

  async createEmailVerificationToken(userId: string, tokenHash: string) {
    // Only one live verification link at a time keeps the token table
    // small and avoids ambiguity about which email the user actually clicked.
    await prisma.emailVerificationToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + env.EMAIL_VERIFICATION_TTL_SECONDS * 1000),
      },
    });
  },

  findValidEmailVerificationToken(tokenHash: string) {
    return prisma.emailVerificationToken.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
    });
  },

  consumeEmailVerificationToken(id: string) {
    return prisma.emailVerificationToken.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  },

  // ---- Password reset tokens ----

  async createPasswordResetToken(userId: string, tokenHash: string) {
    await prisma.passwordResetToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_SECONDS * 1000),
      },
    });
  },

  findValidPasswordResetToken(tokenHash: string) {
    return prisma.passwordResetToken.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
    });
  },

  consumePasswordResetToken(id: string) {
    return prisma.passwordResetToken.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  },

  // ---- Account deletion ----

  /**
   * Writes a final audit entry, then deletes the User row, both in one
   * transaction — if the audit write somehow failed, the deletion
   * shouldn't proceed silently with no trail of it at all.
   *
   * The delete itself is a single native `DELETE FROM users WHERE
   * id = $1`: every user-owned table (Session, SymptomLog, CycleEntry,
   * ClinicalBrief, OnboardingProfile, OrganizationMembership, the
   * verification/reset tokens) declares `onDelete: Cascade` in the
   * schema, and AuditLog declares `onDelete: SetNull` — Postgres
   * enforces both as real foreign-key actions (this datasource has no
   * `relationMode` override, so it's the default `"foreignKeys"` mode,
   * not Prisma-emulated cascades), meaning the single DELETE statement
   * removes every row it should and nulls the audit trail's userId —
   * including the very row this method just wrote — atomically, with
   * no per-table application code needed here.
   *
   * Deliberately bypasses audit.ts's writeAuditLog() helper — that
   * helper is intentionally "best-effort, never allowed to fail an
   * otherwise-successful operation" (see its own doc comment), which
   * is the wrong behavior here: this specific write and the deletion
   * must succeed or fail together, not independently.
   */
  async deleteUserAccount(userId: string): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.auditLog.create({
        data: { userId, action: "ACCOUNT_DELETED" },
      });
      await tx.user.delete({ where: { id: userId } });
    });
  },
};

export type AuthRepository = typeof authRepository;
export type { Prisma };
