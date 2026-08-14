import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";

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
      sessions: [] as Array<{ id: string; userId: string; revokedAt: Date | null }>,
      symptomLogs: [] as Array<{ id: string; userId: string }>,
      cycleEntries: [] as Array<{ id: string; userId: string }>,
      onboardingProfiles: [] as Array<{ id: string; userId: string }>,
      clinicalBriefs: [] as Array<{ id: string; userId: string }>,
      treatments: [] as Array<{ id: string; userId: string }>,
      emailVerificationTokens: [] as Array<{ id: string; userId: string }>,
      passwordResetTokens: [] as Array<{ id: string; userId: string }>,
      auditLogEntries: [] as Array<{ id: string; userId: string | null; action: string }>,
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
  sendOrganizationInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

/**
 * `deleteUserWhereCascade` simulates every `onDelete: Cascade` /
 * `SetNull` relation declared in schema.prisma for User — see
 * auth.repository.ts's deleteUserAccount doc comment for exactly which
 * tables and why. This mock's job is to make that expected behavior
 * observable to a unit test; it does NOT and cannot prove Postgres's
 * real foreign-key constraints behave this way — that's a schema-level
 * guarantee verified by direct inspection, not something a
 * mocked-Prisma unit test run in this sandbox (no real Postgres
 * available) can execute against.
 */
function deleteUserWhereCascade(userId: string) {
  state.users = state.users.filter((u) => u.id !== userId);
  state.sessions = state.sessions.filter((s) => s.userId !== userId);
  state.symptomLogs = state.symptomLogs.filter((l) => l.userId !== userId);
  state.cycleEntries = state.cycleEntries.filter((e) => e.userId !== userId);
  state.onboardingProfiles = state.onboardingProfiles.filter((p) => p.userId !== userId);
  state.clinicalBriefs = state.clinicalBriefs.filter((b) => b.userId !== userId);
  state.treatments = state.treatments.filter((t) => t.userId !== userId);
  state.emailVerificationTokens = state.emailVerificationTokens.filter((t) => t.userId !== userId);
  state.passwordResetTokens = state.passwordResetTokens.filter((t) => t.userId !== userId);
  for (const entry of state.auditLogEntries) {
    if (entry.userId === userId) entry.userId = null;
  }
}

vi.mock("../src/lib/prisma.js", () => {
  const txClient = {
    auditLog: {
      create: vi.fn(({ data }: { data: { userId: string | null; action: string } }) => {
        const entry = { id: nextId(), ...data };
        state.auditLogEntries.push(entry);
        return Promise.resolve(entry);
      }),
    },
    user: {
      delete: vi.fn(({ where }: { where: { id: string } }) => {
        const user = state.users.find((u) => u.id === where.id);
        if (!user) throw new Error("Record to delete does not exist.");
        deleteUserWhereCascade(where.id);
        return Promise.resolve(user);
      }),
    },
  };

  return {
    prisma: {
      $transaction: vi.fn((callback: (tx: typeof txClient) => Promise<unknown>) =>
        callback(txClient),
      ),
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
        update: vi.fn(
          ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const user = state.users.find((u) => u.id === where.id)!;
            Object.assign(user, data);
            return Promise.resolve(user);
          },
        ),
      },
      session: {
        create: vi.fn(({ data }: { data: { userId: string } }) => {
          const session = { id: nextId(), revokedAt: null, ...data };
          state.sessions.push(session);
          return Promise.resolve({ replacedBySessionId: null, createdAt: now(), ...session });
        }),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn(({ where }: { where?: { userId?: string } }) =>
          Promise.resolve(
            state.sessions.filter((s) => !where?.userId || s.userId === where.userId),
          ),
        ),
      },
      emailVerificationToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(({ data }: { data: { userId: string } }) => {
          const token = { id: nextId(), ...data };
          state.emailVerificationTokens.push(token);
          return Promise.resolve(token);
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      passwordResetToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(({ data }: { data: { userId: string } }) => {
          const token = { id: nextId(), ...data };
          state.passwordResetTokens.push(token);
          return Promise.resolve(token);
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn(({ data }: { data: { userId: string | null; action: string } }) => {
          const entry = { id: nextId(), ...data };
          state.auditLogEntries.push(entry);
          return Promise.resolve(entry);
        }),
      },
      symptomLog: {
        findMany: vi.fn(({ where }: { where?: { userId?: string } }) =>
          Promise.resolve(
            state.symptomLogs.filter((l) => !where?.userId || l.userId === where.userId),
          ),
        ),
      },
      cycleEntry: {
        findMany: vi.fn(({ where }: { where?: { userId?: string } }) =>
          Promise.resolve(
            state.cycleEntries.filter((e) => !where?.userId || e.userId === where.userId),
          ),
        ),
      },
      onboardingProfile: {
        findUnique: vi.fn(({ where }: { where: { userId: string } }) =>
          Promise.resolve(state.onboardingProfiles.find((p) => p.userId === where.userId) ?? null),
        ),
      },
      clinicalBrief: {
        findMany: vi.fn(({ where }: { where?: { userId?: string } }) =>
          Promise.resolve(
            state.clinicalBriefs.filter((b) => !where?.userId || b.userId === where.userId),
          ),
        ),
      },
      treatment: {
        findMany: vi.fn(({ where }: { where?: { userId?: string } }) =>
          Promise.resolve(
            state.treatments.filter((t) => !where?.userId || t.userId === where.userId),
          ),
        ),
      },
    },
  };
});

const VALID_PASSWORD = "Sup3rSecret!Pass";

async function registerAndLogin(agent: ReturnType<typeof request.agent>, email: string) {
  const register = await agent.post("/auth/register").send({ email, password: VALID_PASSWORD });
  const login = await agent.post("/auth/login").send({ email, password: VALID_PASSWORD });
  const csrfCookie = (login.headers["set-cookie"] as unknown as string[])
    .find((c: string) => c.startsWith("embr_csrf="))!
    .split(";")[0]
    .split("=")[1]!;
  return { userId: register.body.data.id as string, csrfCookie };
}

beforeEach(() => {
  state.users = [];
  state.sessions = [];
  state.symptomLogs = [];
  state.cycleEntries = [];
  state.onboardingProfiles = [];
  state.clinicalBriefs = [];
  state.treatments = [];
  state.emailVerificationTokens = [];
  state.passwordResetTokens = [];
  state.auditLogEntries = [];
});

describe("DELETE /auth/me", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).delete("/auth/me").send({ password: VALID_PASSWORD });
    expect(res.status).toBe(401);
  });

  it("requires the CSRF header for a cookie-authenticated request", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "nocsrf@embr.health");

    const res = await agent.delete("/auth/me").send({ password: VALID_PASSWORD });
    expect(res.status).toBe(403);
  });

  it("rejects the wrong password and does not delete the account", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const { userId, csrfCookie } = await registerAndLogin(agent, "wrongpw@embr.health");

    const res = await agent
      .delete("/auth/me")
      .set("x-csrf-token", csrfCookie)
      .send({ password: "TotallyWrongPassword1!" });

    expect(res.status).toBe(400);
    expect(state.users.find((u) => u.id === userId)).toBeDefined();
  });

  it("deletes the account and every owned record on success", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const { userId, csrfCookie } = await registerAndLogin(agent, "deleteme@embr.health");

    state.symptomLogs.push({ id: nextId(), userId });
    state.cycleEntries.push({ id: nextId(), userId });
    state.onboardingProfiles.push({ id: nextId(), userId });
    state.clinicalBriefs.push({ id: nextId(), userId });
    state.treatments.push({ id: nextId(), userId });
    state.emailVerificationTokens.push({ id: nextId(), userId });
    state.passwordResetTokens.push({ id: nextId(), userId });
    state.auditLogEntries.push({ id: nextId(), userId, action: "LOGIN_SUCCEEDED" });

    const res = await agent
      .delete("/auth/me")
      .set("x-csrf-token", csrfCookie)
      .send({ password: VALID_PASSWORD });

    expect(res.status).toBe(204);

    expect(state.users.find((u) => u.id === userId)).toBeUndefined();
    expect(state.sessions.some((s) => s.userId === userId)).toBe(false);
    expect(state.symptomLogs.some((l) => l.userId === userId)).toBe(false);
    expect(state.cycleEntries.some((e) => e.userId === userId)).toBe(false);
    expect(state.onboardingProfiles.some((p) => p.userId === userId)).toBe(false);
    expect(state.clinicalBriefs.some((b) => b.userId === userId)).toBe(false);
    expect(state.treatments.some((t) => t.userId === userId)).toBe(false);
    expect(state.emailVerificationTokens.some((t) => t.userId === userId)).toBe(false);
    expect(state.passwordResetTokens.some((t) => t.userId === userId)).toBe(false);

    const survivingEntries = state.auditLogEntries.filter(
      (e) => e.action === "LOGIN_SUCCEEDED" || e.action === "ACCOUNT_DELETED",
    );
    expect(survivingEntries.length).toBeGreaterThanOrEqual(2);
    for (const entry of survivingEntries) {
      expect(entry.userId).toBeNull();
    }

    const deletionEntry = state.auditLogEntries.find((e) => e.action === "ACCOUNT_DELETED");
    expect(deletionEntry).toBeDefined();
  });

  it("cannot delete another user's account — there is no :id to target one with", async () => {
    const app = createApp();

    const agentA = request.agent(app);
    const { userId: userIdA } = await registerAndLogin(agentA, "victim@embr.health");

    const agentB = request.agent(app);
    const { csrfCookie: csrfB } = await registerAndLogin(agentB, "attacker@embr.health");

    const res = await agentB
      .delete("/auth/me")
      .set("x-csrf-token", csrfB)
      .send({ password: VALID_PASSWORD });

    expect(res.status).toBe(204);
    expect(state.users.find((u) => u.id === userIdA)).toBeDefined();
  });

  it("a repeated deletion attempt (already-deleted account) fails cleanly, not with a crash", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const { csrfCookie } = await registerAndLogin(agent, "repeat@embr.health");

    const first = await agent
      .delete("/auth/me")
      .set("x-csrf-token", csrfCookie)
      .send({ password: VALID_PASSWORD });
    expect(first.status).toBe(204);

    const second = await agent
      .delete("/auth/me")
      .set("x-csrf-token", csrfCookie)
      .send({ password: VALID_PASSWORD });

    expect(second.status).toBe(401);
    expect(state.users).toHaveLength(0);
  });
});
