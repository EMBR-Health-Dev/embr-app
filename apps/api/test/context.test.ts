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
      contexts: [] as Array<{
        id: string;
        userId: string;
        date: Date;
        sleepDuration: string | null;
        caffeineAfternoon: boolean | null;
        alcohol: boolean | null;
        stressLevel: string | null;
        createdAt: Date;
        updatedAt: Date;
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
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: nextId(),
          revokedAt: null,
          replacedBySessionId: null,
          createdAt: now(),
          ...data,
        }),
      ),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
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
    contextLog: {
      upsert: vi.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { userId_date: { userId: string; date: Date } };
          create: Omit<(typeof state.contexts)[number], "id" | "createdAt" | "updatedAt">;
          update: Partial<(typeof state.contexts)[number]>;
        }) => {
          const { userId, date } = where.userId_date;
          const existing = state.contexts.find(
            (e) => e.userId === userId && e.date.getTime() === date.getTime(),
          );
          if (existing) {
            Object.assign(existing, update, { updatedAt: now() });
            return Promise.resolve(existing);
          }
          const entry = { id: nextId(), createdAt: now(), updatedAt: now(), ...create };
          state.contexts.push(entry);
          return Promise.resolve(entry);
        },
      ),
      findMany: vi.fn(
        ({
          where,
          orderBy,
          skip = 0,
          take = 20,
        }: {
          where: { userId: string; date?: { gte?: Date; lte?: Date } };
          orderBy?: { date: "asc" | "desc" };
          skip?: number;
          take?: number;
        }) => {
          let items = state.contexts.filter((e) => e.userId === where.userId);
          if (where.date?.gte) items = items.filter((e) => e.date >= where.date!.gte!);
          if (where.date?.lte) items = items.filter((e) => e.date <= where.date!.lte!);
          items = [...items].sort((a, b) =>
            orderBy?.date === "asc"
              ? a.date.getTime() - b.date.getTime()
              : b.date.getTime() - a.date.getTime(),
          );
          return Promise.resolve(items.slice(skip, skip + take));
        },
      ),
      count: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(state.contexts.filter((e) => e.userId === where.userId).length),
      ),
    },
  },
}));

const VALID_PASSWORD = "Sup3rSecret!Pass";

async function registerAndLogin(agent: ReturnType<typeof request.agent>, email: string) {
  await agent.post("/auth/register").send({ email, password: VALID_PASSWORD });
  const res = await agent.post("/auth/login").send({ email, password: VALID_PASSWORD });
  const csrfCookie = (res.headers["set-cookie"] as unknown as string[] | undefined)?.find((c) =>
    c.startsWith("embr_csrf="),
  );
  if (csrfCookie) {
    const token = csrfCookie.split(";")[0]!.split("=")[1]!;
    agent.set("x-csrf-token", token);
  }
  return res;
}

beforeEach(() => {
  state.users = [];
  state.contexts = [];
  state.auditLogEntries = [];
});

describe("POST /context-logs", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).post("/context-logs").send({ date: "2026-07-20" });
    expect(res.status).toBe(401);
  });

  it("creates an entry for a new date", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "context@embr.health");

    const res = await agent.post("/context-logs").send({
      date: "2026-07-20",
      sleepDuration: "UNDER_6H",
      caffeineAfternoon: true,
      alcohol: false,
      stressLevel: "HIGH",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe("2026-07-20");
    expect(res.body.data.sleepDuration).toBe("UNDER_6H");
    expect(res.body.data.caffeineAfternoon).toBe(true);
    expect(res.body.data.alcohol).toBe(false);
    expect(res.body.data.stressLevel).toBe("HIGH");
  });

  it("allows logging just one factor, leaving the rest null", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "context-partial@embr.health");

    const res = await agent.post("/context-logs").send({ date: "2026-07-20", alcohol: true });

    expect(res.status).toBe(200);
    expect(res.body.data.alcohol).toBe(true);
    expect(res.body.data.sleepDuration).toBeNull();
    expect(res.body.data.caffeineAfternoon).toBeNull();
    expect(res.body.data.stressLevel).toBeNull();
  });

  it("upserts (overwrites) the entry for the same date rather than duplicating", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "context-upsert@embr.health");

    await agent.post("/context-logs").send({ date: "2026-07-21", stressLevel: "LOW" });
    const second = await agent
      .post("/context-logs")
      .send({ date: "2026-07-21", stressLevel: "HIGH" });

    expect(second.status).toBe(200);
    expect(second.body.data.stressLevel).toBe("HIGH");

    const listRes = await agent.get("/context-logs");
    expect(listRes.body.data.total).toBe(1);
  });

  it("rejects an invalid date", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "context-baddate@embr.health");

    const res = await agent.post("/context-logs").send({ date: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("rejects a sleep duration value outside the fixed taxonomy", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "context-badbucket@embr.health");

    const res = await agent
      .post("/context-logs")
      .send({ date: "2026-07-20", sleepDuration: "EIGHT_HOURS" });
    expect(res.status).toBe(400);
  });

  it("logs CONTEXT_LOG_UPSERTED to the audit trail", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "context-audit@embr.health");

    const res = await agent.post("/context-logs").send({ date: "2026-08-01", alcohol: true });

    const entry = state.auditLogEntries.find((e) => e.action === "CONTEXT_LOG_UPSERTED");
    expect(entry).toBeDefined();
    expect((entry?.metadata as { contextLogId?: string })?.contextLogId).toBe(res.body.data.id);
  });
});

describe("GET /context-logs", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/context-logs");
    expect(res.status).toBe(401);
  });

  it("only returns the authenticated user's own entries", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "context-ownerA@embr.health");
    await registerAndLogin(agentB, "context-ownerB@embr.health");

    await agentA.post("/context-logs").send({ date: "2026-07-22", alcohol: true });
    await agentB.post("/context-logs").send({ date: "2026-07-22", alcohol: true });

    const res = await agentA.get("/context-logs");
    expect(res.body.data.total).toBe(1);
  });
});
