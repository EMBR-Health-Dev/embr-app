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

interface OccurredAtRange {
  gte?: Date;
  lte?: Date;
}

interface SymptomFindManyArgs {
  where: { userId: string; occurredAt?: OccurredAtRange };
}

function inRange(date: Date, range?: OccurredAtRange): boolean {
  if (!range) return true;
  if (range.gte && date.getTime() < range.gte.getTime()) return false;
  if (range.lte && date.getTime() > range.lte.getTime()) return false;
  return true;
}

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
    onboardingProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
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
      // Real Postgres findMany behavior: one row per log, unaggregated
      // — reflectionsService reuses trendsRepository's raw-rows query
      // (the same one co-occurrence detection uses), not the groupBy
      // aggregate.
      findMany: vi.fn(({ where }: SymptomFindManyArgs) => {
        const matching = state.logs.filter(
          (l) => l.userId === where.userId && inRange(l.occurredAt, where.occurredAt),
        );
        return Promise.resolve(
          matching.map((l) => ({ category: l.category, occurredAt: l.occurredAt })),
        );
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

describe("GET /reflections", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/reflections");
    expect(res.status).toBe(401);
  });

  it("returns an empty array for a user with no logs at all", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "reflections1@embr.health");

    const res = await agent.get("/reflections");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("returns a weekly_frequency reflection scoped to the authenticated user only", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "reflectionsA@embr.health");
    await registerAndLogin(agentB, "reflectionsB@embr.health");

    await agentA.post("/symptom-logs").send({
      category: "HOT_FLASH",
      severity: "MILD",
      occurredAt: new Date().toISOString(),
    });
    // Different category, different user — must never affect agentA's
    // result.
    await agentB.post("/symptom-logs").send({
      category: "JOINT_PAIN",
      severity: "SEVERE",
      occurredAt: new Date().toISOString(),
    });

    const resA = await agentA.get("/reflections");
    expect(resA.status).toBe(200);
    const weekly = resA.body.data.find((r: { type: string }) => r.type === "weekly_frequency");
    expect(weekly).toMatchObject({
      type: "weekly_frequency",
      totalCount: 1,
      topCategory: "HOT_FLASH",
    });

    const resB = await agentB.get("/reflections");
    const weeklyB = resB.body.data.find((r: { type: string }) => r.type === "weekly_frequency");
    expect(weeklyB).toMatchObject({
      type: "weekly_frequency",
      totalCount: 1,
      topCategory: "JOINT_PAIN",
    });
  });

  it("returns a logging_streak reflection once logs span 2+ consecutive days", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "reflections-streak@embr.health");

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    await agent.post("/symptom-logs").send({
      category: "FATIGUE",
      severity: "MODERATE",
      occurredAt: today.toISOString(),
    });
    await agent.post("/symptom-logs").send({
      category: "FATIGUE",
      severity: "MODERATE",
      occurredAt: yesterday.toISOString(),
    });

    const res = await agent.get("/reflections");
    const streak = res.body.data.find((r: { type: string }) => r.type === "logging_streak");
    expect(streak).toMatchObject({ type: "logging_streak", days: 2 });
  });

  it("does not return a logging_streak reflection for a single logged day", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "reflections-single@embr.health");

    await agent.post("/symptom-logs").send({
      category: "FATIGUE",
      severity: "MODERATE",
      occurredAt: new Date().toISOString(),
    });

    const res = await agent.get("/reflections");
    expect(
      res.body.data.find((r: { type: string }) => r.type === "logging_streak"),
    ).toBeUndefined();
  });
});
