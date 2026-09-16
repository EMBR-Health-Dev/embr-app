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
  // of these would incorrectly resolve to `true`. COOKIE_SECURE is the
  // only remaining consumer of booleanEnvVar() since the SMTP_SECURE/
  // SMTP_REQUIRE_TLS fields were removed with the Nodemailer→Resend
  // migration — kept as an `it.each` (rather than collapsing to plain
  // `it`s) so a future second boolean env var slots in without
  // restructuring these.
  it.each(["COOKIE_SECURE"] as const)(
    "parses an explicit %s=false as false, not true",
    async (key) => {
      vi.resetModules();
      process.env[key] = "false";
      process.env.NODE_ENV = "development";

      const { env } = await import("../src/config/env.js");
      expect(env[key]).toBe(false);
    },
  );

  it.each(["COOKIE_SECURE"] as const)("parses an explicit %s=0 as false", async (key) => {
    vi.resetModules();
    process.env[key] = "0";
    process.env.NODE_ENV = "development";

    const { env } = await import("../src/config/env.js");
    expect(env[key]).toBe(false);
  });

  it.each(["COOKIE_SECURE"] as const)("parses an explicit %s=true as true", async (key) => {
    vi.resetModules();
    process.env[key] = "true";
    process.env.NODE_ENV = "development";

    const { env } = await import("../src/config/env.js");
    expect(env[key]).toBe(true);
  });

  it.each(["COOKIE_SECURE"] as const)(
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
});

describe("env COOKIE_SECURE default", () => {
  it("defaults to true in production when COOKIE_SECURE is left unset", async () => {
    vi.resetModules();
    delete process.env.COOKIE_SECURE;
    process.env.NODE_ENV = "production";
    // APP_URL/CORS_ORIGIN are also required in production (see below) —
    // set explicitly here so this test only exercises COOKIE_SECURE.
    process.env.APP_URL = "https://embrhealthcare.com";
    process.env.CORS_ORIGIN = "https://embrhealthcare.com";

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
    process.env.APP_URL = "https://embrhealthcare.com";
    process.env.CORS_ORIGIN = "https://embrhealthcare.com";

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

describe("env APP_URL / CORS_ORIGIN production requirement", () => {
  // Forgetting to set these in production doesn't crash on its own —
  // it silently bakes localhost into real password-reset/verification/
  // org-invite emails, SSO redirects, and Stripe return URLs (APP_URL),
  // or makes the API reject every real browser origin (CORS_ORIGIN).
  // Both must fail loudly at boot instead.
  it.each(["APP_URL", "CORS_ORIGIN"] as const)(
    "exits the process with a clear message when %s is unset in production",
    async (key) => {
      vi.resetModules();
      const sibling = key === "APP_URL" ? "CORS_ORIGIN" : "APP_URL";
      delete process.env[key];
      process.env[sibling] = "https://embrhealthcare.com";
      process.env.NODE_ENV = "production";
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await import("../src/config/env.js");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy.mock.calls.flat().join("\n")).toContain(
        `${key} has no safe default in production`,
      );
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    },
  );

  it.each(["APP_URL", "CORS_ORIGIN"] as const)(
    "still honors an explicit %s value in production",
    async (key) => {
      vi.resetModules();
      const sibling = key === "APP_URL" ? "CORS_ORIGIN" : "APP_URL";
      process.env[key] = "https://embrhealthcare.com";
      process.env[sibling] = "https://embrhealthcare.com";
      process.env.NODE_ENV = "production";

      const { env } = await import("../src/config/env.js");
      expect(env[key]).toBe("https://embrhealthcare.com");
    },
  );

  it.each(["APP_URL", "CORS_ORIGIN"] as const)(
    "still defaults to localhost outside production when %s is unset",
    async (key) => {
      vi.resetModules();
      delete process.env[key];
      process.env.NODE_ENV = "development";

      const { env } = await import("../src/config/env.js");
      expect(env[key]).toBe("http://localhost:3000");
    },
  );
});
