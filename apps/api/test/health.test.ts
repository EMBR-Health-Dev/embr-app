import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}));
vi.mock("../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
}));

const { mockVerifyMailTransport } = vi.hoisted(() => ({
  mockVerifyMailTransport: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/modules/auth/mailer.js", () => ({
  verifyMailTransport: mockVerifyMailTransport,
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendOrganizationInviteEmail: vi.fn(),
}));

describe("GET /health/live", () => {
  it("returns 200 with status ok", async () => {
    const app = createApp();
    const res = await request(app).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /health/ready", () => {
  it("returns 200 and reports database + redis as ok when dependencies are healthy", async () => {
    const app = createApp();
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.checks.database.status).toBe("ok");
    expect(res.body.checks.redis.status).toBe("ok");
  });

  it("reports smtp as ok when the mail transport verifies successfully", async () => {
    mockVerifyMailTransport.mockResolvedValueOnce(undefined);
    const app = createApp();
    const res = await request(app).get("/health/ready");
    expect(res.body.checks.smtp.status).toBe("ok");
  });

  it("reports smtp as down without affecting overall status — email is not on the critical path", async () => {
    mockVerifyMailTransport.mockRejectedValueOnce(new Error("SMTP auth failed"));
    const app = createApp();
    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.checks.smtp.status).toBe("down");
    expect(res.body.checks.smtp.message).toContain("SMTP auth failed");
    // Database/Redis remaining healthy is what actually keeps the
    // overall status "ok" — confirms this isn't just an oversight.
    expect(res.body.checks.database.status).toBe("ok");
    expect(res.body.checks.redis.status).toBe("ok");
  });

  it("echoes back a client-supplied x-request-id header", async () => {
    const app = createApp();
    const res = await request(app).get("/health/live").set("x-request-id", "test-req-123");
    expect(res.headers["x-request-id"]).toBe("test-req-123");
  });
});

describe("unmatched routes", () => {
  it("returns a consistent AppError JSON shape for 404s", async () => {
    const app = createApp();
    const res = await request(app).get("/this-route-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.requestId).toBeDefined();
  });
});
