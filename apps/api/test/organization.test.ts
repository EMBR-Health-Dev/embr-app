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
      logs: [] as Array<{ id: string; userId: string; category: string; occurredAt: Date }>,
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
      count: vi.fn(({ where }: { where: { organizationId: string } }) =>
        Promise.resolve(
          state.memberships.filter((m) => m.organizationId === where.organizationId).length,
        ),
      ),
      deleteMany: vi.fn(({ where }: { where: { organizationId: string; userId: string } }) => {
        const before = state.memberships.length;
        state.memberships = state.memberships.filter(
          (m) => !(m.organizationId === where.organizationId && m.userId === where.userId),
        );
        return Promise.resolve({ count: before - state.memberships.length });
      }),
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
  },
}));

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

function addMembership(organizationId: string, userId: string, role: "ORG_ADMIN" | "ORG_MEMBER") {
  state.memberships.push({ id: nextId(), organizationId, userId, role, createdAt: now() });
}

beforeEach(() => {
  state.users = [];
  state.logs = [];
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
