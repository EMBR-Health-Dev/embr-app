import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
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
      notes: [] as Array<{
        id: string;
        userId: string;
        title: string;
        body: string;
        cover: string;
        createdAt: Date;
        updatedAt: Date;
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
    note: {
      create: vi.fn(
        ({ data }: { data: { userId: string; title: string; body: string; cover: string } }) => {
          const note = { id: nextId(), createdAt: now(), updatedAt: now(), ...data };
          state.notes.push(note);
          return Promise.resolve(note);
        },
      ),
      findMany: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          state.notes
            .filter((n) => n.userId === where.userId)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
        ),
      ),
      count: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(state.notes.filter((n) => n.userId === where.userId).length),
      ),
      findFirst: vi.fn(({ where }: { where: { id: string; userId: string } }) =>
        Promise.resolve(
          state.notes.find((n) => n.id === where.id && n.userId === where.userId) ?? null,
        ),
      ),
      updateMany: vi.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; userId: string };
          data: Record<string, unknown>;
        }) => {
          const note = state.notes.find((n) => n.id === where.id && n.userId === where.userId);
          if (!note) return Promise.resolve({ count: 0 });
          Object.assign(note, data, { updatedAt: now() });
          return Promise.resolve({ count: 1 });
        },
      ),
      deleteMany: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const before = state.notes.length;
        state.notes = state.notes.filter((n) => !(n.id === where.id && n.userId === where.userId));
        return Promise.resolve({ count: before - state.notes.length });
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

beforeEach(() => {
  state.users = [];
  state.notes = [];
  state.auditLogEntries = [];
});

describe("Notes", () => {
  it("requires authentication", async () => {
    const app = createApp();
    expect((await request(app).get("/notes")).status).toBe(401);
    expect((await request(app).post("/notes").send({ title: "x" })).status).toBe(401);
  });

  it("creates a note with a default cover and empty body", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "notes-create@embr.health");

    const res = await agent.post("/notes").send({ title: "  Questions for Dr Sato  " });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: "Questions for Dr Sato",
      body: "",
      cover: "LILAC",
    });
  });

  it("rejects an empty title, an over long body and an unknown cover", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "notes-invalid@embr.health");

    expect((await agent.post("/notes").send({ title: "   " })).status).toBe(400);
    expect((await agent.post("/notes").send({ title: "a", body: "x".repeat(20001) })).status).toBe(
      400,
    );
    expect((await agent.post("/notes").send({ title: "a", cover: "GOLD" })).status).toBe(400);
  });

  it("lists only the signed in person's notes", async () => {
    const app = createApp();
    const a = request.agent(app);
    const b = request.agent(app);
    await registerAndLogin(a, "notes-a@embr.health");
    await registerAndLogin(b, "notes-b@embr.health");
    await a.post("/notes").send({ title: "Mine" });
    await b.post("/notes").send({ title: "Theirs" });

    const res = await a.get("/notes");

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].title).toBe("Mine");
  });

  it("updates and deletes a note, and treats someone else's note as not found", async () => {
    const app = createApp();
    const a = request.agent(app);
    const b = request.agent(app);
    await registerAndLogin(a, "notes-edit-a@embr.health");
    await registerAndLogin(b, "notes-edit-b@embr.health");
    const created = await a.post("/notes").send({ title: "Draft" });
    const id = created.body.data.id as string;

    const updated = await a
      .patch(`/notes/${id}`)
      .send({ body: "Woke at 3am twice", cover: "PLUM" });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      title: "Draft",
      body: "Woke at 3am twice",
      cover: "PLUM",
    });

    expect((await b.patch(`/notes/${id}`).send({ title: "x" })).status).toBe(404);
    expect((await b.delete(`/notes/${id}`)).status).toBe(404);
    expect((await b.get(`/notes/${id}`)).status).toBe(404);

    expect((await a.delete(`/notes/${id}`)).status).toBe(204);
    expect((await a.get(`/notes/${id}`)).status).toBe(404);
  });

  it("rejects an update with nothing to change", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "notes-empty-update@embr.health");
    const created = await agent.post("/notes").send({ title: "Draft" });
    expect((await agent.patch(`/notes/${created.body.data.id}`).send({})).status).toBe(400);
  });

  it("audits note writes by id only, never the title or text", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "notes-audit@embr.health");
    await agent.post("/notes").send({ title: "Private title", body: "Private text" });

    const entry = state.auditLogEntries.find((e) => e.action === "NOTE_CREATED");
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).not.toMatch(/Private/);
  });
});
