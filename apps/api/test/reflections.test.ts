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
      treatments: [] as Array<{
        id: string;
        userId: string;
        name: string;
        category: string;
        startDate: Date;
        endDate: Date | null;
      }>,
      dismissals: [] as Array<{ userId: string; type: string; dismissalKey: string }>,
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
      // Real Postgres findMany behavior for reflection.repository's
      // symptomLogsForPeriod: one row per log, unaggregated.
      findMany: vi.fn(({ where }: { where: { userId: string; occurredAt?: OccurredAtRange } }) => {
        const matching = state.logs.filter(
          (l) => l.userId === where.userId && inRange(l.occurredAt, where.occurredAt),
        );
        return Promise.resolve(
          matching.map((l) => ({
            category: l.category,
            severity: l.severity,
            occurredAt: l.occurredAt,
          })),
        );
      }),
    },
    treatment: {
      findMany: vi.fn(
        ({
          where,
        }: {
          where: {
            userId: string;
            startDate?: { lte: Date };
            OR?: Array<{ endDate: null } | { endDate: { gte: Date } }>;
          };
        }) => {
          const matching = state.treatments.filter((t) => {
            if (t.userId !== where.userId) return false;
            if (where.startDate?.lte && t.startDate.getTime() > where.startDate.lte.getTime())
              return false;
            const fromBound = where.OR?.find(
              (clause): clause is { endDate: { gte: Date } } =>
                "endDate" in clause && clause.endDate !== null,
            )?.endDate.gte;
            if (fromBound && t.endDate !== null && t.endDate.getTime() < fromBound.getTime())
              return false;
            return true;
          });
          return Promise.resolve(
            matching
              .slice()
              .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
              .map((t) => ({
                id: t.id,
                name: t.name,
                category: t.category,
                startDate: t.startDate,
                endDate: t.endDate,
              })),
          );
        },
      ),
    },
    reflectionDismissal: {
      findMany: vi.fn(
        ({
          where,
        }: {
          where: { userId: string; type: string; dismissalKey: { in: string[] } };
        }) => {
          const matching = state.dismissals.filter(
            (d) =>
              d.userId === where.userId &&
              d.type === where.type &&
              where.dismissalKey.in.includes(d.dismissalKey),
          );
          return Promise.resolve(matching.map((d) => ({ dismissalKey: d.dismissalKey })));
        },
      ),
      upsert: vi.fn(
        ({
          where,
        }: {
          where: {
            userId_type_dismissalKey: { userId: string; type: string; dismissalKey: string };
          };
        }) => {
          const { userId, type, dismissalKey } = where.userId_type_dismissalKey;
          const existing = state.dismissals.find(
            (d) => d.userId === userId && d.type === type && d.dismissalKey === dismissalKey,
          );
          if (!existing) state.dismissals.push({ userId, type, dismissalKey });
          return Promise.resolve({});
        },
      ),
    },
  },
}));

const VALID_PASSWORD = "Sup3rSecret!Pass";

async function registerAndLogin(agent: ReturnType<typeof request.agent>, email: string) {
  await agent.post("/auth/register").send({ email, password: VALID_PASSWORD });
  return agent.post("/auth/login").send({ email, password: VALID_PASSWORD });
}

function findByType<T extends { type: string }>(items: T[], type: string): T | undefined {
  return items.find((i) => i.type === type);
}

beforeEach(() => {
  state.users = [];
  state.logs = [];
  state.treatments = [];
  state.dismissals = [];
});

describe("GET /reflections", () => {
  it("rejects an unauthenticated request", async () => {
    const app = createApp();
    const res = await request(app).get("/reflections");
    expect(res.status).toBe(401);
  });

  it("returns an empty array when nothing qualifies yet", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "reflections-empty@embr.health");

    const res = await agent.get("/reflections");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("surfaces a LOGGING_ACTIVITY reflection once the 3-log threshold is met, and not before", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "reflections-activity@embr.health");

    await agent.post("/symptom-logs").send({
      category: "FATIGUE",
      severity: "MILD",
      occurredAt: new Date().toISOString(),
    });
    await agent.post("/symptom-logs").send({
      category: "FATIGUE",
      severity: "MILD",
      occurredAt: new Date().toISOString(),
    });

    let res = await agent.get("/reflections");
    expect(findByType(res.body.data, "LOGGING_ACTIVITY")).toBeUndefined();

    await agent.post("/symptom-logs").send({
      category: "FATIGUE",
      severity: "MILD",
      occurredAt: new Date().toISOString(),
    });

    res = await agent.get("/reflections");
    const activity = findByType(res.body.data, "LOGGING_ACTIVITY");
    expect(activity).toMatchObject({ logCount: 3, daysLogged: 1 });
  });

  it("surfaces the most-logged category as SYMPTOM_FREQUENCY", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "reflections-frequency@embr.health");

    for (const day of [1, 2, 3]) {
      await agent.post("/symptom-logs").send({
        category: "HOT_FLASH",
        severity: "MODERATE",
        occurredAt: new Date(Date.UTC(2026, 5, day, 8)).toISOString(),
      });
    }
    await agent.post("/symptom-logs").send({
      category: "BRAIN_FOG",
      severity: "MILD",
      occurredAt: new Date(Date.UTC(2026, 5, 1, 8)).toISOString(),
    });

    const res = await agent.get("/reflections").query({ from: "2026-06-01T00:00:00.000Z" });
    const frequency = findByType(res.body.data, "SYMPTOM_FREQUENCY");
    expect(frequency).toMatchObject({ category: "HOT_FLASH", count: 3 });
  });

  it("surfaces SYMPTOM_CO_OCCURRENCE using the same deterministic detector trends uses", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "reflections-cooccurrence@embr.health");

    for (const day of [1, 2, 3]) {
      await agent.post("/symptom-logs").send({
        category: "HOT_FLASH",
        severity: "MODERATE",
        occurredAt: new Date(Date.UTC(2026, 5, day, 8)).toISOString(),
      });
      await agent.post("/symptom-logs").send({
        category: "SLEEP_DISTURBANCE",
        severity: "MODERATE",
        occurredAt: new Date(Date.UTC(2026, 5, day, 22)).toISOString(),
      });
    }

    const res = await agent.get("/reflections").query({ from: "2026-06-01T00:00:00.000Z" });
    const coOccurrence = findByType(res.body.data, "SYMPTOM_CO_OCCURRENCE");
    expect(coOccurrence).toMatchObject({
      categoryA: "HOT_FLASH",
      categoryB: "SLEEP_DISTURBANCE",
      days: 3,
    });
  });

  it("surfaces TREATMENT_CONTEXT as a plain count, never an efficacy claim", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const loginRes = await registerAndLogin(agent, "reflections-treatment@embr.health");
    const userId = loginRes.body.data.user.id as string;

    state.treatments.push({
      id: nextId(),
      userId,
      name: "Estradiol patch",
      category: "HRT",
      startDate: new Date(Date.UTC(2026, 5, 1)),
      endDate: null,
    });
    await agent.post("/symptom-logs").send({
      category: "HOT_FLASH",
      severity: "MILD",
      occurredAt: new Date(Date.UTC(2026, 5, 5, 8)).toISOString(),
    });
    await agent.post("/symptom-logs").send({
      category: "HOT_FLASH",
      severity: "MILD",
      occurredAt: new Date(Date.UTC(2026, 5, 6, 8)).toISOString(),
    });

    const res = await agent.get("/reflections").query({ from: "2026-06-01T00:00:00.000Z" });
    const treatmentContext = findByType(res.body.data, "TREATMENT_CONTEXT");
    expect(treatmentContext).toMatchObject({
      treatmentName: "Estradiol patch",
      treatmentCategory: "HRT",
      logCount: 2,
    });
    // Factual only — no outcome/efficacy field exists on the DTO at all.
    expect(treatmentContext).not.toHaveProperty("outcome");
    expect(treatmentContext).not.toHaveProperty("effective");
  });

  it("never leaks one user's reflections to another", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "reflections-scopeA@embr.health");
    await registerAndLogin(agentB, "reflections-scopeB@embr.health");

    for (let i = 0; i < 3; i++) {
      await agentA.post("/symptom-logs").send({
        category: "ANXIETY",
        severity: "MILD",
        occurredAt: new Date().toISOString(),
      });
    }

    const resA = await agentA.get("/reflections");
    const resB = await agentB.get("/reflections");
    expect(findByType(resA.body.data, "LOGGING_ACTIVITY")).toBeDefined();
    expect(findByType(resB.body.data, "LOGGING_ACTIVITY")).toBeUndefined();
  });
});

describe("POST /reflections/dismissals", () => {
  it("rejects an unauthenticated request", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/reflections/dismissals")
      .send({ type: "LOGGING_ACTIVITY", key: "some-key" });
    expect(res.status).toBe(401);
  });

  it("suppresses that specific reflection instance without affecting other users", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "reflections-dismissA@embr.health");
    await registerAndLogin(agentB, "reflections-dismissB@embr.health");

    for (let i = 0; i < 3; i++) {
      await agentA.post("/symptom-logs").send({
        category: "JOINT_PAIN",
        severity: "MILD",
        occurredAt: new Date().toISOString(),
      });
      await agentB.post("/symptom-logs").send({
        category: "JOINT_PAIN",
        severity: "MILD",
        occurredAt: new Date().toISOString(),
      });
    }

    const before = await agentA.get("/reflections");
    const activity = findByType(before.body.data, "LOGGING_ACTIVITY");
    expect(activity).toBeDefined();

    const dismissRes = await agentA
      .post("/reflections/dismissals")
      .send({ type: "LOGGING_ACTIVITY", key: activity.key });
    expect(dismissRes.status).toBe(204);

    const afterA = await agentA.get("/reflections");
    expect(findByType(afterA.body.data, "LOGGING_ACTIVITY")).toBeUndefined();

    // Agent B never dismissed anything — their own instance must still show.
    const afterB = await agentB.get("/reflections");
    expect(findByType(afterB.body.data, "LOGGING_ACTIVITY")).toBeDefined();
  });

  it("dismissing twice does not error (idempotent upsert)", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "reflections-dismisstwice@embr.health");

    for (let i = 0; i < 3; i++) {
      await agent.post("/symptom-logs").send({
        category: "OTHER",
        severity: "MILD",
        occurredAt: new Date().toISOString(),
      });
    }
    const listRes = await agent.get("/reflections");
    const activity = findByType(listRes.body.data, "LOGGING_ACTIVITY");

    const first = await agent
      .post("/reflections/dismissals")
      .send({ type: "LOGGING_ACTIVITY", key: activity.key });
    const second = await agent
      .post("/reflections/dismissals")
      .send({ type: "LOGGING_ACTIVITY", key: activity.key });

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
  });

  it("a dismissal survives a day rollover within the same ISO week (regression: dismissal keys were previously namespaced by raw calendar date, so they silently expired at midnight UTC every night)", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "reflections-weekstable@embr.health");

    // A Tuesday, well clear of any week boundary, and 3 logs earlier
    // that same day so LOGGING_ACTIVITY qualifies when queried with
    // `to` set to that Tuesday.
    for (let i = 0; i < 3; i++) {
      await agent.post("/symptom-logs").send({
        category: "OTHER",
        severity: "MILD",
        occurredAt: "2026-06-16T08:00:00.000Z",
      });
    }

    const tuesday = "2026-06-16T10:00:00.000Z";
    const wednesday = "2026-06-17T10:00:00.000Z"; // same ISO week as Tuesday

    const before = await agent.get("/reflections").query({ to: tuesday });
    const activity = findByType(before.body.data, "LOGGING_ACTIVITY");
    expect(activity).toBeDefined();

    const dismissRes = await agent
      .post("/reflections/dismissals")
      .send({ type: "LOGGING_ACTIVITY", key: activity.key });
    expect(dismissRes.status).toBe(204);

    // Query as if it were the next day, still the same ISO week —
    // before the fix, the dismissal key was namespaced by calendar
    // date, so this alone would have been enough to make the
    // reflection reappear.
    const after = await agent.get("/reflections").query({ to: wednesday });
    expect(findByType(after.body.data, "LOGGING_ACTIVITY")).toBeUndefined();
  });
});
