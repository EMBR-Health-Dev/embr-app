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
      findMany: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          [...state.logs.filter((l) => l.userId === where.userId)].sort(
            (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
          ),
        ),
      ),
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
      findMany: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          [...state.entries.filter((e) => e.userId === where.userId)].sort(
            (a, b) => a.date.getTime() - b.date.getTime(),
          ),
        ),
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
  state.logs = [];
  state.entries = [];
});

describe("GET /export/symptom-logs.csv", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/export/symptom-logs.csv");
    expect(res.status).toBe(401);
  });

  it("returns a CSV of only the authenticated user's logs", async () => {
    const app = createApp();
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "exportA@embr.health");
    await registerAndLogin(agentB, "exportB@embr.health");

    await agentA.post("/symptom-logs").send({
      category: "HOT_FLASH",
      severity: "SEVERE",
      occurredAt: "2026-07-01T00:00:00.000Z",
      notes: "bad one",
    });
    await agentB
      .post("/symptom-logs")
      .send({ category: "BRAIN_FOG", severity: "MILD", occurredAt: "2026-07-02T00:00:00.000Z" });

    const res = await agentA.get("/export/symptom-logs.csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("embr-symptom-logs.csv");
    expect(res.text).toContain("Hot Flash");
    expect(res.text).toContain("bad one");
    expect(res.text).not.toContain("Brain Fog");
  });
});

describe("GET /export/cycle-entries.csv", () => {
  it("returns a CSV of cycle entries", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "cycleexport@embr.health");
    await agent
      .post("/cycle-entries")
      .send({ date: "2026-07-05", flow: "MEDIUM", isPeriodStart: true });

    const res = await agent.get("/export/cycle-entries.csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("2026-07-05");
    expect(res.text).toContain("Medium");
  });
});

describe("GET /export/summary.pdf", () => {
  it("returns a PDF document", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "pdfexport@embr.health");
    await agent
      .post("/symptom-logs")
      .send({ category: "JOINT_PAIN", severity: "MODERATE", occurredAt: new Date().toISOString() });

    const res = await agent
      .get("/export/summary.pdf")
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("embr-health-summary.pdf");
    // PDF files start with the "%PDF-" magic bytes.
    expect((res.body as Buffer).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/export/summary.pdf");
    expect(res.status).toBe(401);
  });
});
