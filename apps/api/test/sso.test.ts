import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { encryptClientSecret } from "../src/modules/sso/sso.crypto.js";

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
      organizations: [] as Array<{
        id: string;
        name: string;
        slug: string;
        seatLimit: number | null;
        createdAt: Date;
        updatedAt: Date;
      }>,
      memberships: [] as Array<{
        id: string;
        organizationId: string;
        userId: string;
        role: "ORG_ADMIN" | "ORG_MEMBER";
        createdAt: Date;
      }>,
      ssoConnections: [] as Array<{
        id: string;
        organizationId: string;
        protocol: "OIDC";
        issuerUrl: string;
        clientId: string;
        encryptedClientSecret: string;
        allowedEmailDomain: string;
        enabled: boolean;
        enforced: boolean;
        createdAt: Date;
        updatedAt: Date;
      }>,
    },
    nextId: () => randomUUID(),
  };
});

const now = () => new Date();

// Configurable per-test via oidcState — lets each test control what the
// "IdP" returns without hitting a real network endpoint.
const { oidcState } = vi.hoisted(() => ({
  oidcState: {
    discoverShouldFail: false,
    nextIdentity: null as null | { email: string; emailVerified: boolean; subject: string },
  },
}));

vi.mock("../src/modules/sso/sso.oidc.js", () => ({
  ssoOidc: {
    discover: vi.fn(async () => {
      if (oidcState.discoverShouldFail) throw new Error("discovery failed");
      return { __fakeOidcConfig: true };
    }),
    buildAuthorization: vi.fn(async (_config: unknown, redirectUri: string) => ({
      redirectUrl: `https://idp.example.com/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`,
      codeVerifier: "test-code-verifier",
      state: "test-state",
      nonce: "test-nonce",
    })),
    exchangeCode: vi.fn(async () => {
      if (!oidcState.nextIdentity) {
        throw new Error("test didn't configure an identity for exchangeCode to return");
      }
      return oidcState.nextIdentity;
    }),
  },
}));

// In-memory stand-in for the state/PKCE/nonce storage sso.service.ts
// keeps in Redis — TTL isn't modeled, since "expired" is exercised by
// simply never storing anything for a given state value.
const { redisStore } = vi.hoisted(() => ({ redisStore: new Map<string, string>() }));

vi.mock("../src/lib/redis.js", () => ({
  redis: {
    ping: vi.fn().mockResolvedValue("PONG"),
    quit: vi.fn(),
    setex: vi.fn((key: string, _ttlSeconds: number, value: string) => {
      redisStore.set(key, value);
      return Promise.resolve("OK");
    }),
    get: vi.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    del: vi.fn((key: string) => Promise.resolve(redisStore.delete(key) ? 1 : 0)),
  },
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
    organization: {
      create: vi.fn(({ data }: { data: { name: string; slug: string; seatLimit?: number } }) => {
        const org = {
          id: nextId(),
          name: data.name,
          slug: data.slug,
          seatLimit: data.seatLimit ?? null,
          createdAt: now(),
          updatedAt: now(),
        };
        state.organizations.push(org);
        return Promise.resolve(org);
      }),
      findUnique: vi.fn(({ where }: { where: { id?: string; slug?: string } }) => {
        const found = state.organizations.find((o) => o.id === where.id || o.slug === where.slug);
        return Promise.resolve(found ?? null);
      }),
    },
    organizationMembership: {
      create: vi.fn(
        ({
          data,
        }: {
          data: { organizationId: string; userId: string; role: "ORG_ADMIN" | "ORG_MEMBER" };
        }) => {
          const membership = { id: nextId(), createdAt: now(), ...data };
          state.memberships.push(membership);
          const user = state.users.find((u) => u.id === data.userId)!;
          return Promise.resolve({ ...membership, user: { id: user.id, email: user.email } });
        },
      ),
      findUnique: vi.fn(
        ({
          where,
        }: {
          where: { organizationId_userId: { organizationId: string; userId: string } };
        }) => {
          const { organizationId, userId } = where.organizationId_userId;
          const found = state.memberships.find(
            (m) => m.organizationId === organizationId && m.userId === userId,
          );
          return Promise.resolve(found ?? null);
        },
      ),
    },
    organizationSsoConnection: {
      findUnique: vi.fn(({ where }: { where: { organizationId?: string; id?: string } }) => {
        const found = state.ssoConnections.find(
          (c) =>
            (where.organizationId && c.organizationId === where.organizationId) ||
            (where.id && c.id === where.id),
        );
        return Promise.resolve(found ?? null);
      }),
      findFirst: vi.fn(({ where }: { where: { allowedEmailDomain: string; enabled: boolean } }) => {
        const found = state.ssoConnections.find(
          (c) => c.allowedEmailDomain === where.allowedEmailDomain && c.enabled === where.enabled,
        );
        return Promise.resolve(found ?? null);
      }),
      upsert: vi.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { organizationId: string };
          create: Omit<(typeof state.ssoConnections)[number], "id" | "createdAt" | "updatedAt">;
          update: Partial<(typeof state.ssoConnections)[number]>;
        }) => {
          const existing = state.ssoConnections.find(
            (c) => c.organizationId === where.organizationId,
          );
          if (existing) {
            Object.assign(existing, update, { updatedAt: now() });
            return Promise.resolve(existing);
          }
          const created = {
            id: nextId(),
            createdAt: now(),
            updatedAt: now(),
            ...create,
          };
          state.ssoConnections.push(created);
          return Promise.resolve(created);
        },
      ),
    },
  },
}));

const VALID_PASSWORD = "Sup3rSecret!Pass";

async function registerAndLogin(agent: ReturnType<typeof request.agent>, email: string) {
  const register = await agent.post("/auth/register").send({ email, password: VALID_PASSWORD });
  await agent.post("/auth/login").send({ email, password: VALID_PASSWORD });
  return register.body.data.id as string;
}

function addMembership(organizationId: string, userId: string, role: "ORG_ADMIN" | "ORG_MEMBER") {
  state.memberships.push({ id: nextId(), organizationId, userId, role, createdAt: now() });
}

function addOrganization(name: string, slug: string) {
  const org = { id: nextId(), name, slug, seatLimit: null, createdAt: now(), updatedAt: now() };
  state.organizations.push(org);
  return org;
}

function addSsoConnection(
  organizationId: string,
  overrides: Partial<(typeof state.ssoConnections)[number]> = {},
) {
  const connection = {
    id: nextId(),
    organizationId,
    protocol: "OIDC" as const,
    issuerUrl: "https://idp.example.com",
    clientId: "test-client-id",
    encryptedClientSecret: encryptClientSecret("test-client-secret"), // real ciphertext — sso.crypto.ts isn't mocked, only sso.oidc.ts is
    allowedEmailDomain: "acme.com",
    enabled: true,
    enforced: false,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
  state.ssoConnections.push(connection);
  return connection;
}

beforeEach(() => {
  state.users = [];
  state.organizations = [];
  state.memberships = [];
  state.ssoConnections = [];
  redisStore.clear();
  oidcState.discoverShouldFail = false;
  oidcState.nextIdentity = null;
});

describe("GET/PUT /organizations/:organizationId/sso", () => {
  it("GET requires authentication", async () => {
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    const res = await request(app).get(`/organizations/${org.id}/sso`);
    expect(res.status).toBe(401);
  });

  it("GET returns 403 for a plain ORG_MEMBER", async () => {
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "member@acme.com");
    addMembership(org.id, userId, "ORG_MEMBER");

    const res = await agent.get(`/organizations/${org.id}/sso`);
    expect(res.status).toBe(403);
  });

  it("GET returns null when no connection is configured yet", async () => {
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "admin@acme.com");
    addMembership(org.id, userId, "ORG_ADMIN");

    const res = await agent.get(`/organizations/${org.id}/sso`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("PUT rejects a non-https issuer URL", async () => {
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "admin2@acme.com");
    addMembership(org.id, userId, "ORG_ADMIN");

    const res = await agent.put(`/organizations/${org.id}/sso`).send({
      issuerUrl: "http://idp.example.com",
      clientId: "client-id",
      clientSecret: "shh",
      allowedEmailDomain: "acme.com",
      enabled: true,
    });
    expect(res.status).toBe(400);
  });

  it("PUT surfaces an IdP discovery failure rather than saving a broken connection", async () => {
    oidcState.discoverShouldFail = true;
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "admin3@acme.com");
    addMembership(org.id, userId, "ORG_ADMIN");

    const res = await agent.put(`/organizations/${org.id}/sso`).send({
      issuerUrl: "https://idp.example.com",
      clientId: "client-id",
      clientSecret: "shh",
      allowedEmailDomain: "acme.com",
      enabled: true,
    });
    expect(res.status).toBe(400);
    expect(state.ssoConnections).toHaveLength(0);
  });

  it("an ORG_ADMIN can save a connection, and the client secret never comes back", async () => {
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "admin4@acme.com");
    addMembership(org.id, userId, "ORG_ADMIN");

    const res = await agent.put(`/organizations/${org.id}/sso`).send({
      issuerUrl: "https://idp.example.com",
      clientId: "client-id",
      clientSecret: "super-secret-value",
      allowedEmailDomain: "acme.com",
      enabled: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      issuerUrl: "https://idp.example.com",
      clientId: "client-id",
      allowedEmailDomain: "acme.com",
      enabled: true,
      hasClientSecret: true,
    });
    expect(JSON.stringify(res.body)).not.toContain("super-secret-value");

    const getRes = await agent.get(`/organizations/${org.id}/sso`);
    expect(getRes.status).toBe(200);
    expect(JSON.stringify(getRes.body)).not.toContain("super-secret-value");
  });
});

describe("GET /auth/sso/start", () => {
  it("redirects to the IdP when the email's domain has an enabled connection", async () => {
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    addSsoConnection(org.id, { allowedEmailDomain: "acme.com", enabled: true });

    const res = await request(app).get("/auth/sso/start").query({ email: "person@acme.com" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("https://idp.example.com/authorize");
  });

  it("redirects back to login when no connection is configured for the domain", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/sso/start").query({ email: "person@unknown.com" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login?ssoError=sso_not_configured");
  });

  it("treats a disabled connection the same as no connection", async () => {
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    addSsoConnection(org.id, { allowedEmailDomain: "acme.com", enabled: false });

    const res = await request(app).get("/auth/sso/start").query({ email: "person@acme.com" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login?ssoError=sso_not_configured");
  });
});

describe("GET /auth/sso/callback", () => {
  async function startAttempt(app: ReturnType<typeof createApp>, email: string) {
    const res = await request(app).get("/auth/sso/start").query({ email });
    expect(res.status).toBe(302); // sanity check — the flow below assumes this succeeded
    return res;
  }

  it("JIT-provisions a new user and auto-joins them as ORG_MEMBER", async () => {
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    addSsoConnection(org.id, { allowedEmailDomain: "acme.com", enabled: true });
    oidcState.nextIdentity = { email: "newperson@acme.com", emailVerified: true, subject: "sub-1" };

    await startAttempt(app, "newperson@acme.com");

    const res = await request(app)
      .get("/auth/sso/callback")
      .query({ code: "test-code", state: "test-state" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/dashboard");
    expect(res.headers["set-cookie"]?.some((c: string) => c.startsWith("embr_at="))).toBe(true);

    const user = state.users.find((u) => u.email === "newperson@acme.com");
    expect(user).toBeDefined();
    expect(user!.emailVerifiedAt).not.toBeNull();
    const membership = state.memberships.find((m) => m.userId === user!.id);
    expect(membership).toMatchObject({ organizationId: org.id, role: "ORG_MEMBER" });
  });

  it("logs in and joins an existing (password-registered) user by matching email", async () => {
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    addSsoConnection(org.id, { allowedEmailDomain: "acme.com", enabled: true });

    const agent = request.agent(app);
    const existingUserId = await registerAndLogin(agent, "existing@acme.com");
    oidcState.nextIdentity = { email: "existing@acme.com", emailVerified: true, subject: "sub-2" };

    await startAttempt(app, "existing@acme.com");
    const res = await request(app)
      .get("/auth/sso/callback")
      .query({ code: "test-code", state: "test-state" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/dashboard");
    expect(state.users.filter((u) => u.email === "existing@acme.com")).toHaveLength(1);
    const membership = state.memberships.find((m) => m.userId === existingUserId);
    expect(membership).toMatchObject({ organizationId: org.id, role: "ORG_MEMBER" });
  });

  it("rejects an identity outside the connection's allowed domain", async () => {
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    addSsoConnection(org.id, { allowedEmailDomain: "acme.com", enabled: true });
    // The visitor typed an acme.com address to get here, but the IdP
    // authenticated them as someone on a different domain entirely —
    // e.g. they picked a personal Google account at the IdP's prompt.
    oidcState.nextIdentity = { email: "person@gmail.com", emailVerified: true, subject: "sub-3" };

    await startAttempt(app, "person@acme.com");
    const res = await request(app)
      .get("/auth/sso/callback")
      .query({ code: "test-code", state: "test-state" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/login?ssoError=sso_callback_failed");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(state.users.find((u) => u.email === "person@gmail.com")).toBeUndefined();
  });

  it("rejects an unknown or already-used state value", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/auth/sso/callback")
      .query({ code: "test-code", state: "never-issued-state" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/login?ssoError=sso_callback_failed");
  });

  it("a state value can't be replayed a second time", async () => {
    const app = createApp();
    const org = addOrganization("Acme", "acme");
    addSsoConnection(org.id, { allowedEmailDomain: "acme.com", enabled: true });
    oidcState.nextIdentity = { email: "once@acme.com", emailVerified: true, subject: "sub-4" };

    await startAttempt(app, "once@acme.com");
    const first = await request(app)
      .get("/auth/sso/callback")
      .query({ code: "test-code", state: "test-state" });
    expect(first.status).toBe(302);
    expect(first.headers.location).toBe("http://localhost:3000/dashboard");

    const second = await request(app)
      .get("/auth/sso/callback")
      .query({ code: "test-code", state: "test-state" });
    expect(second.headers.location).toBe(
      "http://localhost:3000/login?ssoError=sso_callback_failed",
    );
  });
});
