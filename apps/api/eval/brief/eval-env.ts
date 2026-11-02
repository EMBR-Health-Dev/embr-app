/**
 * Imported first by run.ts. The modules the harness reuses validate the
 * whole server environment on import (src/config/env.ts), although the
 * harness touches no database, cache or session. These placeholders
 * only satisfy that validation; none is ever used to connect anywhere.
 * ANTHROPIC_API_KEY is filled with a placeholder in replay mode only:
 * live mode needs the real key from the caller's environment.
 */
const live = process.argv.includes("--live");
const placeholders: Record<string, string> = {
  DATABASE_URL: "postgresql://eval:eval@localhost:5432/unused",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "eval-harness-placeholder-not-a-secret-32ch",
  JWT_REFRESH_SECRET: "eval-harness-placeholder-not-a-secret-32ch",
  SSO_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};
for (const [key, value] of Object.entries(placeholders)) process.env[key] ??= value;
if (!live) {
  process.env.ANTHROPIC_API_KEY ??= "eval-replay-placeholder";
  // The truncated and malformed synthetic cases log parse failures by
  // design; the report already records them.
  process.env.LOG_LEVEL ??= "fatal";
}
if (live && !process.env.ANTHROPIC_API_KEY) {
  console.error("Live mode needs ANTHROPIC_API_KEY in the environment.");
  process.exit(1);
}
