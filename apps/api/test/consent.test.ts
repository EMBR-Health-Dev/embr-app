import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { CURRENT_CONSENTS } from "./helpers/consents.js";
import { LEGAL_DOCUMENT_VERSIONS } from "@embr/validation";
import { env } from "../src/config/env.js";

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
      auditLogEntries: [] as Array<{ action: string; userId: string | null; metadata?: unknown }>,
    },
    // idParamSchema requires a real UUID shape, so fixture ids can't be
    // plain incrementing strings the way earlier tests used them.
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
      findMany: vi.fn(
        ({
          where,
          orderBy,
          skip = 0,
          take = 20,
        }: {
          where: { userId: string; category?: string; occurredAt?: { gte?: Date; lte?: Date } };
          orderBy?: { occurredAt: "asc" | "desc" };
          skip?: number;
          take?: number;
        }) => {
          let items = state.logs.filter((l) => l.userId === where.userId);
          if (where.category) items = items.filter((l) => l.category === where.category);
          if (where.occurredAt?.gte)
            items = items.filter((l) => l.occurredAt >= where.occurredAt!.gte!);
          if (where.occurredAt?.lte)
            items = items.filter((l) => l.occurredAt <= where.occurredAt!.lte!);
          items = [...items].sort((a, b) =>
            orderBy?.occurredAt === "asc"
              ? a.occurredAt.getTime() - b.occurredAt.getTime()
              : b.occurredAt.getTime() - a.occurredAt.getTime(),
          );
          return Promise.resolve(items.slice(skip, skip + take));
        },
      ),
      count: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(state.logs.filter((l) => l.userId === where.userId).length),
      ),
      findFirst: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const found = state.logs.find((l) => l.id === where.id && l.userId === where.userId);
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
          const found = state.logs.find((l) => l.id === where.id && l.userId === where.userId);
          if (!found) return Promise.resolve({ count: 0 });
          Object.assign(found, data, { updatedAt: now() });
          return Promise.resolve({ count: 1 });
        },
      ),
      deleteMany: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const idx = state.logs.findIndex((l) => l.id === where.id && l.userId === where.userId);
        if (idx === -1) return Promise.resolve({ count: 0 });
        state.logs.splice(idx, 1);
        return Promise.resolve({ count: 1 });
      }),
    },
  },
}));

const VALID_PASSWORD = "Sup3rSecret!Pass";

type Agent = ReturnType<typeof request.agent>;
type Consents = Array<{ type: string; version: string }>;

const TERMS_AND_PRIVACY = CURRENT_CONSENTS.filter((c) => c.type !== "HEALTH_PROCESSING");
const HEALTH = CURRENT_CONSENTS.filter((c) => c.type === "HEALTH_PROCESSING");

function register(agent: Agent, email: string, consents: Consents, extra: object = {}) {
  return agent.post("/auth/register").send({ email, password: VALID_PASSWORD, consents, ...extra });
}

async function login(agent: Agent, email: string) {
  const res = await agent.post("/auth/login").send({ email, password: VALID_PASSWORD });
  const csrfCookie = (res.headers["set-cookie"] as unknown as string[] | undefined)?.find((c) =>
    c.startsWith("embr_csrf="),
  );
  if (csrfCookie) agent.set("x-csrf-token", csrfCookie.split(";")[0]!.split("=")[1]!);
  return res;
}

async function registerAndLogin(agent: Agent, email: string, consents: Consents) {
  await register(agent, email, consents);
  return login(agent, email);
}

function logSymptom(agent: Agent) {
  return agent
    .post("/symptom-logs")
    .send({ category: "HOT_FLASH", severity: "MILD", occurredAt: new Date().toISOString() });
}

beforeEach(() => {
  state.users = [];
  state.logs = [];
  state.auditLogEntries = [];
  env.CONSENT_HEALTH_REQUIRED_AT_REGISTRATION = false;
});

describe("POST /auth/register — consent", () => {
  it("rejects registration without Terms and Privacy, and creates no account", async () => {
    const agent = request.agent(createApp());
    const res = await register(agent, "none@embr.health", []);
    expect(res.status).toBe(400);
    const fields = (res.body.error.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["consents.TERMS", "consents.PRIVACY"]));
    expect(state.users).toHaveLength(0);
  });

  it("rejects registration missing only Privacy", async () => {
    const agent = request.agent(createApp());
    const res = await register(
      agent,
      "noprivacy@embr.health",
      CURRENT_CONSENTS.filter((c) => c.type !== "PRIVACY"),
    );
    expect(res.status).toBe(400);
    expect(state.users).toHaveLength(0);
  });

  it("rejects a displayed version that isn't current (stale page), and creates no account", async () => {
    const agent = request.agent(createApp());
    const res = await register(agent, "stale@embr.health", [
      { type: "TERMS", version: "0.0-old" },
      { type: "PRIVACY", version: LEGAL_DOCUMENT_VERSIONS.PRIVACY },
    ]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONSENT_VERSION_OUTDATED");
    expect(state.users).toHaveLength(0);
  });

  it("rejects the same item listed twice", async () => {
    const agent = request.agent(createApp());
    const res = await register(agent, "dupe@embr.health", [
      ...CURRENT_CONSENTS,
      CURRENT_CONSENTS[0]!,
    ]);
    expect(res.status).toBe(400);
  });

  it("by default creates the account without health processing, leaving it MISSING", async () => {
    const agent = request.agent(createApp());
    const res = await register(agent, "nohealth@embr.health", TERMS_AND_PRIVACY);
    expect(res.status).toBe(201);
    expect(res.body.data.consents).toEqual({
      TERMS: "CURRENT",
      PRIVACY: "CURRENT",
      HEALTH_PROCESSING: "MISSING",
    });
  });

  it("requires health processing at registration when configured to", async () => {
    env.CONSENT_HEALTH_REQUIRED_AT_REGISTRATION = true;
    const agent = request.agent(createApp());
    const res = await register(agent, "strict@embr.health", TERMS_AND_PRIVACY);
    expect(res.status).toBe(400);
    const fields = (res.body.error.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(["consents.HEALTH_PROCESSING"]);
    expect(state.users).toHaveLength(0);

    const ok = await register(request.agent(createApp()), "strict2@embr.health", CURRENT_CONSENTS);
    expect(ok.status).toBe(201);
  });

  it("records exact versions, locale, source and client for each item", async () => {
    const agent = request.agent(createApp());
    await register(agent, "record@embr.health", CURRENT_CONSENTS, { locale: "ja", client: "web" });
    await login(agent, "record@embr.health");

    const res = await agent.get("/consents");
    expect(res.status).toBe(200);
    const history = res.body.data.history as Array<Record<string, string>>;
    expect(history).toHaveLength(3);
    for (const type of ["TERMS", "PRIVACY", "HEALTH_PROCESSING"] as const) {
      expect(history).toContainEqual(
        expect.objectContaining({
          type,
          version: LEGAL_DOCUMENT_VERSIONS[type],
          locale: "ja",
          action: "GRANTED",
          source: "REGISTRATION",
          client: "web",
        }),
      );
    }
    expect(res.body.data.items).toContainEqual({
      type: "PRIVACY",
      state: "CURRENT",
      currentVersion: LEGAL_DOCUMENT_VERSIONS.PRIVACY,
      acceptedVersion: LEGAL_DOCUMENT_VERSIONS.PRIVACY,
    });
  });
});

describe("requireCurrentConsent — server-side gate on health routes", () => {
  it("blocks health routes with 403 CONSENT_REQUIRED until every item is current", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "gate@embr.health", TERMS_AND_PRIVACY);

    const blocked = await logSymptom(agent);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("CONSENT_REQUIRED");
    expect((await agent.get("/symptom-logs")).status).toBe(403);
    expect(state.logs).toHaveLength(0);
  });

  it("keeps account, profile and consent management reachable while blocked", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "reach@embr.health", TERMS_AND_PRIVACY);
    const me = await agent.get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.consents.HEALTH_PROCESSING).toBe("MISSING");
    expect((await agent.get("/consents")).status).toBe(200);
  });

  it("allows health routes once the missing item is granted, on the very next request", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "grant@embr.health", TERMS_AND_PRIVACY);
    expect((await logSymptom(agent)).status).toBe(403);

    const granted = await agent.post("/consents").send({ consents: HEALTH, locale: "en" });
    expect(granted.status).toBe(200);
    expect(granted.body.data.consents.HEALTH_PROCESSING).toBe("CURRENT");

    expect((await logSymptom(agent)).status).toBe(201);
  });

  it("allows health routes for a person who accepted everything at registration", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "all@embr.health", CURRENT_CONSENTS);
    expect((await logSymptom(agent)).status).toBe(201);
  });

  it("treats an account with no consent records at all (existing user) as needing review", async () => {
    // Stands in for an account that predates consent recording: no rows
    // are ever backfilled, so it must never read as having consented.
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "legacy@embr.health", TERMS_AND_PRIVACY);
    const { resetFakeConsentStore } = await import("./helpers/fake-consent-repository.js");
    resetFakeConsentStore();

    const me = await agent.get("/auth/me");
    expect(me.body.data.consents).toEqual({
      TERMS: "MISSING",
      PRIVACY: "MISSING",
      HEALTH_PROCESSING: "MISSING",
    });
    expect((await logSymptom(agent)).status).toBe(403);
  });
});

describe("POST /consents", () => {
  it("rejects a stale displayed version and records nothing", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "stalegrant@embr.health", TERMS_AND_PRIVACY);
    const res = await agent
      .post("/consents")
      .send({ consents: [{ type: "HEALTH_PROCESSING", version: "0.0-old" }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONSENT_VERSION_OUTDATED");
    const status = await agent.get("/consents");
    expect(status.body.data.history).toHaveLength(2);
  });

  it("rejects an empty submission", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "empty@embr.health", TERMS_AND_PRIVACY);
    expect((await agent.post("/consents").send({ consents: [] })).status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await request(createApp()).post("/consents").send({ consents: HEALTH });
    expect(res.status).toBe(401);
  });

  it("requires the CSRF header for a cookie-authenticated request", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "csrf@embr.health", TERMS_AND_PRIVACY);
    agent.set("x-csrf-token", "wrong");
    expect((await agent.post("/consents").send({ consents: HEALTH })).status).toBe(403);
  });
});

describe("POST /consents/withdraw", () => {
  it("withdraws health processing without deleting the account, and blocks health routes", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "withdraw@embr.health", CURRENT_CONSENTS);
    expect((await logSymptom(agent)).status).toBe(201);

    const res = await agent.post("/consents/withdraw").send({ type: "HEALTH_PROCESSING" });
    expect(res.status).toBe(200);
    expect(res.body.data.consents.HEALTH_PROCESSING).toBe("WITHDRAWN");

    // Account still exists and works; health features don't.
    expect(state.users).toHaveLength(1);
    expect((await agent.get("/auth/me")).status).toBe(200);
    expect((await logSymptom(agent)).status).toBe(403);
    // Nothing already recorded is deleted by withdrawal.
    expect(state.logs).toHaveLength(1);
  });

  it("keeps the full history, so the withdrawal and the original grant are both visible", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "history@embr.health", CURRENT_CONSENTS);
    await agent.post("/consents/withdraw").send({ type: "HEALTH_PROCESSING" });

    const history = (await agent.get("/consents")).body.data.history as Array<{
      type: string;
      action: string;
      source: string;
    }>;
    const health = history.filter((h) => h.type === "HEALTH_PROCESSING");
    expect(health.map((h) => h.action)).toEqual(["WITHDRAWN", "GRANTED"]);
    expect(health[0]!.source).toBe("SETTINGS");
  });

  it("can be granted again after withdrawal", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "regrant@embr.health", CURRENT_CONSENTS);
    await agent.post("/consents/withdraw").send({ type: "HEALTH_PROCESSING" });
    await agent.post("/consents").send({ consents: HEALTH });
    expect((await logSymptom(agent)).status).toBe(201);
  });

  it("only allows withdrawing health processing (Terms end with the account)", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "terms@embr.health", CURRENT_CONSENTS);
    expect((await agent.post("/consents/withdraw").send({ type: "TERMS" })).status).toBe(400);
  });

  it("is a no-op when there is nothing to withdraw", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "noop@embr.health", TERMS_AND_PRIVACY);
    const res = await agent.post("/consents/withdraw").send({ type: "HEALTH_PROCESSING" });
    expect(res.status).toBe(200);
    expect(res.body.data.consents.HEALTH_PROCESSING).toBe("MISSING");
    expect((await agent.get("/consents")).body.data.history).toHaveLength(2);
  });
});

describe("version changes", () => {
  it("marks an item OUTDATED and blocks health routes when its current version is raised", async () => {
    const agent = request.agent(createApp());
    await registerAndLogin(agent, "bump@embr.health", CURRENT_CONSENTS);
    const original = LEGAL_DOCUMENT_VERSIONS.TERMS;
    LEGAL_DOCUMENT_VERSIONS.TERMS = "9.9-test";
    try {
      const me = await agent.get("/auth/me");
      expect(me.body.data.consents.TERMS).toBe("OUTDATED");
      expect((await logSymptom(agent)).status).toBe(403);

      await agent.post("/consents").send({ consents: [{ type: "TERMS", version: "9.9-test" }] });
      expect((await logSymptom(agent)).status).toBe(201);
    } finally {
      LEGAL_DOCUMENT_VERSIONS.TERMS = original;
    }
  });
});

describe("every health-data router is gated", () => {
  // The gate runs before any handler, so these need no mocks for the
  // routers' own models: a 403 CONSENT_REQUIRED proves the middleware is
  // mounted on that router. Keep this list in sync with the routers.
  const HEALTH_ROUTES = [
    ["GET", "/symptom-logs"],
    ["GET", "/treatments"],
    ["GET", "/cycle-entries"],
    ["GET", "/context-logs"],
    ["GET", "/trends/symptom-frequency"],
    ["GET", "/reflections"],
    ["GET", "/briefs"],
    ["GET", "/onboarding"],
    ["PATCH", "/onboarding"],
  ] as const;

  it.each(HEALTH_ROUTES)(
    "%s %s returns 403 CONSENT_REQUIRED without current consent",
    async (method, path) => {
      const agent = request.agent(createApp());
      await registerAndLogin(
        agent,
        `route${path.replace(/\W/g, "")}${method}@embr.health`,
        TERMS_AND_PRIVACY,
      );
      const res = method === "GET" ? await agent.get(path) : await agent.patch(path).send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CONSENT_REQUIRED");
    },
  );
});
