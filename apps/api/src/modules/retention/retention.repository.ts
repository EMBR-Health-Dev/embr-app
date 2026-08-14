import { prisma } from "../../lib/prisma.js";

/**
 * Only ever targets rows that are already functionally dead — expired
 * (past `expiresAt`) or explicitly revoked — never anything a user
 * could still be relying on. A grace period beyond the raw expiry
 * exists for two reasons: (1) clock skew between this process and
 * whatever issued the row, and (2) a short window where a recently-
 * expired session/token is still useful to have on hand for incident
 * investigation ("did this user's session expire, or was it
 * hijacked?") without keeping it around indefinitely.
 *
 * Deliberately does not touch AuditLog — see docs/RETENTION.md for
 * why that's a separate, explicit policy decision rather than
 * something this cleanup silently does.
 */
export const retentionRepository = {
  deleteStaleSessions(cutoff: Date) {
    return prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { not: null, lt: cutoff } }],
      },
    });
  },

  deleteStaleEmailVerificationTokens(cutoff: Date) {
    return prisma.emailVerificationToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
  },

  deleteStalePasswordResetTokens(cutoff: Date) {
    return prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
  },
};
