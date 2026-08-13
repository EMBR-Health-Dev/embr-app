import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";

// vi.mock(...) below is hoisted above all other top-level code in this
// file, so any state its factory closes over must be created via
// vi.hoisted() — a plain `let` declared further down would be accessed
// before initialization once hoisting happens.
const { state, nextId } = vi.hoisted(() => {
  return {
    state: {
      users: [] as Array<{
        id: string;
        email: string;
        passwordHash: string;
        role: "MEMBER" | "ADMIN";
        emailVerifiedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>,
      sessions: [] as Array<{
        id: string;
        userId: string;
        refreshTokenHash: string;
        userAgent: string | null;
        ipAddress: string | null;
        expiresAt: Date;
        revokedAt: Date | null;
        replacedBySessionId: string | null;
        createdAt: Date;
      }>,
      auditLogEntries: [] as Array<{ action: string; userId: string | null; metadata?: unknown }>,
    },
    nextId: () => randomUUID(),
  };
});

const now = () => new Date();

vi.mock("../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG"), quit: vi.fn() },
}));

vi.mock("../src/modules/auth/mailer.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(({ where }: { where: { email?: string; id?: string } }) => {
        const found = state.users.find((u) => u.email === where.email || u.id === where.id);
        return Promise.resolve(found ?? null);
      }),
      create: vi.fn(({ data }: { data: { email: string; passwordHash: string } }) => {
        const user = {
          id: nextId(),
          email: data.email,
          passwordHash: data.passwordHash,
          role: "MEMBER" as const,
          emailVerifiedAt: null,
          createdAt: now(),
          updatedAt: now(),
        };
        state.users.push(user);
        return Promise.resolve(user);
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const user = state.users.find((u) => u.id === where.id)!;
        Object.assign(user, data);
        return Promise.resolve(user);
      }),
    },
    session: {
      create: vi.fn(
        ({
          data,
        }: {
          data: Omit<
            (typeof state.sessions)[number],
            "id" | "revokedAt" | "replacedBySessionId" | "createdAt"
          >;
        }) => {
          const session = {
            id: nextId(),
            ...data,
            revokedAt: null,
            replacedBySessionId: null,
            createdAt: now(),
          };
          state.sessions.push(session);
          return Promise.resolve(session);
        },
      ),
      findUnique: vi.fn(({ where }: { where: { refreshTokenHash: string } }) => {
        const found = state.sessions.find((s) => s.refreshTokenHash === where.refreshTokenHash);
        return Promise.resolve(found ?? null);
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const session = state.sessions.find((s) => s.id === where.id)!;
        Object.assign(session, data);
        return Promise.resolve(session);
      }),
      updateMany: vi.fn(
        ({ where, data }: { where: { userId: string }; data: Record<string, unknown> }) => {
          const matched = state.sessions.filter(
            (s) => s.userId === where.userId && s.revokedAt === null,
          );
          matched.forEach((s) => Object.assign(s, data));
          return Promise.resolve({ count: matched.length });
        },
      ),
      findMany: vi.fn(({ where }: { where: { userId: string } }) => {
        return Promise.resolve(
          state.sessions.filter((s) => s.userId === where.userId && s.revokedAt === null),
        );
      }),
    },
    emailVerificationToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: nextId() }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: nextId() }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn(
        ({ data }: { data: { action: string; userId: string | null; metadata?: unknown } }) => {
          state.auditLogEntries.push(data);
          return Promise.resolve({ id: nextId(), ...data });
        },
      ),
    },
    onboardingProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Fake tx object reuses the same mocked model methods above.
      const tx = { session: (await import("../src/lib/prisma.js")).prisma.session };
      return fn(tx);
    }),
  },
}));

const VALID_PASSWORD = "Sup3rSecret!Pass";

async function registerAndLogin(agent: ReturnType<typeof request.agent>, email: string) {
  await agent.post("/auth/register").send({ email, password: VALID_PASSWORD });
  const loginRes = await agent.post("/auth/login").send({ email, password: VALID_PASSWORD });
  return loginRes;
}

beforeEach(() => {
  state.users = [];
  state.sessions = [];
  state.auditLogEntries = [];
});

describe("POST /auth/register", () => {
  it("creates a user and never returns the password hash", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "new@embr.health", password: VALID_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("new@embr.health");
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.emailVerified).toBe(false);
  });

  it("rejects a weak password", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "weak@embr.health", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 for a duplicate email", async () => {
    const app = createApp();
    await request(app)
      .post("/auth/register")
      .send({ email: "dupe@embr.health", password: VALID_PASSWORD });
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "dupe@embr.health", password: VALID_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });
});

describe("POST /auth/login", () => {
  it("sets auth cookies and returns the user + access token on success", async () => {
    const app = createApp();
    await request(app)
      .post("/auth/register")
      .send({ email: "login@embr.health", password: VALID_PASSWORD });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "login@embr.health", password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("embr_at="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("embr_rt="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("embr_csrf="))).toBe(true);
  });

  it("returns 401 for a wrong password without revealing whether the account exists", async () => {
    const app = createApp();
    await request(app)
      .post("/auth/register")
      .send({ email: "wrongpw@embr.health", password: VALID_PASSWORD });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "wrongpw@embr.health", password: "WrongPassword123" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns the same 401 shape for a non-existent account", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ghost@embr.health", password: VALID_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("GET /auth/me", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user when authenticated via cookie", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "me@embr.health");

    const res = await agent.get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("me@embr.health");
  });
});

describe("CSRF protection", () => {
  it("rejects /auth/logout without a matching csrf header", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "csrf@embr.health");

    const res = await agent.post("/auth/logout");
    expect(res.status).toBe(403);
  });

  it("accepts /auth/logout when the csrf header matches the cookie", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const loginRes = await registerAndLogin(agent, "csrf2@embr.health");
    const csrfCookie = (loginRes.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("embr_csrf="))!
      .split(";")[0]
      .split("=")[1];

    const res = await agent.post("/auth/logout").set("x-csrf-token", csrfCookie);
    expect(res.status).toBe(204);
  });
});

describe("DELETE /auth/sessions/:id", () => {
  it("logs SESSION_REVOKED, matching the existing LOGOUT/LOGOUT_ALL coverage", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const loginRes = await registerAndLogin(agent, "revoke@embr.health");
    const csrfCookie = (loginRes.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("embr_csrf="))!
      .split(";")[0]
      .split("=")[1];

    const sessionsRes = await agent.get("/auth/sessions");
    const sessionId = sessionsRes.body.data[0].id;

    const res = await agent.delete(`/auth/sessions/${sessionId}`).set("x-csrf-token", csrfCookie);
    expect(res.status).toBe(204);

    const entry = state.auditLogEntries.find((e) => e.action === "SESSION_REVOKED");
    expect(entry).toBeDefined();
    expect((entry?.metadata as { sessionId?: string })?.sessionId).toBe(sessionId);
  });
});

describe("POST /auth/refresh", () => {
  it("rotates the refresh token and rejects reuse of the old one", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const loginRes = await registerAndLogin(agent, "refresh@embr.health");
    const csrfCookie = (loginRes.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("embr_csrf="))!
      .split(";")[0]
      .split("=")[1];

    const firstRefresh = await agent.post("/auth/refresh").set("x-csrf-token", csrfCookie);
    expect(firstRefresh.status).toBe(200);

    // The agent's cookie jar now holds the *rotated* refresh token, so to
    // replay the original one we snapshot it before rotating and send it
    // again manually.
    const originalRt = (loginRes.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("embr_rt="))!
      .split(";")[0];

    const replay = await request(app)
      .post("/auth/refresh")
      .set("Cookie", [originalRt, `embr_csrf=${csrfCookie}`])
      .set("x-csrf-token", csrfCookie);

    expect(replay.status).toBe(401);
  });
});

describe("Mobile auth (Bearer access token, body-presented refresh token)", () => {
  it("login response includes refreshToken, not just accessToken", async () => {
    const app = createApp();
    await request(app)
      .post("/auth/register")
      .send({ email: "mobile-login@embr.health", password: VALID_PASSWORD });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "mobile-login@embr.health", password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it("GET /auth/me works via Authorization header alone, no cookies at all", async () => {
    const app = createApp();
    await request(app)
      .post("/auth/register")
      .send({ email: "mobile-me@embr.health", password: VALID_PASSWORD });
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "mobile-me@embr.health", password: VALID_PASSWORD });

    // A fresh request(app) call, deliberately not the cookie-jar agent
    // — nothing here should depend on a cookie existing.
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${loginRes.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("mobile-me@embr.health");
  });

  it("POST /auth/refresh works from a refresh token in the body, no cookie or CSRF header", async () => {
    const app = createApp();
    await request(app)
      .post("/auth/register")
      .send({ email: "mobile-refresh@embr.health", password: VALID_PASSWORD });
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "mobile-refresh@embr.health", password: VALID_PASSWORD });

    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: loginRes.body.data.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    // Rotation applies here too — the response must carry the new token
    // forward, or a mobile client can refresh exactly once.
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.refreshToken).not.toBe(loginRes.body.data.refreshToken);
  });

  it("a body-presented refresh token also rotates and rejects reuse, same as the cookie path", async () => {
    const app = createApp();
    await request(app)
      .post("/auth/register")
      .send({ email: "mobile-rotate@embr.health", password: VALID_PASSWORD });
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "mobile-rotate@embr.health", password: VALID_PASSWORD });

    const firstToken = loginRes.body.data.refreshToken as string;
    const first = await request(app).post("/auth/refresh").send({ refreshToken: firstToken });
    expect(first.status).toBe(200);

    const replay = await request(app).post("/auth/refresh").send({ refreshToken: firstToken });
    expect(replay.status).toBe(401);
  });

  it("POST /auth/logout works from a refresh token in the body, no cookie or CSRF header", async () => {
    const app = createApp();
    await request(app)
      .post("/auth/register")
      .send({ email: "mobile-logout@embr.health", password: VALID_PASSWORD });
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "mobile-logout@embr.health", password: VALID_PASSWORD });

    const logoutRes = await request(app)
      .post("/auth/logout")
      .send({ refreshToken: loginRes.body.data.refreshToken });
    expect(logoutRes.status).toBe(204);

    // The logged-out token must actually be revoked, not just accepted
    // and ignored.
    const reuse = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: loginRes.body.data.refreshToken });
    expect(reuse.status).toBe(401);
  });

  it("does not relax CSRF for a genuinely cookie-authenticated refresh request", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "still-protected@embr.health");

    // Cookie is present (the agent has it from login) but no CSRF header
    // is sent — this must still be rejected exactly as before. The
    // exemption is for requests with no relevant cookie at all, not a
    // general weakening of the check.
    const res = await agent.post("/auth/refresh");
    expect(res.status).toBe(403);
  });
});
