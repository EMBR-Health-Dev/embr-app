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
      symptomLogs: [] as Array<{ id: string; userId: string }>,
      onboardingProfiles: [] as Array<{
        id: string;
        userId: string;
        jobToBeDone: string | null;
        noticedAreas: string[];
        appointmentStatus: string | null;
        currentStep: string | null;
        skipped: boolean;
        completedAt: Date | null;
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
    symptomLog: {
      create: vi.fn(({ data }: { data: { userId: string } }) => {
        const log = { id: nextId(), ...data };
        state.symptomLogs.push(log);
        return Promise.resolve(log);
      }),
    },
    onboardingProfile: {
      findUnique: vi.fn(({ where }: { where: { userId: string } }) => {
        const found = state.onboardingProfiles.find((p) => p.userId === where.userId);
        return Promise.resolve(found ?? null);
      }),
      upsert: vi.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { userId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const existing = state.onboardingProfiles.find((p) => p.userId === where.userId);
          if (existing) {
            Object.assign(existing, update, { updatedAt: now() });
            return Promise.resolve(existing);
          }
          const created = {
            id: nextId(),
            jobToBeDone: null,
            noticedAreas: [],
            appointmentStatus: null,
            currentStep: null,
            skipped: false,
            completedAt: null,
            createdAt: now(),
            updatedAt: now(),
            ...create,
          };
          state.onboardingProfiles.push(created);
          return Promise.resolve(created);
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

beforeEach(() => {
  state.users = [];
  state.symptomLogs = [];
  state.onboardingProfiles = [];
});

describe("GET /onboarding", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/onboarding");
    expect(res.status).toBe(401);
  });

  it("returns the default empty shape when no profile exists yet", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "fresh@embr.health");

    const res = await agent.get("/onboarding");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      jobToBeDone: null,
      noticedAreas: [],
      appointmentStatus: null,
      currentStep: null,
      skipped: false,
      completedAt: null,
    });
  });

  it("only ever returns the caller's own profile, never another user's", async () => {
    const app = createApp();

    const agentA = request.agent(app);
    await registerAndLogin(agentA, "a@embr.health");
    await agentA.patch("/onboarding").send({ jobToBeDone: "KEEP_RECORD" });

    const agentB = request.agent(app);
    await registerAndLogin(agentB, "b@embr.health");

    const res = await agentB.get("/onboarding");
    expect(res.status).toBe(200);
    // B has never touched onboarding — must see the empty default, not
    // A's answer, regardless of there being no :id in this route at all
    // for B to have gotten wrong.
    expect(res.body.data.jobToBeDone).toBeNull();
  });
});

describe("PATCH /onboarding", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).patch("/onboarding").send({ currentStep: "WELCOME" });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid enum value", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "badenum@embr.health");

    const res = await agent.patch("/onboarding").send({ jobToBeDone: "SOMETHING_MADE_UP" });
    expect(res.status).toBe(400);
    expect(state.onboardingProfiles).toHaveLength(0);
  });

  it("rejects an unknown top-level field", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "badfield@embr.health");

    const res = await agent.patch("/onboarding").send({ favoriteColor: "navy" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid array element in noticedAreas", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "badarea@embr.health");

    const res = await agent
      .patch("/onboarding")
      .send({ noticedAreas: ["SLEEP", "NOT_A_REAL_AREA"] });
    expect(res.status).toBe(400);
  });

  it("supports genuine partial updates without clobbering previously-set fields", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "partial@embr.health");

    const first = await agent.patch("/onboarding").send({ jobToBeDone: "UNDERSTAND_PATTERNS" });
    expect(first.status).toBe(200);
    expect(first.body.data.jobToBeDone).toBe("UNDERSTAND_PATTERNS");

    const second = await agent.patch("/onboarding").send({ noticedAreas: ["SLEEP", "ENERGY"] });
    expect(second.status).toBe(200);
    // jobToBeDone from the first PATCH must still be there — a partial
    // update naming only noticedAreas must not have reset it.
    expect(second.body.data.jobToBeDone).toBe("UNDERSTAND_PATTERNS");
    expect(second.body.data.noticedAreas).toEqual(["SLEEP", "ENERGY"]);
  });

  it("persists currentStep for resume", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "resume@embr.health");

    await agent.patch("/onboarding").send({ currentStep: "JOB_TO_BE_DONE" });
    const res = await agent.get("/onboarding");
    expect(res.body.data.currentStep).toBe("JOB_TO_BE_DONE");
  });

  it("completion sets completedAt and leaves skipped false", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "complete@embr.health");

    const res = await agent.patch("/onboarding").send({ status: "completed" });
    expect(res.status).toBe(200);
    expect(res.body.data.completedAt).not.toBeNull();
    expect(res.body.data.skipped).toBe(false);
  });

  it("skip sets completedAt and skipped true", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "skip@embr.health");

    const res = await agent.patch("/onboarding").send({ status: "skipped" });
    expect(res.status).toBe(200);
    expect(res.body.data.completedAt).not.toBeNull();
    expect(res.body.data.skipped).toBe(true);
  });

  it("never creates a SymptomLog, regardless of what noticedAreas contains", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "nolog@embr.health");

    await agent.patch("/onboarding").send({ noticedAreas: ["SLEEP", "MOOD", "BODY"] });
    await agent.patch("/onboarding").send({ status: "completed" });

    expect(state.symptomLogs).toHaveLength(0);
  });

  it("cannot modify another user's profile", async () => {
    const app = createApp();

    const agentA = request.agent(app);
    await registerAndLogin(agentA, "victim@embr.health");
    await agentA.patch("/onboarding").send({ jobToBeDone: "KEEP_RECORD" });

    const agentB = request.agent(app);
    await registerAndLogin(agentB, "attacker@embr.health");
    // There's no :id to target — B's PATCH can only ever act on B's own
    // profile, scoped by B's own authenticated session. This confirms
    // that holds: B's write doesn't touch A's row at all.
    await agentB.patch("/onboarding").send({ jobToBeDone: "NOT_SURE" });

    const aProfile = state.onboardingProfiles.find((p) =>
      state.users.find((u) => u.email === "victim@embr.health" && u.id === p.userId),
    );
    expect(aProfile?.jobToBeDone).toBe("KEEP_RECORD");
  });
});

describe("onboardingCompletedAt on /auth/me", () => {
  it("is null before onboarding is touched", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "neverboarded@embr.health");

    const res = await agent.get("/auth/me");
    expect(res.body.data.onboardingCompletedAt).toBeNull();
  });

  it("reflects completion immediately, without a second /auth/me needed to notice", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "willcomplete@embr.health");

    await agent.patch("/onboarding").send({ status: "completed" });
    const res = await agent.get("/auth/me");
    expect(res.body.data.onboardingCompletedAt).not.toBeNull();
  });

  it("reflects a skip the same way a completion is reflected", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "willskip@embr.health");

    await agent.patch("/onboarding").send({ status: "skipped" });
    const res = await agent.get("/auth/me");
    expect(res.body.data.onboardingCompletedAt).not.toBeNull();
  });

  it("stays set on subsequent logins — completed onboarding never reappears", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "persistent@embr.health");
    await agent.patch("/onboarding").send({ status: "completed" });

    // A fresh login (as if the app were reopened) must still see it.
    const reLogin = await agent
      .post("/auth/login")
      .send({ email: "persistent@embr.health", password: VALID_PASSWORD });
    expect(reLogin.body.data.user.onboardingCompletedAt).not.toBeNull();
  });

  it("stays set on subsequent logins after a skip too", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "persistentskip@embr.health");
    await agent.patch("/onboarding").send({ status: "skipped" });

    const reLogin = await agent
      .post("/auth/login")
      .send({ email: "persistentskip@embr.health", password: VALID_PASSWORD });
    expect(reLogin.body.data.user.onboardingCompletedAt).not.toBeNull();
  });
});
