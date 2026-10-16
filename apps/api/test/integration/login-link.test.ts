import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// Sign in by email link, against the real tables: the single use rule
// is one conditional write in Postgres, so it is proven there.
const { sentLinks } = vi.hoisted(() => ({ sentLinks: [] as Array<{ to: string; token: string }> }));

vi.mock("../../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG"), quit: vi.fn() },
}));

vi.mock("../../src/modules/auth/mailer.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendLoginLinkEmail: vi.fn((to: string, token: string) => {
    sentLinks.push({ to, token });
    return Promise.resolve();
  }),
}));

const { createApp } = await import("../../src/app.js");
const { prisma } = await import("../../src/lib/prisma.js");
const { hashToken } = await import("../../src/modules/auth/tokens.js");

function isPostgresReachable(url: string | undefined, timeoutMs = 750): Promise<boolean> {
  return new Promise((resolve) => {
    let host = "127.0.0.1";
    let port = 5432;
    try {
      const parsed = new URL(url ?? "");
      host = parsed.hostname || host;
      port = parsed.port ? Number(parsed.port) : port;
    } catch {
      resolve(false);
      return;
    }
    const socket = connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

const reachable = await isPostgresReachable(process.env.DATABASE_URL);
const createdEmails: string[] = [];

async function person(opts: { verified?: boolean } = {}) {
  const email = `link-${randomUUID()}@embr.test`;
  createdEmails.push(email);
  // ADMIN only so these accounts stay out of the admin metrics, which
  // another suite counts against this same database at the same time.
  // Sign in by link works the same for every role.
  return prisma.user.create({
    data: {
      email,
      passwordHash: "x",
      role: "ADMIN",
      emailVerifiedAt: opts.verified === false ? null : new Date(),
    },
  });
}

async function requestLink(app: ReturnType<typeof createApp>, email: string) {
  const res = await request(app).post("/auth/login-link").send({ email });
  expect(res.status).toBe(202);
  return sentLinks.at(-1)?.to === email ? sentLinks.at(-1)!.token : null;
}

describe.skipIf(!reachable)("Sign in by email link against Postgres", () => {
  const app = createApp();

  beforeEach(() => {
    sentLinks.length = 0;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
  });

  it("emails a link that signs the person in once, and stores only its hash", async () => {
    const user = await person();
    const token = await requestLink(app, user.email);
    expect(token).toBeTruthy();

    const stored = await prisma.loginLinkToken.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).toBe(hashToken(token!));
    expect(stored[0]!.tokenHash).not.toContain(token!);
    const minutes = (stored[0]!.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);

    const first = await request(app).post("/auth/login-link/consume").send({ token });
    expect(first.status).toBe(200);
    expect(first.body.data.user.email).toBe(user.email);
    expect(first.body.data.accessToken).toBeTruthy();
    expect(first.headers["set-cookie"]?.join(";")).toContain("embr_rt=");

    const again = await request(app).post("/auth/login-link/consume").send({ token });
    expect(again.status).toBe(401);

    const actions = await prisma.auditLog.findMany({
      where: { userId: user.id },
      select: { action: true, metadata: true },
    });
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(["LOGIN_LINK_REQUESTED", "LOGIN_SUCCEEDED"]),
    );
  });

  it("lets only one of two simultaneous uses of the same link through", async () => {
    const user = await person();
    const token = await requestLink(app, user.email);
    const results = await Promise.all([
      request(app).post("/auth/login-link/consume").send({ token }),
      request(app).post("/auth/login-link/consume").send({ token }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it("only the newest link works", async () => {
    const user = await person();
    const older = await requestLink(app, user.email);
    const newer = await requestLink(app, user.email);
    expect(
      (await request(app).post("/auth/login-link/consume").send({ token: older })).status,
    ).toBe(401);
    expect(
      (await request(app).post("/auth/login-link/consume").send({ token: newer })).status,
    ).toBe(200);
  });

  it("rejects an expired link", async () => {
    const user = await person();
    const token = await requestLink(app, user.email);
    await prisma.loginLinkToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app).post("/auth/login-link/consume").send({ token });
    expect(res.status).toBe(401);
  });

  it("answers the same for an email with no account, and sends nothing", async () => {
    const res = await request(app)
      .post("/auth/login-link")
      .send({ email: `nobody-${randomUUID()}@embr.test` });
    expect(res.status).toBe(202);
    expect(sentLinks).toHaveLength(0);
  });

  it("marks an unverified address verified, since the link proves it", async () => {
    const user = await person({ verified: false });
    const token = await requestLink(app, user.email);
    const res = await request(app).post("/auth/login-link/consume").send({ token });
    expect(res.status).toBe(200);
    expect(res.body.data.user.emailVerified).toBe(true);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after!.emailVerifiedAt).not.toBeNull();
  });
});
