import { describe, expect, it, vi } from "vitest";
import request from "supertest";

// Sign up is closed unless PUBLIC_REGISTRATION_ENABLED is true (setup.ts
// opens it for the other suites). env is read at import, so set it first.
process.env.PUBLIC_REGISTRATION_ENABLED = "false";

const prismaUserCreate = vi.fn();
vi.mock("../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG"), quit: vi.fn() },
}));
vi.mock("../src/modules/auth/mailer.js", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("../src/lib/prisma.js", () => ({
  prisma: { user: { create: prismaUserCreate, findUnique: vi.fn() } },
}));

const { createApp } = await import("../src/app.js");

describe("POST /auth/register while sign up is closed", () => {
  it("refuses with REGISTRATION_CLOSED and stores nothing", async () => {
    const res = await request(createApp())
      .post("/auth/register")
      .send({ email: "someone@example.test", password: "Sup3rSecret!Pass", consents: [] });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
    expect(prismaUserCreate).not.toHaveBeenCalled();
  });
});
