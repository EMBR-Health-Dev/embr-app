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

interface OccurredAtRange {
  gte?: Date;
  lte?: Date;
}

interface SymptomGroupByArgs {
  where: { userId: string; occurredAt?: OccurredAtRange };
}

interface CycleFindManyArgs {
  where: { userId: string; isPeriodStart?: boolean; date?: OccurredAtRange };
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
      // Real Postgres GROUP BY behavior: one row per distinct category
      // that has at least one matching log, each with its own count —
      // never one row per log the way findMany would.
      groupBy: vi.fn(({ where }: SymptomGroupByArgs) => {
        const matching = state.logs.filter(
          (l) => l.userId === where.userId && inRange(l.occurredAt, where.occurredAt),
        );
        const counts = new Map<string, number>();
        for (const log of matching) {
          counts.set(log.category, (counts.get(log.category) ?? 0) + 1);
        }
        return Promise.resolve(
          [...counts.entries()].map(([category, count]) => ({
            category,
            _count: { category: count },
          })),
        );
      }),
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
      findMany: vi.fn(({ where }: CycleFindManyArgs) => {
        const matching = state.entries
          .filter(
            (e) =>
              e.userId === where.userId &&
              (where.isPeriodStart === undefined || e.isPeriodStart === where.isPeriodStart) &&
              inRange(e.date, where.date),
          )
          .sort((a, b) => a.date.getTime() - b.date.getTime());
        return Promise.resolve(matching.map((e) => ({ date: e.date })));
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
  state.entries = [];
});

describe("GET /trends/symptom-frequency", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/trends/symptom-frequency");
    expect(res.status).toBe(401);
  });

  it("aggregates counts by category, scoped to the authenticated user, sorted descending", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "trendsA@embr.health");
    await registerAndLogin(agentB, "trendsB@embr.health");

    // More than the pageSize:100 list-endpoint cap, to prove this is a
    // real DB-side aggregate and not something built from a paginated
    // fetch — every one of these should be counted.
    for (let i = 0; i < 120; i++) {
      await agentA.post("/symptom-logs").send({
        category: "HOT_FLASH",
        severity: "MILD",
        occurredAt: new Date(2026, 5, 1 + (i % 20)).toISOString(),
      });
    }
    await agentA.post("/symptom-logs").send({
      category: "BRAIN_FOG",
      severity: "MODERATE",
      occurredAt: "2026-06-05T00:00:00.000Z",
    });
    await agentB.post("/symptom-logs").send({
      category: "JOINT_PAIN",
      severity: "SEVERE",
      occurredAt: "2026-06-05T00:00:00.000Z",
    });

    const res = await agentA.get("/trends/symptom-frequency");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { category: "HOT_FLASH", count: 120 },
      { category: "BRAIN_FOG", count: 1 },
    ]);
  });

  it("respects the from/to range", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "trendsrange@embr.health");

    await agent.post("/symptom-logs").send({
      category: "FATIGUE",
      severity: "MILD",
      occurredAt: "2026-01-01T00:00:00.000Z",
    });
    await agent.post("/symptom-logs").send({
      category: "FATIGUE",
      severity: "MILD",
      occurredAt: "2026-07-01T00:00:00.000Z",
    });

    const res = await agent
      .get("/trends/symptom-frequency")
      .query({ from: "2026-06-01T00:00:00.000Z" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ category: "FATIGUE", count: 1 }]);
  });
});

describe("GET /trends/cycle-length", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/trends/cycle-length");
    expect(res.status).toBe(401);
  });

  it("returns an empty result with no data logged", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "cycleempty@embr.health");

    const res = await agent.get("/trends/cycle-length");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ averageDays: null, lengths: [] });
  });

  it("diffs consecutive period-start dates and averages them", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "cyclelength@embr.health");

    await agent.post("/cycle-entries").send({ date: "2026-01-01", isPeriodStart: true });
    await agent.post("/cycle-entries").send({ date: "2026-01-29", isPeriodStart: true });
    await agent.post("/cycle-entries").send({ date: "2026-03-01", isPeriodStart: true });
    // Non-period-start entries must not be treated as cycle boundaries.
    await agent.post("/cycle-entries").send({ date: "2026-01-15", flow: "LIGHT" });

    const res = await agent.get("/trends/cycle-length");
    expect(res.status).toBe(200);
    expect(res.body.data.lengths).toEqual([
      { from: "2026-01-01", to: "2026-01-29", days: 28 },
      { from: "2026-01-29", to: "2026-03-01", days: 31 },
    ]);
    expect(res.body.data.averageDays).toBe(30);
  });
});
