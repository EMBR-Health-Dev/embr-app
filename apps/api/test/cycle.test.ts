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
      entries: [] as Array<{
        id: string;
        userId: string;
        date: Date;
        flow: string | null;
        isPeriodStart: boolean;
        isPeriodEnd: boolean;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>,
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
      create: vi.fn().mockResolvedValue({}),
    },
    cycleEntry: {
      upsert: vi.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { userId_date: { userId: string; date: Date } };
          create: Omit<(typeof state.entries)[number], "id" | "createdAt" | "updatedAt">;
          update: Partial<(typeof state.entries)[number]>;
        }) => {
          const { userId, date } = where.userId_date;
          const existing = state.entries.find(
            (e) => e.userId === userId && e.date.getTime() === date.getTime(),
          );
          if (existing) {
            Object.assign(existing, update, { updatedAt: now() });
            return Promise.resolve(existing);
          }
          const entry = { id: nextId(), createdAt: now(), updatedAt: now(), ...create };
          state.entries.push(entry);
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
          let items = state.entries.filter((e) => e.userId === where.userId);
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
        Promise.resolve(state.entries.filter((e) => e.userId === where.userId).length),
      ),
      findFirst: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const found = state.entries.find((e) => e.id === where.id && e.userId === where.userId);
        return Promise.resolve(found ?? null);
      }),
      updateMany: vi.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; userId: string };
          data: Record<string, unknown>;
        }) => {
          const found = state.entries.find((e) => e.id === where.id && e.userId === where.userId);
          if (!found) return Promise.resolve({ count: 0 });
          Object.assign(found, data, { updatedAt: now() });
          return Promise.resolve({ count: 1 });
        },
      ),
      deleteMany: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const idx = state.entries.findIndex((e) => e.id === where.id && e.userId === where.userId);
        if (idx === -1) return Promise.resolve({ count: 0 });
        state.entries.splice(idx, 1);
        return Promise.resolve({ count: 1 });
      }),
    },
  },
}));

const VALID_PASSWORD = "Sup3rSecret!Pass";

async function registerAndLogin(agent: ReturnType<typeof request.agent>, email: string) {
  await agent.post("/auth/register").send({ email, password: VALID_PASSWORD });
  return agent.post("/auth/login").send({ email, password: VALID_PASSWORD });
}

beforeEach(() => {
  state.users = [];
  state.entries = [];
});

describe("POST /cycle-entries", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/cycle-entries")
      .send({ date: "2026-07-20", flow: "MEDIUM" });
    expect(res.status).toBe(401);
  });

  it("creates an entry for a new date", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "cycle@embr.health");

    const res = await agent
      .post("/cycle-entries")
      .send({ date: "2026-07-20", flow: "MEDIUM", isPeriodStart: true });

    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe("2026-07-20");
    expect(res.body.data.flow).toBe("MEDIUM");
    expect(res.body.data.isPeriodStart).toBe(true);
  });

  it("upserts (overwrites) the entry for the same date rather than duplicating", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "upsert@embr.health");

    await agent.post("/cycle-entries").send({ date: "2026-07-21", flow: "LIGHT" });
    const second = await agent.post("/cycle-entries").send({ date: "2026-07-21", flow: "HEAVY" });

    expect(second.status).toBe(200);
    expect(second.body.data.flow).toBe("HEAVY");

    const listRes = await agent.get("/cycle-entries");
    expect(listRes.body.data.total).toBe(1);
  });

  it("rejects an invalid date", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "baddate@embr.health");

    const res = await agent.post("/cycle-entries").send({ date: "not-a-date" });
    expect(res.status).toBe(400);
  });
});

describe("ownership scoping", () => {
  it("returns 404 when reading or updating another user's entry", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "cycleOwnerA@embr.health");
    await registerAndLogin(agentB, "cycleOwnerB@embr.health");

    const createRes = await agentA
      .post("/cycle-entries")
      .send({ date: "2026-07-22", flow: "LIGHT" });
    const entryId = createRes.body.data.id;

    const getRes = await agentB.get(`/cycle-entries/${entryId}`);
    expect(getRes.status).toBe(404);

    const patchRes = await agentB.patch(`/cycle-entries/${entryId}`).send({ flow: "HEAVY" });
    expect(patchRes.status).toBe(404);
  });

  it("allows the owner to update and delete their own entry", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "cycleOwner@embr.health");

    const createRes = await agent
      .post("/cycle-entries")
      .send({ date: "2026-07-23", flow: "LIGHT" });
    const entryId = createRes.body.data.id;

    const updateRes = await agent
      .patch(`/cycle-entries/${entryId}`)
      .send({ flow: "HEAVY", isPeriodEnd: true });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.flow).toBe("HEAVY");
    expect(updateRes.body.data.isPeriodEnd).toBe(true);

    const deleteRes = await agent.delete(`/cycle-entries/${entryId}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await agent.get(`/cycle-entries/${entryId}`);
    expect(getRes.status).toBe(404);
  });
});
