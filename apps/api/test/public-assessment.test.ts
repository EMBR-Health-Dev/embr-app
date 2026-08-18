import { describe, expect, it, vi } from "vitest";
import request from "supertest";

// This route touches neither Prisma nor Redis, but createApp() mounts
// every router unconditionally, including health checks that do —
// same mocks health.test.ts already needs for the identical reason.
vi.mock("../src/lib/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}));
vi.mock("../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
}));
vi.mock("../src/modules/auth/mailer.js", () => ({
  verifyMailTransport: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendOrganizationInviteEmail: vi.fn(),
}));

describe("POST /public/perimenopause-assessment", () => {
  it("requires no authentication at all — no cookie, no token, no session", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app)
      .post("/public/perimenopause-assessment")
      .send({ symptoms: ["HOT_FLASH"], hasIrregularPeriods: false });

    // 401 would mean requireAuth() is (incorrectly) applied to this
    // route; confirming the real 200 path, not just "not 401", proves
    // the whole unauthenticated flow genuinely works end to end.
    expect(res.status).toBe(200);
  });

  it("returns a real scored result for a low-tier submission", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app)
      .post("/public/perimenopause-assessment")
      .send({ symptoms: ["HOT_FLASH"], hasIrregularPeriods: false });

    expect(res.body.data).toEqual({ score: 1, tier: "low" });
    expect(res.body.requestId).toBeDefined();
  });

  it("returns a real scored result for a high-tier submission", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app)
      .post("/public/perimenopause-assessment")
      .send({ symptoms: ["HOT_FLASH", "FATIGUE", "BRAIN_FOG"], hasIrregularPeriods: false });

    expect(res.body.data).toEqual({ score: 3, tier: "high" });
  });

  it("the response never contains anything beyond score and tier", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app)
      .post("/public/perimenopause-assessment")
      .send({ symptoms: ["HOT_FLASH"], hasIrregularPeriods: true });

    expect(Object.keys(res.body.data).sort()).toEqual(["score", "tier"]);
  });

  it("rejects an invalid symptom category", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app)
      .post("/public/perimenopause-assessment")
      .send({ symptoms: ["NOT_A_REAL_CATEGORY"], hasIrregularPeriods: false });

    expect(res.status).toBe(400);
  });

  it("rejects unknown extra fields (strict schema)", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app)
      .post("/public/perimenopause-assessment")
      .send({ symptoms: ["HOT_FLASH"], hasIrregularPeriods: false, email: "test@example.com" });

    expect(res.status).toBe(400);
  });

  it("rejects a missing hasIrregularPeriods field", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app)
      .post("/public/perimenopause-assessment")
      .send({ symptoms: ["HOT_FLASH"] });

    expect(res.status).toBe(400);
  });
});

describe("CORS with multiple allowed origins", () => {
  it("reflects Access-Control-Allow-Origin for an origin in the allowlist", async () => {
    vi.resetModules();
    vi.doMock("../src/config/env.js", async () => {
      const actual =
        await vi.importActual<typeof import("../src/config/env.js")>("../src/config/env.js");
      return {
        env: { ...actual.env, CORS_ORIGIN: "http://localhost:3000,https://embrhealthcare.com" },
      };
    });

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app)
      .post("/public/perimenopause-assessment")
      .set("Origin", "https://embrhealthcare.com")
      .send({ symptoms: ["HOT_FLASH"], hasIrregularPeriods: false });

    expect(res.headers["access-control-allow-origin"]).toBe("https://embrhealthcare.com");
    expect(res.status).toBe(200);

    vi.doUnmock("../src/config/env.js");
  });

  it("does not reflect Access-Control-Allow-Origin for an origin outside the allowlist", async () => {
    vi.resetModules();
    vi.doMock("../src/config/env.js", async () => {
      const actual =
        await vi.importActual<typeof import("../src/config/env.js")>("../src/config/env.js");
      return {
        env: { ...actual.env, CORS_ORIGIN: "http://localhost:3000,https://embrhealthcare.com" },
      };
    });

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app)
      .post("/public/perimenopause-assessment")
      .set("Origin", "https://not-an-allowed-origin.example.com")
      .send({ symptoms: ["HOT_FLASH"], hasIrregularPeriods: false });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();

    vi.doUnmock("../src/config/env.js");
  });

  it("still allows the original single default origin unchanged (no regression for the app's own frontend)", async () => {
    vi.resetModules();
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app)
      .post("/public/perimenopause-assessment")
      .set("Origin", "http://localhost:3000")
      .send({ symptoms: ["HOT_FLASH"], hasIrregularPeriods: false });

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});
