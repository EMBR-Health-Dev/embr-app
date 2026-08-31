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
      logs: [] as Array<{ userId: string; category: string; occurredAt: Date }>,
      treatments: [] as Array<{
        id: string;
        userId: string;
        name: string;
        category: string;
        startDate: Date;
        endDate: Date | null;
      }>,
      briefs: [] as Array<{
        id: string;
        userId: string;
        fromDate: Date;
        toDate: Date;
        createdAt: Date;
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

interface DateRange {
  gte?: Date;
  lte?: Date;
}
function inRange(date: Date, range?: DateRange): boolean {
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
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    onboardingProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    symptomLog: {
      findMany: vi.fn(({ where }: { where: { userId: string; occurredAt?: DateRange } }) => {
        const matching = state.logs.filter(
          (l) => l.userId === where.userId && inRange(l.occurredAt, where.occurredAt),
        );
        return Promise.resolve(
          matching.map((l) => ({ category: l.category, occurredAt: l.occurredAt })),
        );
      }),
    },
    treatment: {
      findMany: vi.fn(
        ({
          where,
        }: {
          where: { userId: string; startDate?: DateRange; OR?: Array<Record<string, unknown>> };
        }) => {
          const matching = state.treatments.filter((t) => t.userId === where.userId);
          return Promise.resolve(matching);
        },
      ),
    },
    clinicalBrief: {
      findMany: vi.fn(({ where }: { where: { userId: string; createdAt?: DateRange } }) => {
        const matching = state.briefs.filter(
          (b) => b.userId === where.userId && inRange(b.createdAt, where.createdAt),
        );
        return Promise.resolve(
          matching.map((b) => ({
            id: b.id,
            fromDate: b.fromDate,
            toDate: b.toDate,
            createdAt: b.createdAt,
          })),
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
  state.treatments = [];
  state.briefs = [];
});

describe("GET /timeline", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/timeline");
    expect(res.status).toBe(401);
  });

  it("merges symptom weeks, treatments, and briefs into one chronological, per-user-scoped list", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    const loginA = await registerAndLogin(agentA, "timelineA@embr.health");
    await registerAndLogin(agentB, "timelineB@embr.health");
    const userA = loginA.body.data.user.id as string;

    state.logs.push({
      userId: userA,
      category: "HOT_FLASH",
      occurredAt: new Date("2026-06-01T08:00:00.000Z"),
    });
    state.treatments.push({
      id: nextId(),
      userId: userA,
      name: "Vitamin D",
      category: "SUPPLEMENT",
      startDate: new Date("2026-06-08"),
      endDate: null,
    });
    state.briefs.push({
      id: nextId(),
      userId: userA,
      fromDate: new Date("2026-05-01"),
      toDate: new Date("2026-06-01"),
      createdAt: new Date("2026-06-15T00:00:00.000Z"),
    });

    // Data for user B should never leak into user A's timeline.
    state.logs.push({
      userId: "not-a-real-user",
      category: "ANXIETY",
      occurredAt: new Date("2026-06-01"),
    });

    const res = await agentA.get("/timeline");

    expect(res.status).toBe(200);
    expect(res.body.data.map((e: { type: string }) => e.type)).toEqual([
      "SYMPTOM_WEEK",
      "TREATMENT_STARTED",
      "BRIEF_GENERATED",
    ]);
    // Chronological: symptom week (Jun 1) before treatment start (Jun 8) before brief (Jun 15).
    expect(res.body.data.map((e: { date: string }) => e.date)).toEqual([
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
    ]);
  });

  it("rejects an invalid query range the same way /trends does", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "timelineC@embr.health");

    const res = await agent.get("/timeline").query({ from: "not-a-date" });

    expect(res.status).toBe(400);
  });
});
