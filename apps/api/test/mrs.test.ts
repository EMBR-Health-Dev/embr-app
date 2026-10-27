import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
// The check-in is off unless switched on; these tests switch it on
// before the app (and its env) load.
process.env.MRS_CHECK_IN_ENABLED = "true";

const { createApp } = await import("../src/app.js");
import { CURRENT_CONSENTS } from "./helpers/consents.js";

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
      checkIns: [] as Array<
        Record<string, unknown> & {
          id: string;
          userId: string;
          completedOn: Date;
          createdAt: Date;
          updatedAt: Date;
        }
      >,
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
    mrsCheckIn: {
      upsert: vi.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { userId_completedOn: { userId: string; completedOn: Date } };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const { userId, completedOn } = where.userId_completedOn;
          const existing = state.checkIns.find(
            (c) => c.userId === userId && c.completedOn.getTime() === completedOn.getTime(),
          );
          if (existing) {
            Object.assign(existing, update, { updatedAt: now() });
            return Promise.resolve(existing);
          }
          const row = {
            id: nextId(),
            createdAt: now(),
            updatedAt: now(),
            ...create,
          } as (typeof state.checkIns)[number];
          state.checkIns.push(row);
          return Promise.resolve(row);
        },
      ),
      findMany: vi.fn(
        ({ where }: { where: { userId: string; completedOn?: { gte?: Date; lte?: Date } } }) =>
          Promise.resolve(
            state.checkIns
              .filter(
                (c) =>
                  c.userId === where.userId &&
                  (!where.completedOn?.gte || c.completedOn >= where.completedOn.gte) &&
                  (!where.completedOn?.lte || c.completedOn <= where.completedOn.lte),
              )
              .sort((a, b) => a.completedOn.getTime() - b.completedOn.getTime()),
          ),
      ),
      deleteMany: vi.fn(({ where }: { where: { userId: string; completedOn: Date } }) => {
        const before = state.checkIns.length;
        state.checkIns = state.checkIns.filter(
          (c) =>
            !(c.userId === where.userId && c.completedOn.getTime() === where.completedOn.getTime()),
        );
        return Promise.resolve({ count: before - state.checkIns.length });
      }),
    },
  },
}));

const VALID_PASSWORD = "Sup3rSecret!Pass";

async function registerAndLogin(agent: ReturnType<typeof request.agent>, email: string) {
  await agent
    .post("/auth/register")
    .send({ consents: CURRENT_CONSENTS, email, password: VALID_PASSWORD });
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

const ANSWERS = {
  hotFlushes: 3,
  heartDiscomfort: 1,
  sleepProblems: 4,
  depressiveMood: 2,
  irritability: 1,
  anxiety: 0,
  exhaustion: 3,
  sexualProblems: 1,
  bladderProblems: 0,
  vaginalDryness: 2,
  jointMuscular: 2,
};

beforeEach(() => {
  state.users = [];
  state.checkIns = [];
  state.auditLogEntries = [];
});

describe("MRS check-ins", () => {
  it("requires authentication", async () => {
    const app = createApp();
    expect((await request(app).get("/mrs-check-ins")).status).toBe(401);
    expect(
      (await request(app).put("/mrs-check-ins/2026-06-01").send({ locale: "en", answers: ANSWERS }))
        .status,
    ).toBe(401);
  });

  it("saves a check-in and returns her answers with the published sums", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "mrs-save@embr.health");

    const res = await agent
      .put("/mrs-check-ins/2026-06-01")
      .send({ locale: "en", answers: ANSWERS });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      completedOn: "2026-06-01",
      locale: "en",
      instrumentVersion: "MRS-EN-2003",
      answers: ANSWERS,
      // somatic 3+1+4+2, psychological 2+1+0+3, urogenital 1+0+2
      scores: { total: 19, somatic: 10, psychological: 6, urogenital: 3 },
    });
    expect(res.body.data).not.toHaveProperty("band");
  });

  it("saving the same date again replaces that check-in", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "mrs-replace@embr.health");

    await agent.put("/mrs-check-ins/2026-06-01").send({ locale: "en", answers: ANSWERS });
    await agent
      .put("/mrs-check-ins/2026-06-01")
      .send({ locale: "en", answers: { ...ANSWERS, hotFlushes: 0 } });

    const list = await agent.get("/mrs-check-ins");
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].answers.hotFlushes).toBe(0);
  });

  it("rejects a missing answer, an answer outside 0 to 4, an unknown item and Japanese", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "mrs-invalid@embr.health");
    const put = (body: unknown) => agent.put("/mrs-check-ins/2026-06-01").send(body);

    const missingOne: Partial<typeof ANSWERS> = { ...ANSWERS };
    delete missingOne.anxiety;
    expect((await put({ locale: "en", answers: missingOne })).status).toBe(400);
    expect((await put({ locale: "en", answers: { ...ANSWERS, anxiety: 5 } })).status).toBe(400);
    expect((await put({ locale: "en", answers: { ...ANSWERS, anxiety: -1 } })).status).toBe(400);
    expect((await put({ locale: "en", answers: { ...ANSWERS, anxiety: 1.5 } })).status).toBe(400);
    expect((await put({ locale: "en", answers: { ...ANSWERS, mood: 1 } })).status).toBe(400);
    expect((await put({ locale: "ja", answers: ANSWERS })).status).toBe(400);
    expect(state.checkIns).toHaveLength(0);
  });

  it("rejects a date in the future", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "mrs-future@embr.health");

    const res = await agent
      .put("/mrs-check-ins/2999-01-01")
      .send({ locale: "en", answers: ANSWERS });

    expect(res.status).toBe(400);
  });

  it("lists only her own check-ins, oldest first, within the range", async () => {
    const app = createApp();
    const a = request.agent(app);
    const b = request.agent(app);
    await registerAndLogin(a, "mrs-list-a@embr.health");
    await registerAndLogin(b, "mrs-list-b@embr.health");

    await a.put("/mrs-check-ins/2026-07-01").send({ locale: "en", answers: ANSWERS });
    await a.put("/mrs-check-ins/2026-05-01").send({ locale: "en", answers: ANSWERS });
    await a.put("/mrs-check-ins/2026-06-01").send({ locale: "en", answers: ANSWERS });
    await b.put("/mrs-check-ins/2026-06-01").send({ locale: "en", answers: ANSWERS });

    const all = await a.get("/mrs-check-ins");
    expect(all.body.data.map((c: { completedOn: string }) => c.completedOn)).toEqual([
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
    ]);
    const ranged = await a.get("/mrs-check-ins?from=2026-05-15&to=2026-06-30");
    expect(ranged.body.data.map((c: { completedOn: string }) => c.completedOn)).toEqual([
      "2026-06-01",
    ]);
  });

  it("deletes her own check-in and cannot delete someone else's", async () => {
    const app = createApp();
    const a = request.agent(app);
    const b = request.agent(app);
    await registerAndLogin(a, "mrs-del-a@embr.health");
    await registerAndLogin(b, "mrs-del-b@embr.health");
    await a.put("/mrs-check-ins/2026-06-01").send({ locale: "en", answers: ANSWERS });

    expect((await b.delete("/mrs-check-ins/2026-06-01")).status).toBe(404);
    expect((await a.delete("/mrs-check-ins/2026-06-01")).status).toBe(204);
    expect((await a.get("/mrs-check-ins")).body.data).toEqual([]);
  });

  it("audits saves and deletes by date only, never an answer", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "mrs-audit@embr.health");

    await agent.put("/mrs-check-ins/2026-06-01").send({ locale: "en", answers: ANSWERS });
    await agent.delete("/mrs-check-ins/2026-06-01");

    const entries = state.auditLogEntries.filter((e) => e.action.startsWith("MRS_"));
    expect(entries.map((e) => e.action)).toEqual(["MRS_CHECK_IN_SAVED", "MRS_CHECK_IN_DELETED"]);
    for (const entry of entries) expect(entry.metadata).toEqual({ date: "2026-06-01" });
  });
});
