import { afterEach, describe, expect, it, vi } from "vitest";

// env.ts's loadEnv() call is a top-level side effect that reads
// process.env once at import time — see apps/api/test/setup.ts's own
// comment on why every required var is pre-seeded there before any
// test file loads. To exercise these vars' parsing under several
// different combinations, each test below resets the module registry
// and re-imports env.ts fresh, after adjusting only the vars this test
// actually cares about — every other required var (DATABASE_URL, JWT
// secrets, etc.) stays exactly as setup.ts already left it.
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("boolean env var parsing", () => {
  // z.coerce.boolean() coerces via JavaScript's Boolean(value), which
  // treats any non-empty string — including the literal string
  // "false" — as truthy. That's the exact bug these tests guard
  // against: without env.ts's booleanEnvVar() preprocessing, every one
  // of these would incorrectly resolve to `true`.
  it.each(["SMTP_SECURE", "SMTP_REQUIRE_TLS", "COOKIE_SECURE"] as const)(
    "parses an explicit %s=false as false, not true",
    async (key) => {
      vi.resetModules();
      process.env[key] = "false";
      process.env.NODE_ENV = "development";

      const { env } = await import("../src/config/env.js");
      expect(env[key]).toBe(false);
    },
  );

  it.each(["SMTP_SECURE", "SMTP_REQUIRE_TLS", "COOKIE_SECURE"] as const)(
    "parses an explicit %s=0 as false",
    async (key) => {
      vi.resetModules();
      process.env[key] = "0";
      process.env.NODE_ENV = "development";

      const { env } = await import("../src/config/env.js");
      expect(env[key]).toBe(false);
    },
  );

  it.each(["SMTP_SECURE", "SMTP_REQUIRE_TLS", "COOKIE_SECURE"] as const)(
    "parses an explicit %s=true as true",
    async (key) => {
      vi.resetModules();
      process.env[key] = "true";
      process.env.NODE_ENV = "development";

      const { env } = await import("../src/config/env.js");
      expect(env[key]).toBe(true);
    },
  );

  it.each(["SMTP_SECURE", "SMTP_REQUIRE_TLS", "COOKIE_SECURE"] as const)(
    "parses %s case-insensitively (TRUE / FALSE)",
    async (key) => {
      vi.resetModules();
      process.env[key] = "FALSE";
      process.env.NODE_ENV = "development";

      const { env: envFalse } = await import("../src/config/env.js");
      expect(envFalse[key]).toBe(false);

      vi.resetModules();
      process.env[key] = "TRUE";
      const { env: envTrue } = await import("../src/config/env.js");
      expect(envTrue[key]).toBe(true);
    },
  );

  it("SMTP_SECURE and SMTP_REQUIRE_TLS default to false when unset, regardless of NODE_ENV", async () => {
    vi.resetModules();
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_REQUIRE_TLS;
    process.env.NODE_ENV = "production";

    const { env } = await import("../src/config/env.js");
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SMTP_REQUIRE_TLS).toBe(false);
  });
});

describe("env COOKIE_SECURE default", () => {
  it("defaults to true in production when COOKIE_SECURE is left unset", async () => {
    vi.resetModules();
    delete process.env.COOKIE_SECURE;
    process.env.NODE_ENV = "production";

    const { env } = await import("../src/config/env.js");
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it("defaults to false in development when COOKIE_SECURE is left unset", async () => {
    vi.resetModules();
    delete process.env.COOKIE_SECURE;
    process.env.NODE_ENV = "development";

    const { env } = await import("../src/config/env.js");
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it("defaults to false in test when COOKIE_SECURE is left unset", async () => {
    vi.resetModules();
    delete process.env.COOKIE_SECURE;
    process.env.NODE_ENV = "test";

    const { env } = await import("../src/config/env.js");
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it("still honors an explicit COOKIE_SECURE=false override in production", async () => {
    vi.resetModules();
    process.env.COOKIE_SECURE = "false";
    process.env.NODE_ENV = "production";

    const { env } = await import("../src/config/env.js");
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it("still honors an explicit COOKIE_SECURE=true override in development", async () => {
    vi.resetModules();
    process.env.COOKIE_SECURE = "true";
    process.env.NODE_ENV = "development";

    const { env } = await import("../src/config/env.js");
    expect(env.COOKIE_SECURE).toBe(true);
  });
});
