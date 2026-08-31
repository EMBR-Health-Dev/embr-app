import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { treatmentRepository } from "../src/modules/treatments/treatment.repository.js";

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
      treatments: [] as Array<{
        id: string;
        userId: string;
        name: string;
        category: string;
        startDate: Date;
        endDate: Date | null;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>,
      symptomLogs: [] as Array<{
        userId: string;
        occurredAt: Date;
        category?: string;
        severity?: string;
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
    symptomLog: {
      count: vi.fn(
        ({ where }: { where: { userId: string; occurredAt: { gte: Date; lt: Date } } }) =>
          Promise.resolve(
            state.symptomLogs.filter(
              (l) =>
                l.userId === where.userId &&
                l.occurredAt >= where.occurredAt.gte &&
                l.occurredAt < where.occurredAt.lt,
            ).length,
          ),
      ),
      groupBy: vi.fn(
        ({ where }: { where: { userId: string; occurredAt: { gte: Date; lt: Date } } }) => {
          const matching = state.symptomLogs.filter(
            (l) =>
              l.userId === where.userId &&
              l.occurredAt >= where.occurredAt.gte &&
              l.occurredAt < where.occurredAt.lt,
          );
          const totals = new Map<string, number>();
          for (const l of matching) {
            const key = `${l.category ?? "OTHER"}::${l.severity ?? "MODERATE"}`;
            totals.set(key, (totals.get(key) ?? 0) + 1);
          }
          return Promise.resolve(
            [...totals.entries()].map(([key, count]) => {
              const [category, severity] = key.split("::");
              return { category, severity, _count: { _all: count } };
            }),
          );
        },
      ),
    },
    treatment: {
      create: vi.fn(
        ({
          data,
        }: {
          data: Omit<(typeof state.treatments)[number], "id" | "createdAt" | "updatedAt">;
        }) => {
          const treatment = { id: nextId(), createdAt: now(), updatedAt: now(), ...data };
          state.treatments.push(treatment);
          return Promise.resolve(treatment);
        },
      ),
      findMany: vi.fn(
        ({
          where,
          orderBy,
          skip = 0,
          take = 20,
        }: {
          where: {
            userId: string;
            category?: string;
            startDate?: { lte: Date };
            OR?: Array<{ endDate: null } | { endDate: { gte: Date } }>;
          };
          orderBy?: { startDate: "asc" | "desc" };
          skip?: number;
          take?: number;
        }) => {
          let items = state.treatments.filter((t) => t.userId === where.userId);
          if (where.category) items = items.filter((t) => t.category === where.category);
          if (where.startDate?.lte) {
            items = items.filter((t) => t.startDate <= where.startDate!.lte);
          }
          if (where.OR) {
            items = items.filter(
              (t) =>
                t.endDate === null ||
                t.endDate >= (where.OR![1] as { endDate: { gte: Date } }).endDate.gte,
            );
          }
          items = [...items].sort((a, b) =>
            orderBy?.startDate === "asc"
              ? a.startDate.getTime() - b.startDate.getTime()
              : b.startDate.getTime() - a.startDate.getTime(),
          );
          return Promise.resolve(items.slice(skip, skip + take));
        },
      ),
      count: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(state.treatments.filter((t) => t.userId === where.userId).length),
      ),
      findFirst: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const found = state.treatments.find((t) => t.id === where.id && t.userId === where.userId);
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
          const found = state.treatments.find(
            (t) => t.id === where.id && t.userId === where.userId,
          );
          if (!found) return Promise.resolve({ count: 0 });
          Object.assign(found, data, { updatedAt: now() });
          return Promise.resolve({ count: 1 });
        },
      ),
      deleteMany: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const idx = state.treatments.findIndex(
          (t) => t.id === where.id && t.userId === where.userId,
        );
        if (idx === -1) return Promise.resolve({ count: 0 });
        state.treatments.splice(idx, 1);
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
  state.treatments = [];
  state.symptomLogs = [];
  state.auditLogEntries = [];
});

describe("POST /treatments", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-01" });
    expect(res.status).toBe(401);
  });

  it("creates a treatment for the authenticated user", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "treatments@embr.health");

    const res = await agent.post("/treatments").send({
      name: "Estradiol patch",
      category: "HRT",
      startDate: "2026-06-01",
      notes: "0.05mg, twice weekly",
    });

    console.log("STATUS:", res.status);
    console.log("BODY:", JSON.stringify(res.body, null, 2));
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Estradiol patch");
    expect(res.body.data.category).toBe("HRT");
    expect(res.body.data.startDate).toBe("2026-06-01");
    expect(res.body.data.endDate).toBeNull();
    expect(res.body.data.notes).toBe("0.05mg, twice weekly");
  });

  it("rejects an invalid category", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "invalidcat@embr.health");

    const res = await agent
      .post("/treatments")
      .send({ name: "Something", category: "NOT_A_REAL_CATEGORY", startDate: "2026-06-01" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an endDate before startDate", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "baddates@embr.health");

    const res = await agent.post("/treatments").send({
      name: "Something",
      category: "SUPPLEMENT",
      startDate: "2026-06-10",
      endDate: "2026-06-01",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /treatments", () => {
  it("only returns the authenticated user's own treatments", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "userA@embr.health");
    await registerAndLogin(agentB, "userB@embr.health");

    await agentA
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-01" });
    await agentB
      .post("/treatments")
      .send({ name: "Magnesium", category: "SUPPLEMENT", startDate: "2026-06-01" });

    const resA = await agentA.get("/treatments");
    expect(resA.status).toBe(200);
    expect(resA.body.data.items).toHaveLength(1);
    expect(resA.body.data.items[0].name).toBe("HRT patch");
    expect(resA.body.data.total).toBe(1);
  });

  it("filters by category", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "filter@embr.health");
    await agent
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-01" });
    await agent
      .post("/treatments")
      .send({ name: "Magnesium", category: "SUPPLEMENT", startDate: "2026-06-01" });

    const res = await agent.get("/treatments").query({ category: "SUPPLEMENT" });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe("Magnesium");
  });

  it("active=true excludes treatments that have already ended", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "active@embr.health");

    await agent.post("/treatments").send({
      name: "Old supplement",
      category: "SUPPLEMENT",
      startDate: "2025-01-01",
      endDate: "2025-06-01",
    });
    await agent
      .post("/treatments")
      .send({ name: "Current HRT", category: "HRT", startDate: "2025-01-01" });

    const res = await agent.get("/treatments").query({ active: "true" });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe("Current HRT");
  });
});

describe("GET /treatments/:id/impact", () => {
  it("returns 404 for another user's treatment", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "impactOwner@embr.health");
    await registerAndLogin(agentB, "impactAttacker@embr.health");

    const created = await agentA
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-01" });

    const res = await agentB.get(`/treatments/${created.body.data.id}/impact`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a nonexistent treatment id", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "impactMissing@embr.health");

    const res = await agent.get(`/treatments/${randomUUID()}/impact`);
    expect(res.status).toBe(404);
  });

  it("breaks down before/after counts by symptom category and severity", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));

      const app = createApp();
      const agent = request.agent(app);
      const login = await registerAndLogin(agent, "impactBreakdown@embr.health");
      const userId = login.body.data.user.id as string;

      const created = await agent
        .post("/treatments")
        .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-15" });
      const treatmentId = created.body.data.id as string;

      // "before" window (2026-06-01 to 2026-06-15): 2 severe hot flashes, 1 mild brain fog.
      state.symptomLogs.push(
        {
          userId,
          occurredAt: new Date("2026-06-03T10:00:00Z"),
          category: "HOT_FLASH",
          severity: "SEVERE",
        },
        {
          userId,
          occurredAt: new Date("2026-06-10T10:00:00Z"),
          category: "HOT_FLASH",
          severity: "SEVERE",
        },
        {
          userId,
          occurredAt: new Date("2026-06-12T10:00:00Z"),
          category: "BRAIN_FOG",
          severity: "MILD",
        },
      );
      // "after" window (2026-06-15 onward): 1 mild hot flash — down in both
      // count and severity from "before".
      state.symptomLogs.push({
        userId,
        occurredAt: new Date("2026-06-17T10:00:00Z"),
        category: "HOT_FLASH",
        severity: "MILD",
      });

      const res = await agent.get(`/treatments/${treatmentId}/impact`);

      expect(res.status).toBe(200);
      expect(res.body.data.before.categoryCounts).toEqual([
        { category: "HOT_FLASH", count: 2 },
        { category: "BRAIN_FOG", count: 1 },
      ]);
      expect(res.body.data.before.severityCounts).toEqual([
        { severity: "MILD", count: 1 },
        { severity: "MODERATE", count: 0 },
        { severity: "SEVERE", count: 2 },
      ]);
      expect(res.body.data.after.categoryCounts).toEqual([{ category: "HOT_FLASH", count: 1 }]);
      expect(res.body.data.after.severityCounts).toEqual([
        { severity: "MILD", count: 1 },
        { severity: "MODERATE", count: 0 },
        { severity: "SEVERE", count: 0 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("computes before/after symptom-log counts around the treatment's start date", async () => {
    vi.useFakeTimers();
    try {
      // Fixed "now" so the before/after windows are deterministic
      // regardless of when this test actually runs.
      vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));

      const app = createApp();
      const agent = request.agent(app);
      const login = await registerAndLogin(agent, "impact@embr.health");
      const userId = login.body.data.user.id as string;

      const created = await agent
        .post("/treatments")
        .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-15" });
      const treatmentId = created.body.data.id as string;

      // 3 logs in the 14-day "before" window (2026-06-01 to 2026-06-15).
      state.symptomLogs.push(
        { userId, occurredAt: new Date("2026-06-03T10:00:00Z") },
        { userId, occurredAt: new Date("2026-06-10T10:00:00Z") },
        { userId, occurredAt: new Date("2026-06-14T23:59:00Z") },
      );
      // 1 log in the "after" window so far (2026-06-15 to "today", 2026-06-20).
      state.symptomLogs.push({ userId, occurredAt: new Date("2026-06-17T10:00:00Z") });
      // Outside both windows entirely — must not be counted either side.
      state.symptomLogs.push({ userId, occurredAt: new Date("2026-05-01T10:00:00Z") });

      const res = await agent.get(`/treatments/${treatmentId}/impact`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        treatmentId,
        windowDays: 14,
        before: { logCount: 3, days: 14 },
        after: { logCount: 1, days: 5 }, // 2026-06-15 to 2026-06-20
        insufficientData: false, // 5 days already >= the 3-day floor
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("flags insufficientData for a treatment started only a day ago", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-06-16T08:00:00Z"));

      const app = createApp();
      const agent = request.agent(app);
      await registerAndLogin(agent, "impactRecent@embr.health");

      const created = await agent
        .post("/treatments")
        .send({ name: "Magnesium", category: "SUPPLEMENT", startDate: "2026-06-15" });
      const treatmentId = created.body.data.id as string;

      const res = await agent.get(`/treatments/${treatmentId}/impact`);
      expect(res.status).toBe(200);
      expect(res.body.data.after.days).toBe(1);
      expect(res.body.data.insufficientData).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not flag insufficientData once the after window has run long enough (capped at windowDays)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));

      const app = createApp();
      const agent = request.agent(app);
      await registerAndLogin(agent, "impactSufficient@embr.health");

      const created = await agent
        .post("/treatments")
        .send({ name: "Magnesium", category: "SUPPLEMENT", startDate: "2026-06-15" });
      const treatmentId = created.body.data.id as string;

      const res = await agent.get(`/treatments/${treatmentId}/impact`);
      expect(res.status).toBe(200);
      expect(res.body.data.after.days).toBe(14); // capped at windowDays
      expect(res.body.data.insufficientData).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ownership scoping on single-resource routes", () => {
  it("returns 404 (not 403) when reading another user's treatment", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "ownerA@embr.health");
    await registerAndLogin(agentB, "ownerB@embr.health");

    const createRes = await agentA
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-01" });
    const treatmentId = createRes.body.data.id;

    const res = await agentB.get(`/treatments/${treatmentId}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when updating another user's treatment", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "updA@embr.health");
    await registerAndLogin(agentB, "updB@embr.health");

    const createRes = await agentA
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-01" });
    const treatmentId = createRes.body.data.id;

    const res = await agentB.patch(`/treatments/${treatmentId}`).send({ name: "Renamed" });
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting another user's treatment — and it must still be there afterward", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "delA@embr.health");
    await registerAndLogin(agentB, "delB@embr.health");

    const createRes = await agentA
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-01" });
    const treatmentId = createRes.body.data.id;

    const deleteRes = await agentB.delete(`/treatments/${treatmentId}`);
    expect(deleteRes.status).toBe(404);

    const stillThereRes = await agentA.get(`/treatments/${treatmentId}`);
    expect(stillThereRes.status).toBe(200);
  });

  it("allows the owner to update and delete their own treatment", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "owner@embr.health");

    const createRes = await agent
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-01" });
    const treatmentId = createRes.body.data.id;

    const updateRes = await agent
      .patch(`/treatments/${treatmentId}`)
      .send({ endDate: "2026-07-01" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.endDate).toBe("2026-07-01");

    const deleteRes = await agent.delete(`/treatments/${treatmentId}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await agent.get(`/treatments/${treatmentId}`);
    expect(getRes.status).toBe(404);
  });

  it("rejects a partial update that would put endDate before the existing startDate", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "partialupdate@embr.health");

    const createRes = await agent
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-10" });
    const treatmentId = createRes.body.data.id;

    // Only endDate supplied — the cross-field check has to compare
    // against the *existing* startDate, not just what's in this body.
    const res = await agent.patch(`/treatments/${treatmentId}`).send({ endDate: "2026-06-01" });
    expect(res.status).toBe(400);
  });
});

describe("audit log coverage for treatment mutations", () => {
  it("logs TREATMENT_CREATED on create", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "audit-create@embr.health");

    const res = await agent
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-01" });

    const entry = state.auditLogEntries.find((e) => e.action === "TREATMENT_CREATED");
    expect(entry).toBeDefined();
    expect((entry?.metadata as { treatmentId?: string })?.treatmentId).toBe(res.body.data.id);
  });

  it("logs TREATMENT_UPDATED on update", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "audit-update@embr.health");
    const createRes = await agent
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-01" });

    await agent.patch(`/treatments/${createRes.body.data.id}`).send({ name: "Renamed" });

    const entry = state.auditLogEntries.find((e) => e.action === "TREATMENT_UPDATED");
    expect(entry).toBeDefined();
    expect((entry?.metadata as { treatmentId?: string })?.treatmentId).toBe(createRes.body.data.id);
  });

  it("logs TREATMENT_DELETED on delete", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "audit-delete@embr.health");
    const createRes = await agent
      .post("/treatments")
      .send({ name: "HRT patch", category: "HRT", startDate: "2026-06-01" });

    await agent.delete(`/treatments/${createRes.body.data.id}`);

    const entry = state.auditLogEntries.find((e) => e.action === "TREATMENT_DELETED");
    expect(entry).toBeDefined();
    expect((entry?.metadata as { treatmentId?: string })?.treatmentId).toBe(createRes.body.data.id);
  });
});

// Direct, isolated tests of the repository method itself — no HTTP
// layer, no brief.service.ts — used only by brief.service.ts today
// (see brief.test.ts's own overlap-scenario coverage), but tested here
// on its own merits so its correctness doesn't depend on how any one
// caller happens to use it.
describe("treatmentRepository.listOverlappingRange", () => {
  const USER_ID = "repo-test-user";

  beforeEach(() => {
    state.treatments = [];
  });

  it("includes a treatment fully inside the range", async () => {
    state.treatments.push({
      id: nextId(),
      userId: USER_ID,
      name: "In range",
      category: "HRT",
      startDate: new Date("2026-01-10"),
      endDate: new Date("2026-01-20"),
      notes: null,
      createdAt: now(),
      updatedAt: now(),
    });

    const results = await treatmentRepository.listOverlappingRange(
      USER_ID,
      new Date("2026-01-01"),
      new Date("2026-02-01"),
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe("In range");
  });

  it("scopes strictly to the given userId", async () => {
    state.treatments.push({
      id: nextId(),
      userId: "a-different-user",
      name: "Not this user",
      category: "HRT",
      startDate: new Date("2026-01-10"),
      endDate: null,
      notes: null,
      createdAt: now(),
      updatedAt: now(),
    });

    const results = await treatmentRepository.listOverlappingRange(
      USER_ID,
      new Date("2026-01-01"),
      new Date("2026-02-01"),
    );

    expect(results).toEqual([]);
  });

  it("excludes a treatment entirely before the range", async () => {
    state.treatments.push({
      id: nextId(),
      userId: USER_ID,
      name: "Too early",
      category: "SUPPLEMENT",
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-06-01"),
      notes: null,
      createdAt: now(),
      updatedAt: now(),
    });

    const results = await treatmentRepository.listOverlappingRange(
      USER_ID,
      new Date("2026-01-01"),
      new Date("2026-02-01"),
    );

    expect(results).toEqual([]);
  });

  it("excludes a treatment entirely after the range", async () => {
    state.treatments.push({
      id: nextId(),
      userId: USER_ID,
      name: "Too late",
      category: "MEDICATION",
      startDate: new Date("2026-06-01"),
      endDate: null,
      notes: null,
      createdAt: now(),
      updatedAt: now(),
    });

    const results = await treatmentRepository.listOverlappingRange(
      USER_ID,
      new Date("2026-01-01"),
      new Date("2026-02-01"),
    );

    expect(results).toEqual([]);
  });

  it("returns results ordered by startDate descending", async () => {
    state.treatments.push(
      {
        id: nextId(),
        userId: USER_ID,
        name: "Earlier",
        category: "HRT",
        startDate: new Date("2026-01-05"),
        endDate: null,
        notes: null,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: nextId(),
        userId: USER_ID,
        name: "Later",
        category: "SUPPLEMENT",
        startDate: new Date("2026-01-20"),
        endDate: null,
        notes: null,
        createdAt: now(),
        updatedAt: now(),
      },
    );

    const results = await treatmentRepository.listOverlappingRange(
      USER_ID,
      new Date("2026-01-01"),
      new Date("2026-02-01"),
    );

    expect(results.map((t) => t.name)).toEqual(["Later", "Earlier"]);
  });
});
