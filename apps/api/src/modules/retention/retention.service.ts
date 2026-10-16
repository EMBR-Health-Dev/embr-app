import { env } from "../../config/env.js";
import { retentionRepository } from "./retention.repository.js";

export interface RetentionCleanupResult {
  sessionsDeleted: number;
  emailVerificationTokensDeleted: number;
  passwordResetTokensDeleted: number;
  loginLinkTokensDeleted: number;
  cutoff: string;
}

export const retentionService = {
  /** Runs all cleanup steps and returns counts — the caller (the
   * standalone script) is responsible for logging/alerting on the
   * result, this just does the deletion and reports what happened. */
  async runCleanup(): Promise<RetentionCleanupResult> {
    const cutoff = new Date(Date.now() - env.RETENTION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const [sessions, verificationTokens, resetTokens, loginLinkTokens] = await Promise.all([
      retentionRepository.deleteStaleSessions(cutoff),
      retentionRepository.deleteStaleEmailVerificationTokens(cutoff),
      retentionRepository.deleteStalePasswordResetTokens(cutoff),
      retentionRepository.deleteStaleLoginLinkTokens(cutoff),
    ]);

    return {
      sessionsDeleted: sessions.count,
      emailVerificationTokensDeleted: verificationTokens.count,
      passwordResetTokensDeleted: resetTokens.count,
      loginLinkTokensDeleted: loginLinkTokens.count,
      cutoff: cutoff.toISOString(),
    };
  },
};
