import { Resend } from "resend";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

/**
 * Resend's HTTPS API — replaces the previous Nodemailer/SMTP transport
 * entirely (see git history). Railway blocks outbound SMTP on all ports
 * below its Pro plan, and recommends HTTPS-API email providers even
 * where SMTP is available; there's deliberately no SMTP fallback here —
 * an HTTPS-only path doesn't depend on Railway's plan tier or outbound
 * port policy at all, which is the whole reason this migration exists.
 *
 * `resend` is null when RESEND_API_KEY is unset (local dev/CI without a
 * real Resend account) — sendMail() logs and no-ops in that case, the
 * same "never break the caller" contract the old SMTP transport had.
 */
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Resend's SDK has no documented request-timeout option (checked its
// shipped typings directly — ResendOptions only takes baseUrl/
// userAgent), so a stuck HTTPS request would otherwise hang however
// long fetch/the socket allows. This bounds it the same way the old
// SMTP transport's connectionTimeout/socketTimeout did, for the same
// reason: an external mail dependency should never be able to hang a
// registration/reset/invite request indefinitely.
const SEND_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Resend request timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * Whether a Resend API key is configured — used by /health/ready to
 * report email configuration without making a live API call. Resend has
 * no bare "verify these credentials" endpoint; the closest admin
 * endpoints (listing API keys/domains) require broader-than-sending
 * permissions, so probing one of those would falsely report "down" for
 * a correctly configured, least-privilege sending-only key — the right
 * key type for this exact use case. A presence check has no such
 * false-negative risk, and (like the SMTP check it replaces) is not on
 * the critical path: see health.ts, this never affects overall
 * readiness status.
 */
export function isEmailConfigured(): boolean {
  return resend !== null;
}

async function sendMail(to: string, subject: string, html: string, text: string) {
  if (!resend) {
    logger.warn({ to, subject }, "RESEND_API_KEY not configured — skipping email send");
    return;
  }

  try {
    const { error } = await withTimeout(
      resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text }),
      SEND_TIMEOUT_MS,
    );

    if (error) {
      // Resend's SDK returns failures as { data: null, error }, it
      // doesn't throw for them — this is the "log loudly, never break
      // the caller" branch for that response shape. The catch below
      // covers the separate case of the request itself failing (network
      // error, our own timeout above).
      logger.error({ error, to, subject }, "failed to send email via Resend");
    }
  } catch (err) {
    // Email delivery failure should never crash a registration/reset
    // flow that otherwise succeeded server-side — log loudly and let
    // the user request a resend instead.
    logger.error({ err, to, subject }, "failed to send email via Resend");
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
