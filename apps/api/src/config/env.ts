import { loadEnv } from "@embr/shared";
import { z } from "zod";

const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_FROM: z.string().default("no-reply@embr.health"),
  // Optional: local dev/test points at MailHog (see docker-compose.yml),
  // which accepts unauthenticated connections, so these have no
  // default and are simply omitted from the transport config when
  // unset. Any real provider (SES, Postmark, SendGrid, ...) requires
  // both — see mailer.ts's doc comment for what was actually missing
  // here before this.
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Defaults match MailHog's plaintext-friendly local setup. A real
  // deployment should set SMTP_REQUIRE_TLS=true explicitly — this is
  // never inferred from SMTP_USER/SMTP_PASS being present, since
  // that's a decision worth making deliberately, not guessing at.
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_REQUIRE_TLS: z.coerce.boolean().default(false),

  // ---- Retention (closed-beta minimum) ----
  // Applies only to already-dead rows (expired tokens, expired/revoked
  // sessions) — see retention.repository.ts's doc comment. Deliberately
  // NOT covering AuditLog, which has its own separate, undecided policy
  // — see docs/RETENTION.md.
  RETENTION_GRACE_PERIOD_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // ---- Auth (Milestone 2) ----
  APP_URL: z.string().default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 24 * 60 * 60),
  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60),
  PASSWORD_RESET_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.coerce.boolean().default(false),

  // ---- Observability (Milestone 11) ----
  // Optional by design: Sentry stays fully disabled (no-op init) when this
  // is unset, so local dev and CI never need a real DSN configured.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  // ---- Organizations (Milestone 12) ----
  ORG_INVITE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),
  // The k-anonymity floor for org-level aggregate trends: below this many
  // members with any logged data in range, organization.trends returns a
  // suppressed (empty) result rather than a small, individually-identifying
  // count. 5 is a conservative starting default, not a researched constant —
  // revisit once a real small-org pilot customer surfaces whether it's too
  // strict or too loose in practice.
  ORG_TRENDS_MIN_COHORT_SIZE: z.coerce.number().int().positive().default(5),

  // ---- SSO (Milestone 15) ----
  // Base64-encoded 32-byte (256-bit) key used to encrypt each
  // organization's OIDC client secret at rest (see sso.crypto.ts) — a
  // hash won't do here, unlike passwords, because the plaintext secret
  // must be recoverable to present to the IdP's token endpoint on every
  // login. Rotating this key would invalidate every stored secret, so
  // treat it with the same care as JWT_ACCESS_SECRET.
  SSO_ENCRYPTION_KEY: z.string().refine((v) => {
    try {
      return Buffer.from(v, "base64").length === 32;
    } catch {
      return false;
    }
  }, "SSO_ENCRYPTION_KEY must be a base64-encoded 32-byte key"),
  // How long a single SSO login attempt's state/PKCE/nonce (stored in
  // Redis, keyed by the OAuth `state` value) stays valid — long enough
  // to cover a slow IdP login prompt (MFA, etc.), short enough that a
  // stale, unfinished attempt can't be replayed much later.
  SSO_STATE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60),

  // ---- EMBR BRIEF (Milestone 17) ----
  ANTHROPIC_API_KEY: z.string().min(1),
  // Pinned to a specific model rather than left to whatever "latest"
  // resolves to — a clinical-adjacent feature's output changing
  // shape/tone silently on a provider-side model swap is worse than
  // this needing a deliberate version bump later. Sonnet-tier: this
  // task (summarize structured data, generate neutrally-framed
  // discussion questions) doesn't need Opus-level reasoning, and
  // Haiku is a worse fit for a safety-sensitive, tone-sensitive task
  // like this one.
  ANTHROPIC_BRIEF_MODEL: z.string().default("claude-sonnet-5"),
});

export const env = loadEnv(apiEnvSchema);
export type ApiEnv = typeof env;
