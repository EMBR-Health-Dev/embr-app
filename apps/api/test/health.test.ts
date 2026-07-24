import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}));
vi.mock("../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
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
