import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import {
  processWebhookEvent,
  verifyWebhookSignature,
} from "../src/modules/billing/billing.webhook.js";
import type Stripe from "stripe";

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
        stripeCustomerId: string | null;
        stripeSubscriptionId: string | null;
        subscriptionStatus: string | null;
        currentPeriodEnd: Date | null;
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
      webhookEvents: [] as Array<{ id: string; type: string; processedAt: Date }>,
      auditLogEntries: [] as Array<{ action: string; userId: string | null; metadata?: unknown }>,
    },
    nextId: () => randomUUID(),
  };
});

const now = () => new Date();

// ---- Stripe SDK mock — same precedent as brief.ai.test.ts mocking
// @anthropic-ai/sdk: mock the whole client class, keep individual
// method mocks addressable per-test via vi.hoisted. ----
const {
  mockCustomersCreate,
  mockCheckoutSessionsCreate,
  mockPortalSessionsCreate,
  mockConstructEvent,
} = vi.hoisted(() => ({
  mockCustomersCreate: vi.fn(),
  mockCheckoutSessionsCreate: vi.fn(),
  mockPortalSessionsCreate: vi.fn(),
  mockConstructEvent: vi.fn(),
}));

vi.mock("stripe", () => {
  class MockStripe {
    customers = { create: mockCustomersCreate };
    checkout = { sessions: { create: mockCheckoutSessionsCreate } };
    billingPortal = { sessions: { create: mockPortalSessionsCreate } };
    webhooks = { constructEvent: mockConstructEvent };
  }
  return { default: MockStripe };
});

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
    organization: {
      create: vi.fn(({ data }: { data: { name: string; slug: string; seatLimit?: number } }) => {
        const org = {
          id: nextId(),
          name: data.name,
          slug: data.slug,
          seatLimit: data.seatLimit ?? null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          subscriptionStatus: null,
          currentPeriodEnd: null,
          createdAt: now(),
          updatedAt: now(),
        };
        state.organizations.push(org);
        return Promise.resolve(org);
      }),
      findUnique: vi.fn(
        ({ where }: { where: { id?: string; slug?: string; stripeCustomerId?: string } }) => {
          const found = state.organizations.find(
            (o) =>
              o.id === where.id ||
              o.slug === where.slug ||
              o.stripeCustomerId === where.stripeCustomerId,
          );
          return Promise.resolve(found ?? null);
        },
      ),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const org = state.organizations.find((o) => o.id === where.id)!;
        Object.assign(org, data);
        return Promise.resolve(org);
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
          return Promise.resolve(membership);
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
      count: vi.fn(({ where }: { where: { organizationId: string } }) =>
        Promise.resolve(
          state.memberships.filter((m) => m.organizationId === where.organizationId).length,
        ),
      ),
    },
    stripeWebhookEvent: {
      create: vi.fn(({ data }: { data: { id: string; type: string } }) => {
        if (state.webhookEvents.some((e) => e.id === data.id)) {
          const err = new Error("Unique constraint failed") as Error & { code?: string };
          err.code = "P2002";
          throw err;
        }
        const event = { ...data, processedAt: now() };
        state.webhookEvents.push(event);
        return Promise.resolve(event);
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

function createOrg(overrides: Partial<(typeof state.organizations)[number]> = {}) {
  const org = {
    id: nextId(),
    name: "Acme Co",
    slug: `acme-${nextId().slice(0, 8)}`,
    seatLimit: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
  state.organizations.push(org);
  return org;
}

function addMembership(organizationId: string, userId: string, role: "ORG_ADMIN" | "ORG_MEMBER") {
  state.memberships.push({ id: nextId(), organizationId, userId, role, createdAt: now() });
}

function fakeSubscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    object: "subscription",
    customer: "cus_123",
    status: "active",
    items: {
      object: "list",
      data: [
        {
          id: "si_123",
          object: "subscription_item",
          quantity: 25,
          current_period_end: 1_700_000_000,
          current_period_start: 1_697_000_000,
        } as unknown as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: "",
    } as unknown as Stripe.Subscription["items"],
    ...overrides,
  } as Stripe.Subscription;
}

function fakeEvent(type: string, object: unknown, id = `evt_${nextId()}`): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

beforeEach(() => {
  state.users = [];
  state.organizations = [];
  state.memberships = [];
  state.webhookEvents = [];
  state.auditLogEntries = [];
  mockCustomersCreate.mockReset();
  mockCheckoutSessionsCreate.mockReset();
  mockPortalSessionsCreate.mockReset();
  mockConstructEvent.mockReset();
});

// ==== Route-level: auth/ownership boundaries ====

describe("GET /organizations/:organizationId/billing", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const org = createOrg();
    const res = await request(app).get(`/organizations/${org.id}/billing`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated ORG_MEMBER (ORG_ADMIN only)", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "member@embr.health");
    const org = createOrg();
    addMembership(org.id, userId, "ORG_MEMBER");

    const res = await agent.get(`/organizations/${org.id}/billing`);
    expect(res.status).toBe(403);
  });

  it("returns 404 (not 403) for a valid org the caller isn't a member of", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await registerAndLogin(agent, "outsider@embr.health");
    const org = createOrg();

    const res = await agent.get(`/organizations/${org.id}/billing`);
    expect(res.status).toBe(404);
  });

  it("returns billing status for an ORG_ADMIN, with billingEnabled true when Stripe is configured", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "admin@embr.health");
    const org = createOrg({ seatLimit: 10, subscriptionStatus: "ACTIVE" });
    addMembership(org.id, userId, "ORG_ADMIN");

    const res = await agent.get(`/organizations/${org.id}/billing`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      hasStripeCustomer: false,
      subscriptionStatus: "ACTIVE",
      seatLimit: 10,
      seatsUsed: 1,
      billingEnabled: true,
    });
  });
});

describe("POST /organizations/:organizationId/billing/checkout-session", () => {
  it("returns 403 for an ORG_MEMBER", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "member2@embr.health");
    const org = createOrg();
    addMembership(org.id, userId, "ORG_MEMBER");

    const res = await agent
      .post(`/organizations/${org.id}/billing/checkout-session`)
      .send({ seats: 10 });
    expect(res.status).toBe(403);
  });

  it("rejects a non-positive seat count", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "admin2@embr.health");
    const org = createOrg();
    addMembership(org.id, userId, "ORG_ADMIN");

    const res = await agent
      .post(`/organizations/${org.id}/billing/checkout-session`)
      .send({ seats: 0 });
    expect(res.status).toBe(400);
  });

  it("creates a Stripe customer on first checkout, persists it, and reuses it on a second call", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "admin3@embr.health");
    const org = createOrg();
    addMembership(org.id, userId, "ORG_ADMIN");

    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    mockCheckoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session1" });

    const first = await agent
      .post(`/organizations/${org.id}/billing/checkout-session`)
      .send({ seats: 5 });
    expect(first.status).toBe(201);
    expect(first.body.data.url).toBe("https://checkout.stripe.com/session1");
    expect(mockCustomersCreate).toHaveBeenCalledTimes(1);
    expect(state.organizations.find((o) => o.id === org.id)?.stripeCustomerId).toBe("cus_new");
    expect(state.auditLogEntries.some((e) => e.action === "ORG_BILLING_CHECKOUT_STARTED")).toBe(
      true,
    );

    mockCheckoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session2" });
    const second = await agent
      .post(`/organizations/${org.id}/billing/checkout-session`)
      .send({ seats: 8 });
    expect(second.status).toBe(201);
    // Customer created only once — the second call reuses stripeCustomerId.
    expect(mockCustomersCreate).toHaveBeenCalledTimes(1);
    expect(mockCheckoutSessionsCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        customer: "cus_new",
        line_items: [{ price: expect.any(String), quantity: 8 }],
      }),
    );
  });
});

describe("POST /organizations/:organizationId/billing/portal-session", () => {
  it("returns 409 for an org with no Stripe customer yet", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "admin4@embr.health");
    const org = createOrg();
    addMembership(org.id, userId, "ORG_ADMIN");

    const res = await agent.post(`/organizations/${org.id}/billing/portal-session`);
    expect(res.status).toBe(409);
  });

  it("returns a portal URL for an org with an existing Stripe customer", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "admin5@embr.health");
    const org = createOrg({ stripeCustomerId: "cus_existing" });
    addMembership(org.id, userId, "ORG_ADMIN");

    mockPortalSessionsCreate.mockResolvedValue({ url: "https://billing.stripe.com/portal1" });
    const res = await agent.post(`/organizations/${org.id}/billing/portal-session`);
    expect(res.status).toBe(201);
    expect(res.body.data.url).toBe("https://billing.stripe.com/portal1");
    expect(mockPortalSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
    );
  });
});

describe("billing not configured on this deployment", () => {
  const originalSecretKey = env.STRIPE_SECRET_KEY;

  afterEach(() => {
    env.STRIPE_SECRET_KEY = originalSecretKey;
  });

  it("returns 503 for checkout-session creation when STRIPE_SECRET_KEY is unset", async () => {
    env.STRIPE_SECRET_KEY = undefined;
    const app = createApp();
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "admin6@embr.health");
    const org = createOrg();
    addMembership(org.id, userId, "ORG_ADMIN");

    const res = await agent
      .post(`/organizations/${org.id}/billing/checkout-session`)
      .send({ seats: 5 });
    expect(res.status).toBe(503);
  });

  it("billing status still returns 200 with billingEnabled: false", async () => {
    env.STRIPE_SECRET_KEY = undefined;
    const app = createApp();
    const agent = request.agent(app);
    const userId = await registerAndLogin(agent, "admin7@embr.health");
    const org = createOrg();
    addMembership(org.id, userId, "ORG_ADMIN");

    const res = await agent.get(`/organizations/${org.id}/billing`);
    expect(res.status).toBe(200);
    expect(res.body.data.billingEnabled).toBe(false);
  });
});

// ==== Webhook: signature verification ====

describe("POST /billing/webhook", () => {
  it("rejects a request with no Stripe-Signature header", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/billing/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ id: "evt_1" }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with an invalid signature", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("signature mismatch");
    });
    const app = createApp();
    const res = await request(app)
      .post("/billing/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "bad-signature")
      .send(JSON.stringify({ id: "evt_1" }));
    expect(res.status).toBe(401);
  });

  it("accepts a validly-signed event and processes it", async () => {
    const subscription = fakeSubscription();
    const event = fakeEvent("customer.subscription.updated", subscription, "evt_ok");
    mockConstructEvent.mockReturnValue(event);

    const org = createOrg({ stripeCustomerId: "cus_123" });

    const app = createApp();
    const res = await request(app)
      .post("/billing/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "good-signature")
      .send(JSON.stringify({ id: "evt_ok" }));

    expect(res.status).toBe(200);
    const updated = state.organizations.find((o) => o.id === org.id);
    expect(updated?.seatLimit).toBe(25);
    expect(updated?.subscriptionStatus).toBe("ACTIVE");
    expect(updated?.stripeSubscriptionId).toBe("sub_123");
  });
});

// ==== processWebhookEvent: unit-level (idempotency, event-type coverage) ====

describe("processWebhookEvent", () => {
  it("applies customer.subscription.created — sets seatLimit, status, subscriptionId, currentPeriodEnd", async () => {
    const org = createOrg({ stripeCustomerId: "cus_123" });
    const event = fakeEvent("customer.subscription.created", fakeSubscription());

    await processWebhookEvent(event);

    const updated = state.organizations.find((o) => o.id === org.id)!;
    expect(updated.seatLimit).toBe(25);
    expect(updated.subscriptionStatus).toBe("ACTIVE");
    expect(updated.stripeSubscriptionId).toBe("sub_123");
    expect(updated.currentPeriodEnd).toEqual(new Date(1_700_000_000 * 1000));
  });

  it("applies customer.subscription.deleted — marks CANCELED, leaves seatLimit untouched", async () => {
    const org = createOrg({
      stripeCustomerId: "cus_123",
      seatLimit: 25,
      subscriptionStatus: "ACTIVE",
    });
    const event = fakeEvent(
      "customer.subscription.deleted",
      fakeSubscription({ status: "canceled" }),
    );

    await processWebhookEvent(event);

    const updated = state.organizations.find((o) => o.id === org.id)!;
    expect(updated.subscriptionStatus).toBe("CANCELED");
    expect(updated.seatLimit).toBe(25);
  });

  it("is idempotent — a duplicate event id is processed only once", async () => {
    const org = createOrg({ stripeCustomerId: "cus_123", seatLimit: 5 });
    const event = fakeEvent(
      "customer.subscription.updated",
      fakeSubscription({ status: "past_due" }),
      "evt_dup",
    );

    await processWebhookEvent(event);
    // Mutate the org back before the "duplicate" delivery — if this
    // were reprocessed, seatLimit would flip back to 25.
    org.seatLimit = 999;
    await processWebhookEvent(event);

    expect(state.organizations.find((o) => o.id === org.id)!.seatLimit).toBe(999);
  });

  it("ignores an unhandled event type without throwing", async () => {
    const event = fakeEvent("invoice.paid", {});
    await expect(processWebhookEvent(event)).resolves.toBeUndefined();
  });

  it("logs a warning and does not throw when no organization matches the Stripe customer id", async () => {
    const event = fakeEvent(
      "customer.subscription.updated",
      fakeSubscription({ customer: "cus_unknown" }),
    );
    await expect(processWebhookEvent(event)).resolves.toBeUndefined();
  });
});

describe("verifyWebhookSignature", () => {
  it("returns the parsed event on success", () => {
    const event = fakeEvent("customer.subscription.updated", fakeSubscription());
    mockConstructEvent.mockReturnValue(event);
    const result = verifyWebhookSignature(Buffer.from("{}"), "sig");
    expect(result).toBe(event);
  });

  it("throws AppError.unauthorized on a bad signature", () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    expect(() => verifyWebhookSignature(Buffer.from("{}"), "sig")).toThrow();
  });
});
