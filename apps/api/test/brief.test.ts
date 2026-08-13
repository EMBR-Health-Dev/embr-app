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
      symptomLogs: [] as Array<{
        id: string;
        userId: string;
        category: string;
        severity: string;
        occurredAt: Date;
        notes: string | null;
      }>,
      cycleEntries: [] as Array<{
        id: string;
        userId: string;
        date: Date;
        flow: string | null;
        isPeriodStart: boolean;
        isPeriodEnd: boolean;
        notes: string | null;
      }>,
      briefs: [] as Array<{
        id: string;
        userId: string;
        fromDate: Date;
        toDate: Date;
        symptomSummary: unknown;
        cycleSummary: unknown;
        aiNarrative: string;
        aiDiscussionTopics: unknown;
        createdAt: Date;
      }>,
    },
    nextId: () => randomUUID(),
  };
});

const now = () => new Date();

const { aiState } = vi.hoisted(() => ({
  aiState: {
    nextResponse: null as null | { narrative: string; discussionTopics: string[] },
    shouldThrow: false,
  },
}));

vi.mock("../src/modules/briefs/brief.ai.js", () => ({
  briefAi: {
    generate: vi.fn(async () => {
      if (aiState.shouldThrow) throw new Error("simulated AI failure");
      if (!aiState.nextResponse) {
        throw new Error("test didn't configure an AI response");
      }
      return aiState.nextResponse;
    }),
  },
}));

vi.mock("../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG"), quit: vi.fn() },
}));

vi.mock("../src/modules/auth/mailer.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendOrganizationInviteEmail: vi.fn().mockResolvedValue(undefined),
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
    onboardingProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    symptomLog: {
      findMany: vi.fn(
        ({ where }: { where: { userId: string; occurredAt?: { gte?: Date; lte?: Date } } }) => {
          const results = state.symptomLogs.filter((log) => {
            if (log.userId !== where.userId) return false;
            if (where.occurredAt?.gte && log.occurredAt < where.occurredAt.gte) return false;
            if (where.occurredAt?.lte && log.occurredAt > where.occurredAt.lte) return false;
            return true;
          });
          return Promise.resolve(results);
        },
      ),
    },
    cycleEntry: {
      findMany: vi.fn(
        ({ where }: { where: { userId: string; date?: { gte?: Date; lte?: Date } } }) => {
          const results = state.cycleEntries.filter((entry) => {
            if (entry.userId !== where.userId) return false;
            if (where.date?.gte && entry.date < where.date.gte) return false;
            if (where.date?.lte && entry.date > where.date.lte) return false;
            return true;
          });
          return Promise.resolve(results);
        },
      ),
    },
    clinicalBrief: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const brief = { id: nextId(), createdAt: now(), ...data } as (typeof state.briefs)[number];
        state.briefs.push(brief);
        return Promise.resolve(brief);
      }),
      findMany: vi.fn(
        ({ where, skip, take }: { where: { userId: string }; skip: number; take: number }) => {
          const results = state.briefs
            .filter((b) => b.userId === where.userId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(skip, skip + take);
          return Promise.resolve(results);
        },
      ),
      count: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(state.briefs.filter((b) => b.userId === where.userId).length),
      ),
      findFirst: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const found = state.briefs.find((b) => b.id === where.id && b.userId === where.userId);
        return Promise.resolve(found ?? null);
      }),
      deleteMany: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const before = state.briefs.length;
        state.briefs = state.briefs.filter(
          (b) => !(b.id === where.id && b.userId === where.userId),
        );
        return Promise.resolve({ count: before - state.briefs.length });
      }),
    },
  },
}));

const VALID_PASSWORD = "Sup3rSecret!Pass";

async function registerAndLogin(agent: ReturnType<typeof request.agent>, email: string) {
  const register = await agent.post("/auth/register").send({ email, password: VALID_PASSWORD });
  await agent.post("/auth/login").send({ email, password: VALID_PASSWORD });
  return register.body.data.id as string;
}

function addSymptomLog(
  userId: string,
  overrides: Partial<(typeof state.symptomLogs)[number]> = {},
) {
  const log = {
    id: nextId(),
    userId,
    category: "HOT_FLASH",
    severity: "MODERATE",
    occurredAt: now(),
    notes: null,
    ...overrides,
  };
  state.symptomLogs.push(log);
  return log;
}

beforeEach(() => {
  state.users = [];
  state.symptomLogs = [];
  state.cycleEntries = [];
  state.briefs = [];
  aiState.nextResponse = null;
  aiState.shouldThrow = false;
});

const RANGE = { fromDate: "2026-01-01", toDate: "2026-02-01" };

describe("POST /briefs", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).post("/briefs").send(RANGE);
    expect(res.status).toBe(401);
  });

  it("rejects fromDate >= toDate", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "range@embr.health");

    const res = await agent.post("/briefs").send({ fromDate: "2026-02-01", toDate: "2026-01-01" });
    expect(res.status).toBe(400);
  });

  it("computes the structured summary correctly and persists it alongside the AI content", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "brief1@embr.health");

    addSymptomLog(userId, {
      category: "HOT_FLASH",
      severity: "MODERATE",
      occurredAt: new Date("2026-01-05"),
    });
    addSymptomLog(userId, {
      category: "HOT_FLASH",
      severity: "SEVERE",
      occurredAt: new Date("2026-01-10"),
    });
    addSymptomLog(userId, {
      category: "BRAIN_FOG",
      severity: "MILD",
      occurredAt: new Date("2026-01-15"),
    });
    // Outside the requested range — must not be counted.
    addSymptomLog(userId, { category: "HOT_FLASH", occurredAt: new Date("2026-03-01") });

    aiState.nextResponse = {
      narrative: "Hot flashes were logged most frequently, with increasing severity.",
      discussionTopics: ["Ask whether hot flash severity trends are typical at this stage."],
    };

    const res = await agent.post("/briefs").send(RANGE);

    expect(res.status).toBe(201);
    expect(res.body.data.symptomSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "HOT_FLASH",
          count: 2,
          severityBreakdown: { MODERATE: 1, SEVERE: 1 },
        }),
        expect.objectContaining({ category: "BRAIN_FOG", count: 1 }),
      ]),
    );
    expect(res.body.data.symptomSummary).toHaveLength(2); // not 3 — the out-of-range log excluded
    expect(res.body.data.aiNarrative).toBe(aiState.nextResponse.narrative);
    expect(res.body.data.aiDiscussionTopics).toEqual(aiState.nextResponse.discussionTopics);
    expect(state.briefs).toHaveLength(1);
  });

  it("computes cycle summary from period-start entries", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "brief2@embr.health");

    state.cycleEntries.push(
      {
        id: nextId(),
        userId,
        date: new Date("2026-01-01"),
        flow: "MEDIUM",
        isPeriodStart: true,
        isPeriodEnd: false,
        notes: null,
      },
      {
        id: nextId(),
        userId,
        date: new Date("2026-01-29"),
        flow: "LIGHT",
        isPeriodStart: true,
        isPeriodEnd: false,
        notes: null,
      },
    );
    aiState.nextResponse = { narrative: "n/a", discussionTopics: ["n/a"] };

    const res = await agent.post("/briefs").send(RANGE);

    expect(res.status).toBe(201);
    expect(res.body.data.cycleSummary).toEqual({
      averageCycleLengthDays: 28,
      cycleCount: 1,
      periodDaysLogged: 2,
    });
  });

  it("surfaces an AI failure as an error rather than silently generating a broken brief", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "brief-fail@embr.health");
    aiState.shouldThrow = true;

    const res = await agent.post("/briefs").send(RANGE);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(state.briefs).toHaveLength(0);
  });
});

describe("GET/DELETE /briefs — access control", () => {
  async function createBriefFor(agent: ReturnType<typeof request.agent>) {
    aiState.nextResponse = { narrative: "n", discussionTopics: ["t"] };
    const res = await agent.post("/briefs").send(RANGE);
    return res.body.data.id as string;
  }

  it("GET /briefs only lists the current user's briefs", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    await registerAndLogin(agentA, "user-a@embr.health");
    await createBriefFor(agentA);

    const agentB = request.agent(app);
    await registerAndLogin(agentB, "user-b@embr.health");
    await createBriefFor(agentB);

    const res = await agentA.get("/briefs");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
  });

  it("GET /briefs/:id 404s for another user's brief rather than exposing it", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    await registerAndLogin(agentA, "owner@embr.health");
    const briefId = await createBriefFor(agentA);

    const agentB = request.agent(app);
    await registerAndLogin(agentB, "intruder@embr.health");

    const res = await agentB.get(`/briefs/${briefId}`);
    expect(res.status).toBe(404);
  });

  it("GET /briefs/:id/pdf returns a PDF for the owner", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "pdf-owner@embr.health");
    const briefId = await createBriefFor(agent);

    const res = await agent.get(`/briefs/${briefId}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
  });

  it("DELETE /briefs/:id removes it for the owner", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "deleter@embr.health");
    const briefId = await createBriefFor(agent);

    const del = await agent.delete(`/briefs/${briefId}`);
    expect(del.status).toBe(204);

    const get = await agent.get(`/briefs/${briefId}`);
    expect(get.status).toBe(404);
  });

  it("DELETE /briefs/:id 404s (and does not delete) for another user's brief", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    await registerAndLogin(agentA, "owner2@embr.health");
    const briefId = await createBriefFor(agentA);

    const agentB = request.agent(app);
    await registerAndLogin(agentB, "intruder2@embr.health");

    const del = await agentB.delete(`/briefs/${briefId}`);
    expect(del.status).toBe(404);
    expect(state.briefs.find((b) => b.id === briefId)).toBeDefined();
  });
});
