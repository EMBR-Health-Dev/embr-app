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
      auditLogs: [] as Array<{
        id: string;
        userId: string | null;
        action: string;
        metadata: unknown;
        ipAddress: string | null;
        userAgent: string | null;
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
      findMany: vi.fn(({ skip = 0, take = 20 }: { skip?: number; take?: number }) =>
        Promise.resolve(
          [...state.users]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(skip, skip + take),
        ),
      ),
      count: vi.fn(() => Promise.resolve(state.users.length)),
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
        ({ data }: { data: Omit<(typeof state.auditLogs)[number], "id" | "createdAt"> }) => {
          const log = { id: nextId(), createdAt: now(), ...data };
          state.auditLogs.push(log);
          return Promise.resolve(log);
        },
      ),
      findMany: vi.fn(
        ({
          where,
          skip = 0,
          take = 20,
        }: {
          where?: { action?: string; userId?: string };
          skip?: number;
          take?: number;
        }) => {
          let items = [...state.auditLogs];
          if (where?.action) items = items.filter((l) => l.action === where.action);
          if (where?.userId) items = items.filter((l) => l.userId === where.userId);
          items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          return Promise.resolve(items.slice(skip, skip + take));
        },
      ),
      count: vi.fn(({ where }: { where?: { action?: string; userId?: string } }) => {
        let items = [...state.auditLogs];
        if (where?.action) items = items.filter((l) => l.action === where.action);
        if (where?.userId) items = items.filter((l) => l.userId === where.userId);
        return Promise.resolve(items.length);
      }),
    },
  },
}));

const VALID_PASSWORD = "Sup3rSecret!Pass";

async function registerAndLogin(agent: ReturnType<typeof request.agent>, email: string) {
  await agent.post("/auth/register").send({ email, password: VALID_PASSWORD });
  return agent.post("/auth/login").send({ email, password: VALID_PASSWORD });
}

/** Simulates an out-of-band promotion to ADMIN (there's no self-service
 * promotion endpoint, by design) by mutating the fixture directly. */
function promoteToAdmin(email: string) {
  const user = state.users.find((u) => u.email === email);
  if (user) user.role = "ADMIN";
}

beforeEach(() => {
  state.users = [];
  state.auditLogs = [];
});

describe("GET /admin/users", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/admin/users");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated non-admin", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "member@embr.health");

    const res = await agent.get("/admin/users");
    expect(res.status).toBe(403);
  });

  it("returns a paginated user list for an admin, without password hashes", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "admin@embr.health");
    promoteToAdmin("admin@embr.health");
    // Re-login so the access token actually carries the ADMIN role.
    await agent.post("/auth/login").send({ email: "admin@embr.health", password: VALID_PASSWORD });

    await request(app)
      .post("/auth/register")
      .send({ email: "other@embr.health", password: VALID_PASSWORD });

    const res = await agent.get("/admin/users");
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items[0].passwordHash).toBeUndefined();
    expect(
      res.body.data.items.every((u: { role: string }) => ["MEMBER", "ADMIN"].includes(u.role)),
    ).toBe(true);
  });
});

describe("GET /admin/audit-logs", () => {
  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "notadmin@embr.health");

    const res = await agent.get("/admin/audit-logs");
    expect(res.status).toBe(403);
  });

  it("lists audit log entries for an admin", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "auditadmin@embr.health");
    promoteToAdmin("auditadmin@embr.health");
    await agent
      .post("/auth/login")
      .send({ email: "auditadmin@embr.health", password: VALID_PASSWORD });

    const res = await agent.get("/admin/audit-logs");
    expect(res.status).toBe(200);
    // At minimum: register + two logins + this view itself all wrote entries.
    expect(res.body.data.total).toBeGreaterThan(0);
    expect(res.body.data.items[0]).toHaveProperty("action");
  });

  it("filters by action", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "filteradmin@embr.health");
    promoteToAdmin("filteradmin@embr.health");
    await agent
      .post("/auth/login")
      .send({ email: "filteradmin@embr.health", password: VALID_PASSWORD });

    const res = await agent.get("/admin/audit-logs").query({ action: "LOGIN_SUCCEEDED" });
    expect(res.status).toBe(200);
    expect(
      (res.body.data.items as Array<{ action: string }>).every(
        (l) => l.action === "LOGIN_SUCCEEDED",
      ),
    ).toBe(true);
  });
});
