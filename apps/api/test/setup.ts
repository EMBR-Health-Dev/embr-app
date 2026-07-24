// Runs before any test file is imported (see vitest.config.ts setupFiles),
// so env.ts's eager `loadEnv()` call has what it needs by the time
// app.ts is first imported.
process.env.DATABASE_URL ??= "postgresql://embr:test@localhost:5432/embr_test?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
