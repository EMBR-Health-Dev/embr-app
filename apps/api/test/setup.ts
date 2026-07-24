// Runs before any test file is imported (see vitest.config.ts setupFiles),
// so env.ts's eager `loadEnv()` call has what it needs by the time
// app.ts is first imported.
process.env.DATABASE_URL ??= "postgresql://embr:test@localhost:5432/embr_test?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "test-only-access-secret-do-not-use-in-prod-32ch";
process.env.JWT_REFRESH_SECRET ??= "test-only-refresh-secret-do-not-use-in-prod-32ch";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
