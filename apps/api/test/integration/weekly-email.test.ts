import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// The weekly reminder against the real tables: the one-send-per-week
// rule is a conditional write in Postgres, so it is proven there.
const { sentTo, sentLocale } = vi.hoisted(() => ({
  sentTo: [] as string[],
  sentLocale: new Map<string, string | undefined>(),
}));

vi.mock("../../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG"), quit: vi.fn() },
}));

vi.mock("../../src/modules/auth/mailer.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendLoginLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendWeeklyReminderEmail: vi.fn((to: string, locale?: string) => {
    sentTo.push(to);
    sentLocale.set(to, locale);
    return Promise.resolve();
  }),
}));

const { createApp } = await import("../../src/app.js");
const { prisma } = await import("../../src/lib/prisma.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");
const { runWeeklyEmails } = await import("../../src/modules/notifications/weekly-email.js");

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
const DAY = 86_400_000;
const PASSWORD = "Sup3rSecret!Pass";

// ADMIN only so these accounts stay out of the admin metrics, which
// another suite counts against this same database at the same time.
async function person(opts: { optIn?: boolean; verified?: boolean; lastSentDaysAgo?: number }) {
  const email = `weekly-${randomUUID()}@embr.test`;
  createdEmails.push(email);
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      role: "ADMIN",
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      weeklyEmailOptIn: opts.optIn ?? false,
      weeklyEmailLastSentAt:
        opts.lastSentDaysAgo === undefined
          ? null
          : new Date(Date.now() - opts.lastSentDaysAgo * DAY),
    },
  });
}

describe.skipIf(!reachable)("Weekly email against Postgres", () => {
  beforeEach(() => {
    sentTo.length = 0;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
  });

  it("sends only to verified people who opted in, and never twice in a week", async () => {
    const yes = await person({ optIn: true });
    const notOptedIn = await person({ optIn: false });
    const unverified = await person({ optIn: true, verified: false });
    const sentRecently = await person({ optIn: true, lastSentDaysAgo: 2 });
    const sentLastWeek = await person({ optIn: true, lastSentDaysAgo: 7 });

    await runWeeklyEmails();
    expect(sentTo).toContain(yes.email);
    expect(sentTo).toContain(sentLastWeek.email);
    expect(sentTo).not.toContain(notOptedIn.email);
    expect(sentTo).not.toContain(unverified.email);
    expect(sentTo).not.toContain(sentRecently.email);

    sentTo.length = 0;
    await runWeeklyEmails();
    expect(sentTo).not.toContain(yes.email);
    expect(sentTo).not.toContain(sentLastWeek.email);
  });

  it("sends once when two runs overlap", async () => {
    const someone = await person({ optIn: true });
    await Promise.all([runWeeklyEmails(), runWeeklyEmails()]);
    expect(sentTo.filter((to) => to === someone.email)).toHaveLength(1);
  });

  it("stores the app language when she turns it on, sends in it, and clears it when off", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const me = await person({});
    const login = await agent.post("/auth/login").send({ email: me.email, password: PASSWORD });
    const csrf = login.headers["set-cookie"]
      .find((c: string) => c.startsWith("embr_csrf="))!
      .split(";")[0]!
      .split("=")[1]!;

    await agent
      .patch("/notifications/preferences")
      .set("x-csrf-token", csrf)
      .set("Accept-Language", "fr")
      .send({ weeklyEmail: true });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.weeklyEmailLocale).toBe("fr");

    await runWeeklyEmails();
    expect(sentTo).toContain(me.email);
    expect(sentLocale.get(me.email)).toBe("fr");

    await agent
      .patch("/notifications/preferences")
      .set("x-csrf-token", csrf)
      .set("Accept-Language", "fr")
      .send({ weeklyEmail: false });
    const cleared = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(cleared.weeklyEmailLocale).toBeNull();
  });

  it("updates the stored language at sign in while the email is on, and only then", async () => {
    const app = createApp();
    const on = await person({ optIn: true });
    await prisma.user.update({ where: { id: on.id }, data: { weeklyEmailLocale: "en" } });
    const off = await person({ optIn: false });

    await request(app)
      .post("/auth/login")
      .set("Accept-Language", "ja")
      .send({ email: on.email, password: PASSWORD });
    await request(app)
      .post("/auth/login")
      .set("Accept-Language", "fr")
      .send({ email: off.email, password: PASSWORD });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: on.id } })).weeklyEmailLocale).toBe(
      "ja",
    );
    // Nothing stored for someone who doesn't get the email.
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: off.id } })).weeklyEmailLocale,
    ).toBeNull();

    // A sign in without a language header leaves her choice alone.
    await request(app).post("/auth/login").send({ email: on.email, password: PASSWORD });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: on.id } })).weeklyEmailLocale).toBe(
      "ja",
    );
  });

  it("sends with no language to someone who opted in before languages were stored", async () => {
    const earlier = await person({ optIn: true });
    await runWeeklyEmails();
    expect(sentTo).toContain(earlier.email);
    expect(sentLocale.get(earlier.email)).toBeUndefined();
  });

  it("lets her turn it on and off in Settings, and is off by default", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const me = await person({});
    const login = await agent.post("/auth/login").send({ email: me.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const csrf = login.headers["set-cookie"]
      .find((c: string) => c.startsWith("embr_csrf="))!
      .split(";")[0]!
      .split("=")[1]!;

    const before = await agent.get("/notifications/preferences");
    expect(before.body.data).toEqual({ weeklyEmail: false });

    const noToken = await agent.patch("/notifications/preferences").send({ weeklyEmail: true });
    expect(noToken.status).toBe(403);

    const on = await agent
      .patch("/notifications/preferences")
      .set("x-csrf-token", csrf)
      .send({ weeklyEmail: true });
    expect(on.status).toBe(200);
    expect(on.body.data).toEqual({ weeklyEmail: true });

    const off = await agent
      .patch("/notifications/preferences")
      .set("x-csrf-token", csrf)
      .send({ weeklyEmail: false });
    expect(off.body.data).toEqual({ weeklyEmail: false });

    const bad = await agent
      .patch("/notifications/preferences")
      .set("x-csrf-token", csrf)
      .send({ weeklyEmail: "yes" });
    expect(bad.status).toBe(400);
  });
});
