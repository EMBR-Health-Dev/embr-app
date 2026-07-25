import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

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
      logs: [] as Array<{
        id: string;
        userId: string;
        category: string;
        severity: string;
        occurredAt: Date;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>,
    },
    // idParamSchema requires a real UUID shape, so fixture ids can't be
    // plain incrementing strings the way earlier tests used them.
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
    symptomLog: {
      create: vi.fn(
        ({
          data,
        }: {
          data: Omit<(typeof state.logs)[number], "id" | "createdAt" | "updatedAt">;
        }) => {
          const log = { id: nextId(), createdAt: now(), updatedAt: now(), ...data };
          state.logs.push(log);
          return Promise.resolve(log);
        },
      ),
      findMany: vi.fn(
        ({
          where,
          orderBy,
          skip = 0,
          take = 20,
        }: {
          where: { userId: string; category?: string; occurredAt?: { gte?: Date; lte?: Date } };
          orderBy?: { occurredAt: "asc" | "desc" };
          skip?: number;
          take?: number;
        }) => {
          let items = state.logs.filter((l) => l.userId === where.userId);
          if (where.category) items = items.filter((l) => l.category === where.category);
          if (where.occurredAt?.gte)
            items = items.filter((l) => l.occurredAt >= where.occurredAt!.gte!);
          if (where.occurredAt?.lte)
            items = items.filter((l) => l.occurredAt <= where.occurredAt!.lte!);
          items = [...items].sort((a, b) =>
            orderBy?.occurredAt === "asc"
              ? a.occurredAt.getTime() - b.occurredAt.getTime()
              : b.occurredAt.getTime() - a.occurredAt.getTime(),
          );
          return Promise.resolve(items.slice(skip, skip + take));
        },
      ),
      count: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(state.logs.filter((l) => l.userId === where.userId).length),
      ),
      findFirst: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const found = state.logs.find((l) => l.id === where.id && l.userId === where.userId);
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
          const found = state.logs.find((l) => l.id === where.id && l.userId === where.userId);
          if (!found) return Promise.resolve({ count: 0 });
          Object.assign(found, data, { updatedAt: now() });
          return Promise.resolve({ count: 1 });
        },
      ),
      deleteMany: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const idx = state.logs.findIndex((l) => l.id === where.id && l.userId === where.userId);
        if (idx === -1) return Promise.resolve({ count: 0 });
        state.logs.splice(idx, 1);
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
  state.logs = [];
});

describe("POST /symptom-logs", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/symptom-logs")
      .send({ category: "HOT_FLASH", severity: "MODERATE", occurredAt: new Date().toISOString() });
    expect(res.status).toBe(401);
  });

  it("creates a symptom log for the authenticated user", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "symptoms@embr.health");

    const res = await agent
      .post("/symptom-logs")
      .send({
        category: "HOT_FLASH",
        severity: "SEVERE",
        occurredAt: "2026-07-20T03:00:00.000Z",
        notes: "woke up drenched",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.category).toBe("HOT_FLASH");
    expect(res.body.data.severity).toBe("SEVERE");
    expect(res.body.data.notes).toBe("woke up drenched");
  });

  it("rejects an invalid category", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "invalidcat@embr.health");

    const res = await agent
      .post("/symptom-logs")
      .send({
        category: "NOT_A_REAL_CATEGORY",
        severity: "MILD",
        occurredAt: new Date().toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /symptom-logs", () => {
  it("only returns the authenticated user's own logs", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "userA@embr.health");
    await registerAndLogin(agentB, "userB@embr.health");

    await agentA
      .post("/symptom-logs")
      .send({ category: "HOT_FLASH", severity: "MILD", occurredAt: new Date().toISOString() });
    await agentB
      .post("/symptom-logs")
      .send({ category: "BRAIN_FOG", severity: "MODERATE", occurredAt: new Date().toISOString() });

    const resA = await agentA.get("/symptom-logs");
    expect(resA.status).toBe(200);
    expect(resA.body.data.items).toHaveLength(1);
    expect(resA.body.data.items[0].category).toBe("HOT_FLASH");
    expect(resA.body.data.total).toBe(1);
  });

  it("filters by category", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "filter@embr.health");
    await agent
      .post("/symptom-logs")
      .send({ category: "HOT_FLASH", severity: "MILD", occurredAt: new Date().toISOString() });
    await agent
      .post("/symptom-logs")
      .send({ category: "BRAIN_FOG", severity: "MILD", occurredAt: new Date().toISOString() });

    const res = await agent.get("/symptom-logs").query({ category: "BRAIN_FOG" });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].category).toBe("BRAIN_FOG");
  });
});

describe("ownership scoping on single-resource routes", () => {
  it("returns 404 (not 403) when reading another user's log", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "ownerA@embr.health");
    await registerAndLogin(agentB, "ownerB@embr.health");

    const createRes = await agentA
      .post("/symptom-logs")
      .send({ category: "FATIGUE", severity: "MODERATE", occurredAt: new Date().toISOString() });
    const logId = createRes.body.data.id;

    const res = await agentB.get(`/symptom-logs/${logId}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when updating another user's log", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "updA@embr.health");
    await registerAndLogin(agentB, "updB@embr.health");

    const createRes = await agentA
      .post("/symptom-logs")
      .send({ category: "ANXIETY", severity: "MILD", occurredAt: new Date().toISOString() });
    const logId = createRes.body.data.id;

    const res = await agentB.patch(`/symptom-logs/${logId}`).send({ severity: "SEVERE" });
    expect(res.status).toBe(404);
  });

  it("allows the owner to update and delete their own log", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "owner@embr.health");

    const createRes = await agent
      .post("/symptom-logs")
      .send({ category: "JOINT_PAIN", severity: "MILD", occurredAt: new Date().toISOString() });
    const logId = createRes.body.data.id;

    const updateRes = await agent.patch(`/symptom-logs/${logId}`).send({ severity: "SEVERE" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.severity).toBe("SEVERE");

    const deleteRes = await agent.delete(`/symptom-logs/${logId}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await agent.get(`/symptom-logs/${logId}`);
    expect(getRes.status).toBe(404);
  });
});
