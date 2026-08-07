import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}));
vi.mock("../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG"), on: vi.fn() },
}));

// Error-handling audit: body-parser (and anything else built on the
// `http-errors` convention) throws a plain Error with a numeric
// `.status`/`.statusCode` already set to the right 4xx code. Before this
// fix, normalizeError (src/middleware/error-handler.ts) only recognized
// AppError and ZodError -- everything else, including these, fell through
// to the generic-Error branch and came back as a 500 INTERNAL_ERROR: wrong
// status code to a well-formed client mistake, logged at `error` instead
// of `warn`, and paged to Sentry as a real incident.
describe("malformed request bodies", () => {
  it("returns 400 VALIDATION_ERROR (not 500) for malformed JSON", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send("{not valid json");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.requestId).toBeDefined();
  });
});
