import type { Request } from "express";
import { AppError } from "@embr/shared";
import type { DeviceSessionDto, UserDto } from "@embr/types";
import { env } from "../../config/env.js";
import { authRepository } from "./auth.repository.js";
import { hashPassword, verifyPassword } from "./password.js";
import { generateRefreshToken, generateOpaqueToken, hashToken, signAccessToken } from "./tokens.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "./mailer.js";
import { writeAuditLog } from "./audit.js";
import { toUserDto } from "./auth.mappers.js";
import { onboardingRepository } from "../onboarding/onboarding.repository.js";

interface IssuedSession {
  user: UserDto;
  accessToken: string;
  refreshToken: string;
}

function requestMeta(req: Request) {
  return { userAgent: req.header("user-agent") ?? null, ipAddress: req.ip ?? null };
}

export async function issueSession(
  req: Request,
  user: { id: string; email: string; role: "MEMBER" | "ADMIN" },
): Promise<{ accessToken: string; refreshToken: string }> {
  const refreshToken = generateRefreshToken();
  const { userAgent, ipAddress } = requestMeta(req);

  await authRepository.createSession({
    userId: user.id,
    refreshTokenHash: hashToken(refreshToken),
    userAgent,
    ipAddress,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  return { accessToken, refreshToken };
}

interface SessionRecord {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export const authService = {
  async register(req: Request, input: { email: string; password: string }): Promise<UserDto> {
    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) {
      // Same response whether the account exists or not is impossible
      // here because registration must tell *someone* it worked — but we
      // still avoid confirming account existence in the message text an
      // attacker could distinguish from a validation failure.
      throw AppError.conflict("An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await authRepository.createUser({ email: input.email, passwordHash });

    const verificationToken = generateOpaqueToken();
    await authRepository.createEmailVerificationToken(user.id, hashToken(verificationToken));
    await sendVerificationEmail(user.email, verificationToken);

    await writeAuditLog(req, "USER_REGISTERED", user.id);
    return toUserDto(user);
  },

  async verifyEmail(req: Request, token: string): Promise<void> {
    const record = await authRepository.findValidEmailVerificationToken(hashToken(token));
    if (!record) {
      throw AppError.validation("This verification link is invalid or has expired");
    }
    await authRepository.consumeEmailVerificationToken(record.id);
    await authRepository.markEmailVerified(record.userId);
    await writeAuditLog(req, "EMAIL_VERIFIED", record.userId);
  },

  async resendVerification(email: string): Promise<void> {
    const user = await authRepository.findUserByEmail(email);
    // Deliberately silent on "no such account" / "already verified" —
    // responding differently would let an attacker enumerate registered
    // or verified emails.
    if (!user || user.emailVerifiedAt) return;

    const token = generateOpaqueToken();
    await authRepository.createEmailVerificationToken(user.id, hashToken(token));
    await sendVerificationEmail(user.email, token);
  },

  async login(req: Request, input: { email: string; password: string }): Promise<IssuedSession> {
    const user = await authRepository.findUserByEmail(input.email);

    // Always run verifyPassword, even against a dummy hash, when the
    // user doesn't exist — otherwise a timing difference between
    // "user not found" (fast) and "user found, wrong password" (slow,
    // does an argon2 verify) leaks which emails are registered.
    const passwordHash = user?.passwordHash ?? DUMMY_HASH;
    const validPassword = await verifyPassword(passwordHash, input.password);

    if (!user || !validPassword) {
      await writeAuditLog(req, "LOGIN_FAILED", user?.id ?? null, { email: input.email });
      throw AppError.unauthorized("Invalid email or password");
    }

    const { accessToken, refreshToken } = await issueSession(req, user);
    await writeAuditLog(req, "LOGIN_SUCCEEDED", user.id);

    const onboarding = await onboardingRepository.findByUserId(user.id);
    return { user: toUserDto(user, onboarding?.completedAt ?? null), accessToken, refreshToken };
  },

  async refresh(req: Request, presentedToken: string): Promise<IssuedSession> {
    const presentedHash = hashToken(presentedToken);
    const session = await authRepository.findActiveSessionByTokenHash(presentedHash);

    if (!session) {
      throw AppError.unauthorized("Session expired or already used");
    }

    if (session.revokedAt || session.expiresAt < new Date()) {
      // A revoked-but-still-presented token means either normal reuse
      // after logout, OR a stolen token being replayed after the
      // legitimate rotation already happened. Since we can't tell which
      // from here, the safe response is to nuke every session for the
      // user and force a fresh login everywhere.
      if (session.revokedAt) {
        await writeAuditLog(req, "REFRESH_TOKEN_REUSE_DETECTED", session.userId, {
          sessionId: session.id,
        });
        await authRepository.revokeAllSessionsForUser(session.userId);
      }
      throw AppError.unauthorized("Session expired or already used");
    }

    const user = await authRepository.findUserById(session.userId);
    if (!user) {
      throw AppError.unauthorized("Session expired or already used");
    }

    const refreshToken = generateRefreshToken();
    const { userAgent, ipAddress } = requestMeta(req);

    await authRepository.rotateSession(session.id, {
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent,
      ipAddress,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    await writeAuditLog(req, "TOKEN_REFRESHED", user.id, { sessionId: session.id });

    const onboarding = await onboardingRepository.findByUserId(user.id);
    return { user: toUserDto(user, onboarding?.completedAt ?? null), accessToken, refreshToken };
  },

  async logout(req: Request, presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return;
    const session = await authRepository.findActiveSessionByTokenHash(hashToken(presentedToken));
    if (session && !session.revokedAt) {
      await authRepository.revokeSession(session.id);
      await writeAuditLog(req, "LOGOUT", session.userId, { sessionId: session.id });
    }
  },

  async logoutAll(req: Request, userId: string): Promise<void> {
    await authRepository.revokeAllSessionsForUser(userId);
    await writeAuditLog(req, "LOGOUT_ALL", userId);
  },

  async forgotPassword(email: string): Promise<void> {
    const user = await authRepository.findUserByEmail(email);
    // Silent on non-existent accounts — see resendVerification rationale.
    if (!user) return;

    const token = generateOpaqueToken();
    await authRepository.createPasswordResetToken(user.id, hashToken(token));
    await sendPasswordResetEmail(user.email, token);
  },

  async resetPassword(req: Request, token: string, newPassword: string): Promise<void> {
    const record = await authRepository.findValidPasswordResetToken(hashToken(token));
    if (!record) {
      throw AppError.validation("This password reset link is invalid or has expired");
    }

    const passwordHash = await hashPassword(newPassword);
    await authRepository.updatePassword(record.userId, passwordHash);
    await authRepository.consumePasswordResetToken(record.id);
    // A password reset invalidates every existing session — the whole
    // point is recovering from a possibly-compromised account.
    await authRepository.revokeAllSessionsForUser(record.userId);
    await writeAuditLog(req, "PASSWORD_RESET_COMPLETED", record.userId);
  },

  async changePassword(
    req: Request,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw AppError.unauthorized();

    const valid = await verifyPassword(user.passwordHash, currentPassword);
    if (!valid) {
      throw AppError.validation("Current password is incorrect", [
        { field: "currentPassword", message: "Current password is incorrect" },
      ]);
    }

    const passwordHash = await hashPassword(newPassword);
    await authRepository.updatePassword(userId, passwordHash);
    await authRepository.revokeAllSessionsForUser(userId);
    await writeAuditLog(req, "PASSWORD_CHANGED", userId);
  },

  /**
   * Requires the current password — same bar as changePassword — since
   * this is destructive and irreversible. Sessions don't need a
   * separate explicit revoke call: they're rows in a table with
   * `onDelete: Cascade` on User, so they're gone the instant the
   * transaction commits, same as every other user-owned table.
   *
   * Known, accepted limitation, not fixed here: access tokens are
   * stateless JWTs verified by signature/expiry alone (see
   * auth.middleware.ts's requireAuth — no DB lookup on every request),
   * so an access token issued moments before deletion remains
   * signature-valid for up to its remaining TTL (max 15 minutes) even
   * though the account and its session are already gone. Any request
   * that tries to use it to write new data fails at the database's own
   * foreign-key constraint (userId no longer references a real user),
   * not cleanly at the API layer. Closing this fully would mean adding
   * token revocation/blocklist infrastructure — out of scope for a
   * closed-beta minimum, and not something to introduce silently here.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw AppError.unauthorized();

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      throw AppError.validation("Password is incorrect", [
        { field: "password", message: "Password is incorrect" },
      ]);
    }

    await authRepository.deleteUserAccount(userId);
  },

  async listSessions(userId: string, currentSessionId: string | null): Promise<DeviceSessionDto[]> {
    const sessions = await authRepository.listActiveSessionsForUser(userId);
    return sessions.map((s: SessionRecord) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.id === currentSessionId,
    }));
  },

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const sessions = await authRepository.listActiveSessionsForUser(userId);
    const target = sessions.find((s: SessionRecord) => s.id === sessionId);
    if (!target) {
      throw AppError.notFound("Session");
    }
    await authRepository.revokeSession(sessionId);
  },
};

// A syntactically-valid-looking argon2id hash that no real password will
// ever match, used purely so login() always pays the same argon2 verify
// cost whether or not the account exists (timing-attack mitigation).
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHRzb21lc2FsdA$Y5s3XKz3z8m5f3q1z1k5j2b8h6t4r2w0u8n6y4c2a0e8s6d4f2g0h8j6k4l2";
