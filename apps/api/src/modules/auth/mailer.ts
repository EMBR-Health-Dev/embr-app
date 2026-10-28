import { Resend } from "resend";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import type { Locale } from "../../lib/locale.js";

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

// Transactional emails follow the language of the request that caused
// them (the client's own Accept-Language, see lib/locale.ts). Japanese
// has no email copy yet, so it gets English, as it did before French.
function isFrench(locale: Locale): boolean {
  return locale === "fr";
}

export async function sendVerificationEmail(to: string, token: string, locale: Locale = "en") {
  const link = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const hours = Math.round(env.EMAIL_VERIFICATION_TTL_SECONDS / 3600);
  if (isFrench(locale)) {
    await sendMail(
      to,
      "Vérifiez votre compte EMBR",
      `<p>Bienvenue sur EMBR. Veuillez confirmer votre adresse e-mail\u00a0:</p><p><a href="${link}">${link}</a></p><p>Ce lien expire dans ${hours}\u00a0heures.</p>`,
      `Bienvenue sur EMBR. Vérifiez votre e-mail\u00a0: ${link}`,
    );
    return;
  }
  await sendMail(
    to,
    "Verify your EMBR account",
    `<p>Welcome to EMBR. Please confirm your email address:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${hours} hours.</p>`,
    `Welcome to EMBR. Verify your email: ${link}`,
  );
}

export async function sendPasswordResetEmail(to: string, token: string, locale: Locale = "en") {
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const minutes = Math.round(env.PASSWORD_RESET_TTL_SECONDS / 60);
  if (isFrench(locale)) {
    await sendMail(
      to,
      "Réinitialisez votre mot de passe EMBR",
      `<p>Nous avons reçu une demande de réinitialisation de votre mot de passe.</p><p><a href="${link}">${link}</a></p><p>Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail. Ce lien expire dans ${minutes}\u00a0minutes.</p>`,
      `Réinitialisez votre mot de passe\u00a0: ${link}`,
    );
    return;
  }
  await sendMail(
    to,
    "Reset your EMBR password",
    `<p>We received a request to reset your password.</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can safely ignore this email. This link expires in ${minutes} minutes.</p>`,
    `Reset your password: ${link}`,
  );
}

export async function sendLoginLinkEmail(to: string, token: string, locale: Locale = "en") {
  const link = `${env.APP_URL}/login-link?token=${encodeURIComponent(token)}`;
  const minutes = Math.round(env.LOGIN_LINK_TTL_SECONDS / 60);
  if (isFrench(locale)) {
    await sendMail(
      to,
      "Votre lien de connexion EMBR",
      `<p>Utilisez ce lien pour vous connecter à EMBR\u00a0:</p><p><a href="${link}">${link}</a></p><p>Il ne fonctionne qu’une fois et expire dans ${minutes}\u00a0minutes. Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail.</p>`,
      `Connectez-vous à EMBR\u00a0: ${link}`,
    );
    return;
  }
  await sendMail(
    to,
    "Your EMBR sign in link",
    `<p>Use this link to sign in to EMBR:</p><p><a href="${link}">${link}</a></p><p>It works once and expires in ${minutes} minutes. If you didn't request this, you can safely ignore this email.</p>`,
    `Sign in to EMBR: ${link}`,
  );
}

/**
 * The weekly reminder. Deliberately carries nothing from her record (no
 * counts, symptoms or dates): an inbox is not a private place. English,
 * Japanese and French together, since the account stores no language.
 */
export async function sendWeeklyReminderEmail(to: string) {
  const open = `${env.APP_URL}/timeline`;
  const settings = `${env.APP_URL}/settings`;
  await sendMail(
    to,
    "Your week in EMBR / EMBRの1週間 / Votre semaine dans EMBR",
    `<p>A short weekly reminder from EMBR. Take a minute to look back at your week: open your timeline to see what you recorded, log today, and create a BRIEF when you're ready.</p>` +
      `<p><a href="${open}">Open EMBR</a></p>` +
      `<p>EMBRから週に一度のお知らせです。少し時間をとって、この1週間を振り返ってみましょう。タイムラインで記録を確認し、今日の体調を記録して、準備ができたらBRIEFを作成してください。</p>` +
      `<p><a href="${open}">EMBRを開く</a></p>` +
      `<p>Un petit rappel hebdomadaire d’EMBR. Prenez une minute pour revoir votre semaine\u00a0: ouvrez votre chronologie pour voir ce que vous avez noté, faites la saisie du jour, et créez un BRIEF quand vous le souhaitez.</p>` +
      `<p><a href="${open}">Ouvrir EMBR</a></p>` +
      `<p>To stop these emails, turn off Weekly email in <a href="${settings}">Settings</a>.<br>このメールを停止するには、<a href="${settings}">設定</a>で週1回のメールをオフにしてください。<br>Pour ne plus recevoir ces e-mails, désactivez l’e-mail hebdomadaire dans les <a href="${settings}">Paramètres</a>.</p>`,
    `A short weekly reminder from EMBR. Take a minute to look back at your week: open your timeline to see what you recorded, log today, and create a BRIEF when you're ready.\n${open}\n\n` +
      `EMBRから週に一度のお知らせです。少し時間をとって、この1週間を振り返ってみましょう。タイムラインで記録を確認し、今日の体調を記録して、準備ができたらBRIEFを作成してください。\n${open}\n\n` +
      `Un petit rappel hebdomadaire d’EMBR. Prenez une minute pour revoir votre semaine\u00a0: ouvrez votre chronologie pour voir ce que vous avez noté, faites la saisie du jour, et créez un BRIEF quand vous le souhaitez.\n${open}\n\n` +
      `To stop these emails, turn off Weekly email in Settings: ${settings}\nこのメールを停止するには、設定で週1回のメールをオフにしてください：${settings}\nPour ne plus recevoir ces e-mails, désactivez l’e-mail hebdomadaire dans les Paramètres\u00a0: ${settings}`,
  );
}

export async function sendOrganizationInviteEmail(
  to: string,
  organizationName: string,
  token: string,
  locale: Locale = "en",
) {
  const link = `${env.APP_URL}/organizations/accept-invite?token=${encodeURIComponent(token)}`;
  const days = Math.round(env.ORG_INVITE_TTL_SECONDS / (24 * 60 * 60));
  if (isFrench(locale)) {
    await sendMail(
      to,
      `Invitation à rejoindre ${organizationName} sur EMBR`,
      `<p>Vous avez reçu une invitation à rejoindre <strong>${organizationName}</strong> sur EMBR.</p><p><a href="${link}">${link}</a></p><p>Ce lien expire dans ${days}\u00a0jours. Si vous ne vous attendiez pas à cette invitation, vous pouvez ignorer cet e-mail.</p>`,
      `Vous avez reçu une invitation à rejoindre ${organizationName} sur EMBR\u00a0: ${link}`,
    );
    return;
  }
  await sendMail(
    to,
    `You've been invited to join ${organizationName} on EMBR`,
    `<p>You've been invited to join <strong>${organizationName}</strong> on EMBR.</p><p><a href="${link}">${link}</a></p><p>This link expires in ${days} days. If you weren't expecting this, you can safely ignore this email.</p>`,
    `You've been invited to join ${organizationName} on EMBR: ${link}`,
  );
}
