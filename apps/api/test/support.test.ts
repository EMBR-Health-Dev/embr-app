import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The route touches neither Prisma nor Redis, but createApp() mounts
// routers that import them: the same mocks public-assessment.test.ts uses.
vi.mock("../src/lib/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}));
vi.mock("../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
}));
const sendSupportMessageEmail = vi.fn();
vi.mock("../src/modules/auth/mailer.js", () => ({
  verifyMailTransport: vi.fn().mockResolvedValue(undefined),
  isEmailConfigured: () => true,
  sendSupportMessageEmail: (...args: unknown[]) => sendSupportMessageEmail(...args),
}));
const loggerInfo = vi.fn();
vi.mock("../src/lib/logger.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/logger.js")>();
  return {
    ...actual,
    logger: new Proxy(actual.logger, {
      get(target, prop) {
        if (prop === "info") return loggerInfo;
        return Reflect.get(target, prop);
      },
    }),
  };
});

const valid = {
  topic: "SIGN_IN",
  message: "I never got the email with my sign in link.",
  replyEmail: "Maya@Example.com",
  page: "/login",
  platform: "web",
};

async function app() {
  const { createApp } = await import("../src/app.js");
  return createApp();
}

beforeEach(() => {
  sendSupportMessageEmail.mockReset().mockResolvedValue(true);
  loggerInfo.mockReset();
});

describe("POST /support/messages", () => {
  it("sends the message to the support inbox without needing an account", async () => {
    const res = await request(await app())
      .post("/support/messages")
      .send(valid);
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ received: true });
    expect(sendSupportMessageEmail).toHaveBeenCalledWith({
      ...valid,
      replyEmail: "maya@example.com",
    });
  });

  it("never logs the message itself, only its topic", async () => {
    await request(await app())
      .post("/support/messages")
      .send(valid);
    const logged = JSON.stringify(loggerInfo.mock.calls);
    expect(logged).toContain("SIGN_IN");
    expect(logged).not.toContain("sign in link");
    expect(logged).not.toContain("maya@example.com");
  });

  it("says so with a 503 when the email could not be sent, rather than claiming it was", async () => {
    sendSupportMessageEmail.mockResolvedValue(false);
    const res = await request(await app())
      .post("/support/messages")
      .send(valid);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("SUPPORT_UNAVAILABLE");
  });

  it("refuses a missing email, an unknown topic, a too short message and a page with a query string", async () => {
    const a = await app();
    for (const body of [
      { ...valid, replyEmail: "nope" },
      { ...valid, topic: "HEALTH" },
      { ...valid, message: "help" },
      { ...valid, page: "/brief?from=2026-01-01" },
    ]) {
      const res = await request(a).post("/support/messages").send(body);
      expect(res.status).toBe(400);
    }
    expect(sendSupportMessageEmail).not.toHaveBeenCalled();
  });

  it("accepts and quietly drops a message with the bot field filled in", async () => {
    const res = await request(await app())
      .post("/support/messages")
      .send({ ...valid, company: "Acme" });
    expect(res.status).toBe(202);
    expect(sendSupportMessageEmail).not.toHaveBeenCalled();
  });
});
