import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

/**
 * Single shared transport. In dev/test this points at MailHog (see
 * docker-compose.yml) so verification/reset links can be inspected in a
 * browser without a real mail provider; swap SMTP_* for a real provider
 * (SES, Postmark, ...) in production — the calling code never changes.
 *
 * `auth` is only included when both SMTP_USER and SMTP_PASS are set —
 * MailHog accepts unauthenticated connections, so local dev/test never
 * sets these. Before this, the transport had no auth option at all,
 * meaning it could never actually authenticate with any real provider
 * regardless of what credentials were supplied via env vars — every
 * one of them requires SMTP auth to send anything.
 */
const auth =
  env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined;

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  requireTLS: env.SMTP_REQUIRE_TLS,
  auth,
});

/** Verifies the transport can actually connect and (if configured)
 * authenticate — used by the /health/ready check so a broken SMTP
 * config is visible before a real user's verification email silently
 * fails to send. Deliberately not part of the readiness check's
 * overall pass/fail status (see health.ts) — email being down
 * shouldn't pull an otherwise-healthy API instance out of a load
 * balancer's rotation. */
export async function verifyMailTransport(): Promise<void> {
  await transport.verify();
}

async function sendMail(to: string, subject: string, html: string, text: string) {
  try {
    await transport.sendMail({ from: env.SMTP_FROM, to, subject, html, text });
  } catch (err) {
    // Email delivery failure should never crash a registration/reset
    // flow that otherwise succeeded server-side — log loudly and let
    // the user request a resend instead.
    logger.error({ err, to, subject }, "failed to send email");
  }
}

export async function sendVerificationEmail(to: string, token: string) {
  const link = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendMail(
    to,
    "Verify your EMBR account",
    `<p>Welcome to EMBR. Please confirm your email address:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${Math.round(env.EMAIL_VERIFICATION_TTL_SECONDS / 3600)} hours.</p>`,
    `Welcome to EMBR. Verify your email: ${link}`,
  );
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail(
    to,
    "Reset your EMBR password",
    `<p>We received a request to reset your password.</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can safely ignore this email. This link expires in ${Math.round(env.PASSWORD_RESET_TTL_SECONDS / 60)} minutes.</p>`,
    `Reset your password: ${link}`,
  );
}

export async function sendOrganizationInviteEmail(
  to: string,
  organizationName: string,
  token: string,
) {
  const link = `${env.APP_URL}/organizations/accept-invite?token=${encodeURIComponent(token)}`;
  await sendMail(
    to,
    `You've been invited to join ${organizationName} on EMBR`,
    `<p>You've been invited to join <strong>${organizationName}</strong> on EMBR.</p><p><a href="${link}">${link}</a></p><p>This link expires in ${Math.round(env.ORG_INVITE_TTL_SECONDS / (24 * 60 * 60))} days. If you weren't expecting this, you can safely ignore this email.</p>`,
    `You've been invited to join ${organizationName} on EMBR: ${link}`,
  );
}
