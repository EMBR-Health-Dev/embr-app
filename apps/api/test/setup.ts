// Runs before any test file is imported (see vitest.config.ts setupFiles),
// so env.ts's eager `loadEnv()` call has what it needs by the time
// app.ts is first imported.
process.env.DATABASE_URL ??= "postgresql://embr:test@localhost:5432/embr_test?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "test-only-access-secret-do-not-use-in-prod-32ch";
process.env.JWT_REFRESH_SECRET ??= "test-only-refresh-secret-do-not-use-in-prod-32ch";
// 32 zero bytes, base64-encoded — fine for tests, never for a real
// deployment (see env.ts's doc comment on the real key's rotation cost).
process.env.SSO_ENCRYPTION_KEY ??= Buffer.alloc(32).toString("base64");
// Never actually called in tests — brief.ai.ts is mocked wherever it
// matters — this just satisfies env.ts's required-field validation at
// boot.
process.env.ANTHROPIC_API_KEY ??= "test-only-placeholder-not-a-real-key";
// Same reasoning as ANTHROPIC_API_KEY above — the `stripe` package is
// mocked wherever billing.test.ts exercises real behavior; this just
// makes isBillingConfigured() true by default so route tests don't all
// need to stub these individually. Tests of the "billing isn't
// configured" 503 path mutate `env` directly and restore it afterward
// — see billing.test.ts.
process.env.STRIPE_SECRET_KEY ??= "sk_test_placeholder";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_placeholder";
process.env.STRIPE_SEAT_PRICE_ID ??= "price_test_placeholder";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
