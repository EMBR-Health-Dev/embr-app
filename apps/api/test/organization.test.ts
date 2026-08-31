import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { organizationService } from "../src/modules/organizations/organization.service.js";

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
      logs: [] as Array<{ id: string; userId: string; category: string; occurredAt: Date }>,
      cycleEntries: [] as Array<{ id: string; userId: string; date: Date }>,
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
      invites: [] as Array<{
        id: string;
        organizationId: string;
        email: string;
        role: "ORG_ADMIN" | "ORG_MEMBER";
        tokenHash: string;
        invitedByUserId: string;
        expiresAt: Date;
        consumedAt: Date | null;
        createdAt: Date;
      }>,
      auditLogEntries: [] as Array<{ action: string; userId: string | null; metadata?: unknown }>,
    },
    nextId: () => randomUUID(),
  };
});

const now = () => new Date();
const sentInvites: Array<{ to: string; orgName: string; token: string }> = [];

vi.mock("../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG"), quit: vi.fn() },
}));

vi.mock("../src/modules/auth/mailer.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendOrganizationInviteEmail: vi.fn((to: string, orgName: string, token: string) => {
    sentInvites.push({ to, orgName, token });
    return Promise.resolve(undefined);
  }),
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

vi.mock("../src/lib/prisma.js", () => {
  const mockPrisma = {
    // Test-double transactions run the callback against this same mock
    // object rather than a real isolated Prisma.TransactionClient — good
    // enough to exercise the read-then-write invariant logic in
    // organizationRepository.revokeMembership, but it doesn't model real
    // Postgres transaction isolation/rollback semantics.
    $transaction: vi.fn((callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
      callback(mockPrisma),
    ),
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
        ({ data }: { data: { userId: string; category: string; occurredAt: Date } }) => {
          const log = { id: nextId(), ...data };
          state.logs.push(log);
          return Promise.resolve(log);
        },
      ),
      // Handles both shapes this milestone needs: a single userId (personal
      // trends, Milestone 9) and { in: [...] } (org-level cohort aggregate,
      // Milestone 12) — real Postgres GROUP BY semantics either way, one
      // row per distinct value with at least one match.
      groupBy: vi.fn(
        ({
          by,
          where,
        }: {
          by: string[];
          where: { userId: string | { in: string[] }; occurredAt?: OccurredAtRange };
        }) => {
          const matchesUser = (userId: string) =>
            typeof where.userId === "string"
              ? userId === where.userId
              : where.userId.in.includes(userId);
          const matching = state.logs.filter(
            (l) => matchesUser(l.userId) && inRange(l.occurredAt, where.occurredAt),
          );
          if (by[0] === "userId") {
            const distinctUserIds = [...new Set(matching.map((l) => l.userId))];
            return Promise.resolve(distinctUserIds.map((userId) => ({ userId })));
          }
          const counts = new Map<string, number>();
          for (const log of matching) counts.set(log.category, (counts.get(log.category) ?? 0) + 1);
          return Promise.resolve(
            [...counts.entries()].map(([category, count]) => ({
              category,
              _count: { category: count },
            })),
          );
        },
      ),
      // Used by organizationRepository.activityForMembers — a plain
      // row fetch, unlike groupBy above, since activation needs raw
      // per-member timestamps to evaluate each member's own 30-day
      // window, not an aggregate count.
      findMany: vi.fn(
        ({ where }: { where: { userId: { in: string[] }; occurredAt?: { gte?: Date } } }) => {
          const matching = state.logs.filter(
            (l) =>
              where.userId.in.includes(l.userId) &&
              (!where.occurredAt?.gte || l.occurredAt >= where.occurredAt.gte),
          );
          return Promise.resolve(
            matching.map((l) => ({ userId: l.userId, occurredAt: l.occurredAt })),
          );
        },
      ),
    },
    cycleEntry: {
      findMany: vi.fn(
        ({ where }: { where: { userId: { in: string[] }; date?: { gte?: Date } } }) => {
          const matching = state.cycleEntries.filter(
            (e) =>
              where.userId.in.includes(e.userId) && (!where.date?.gte || e.date >= where.date.gte),
          );
          return Promise.resolve(matching.map((e) => ({ userId: e.userId, date: e.date })));
        },
      ),
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
      findMany: vi.fn(({ skip = 0, take = 20 }: { skip?: number; take?: number }) =>
        Promise.resolve([...state.organizations].slice(skip, skip + take)),
      ),
      count: vi.fn(() => Promise.resolve(state.organizations.length)),
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
      findMany: vi.fn(
        ({
          where,
          skip = 0,
          take = 20,
        }: {
          where: { organizationId?: string; userId?: string };
          skip?: number;
          take?: number;
        }) => {
          // listMembers(organizationId) — includes the member's user.
          if (where.organizationId !== undefined) {
            const items = state.memberships
              .filter((m) => m.organizationId === where.organizationId)
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
              .slice(skip, skip + take)
              .map((m) => {
                const user = state.users.find((u) => u.id === m.userId)!;
                return { ...m, user: { id: user.id, email: user.email } };
              });
            return Promise.resolve(items);
          }
          // listMembershipsForUser(userId) — includes the organization.
          const items = state.memberships
            .filter((m) => m.userId === where.userId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((m) => {
              const org = state.organizations.find((o) => o.id === m.organizationId)!;
              return { ...m, organization: { id: org.id, name: org.name, slug: org.slug } };
            });
          return Promise.resolve(items);
        },
      ),
      count: vi.fn(
        ({ where }: { where: { organizationId: string; role?: "ORG_ADMIN" | "ORG_MEMBER" } }) =>
          Promise.resolve(
            state.memberships.filter(
              (m) =>
                m.organizationId === where.organizationId &&
                (where.role === undefined || m.role === where.role),
            ).length,
          ),
      ),
      deleteMany: vi.fn(({ where }: { where: { organizationId: string; userId: string } }) => {
        const before = state.memberships.length;
        state.memberships = state.memberships.filter(
          (m) => !(m.organizationId === where.organizationId && m.userId === where.userId),
        );
        return Promise.resolve({ count: before - state.memberships.length });
      }),
      // Singular, unique-key delete used inside revokeMembership's
      // transaction — distinct from deleteMany above (still used
      // elsewhere) since the transaction already confirms the row exists
      // via findUnique before calling this.
      delete: vi.fn(
        ({
          where,
        }: {
          where: { organizationId_userId: { organizationId: string; userId: string } };
        }) => {
          const { organizationId, userId } = where.organizationId_userId;
          const idx = state.memberships.findIndex(
            (m) => m.organizationId === organizationId && m.userId === userId,
          );
          const [removed] = state.memberships.splice(idx, 1);
          return Promise.resolve(removed);
        },
      ),
    },
    organizationInvite: {
      create: vi.fn(
        ({
          data,
        }: {
          data: Omit<(typeof state.invites)[number], "id" | "createdAt" | "consumedAt">;
        }) => {
          const invite = { id: nextId(), createdAt: now(), consumedAt: null, ...data };
          state.invites.push(invite);
          return Promise.resolve(invite);
        },
      ),
      updateMany: vi.fn(
        ({ where }: { where: { organizationId: string; email: string; consumedAt: null } }) => {
          let count = 0;
          for (const invite of state.invites) {
            if (
              invite.organizationId === where.organizationId &&
              invite.email === where.email &&
              invite.consumedAt === null
            ) {
              invite.consumedAt = now();
              count++;
            }
          }
          return Promise.resolve({ count });
        },
      ),
      findFirst: vi.fn(({ where }: { where: { tokenHash: string } }) => {
        const found = state.invites.find(
          (i) =>
            i.tokenHash === where.tokenHash &&
            i.consumedAt === null &&
            i.expiresAt.getTime() > Date.now(),
        );
        return Promise.resolve(found ?? null);
      }),
      update: vi.fn(({ where }: { where: { id: string } }) => {
        const invite = state.invites.find((i) => i.id === where.id)!;
        invite.consumedAt = now();
        return Promise.resolve(invite);
      }),
    },
  };
  return { prisma: mockPrisma };
});

const VALID_PASSWORD = "Sup3rSecret!Pass";

async function registerAndLogin(agent: ReturnType<typeof request.agent>, email: string) {
  const register = await agent.post("/auth/register").send({ email, password: VALID_PASSWORD });
  await agent.post("/auth/login").send({ email, password: VALID_PASSWORD });
  return register.body.data.id as string;
}

function promoteToAdmin(email: string) {
  const user = state.users.find((u) => u.email === email);
  if (user) user.role = "ADMIN";
}

function addMembership(
  organizationId: string,
  userId: string,
  role: "ORG_ADMIN" | "ORG_MEMBER",
  createdAt: Date = now(),
) {
  state.memberships.push({ id: nextId(), organizationId, userId, role, createdAt });
}

function addSymptomLog(userId: string, occurredAt: Date, category = "HOT_FLASH") {
  state.logs.push({ id: nextId(), userId, category, occurredAt });
}

function addCycleEntry(userId: string, date: Date) {
  state.cycleEntries.push({ id: nextId(), userId, date });
}

beforeEach(() => {
  state.users = [];
  state.logs = [];
  state.cycleEntries = [];
  state.organizations = [];
  state.memberships = [];
  state.invites = [];
  state.auditLogEntries = [];
  sentInvites.length = 0;
});

describe("POST /organizations", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).post("/organizations").send({ name: "Acme", slug: "acme" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated non-platform-admin", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "notadmin@embr.health");
    const res = await agent.post("/organizations").send({ name: "Acme", slug: "acme" });
    expect(res.status).toBe(403);
  });

  it("creates an organization for a platform admin", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "platformadmin@embr.health");
    promoteToAdmin("platformadmin@embr.health");
    await agent
      .post("/auth/login")
      .send({ email: "platformadmin@embr.health", password: VALID_PASSWORD });

    const res = await agent.post("/organizations").send({ name: "Acme Corp", slug: "acme-corp" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Acme Corp", slug: "acme-corp", memberCount: 0 });
  });

  it("rejects a duplicate slug with 409", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "dupadmin@embr.health");
    promoteToAdmin("dupadmin@embr.health");
    await agent
      .post("/auth/login")
      .send({ email: "dupadmin@embr.health", password: VALID_PASSWORD });

    await agent.post("/organizations").send({ name: "First", slug: "dup-slug" });
    const res = await agent.post("/organizations").send({ name: "Second", slug: "dup-slug" });
    expect(res.status).toBe(409);
  });
});

describe("org invite + accept flow", () => {
  it("invite requires ORG_ADMIN; a plain member gets 403", async () => {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, "ops1@embr.health");
    promoteToAdmin("ops1@embr.health");
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: "ops1@embr.health", password: VALID_PASSWORD });
    const orgRes = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: "acme-1" });
    const organizationId = orgRes.body.data.id as string;

    const memberAgent = request.agent(app);
    const memberId = await registerAndLogin(memberAgent, "plainmember@embr.health");
    addMembership(organizationId, memberId, "ORG_MEMBER");

    const res = await memberAgent
      .post(`/organizations/${organizationId}/invites`)
      .send({ email: "invitee@embr.health" });
    expect(res.status).toBe(403);
  });

  it("an ORG_ADMIN can invite, and the invited user can accept", async () => {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, "ops2@embr.health");
    promoteToAdmin("ops2@embr.health");
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: "ops2@embr.health", password: VALID_PASSWORD });
    const orgRes = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: "acme-2" });
    const organizationId = orgRes.body.data.id as string;

    const orgAdminAgent = request.agent(app);
    const orgAdminId = await registerAndLogin(orgAdminAgent, "orgadmin2@embr.health");
    addMembership(organizationId, orgAdminId, "ORG_ADMIN");

    const inviteRes = await orgAdminAgent
      .post(`/organizations/${organizationId}/invites`)
      .send({ email: "newhire@embr.health", role: "ORG_MEMBER" });
    expect(inviteRes.status).toBe(201);
    expect(sentInvites).toHaveLength(1);
    expect(sentInvites[0]).toMatchObject({ to: "newhire@embr.health", orgName: "Acme" });

    const invitedAgent = request.agent(app);
    await registerAndLogin(invitedAgent, "newhire@embr.health");

    const acceptRes = await invitedAgent
      .post("/organizations/invites/accept")
      .send({ token: sentInvites[0]!.token });
    expect(acceptRes.status).toBe(200);

    const membersRes = await orgAdminAgent.get(`/organizations/${organizationId}/members`);
    expect(membersRes.body.data.items.map((m: { email: string }) => m.email)).toContain(
      "newhire@embr.health",
    );

    // Re-accepting the same (now-consumed) token should no longer work.
    const secondAttempt = await invitedAgent
      .post("/organizations/invites/accept")
      .send({ token: sentInvites[0]!.token });
    expect(secondAttempt.status).toBe(400);
  });

  it("rejects accepting an invite with an account whose email doesn't match", async () => {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, "ops3@embr.health");
    promoteToAdmin("ops3@embr.health");
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: "ops3@embr.health", password: VALID_PASSWORD });
    const orgRes = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: "acme-3" });
    const organizationId = orgRes.body.data.id as string;

    const orgAdminAgent = request.agent(app);
    const orgAdminId = await registerAndLogin(orgAdminAgent, "orgadmin3@embr.health");
    addMembership(organizationId, orgAdminId, "ORG_ADMIN");

    await orgAdminAgent
      .post(`/organizations/${organizationId}/invites`)
      .send({ email: "invitedperson@embr.health" });
    const realToken = sentInvites[sentInvites.length - 1]!.token;

    const wrongPersonAgent = request.agent(app);
    await registerAndLogin(wrongPersonAgent, "wrongperson@embr.health");

    const res = await wrongPersonAgent
      .post("/organizations/invites/accept")
      .send({ token: realToken });
    expect(res.status).toBe(403);
  });

  it("rejects an invalid or already-expired token with 400", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "randomuser@embr.health");
    const res = await agent
      .post("/organizations/invites/accept")
      .send({ token: "not-a-real-token" });
    expect(res.status).toBe(400);
  });
});

describe("GET /organizations/:organizationId/members", () => {
  it("returns the roster for an ORG_ADMIN without any health data fields", async () => {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, "ops4@embr.health");
    promoteToAdmin("ops4@embr.health");
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: "ops4@embr.health", password: VALID_PASSWORD });
    const orgRes = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: "acme-4" });
    const organizationId = orgRes.body.data.id as string;

    const orgAdminAgent = request.agent(app);
    const orgAdminId = await registerAndLogin(orgAdminAgent, "orgadmin4@embr.health");
    addMembership(organizationId, orgAdminId, "ORG_ADMIN");
    const memberId = await registerAndLogin(request.agent(app), "member4@embr.health");
    addMembership(organizationId, memberId, "ORG_MEMBER");

    const res = await orgAdminAgent.get(`/organizations/${organizationId}/members`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    const fields = Object.keys(res.body.data.items[0]);
    expect(fields.sort()).toEqual(["email", "id", "joinedAt", "role", "userId"].sort());
  });

  it("returns 404 (not 403) for a valid org the caller isn't a member of", async () => {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, "ops5@embr.health");
    promoteToAdmin("ops5@embr.health");
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: "ops5@embr.health", password: VALID_PASSWORD });
    const orgRes = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: "acme-5" });
    const organizationId = orgRes.body.data.id as string;

    const outsiderAgent = request.agent(app);
    await registerAndLogin(outsiderAgent, "outsider5@embr.health");

    const res = await outsiderAgent.get(`/organizations/${organizationId}/members`);
    expect(res.status).toBe(404);
  });

  // RBAC/audit-log review: unlike a member reading their own data, an
  // ORG_ADMIN viewing the roster sees other real people's identities
  // (email, role) -- that's exactly the "who viewed" case an audit trail
  // exists for, and it previously had none.
  it("logs ORG_MEMBERS_VIEWED when the roster is read", async () => {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, "ops-roster@embr.health");
    promoteToAdmin("ops-roster@embr.health");
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: "ops-roster@embr.health", password: VALID_PASSWORD });
    const orgRes = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: "acme-roster" });
    const organizationId = orgRes.body.data.id as string;

    const orgAdminAgent = request.agent(app);
    const orgAdminId = await registerAndLogin(orgAdminAgent, "orgadmin-roster@embr.health");
    addMembership(organizationId, orgAdminId, "ORG_ADMIN");

    await orgAdminAgent.get(`/organizations/${organizationId}/members`);

    const entry = state.auditLogEntries.find((e) => e.action === "ORG_MEMBERS_VIEWED");
    expect(entry).toBeDefined();
    expect((entry?.metadata as { organizationId?: string })?.organizationId).toBe(organizationId);
    expect(entry?.userId).toBe(orgAdminId);
  });
});

// RBAC/audit-log review: this platform-admin listing was inconsistent with
// its siblings -- /admin/users and /admin/audit-logs both log
// ADMIN_VIEWED_* already, this one didn't.
describe("GET /organizations", () => {
  it("logs ADMIN_VIEWED_ORGANIZATIONS when a platform admin lists all organizations", async () => {
    const app = createApp();
    const adminAgent = request.agent(app);
    const adminId = await registerAndLogin(adminAgent, "ops-list@embr.health");
    promoteToAdmin("ops-list@embr.health");
    await adminAgent
      .post("/auth/login")
      .send({ email: "ops-list@embr.health", password: VALID_PASSWORD });

    const res = await adminAgent.get("/organizations");
    expect(res.status).toBe(200);

    const entry = state.auditLogEntries.find((e) => e.action === "ADMIN_VIEWED_ORGANIZATIONS");
    expect(entry).toBeDefined();
    expect(entry?.userId).toBe(adminId);
  });

  it("is not accessible to a non-admin member", async () => {
    const app = createApp();
    const memberAgent = request.agent(app);
    await registerAndLogin(memberAgent, "not-admin@embr.health");

    const res = await memberAgent.get("/organizations");
    expect(res.status).toBe(403);
  });
});

describe("DELETE /organizations/:organizationId/members/:userId", () => {
  it("lets an ORG_ADMIN revoke a member, and 404s revoking someone already removed", async () => {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, "ops6@embr.health");
    promoteToAdmin("ops6@embr.health");
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: "ops6@embr.health", password: VALID_PASSWORD });
    const orgRes = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: "acme-6" });
    const organizationId = orgRes.body.data.id as string;

    const orgAdminAgent = request.agent(app);
    const orgAdminId = await registerAndLogin(orgAdminAgent, "orgadmin6@embr.health");
    addMembership(organizationId, orgAdminId, "ORG_ADMIN");
    const memberId = await registerAndLogin(request.agent(app), "member6@embr.health");
    addMembership(organizationId, memberId, "ORG_MEMBER");

    const res = await orgAdminAgent.delete(`/organizations/${organizationId}/members/${memberId}`);
    expect(res.status).toBe(204);

    const again = await orgAdminAgent.delete(
      `/organizations/${organizationId}/members/${memberId}`,
    );
    expect(again.status).toBe(404);
  });

  it("lets an ORG_ADMIN revoke another admin when an admin remains", async () => {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, "ops7@embr.health");
    promoteToAdmin("ops7@embr.health");
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: "ops7@embr.health", password: VALID_PASSWORD });
    const orgRes = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: "acme-7" });
    const organizationId = orgRes.body.data.id as string;

    const adminAAgent = request.agent(app);
    const adminAId = await registerAndLogin(adminAAgent, "admin7a@embr.health");
    addMembership(organizationId, adminAId, "ORG_ADMIN");
    const adminBId = await registerAndLogin(request.agent(app), "admin7b@embr.health");
    addMembership(organizationId, adminBId, "ORG_ADMIN");

    const res = await adminAAgent.delete(`/organizations/${organizationId}/members/${adminBId}`);
    expect(res.status).toBe(204);

    const remaining = state.memberships.filter((m) => m.organizationId === organizationId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.userId).toBe(adminAId);
  });

  /**
   * Not reachable via HTTP: a test that had a second admin caller remove
   * the last remaining admin *after that caller's own membership had
   * already been revoked* is unreachable, because requireOrgRole
   * ("ORG_ADMIN") correctly rejects that caller's request before the
   * service is ever called — they're no longer a member at all, let
   * alone an admin. So this verifies the last-admin invariant directly
   * at the service layer instead of simulating an HTTP request that
   * could never legitimately reach it.
   */
  it("rejects removing the last remaining ORG_ADMIN", async () => {
    const organizationId = nextId();
    const adminAId = nextId();
    const adminBId = nextId();
    addMembership(organizationId, adminAId, "ORG_ADMIN");
    addMembership(organizationId, adminBId, "ORG_ADMIN");

    await organizationService.revokeMember(organizationId, adminBId);
    expect(
      state.memberships.some((m) => m.organizationId === organizationId && m.userId === adminBId),
    ).toBe(false);

    await expect(organizationService.revokeMember(organizationId, adminAId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(
      state.memberships.some((m) => m.organizationId === organizationId && m.userId === adminAId),
    ).toBe(true);
  });

  it("rejects an ORG_ADMIN removing themselves when they are the only admin", async () => {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, "ops8@embr.health");
    promoteToAdmin("ops8@embr.health");
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: "ops8@embr.health", password: VALID_PASSWORD });
    const orgRes = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: "acme-8" });
    const organizationId = orgRes.body.data.id as string;

    const soleAdminAgent = request.agent(app);
    const soleAdminId = await registerAndLogin(soleAdminAgent, "admin8@embr.health");
    addMembership(organizationId, soleAdminId, "ORG_ADMIN");

    const res = await soleAdminAgent.delete(
      `/organizations/${organizationId}/members/${soleAdminId}`,
    );
    expect(res.status).toBe(409);
    expect(
      state.memberships.some(
        (m) => m.organizationId === organizationId && m.userId === soleAdminId,
      ),
    ).toBe(true);
  });
});

describe("POST /organizations/:organizationId/leave", () => {
  it("lets a plain ORG_MEMBER leave, removing their own membership", async () => {
    const app = createApp();
    const organizationId = nextId();
    const memberAgent = request.agent(app);
    const memberId = await registerAndLogin(memberAgent, "leaver1@embr.health");
    addMembership(organizationId, memberId, "ORG_MEMBER");
    // An admin remains regardless — a plain member leaving was never
    // going to be blocked by the last-admin invariant, but this keeps
    // the fixture realistic rather than a single-member organization.
    addMembership(organizationId, nextId(), "ORG_ADMIN");

    const res = await memberAgent.post(`/organizations/${organizationId}/leave`);

    expect(res.status).toBe(204);
    expect(
      state.memberships.some((m) => m.organizationId === organizationId && m.userId === memberId),
    ).toBe(false);
  });

  it("lets an ORG_ADMIN leave when another admin remains", async () => {
    const app = createApp();
    const organizationId = nextId();
    const adminAAgent = request.agent(app);
    const adminAId = await registerAndLogin(adminAAgent, "leaver2a@embr.health");
    addMembership(organizationId, adminAId, "ORG_ADMIN");
    const adminBId = nextId();
    addMembership(organizationId, adminBId, "ORG_ADMIN");

    const res = await adminAAgent.post(`/organizations/${organizationId}/leave`);

    expect(res.status).toBe(204);
    const remaining = state.memberships.filter((m) => m.organizationId === organizationId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.userId).toBe(adminBId);
  });

  // Unlike the equivalent revoke case, this one *is* reachable via a
  // real HTTP request: requireOrgRole("ORG_ADMIN", "ORG_MEMBER") only
  // confirms the caller is still a member of this org when leaving is
  // self-targeted, which remains true right up until the moment they
  // actually leave — there's no "caller must still be an admin to act
  // on someone else" gate the way revoke has, so a sole admin genuinely
  // reaches leaveOrganization's own LAST_ADMIN check through the route.
  it("rejects the sole remaining ORG_ADMIN leaving, and does not remove their membership", async () => {
    const app = createApp();
    const organizationId = nextId();
    const soleAdminAgent = request.agent(app);
    const soleAdminId = await registerAndLogin(soleAdminAgent, "leaver3@embr.health");
    addMembership(organizationId, soleAdminId, "ORG_ADMIN");

    const res = await soleAdminAgent.post(`/organizations/${organizationId}/leave`);

    expect(res.status).toBe(409);
    expect(
      state.memberships.some(
        (m) => m.organizationId === organizationId && m.userId === soleAdminId,
      ),
    ).toBe(true);
  });

  it("404s for a non-member, rather than confirming the organization exists", async () => {
    const app = createApp();
    const organizationId = nextId();
    addMembership(organizationId, nextId(), "ORG_ADMIN");
    const outsiderAgent = request.agent(app);
    await registerAndLogin(outsiderAgent, "outsider@embr.health");

    const res = await outsiderAgent.post(`/organizations/${organizationId}/leave`);

    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const app = createApp();
    const organizationId = nextId();

    const res = await request(app).post(`/organizations/${organizationId}/leave`);

    expect(res.status).toBe(401);
  });
});

describe("GET /organizations/:organizationId/trends/symptom-frequency", () => {
  async function setupOrgWithLoggingMembers(memberCount: number) {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, `ops-trend-${memberCount}@embr.health`);
    promoteToAdmin(`ops-trend-${memberCount}@embr.health`);
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: `ops-trend-${memberCount}@embr.health`, password: VALID_PASSWORD });
    const orgRes = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: `acme-trend-${memberCount}` });
    const organizationId = orgRes.body.data.id as string;

    const orgAdminAgent = request.agent(app);
    const orgAdminId = await registerAndLogin(
      orgAdminAgent,
      `orgadmin-trend-${memberCount}@embr.health`,
    );
    addMembership(organizationId, orgAdminId, "ORG_ADMIN");

    for (let i = 0; i < memberCount; i++) {
      const memberAgent = request.agent(app);
      const memberId = await registerAndLogin(
        memberAgent,
        `member-trend-${memberCount}-${i}@embr.health`,
      );
      addMembership(organizationId, memberId, "ORG_MEMBER");
      await memberAgent.post("/symptom-logs").send({
        category: "HOT_FLASH",
        severity: "MILD",
        occurredAt: "2026-06-05T00:00:00.000Z",
      });
    }

    return { orgAdminAgent, organizationId };
  }

  it("suppresses category counts when the cohort is below the minimum size", async () => {
    const { orgAdminAgent, organizationId } = await setupOrgWithLoggingMembers(2);
    const res = await orgAdminAgent.get(
      `/organizations/${organizationId}/trends/symptom-frequency`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.suppressed).toBe(true);
    expect(res.body.data.categories).toEqual([]);
    expect(res.body.data.cohortSize).toBe(2);
  });

  it("returns category-level counts once the cohort meets the minimum size", async () => {
    const { orgAdminAgent, organizationId } = await setupOrgWithLoggingMembers(5);
    const res = await orgAdminAgent.get(
      `/organizations/${organizationId}/trends/symptom-frequency`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.suppressed).toBe(false);
    expect(res.body.data.cohortSize).toBe(5);
    expect(res.body.data.categories).toEqual([{ category: "HOT_FLASH", count: 5 }]);
  });

  it("requires ORG_ADMIN, not just ORG_MEMBER", async () => {
    const { organizationId } = await setupOrgWithLoggingMembers(5);
    const app = createApp();
    // Reuse the same underlying data isn't possible across app instances
    // in this mock (module-level state is shared, but the app instance
    // doesn't need to match) — attach a plain member from that org.
    const plainMemberId = state.memberships.find(
      (m) => m.organizationId === organizationId && m.role === "ORG_MEMBER",
    )!.userId;
    const plainMemberEmail = state.users.find((u) => u.id === plainMemberId)!.email;
    const memberAgent = request.agent(app);
    await memberAgent
      .post("/auth/login")
      .send({ email: plainMemberEmail, password: VALID_PASSWORD });

    const res = await memberAgent.get(`/organizations/${organizationId}/trends/symptom-frequency`);
    expect(res.status).toBe(403);
  });
});

describe("GET /organizations/:organizationId/trends/activation", () => {
  async function setupOrg(suffix: string) {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, `ops-act-${suffix}@embr.health`);
    promoteToAdmin(`ops-act-${suffix}@embr.health`);
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: `ops-act-${suffix}@embr.health`, password: VALID_PASSWORD });
    const orgRes = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: `acme-act-${suffix}` });
    const organizationId = orgRes.body.data.id as string;

    const orgAdminAgent = request.agent(app);
    const orgAdminId = await registerAndLogin(orgAdminAgent, `orgadmin-act-${suffix}@embr.health`);
    addMembership(organizationId, orgAdminId, "ORG_ADMIN");

    return { app, orgAdminAgent, organizationId };
  }

  async function addRegisteredMember(app: ReturnType<typeof createApp>, email: string) {
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, email);
    return userId;
  }

  it("suppresses all activation numbers when eligibleCount is below the minimum cohort size", async () => {
    const { orgAdminAgent, organizationId, app } = await setupOrg("suppress");
    const memberId = await addRegisteredMember(app, "member-suppress-1@embr.health");
    addMembership(organizationId, memberId, "ORG_MEMBER", new Date("2026-01-01"));

    const res = await orgAdminAgent.get(`/organizations/${organizationId}/trends/activation`);
    expect(res.status).toBe(200);
    expect(res.body.data.suppressed).toBe(true);
    // setupOrg's own ORG_ADMIN membership is itself an eligible
    // employee (the approved definition has no role exclusion) — 1
    // admin + 1 member = 2, still below the default floor of 5.
    expect(res.body.data.eligibleCount).toBe(2);
    expect(res.body.data.activatedCount).toBeNull();
    expect(res.body.data.activationPercentage).toBeNull();
    expect(res.body.data.weeklyActiveCount).toBeNull();
    expect(res.body.data.weeklyActivePercentage).toBeNull();
  });

  it("suppresses even when activatedCount would itself be exactly 0 — the edge case a naive gate would miss", async () => {
    const { orgAdminAgent, organizationId, app } = await setupOrg("suppress-zero");
    // Only 1 eligible member (below the default floor of 5), and they
    // have logged nothing at all — a gate keyed on "activated count >
    // 0" rather than "eligible count >= floor" would incorrectly
    // treat this as safe to expose ("0 of 1 activated" is exactly as
    // identifying as any other small-cohort number).
    const memberId = await addRegisteredMember(app, "member-zero@embr.health");
    addMembership(organizationId, memberId, "ORG_MEMBER", new Date("2026-01-01"));

    const res = await orgAdminAgent.get(`/organizations/${organizationId}/trends/activation`);
    expect(res.body.data.suppressed).toBe(true);
    expect(res.body.data.activatedCount).toBeNull();
  });

  it("returns real activation and weekly-active numbers once the cohort meets the minimum size", async () => {
    const { orgAdminAgent, organizationId, app } = await setupOrg("real");
    const joinDate = new Date("2026-01-01T00:00:00.000Z");

    // 5 members total, plus setupOrg's own ORG_ADMIN membership — 6
    // eligible employees, meeting the default floor of 5.
    for (let i = 0; i < 5; i++) {
      const memberId = await addRegisteredMember(app, `member-real-${i}@embr.health`);
      addMembership(organizationId, memberId, "ORG_MEMBER", joinDate);
      // Members 0-2 logged within their 30-day activation window.
      if (i < 3) {
        addSymptomLog(memberId, new Date("2026-01-10T00:00:00.000Z"));
      }
    }

    const res = await orgAdminAgent.get(`/organizations/${organizationId}/trends/activation`);
    expect(res.status).toBe(200);
    expect(res.body.data.suppressed).toBe(false);
    expect(res.body.data.eligibleCount).toBe(6); // 5 members + setupOrg's ORG_ADMIN
    // The ORG_ADMIN never logged anything in this test, so only
    // members 0-2 are activated — 3 of the 6 eligible employees.
    expect(res.body.data.activatedCount).toBe(3);
    expect(res.body.data.activationPercentage).toBe(50); // 3/6
    expect(res.body.data.activationWindowDays).toBe(30);
  });

  it("counts CycleEntry activity toward activation, not just SymptomLog (OR, not AND)", async () => {
    const { orgAdminAgent, organizationId, app } = await setupOrg("cycle-or");
    const joinDate = new Date("2026-01-01T00:00:00.000Z");

    for (let i = 0; i < 5; i++) {
      const memberId = await addRegisteredMember(app, `member-cycor-${i}@embr.health`);
      addMembership(organizationId, memberId, "ORG_MEMBER", joinDate);
    }
    // Only member 0 has any activity, and it's cycle-only — no
    // SymptomLog at all for them.
    const firstMemberId = state.memberships.find(
      (m) => m.organizationId === organizationId && m.role === "ORG_MEMBER",
    )!.userId;
    addCycleEntry(firstMemberId, new Date("2026-01-15T00:00:00.000Z"));

    const res = await orgAdminAgent.get(`/organizations/${organizationId}/trends/activation`);
    expect(res.body.data.activatedCount).toBe(1);
  });

  it("does not activate a member whose only activity falls after their 30-day window", async () => {
    const { orgAdminAgent, organizationId, app } = await setupOrg("late");
    const joinDate = new Date("2026-01-01T00:00:00.000Z");

    for (let i = 0; i < 5; i++) {
      const memberId = await addRegisteredMember(app, `member-late-${i}@embr.health`);
      addMembership(organizationId, memberId, "ORG_MEMBER", joinDate);
    }
    const firstMemberId = state.memberships.find(
      (m) => m.organizationId === organizationId && m.role === "ORG_MEMBER",
    )!.userId;
    // 40 days after joining — outside the 30-day window.
    addSymptomLog(firstMemberId, new Date("2026-02-10T00:00:00.000Z"));

    const res = await orgAdminAgent.get(`/organizations/${organizationId}/trends/activation`);
    expect(res.body.data.activatedCount).toBe(0);
    expect(res.body.data.activationPercentage).toBe(0);
  });

  it("evaluates each member's activation window against their own join date, not a shared org-wide range", async () => {
    const { orgAdminAgent, organizationId, app } = await setupOrg("own-window");

    // 5 members with staggered join dates.
    const memberIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const memberId = await addRegisteredMember(app, `member-own-${i}@embr.health`);
      const joinDate = new Date(2026, 0, 1 + i * 30); // roughly a month apart
      addMembership(organizationId, memberId, "ORG_MEMBER", joinDate);
      memberIds.push(memberId);
    }
    // Every member logs exactly 10 days after their own join date —
    // all should activate, despite none of them sharing a join date.
    memberIds.forEach((id, i) => {
      const joinDate = new Date(2026, 0, 1 + i * 30);
      const logDate = new Date(joinDate);
      logDate.setDate(logDate.getDate() + 10);
      addSymptomLog(id, logDate);
    });

    const res = await orgAdminAgent.get(`/organizations/${organizationId}/trends/activation`);
    // The actual point of this test: all 5 staggered members correctly
    // activate based on their own join date, none of them sharing one.
    expect(res.body.data.activatedCount).toBe(5);
    // eligibleCount is 6 (5 members + setupOrg's own ORG_ADMIN, who
    // never logs in this test) — so 5/6 rounds to 83%, not 100%. The
    // percentage math itself is covered separately by "returns real
    // activation and weekly-active numbers" above; this test's job is
    // activatedCount being 5, not the resulting percentage.
    expect(res.body.data.activationPercentage).toBe(83);
  });

  it("requires ORG_ADMIN, not just ORG_MEMBER", async () => {
    const { organizationId, app } = await setupOrg("perm-member");
    for (let i = 0; i < 5; i++) {
      const memberId = await addRegisteredMember(app, `member-perm-${i}@embr.health`);
      addMembership(organizationId, memberId, "ORG_MEMBER");
    }
    const plainMemberId = state.memberships.find(
      (m) => m.organizationId === organizationId && m.role === "ORG_MEMBER",
    )!.userId;
    const plainMemberEmail = state.users.find((u) => u.id === plainMemberId)!.email;
    const memberAgent = request.agent(app);
    await memberAgent
      .post("/auth/login")
      .send({ email: plainMemberEmail, password: VALID_PASSWORD });

    const res = await memberAgent.get(`/organizations/${organizationId}/trends/activation`);
    expect(res.status).toBe(403);
  });

  it("404s for a non-member entirely, rather than exposing that the organization exists", async () => {
    const { organizationId, app } = await setupOrg("perm-nonmember");
    const outsiderAgent = request.agent(app);
    await registerAndLogin(outsiderAgent, "outsider-act@embr.health");

    const res = await outsiderAgent.get(`/organizations/${organizationId}/trends/activation`);
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const { organizationId, app } = await setupOrg("perm-noauth");
    const res = await request(app).get(`/organizations/${organizationId}/trends/activation`);
    expect(res.status).toBe(401);
  });

  it("writes an ORG_ACTIVATION_METRICS_VIEWED audit log entry on every successful view", async () => {
    const { orgAdminAgent, organizationId, app } = await setupOrg("audit");
    for (let i = 0; i < 5; i++) {
      const memberId = await addRegisteredMember(app, `member-audit-${i}@embr.health`);
      addMembership(organizationId, memberId, "ORG_MEMBER");
    }

    await orgAdminAgent.get(`/organizations/${organizationId}/trends/activation`);

    const entry = state.auditLogEntries.find((e) => e.action === "ORG_ACTIVATION_METRICS_VIEWED");
    expect(entry).toBeDefined();
    expect((entry?.metadata as { organizationId?: string })?.organizationId).toBe(organizationId);
  });

  it("writes an audit log entry even when the response is suppressed", async () => {
    const { orgAdminAgent, organizationId, app } = await setupOrg("audit-suppressed");
    const memberId = await addRegisteredMember(app, "member-audsup@embr.health");
    addMembership(organizationId, memberId, "ORG_MEMBER");

    await orgAdminAgent.get(`/organizations/${organizationId}/trends/activation`);

    const entry = state.auditLogEntries.find((e) => e.action === "ORG_ACTIVATION_METRICS_VIEWED");
    expect(entry).toBeDefined();
  });
});

describe("GET /organizations/mine", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/organizations/mine");
    expect(res.status).toBe(401);
  });

  it("returns an empty list for a user with no organization memberships", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "noorg@embr.health");
    const res = await agent.get("/organizations/mine");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("returns each organization the user belongs to, with their role in it", async () => {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, "opsmine@embr.health");
    promoteToAdmin("opsmine@embr.health");
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: "opsmine@embr.health", password: VALID_PASSWORD });

    const orgA = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Acme", slug: "acme-mine" });
    const orgB = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Globex", slug: "globex-mine" });

    const memberAgent = request.agent(app);
    const memberId = await registerAndLogin(memberAgent, "belongs-to-both@embr.health");
    addMembership(orgA.body.data.id, memberId, "ORG_ADMIN");
    addMembership(orgB.body.data.id, memberId, "ORG_MEMBER");

    const res = await memberAgent.get("/organizations/mine");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: orgA.body.data.id,
          organizationName: "Acme",
          organizationSlug: "acme-mine",
          role: "ORG_ADMIN",
        }),
        expect.objectContaining({
          organizationId: orgB.body.data.id,
          organizationName: "Globex",
          organizationSlug: "globex-mine",
          role: "ORG_MEMBER",
        }),
      ]),
    );
  });

  it("does not leak another user's memberships", async () => {
    const app = createApp();
    const platformAdminAgent = request.agent(app);
    await registerAndLogin(platformAdminAgent, "opsmine2@embr.health");
    promoteToAdmin("opsmine2@embr.health");
    await platformAdminAgent
      .post("/auth/login")
      .send({ email: "opsmine2@embr.health", password: VALID_PASSWORD });
    const org = await platformAdminAgent
      .post("/organizations")
      .send({ name: "Initech", slug: "initech-mine" });

    const ownerAgent = request.agent(app);
    const ownerId = await registerAndLogin(ownerAgent, "owner-mine@embr.health");
    addMembership(org.body.data.id, ownerId, "ORG_ADMIN");

    const outsiderAgent = request.agent(app);
    await registerAndLogin(outsiderAgent, "outsider-mine@embr.health");

    const res = await outsiderAgent.get("/organizations/mine");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
