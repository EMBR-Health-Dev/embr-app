import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// Two-step sign in against the real tables: single use codes, the
// attempt limit and encryption at rest are all properties of the
// database writes, so they are proven there.
const { sentLinks } = vi.hoisted(() => ({
  sentLinks: [] as Array<{ to: string; token: string }>,
}));

vi.mock("../../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG"), quit: vi.fn() },
}));
vi.mock("../../src/modules/auth/mailer.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendLoginLinkEmail: vi.fn((to: string, token: string) => {
    sentLinks.push({ to, token });
    return Promise.resolve();
  }),
}));

const { createApp } = await import("../../src/app.js");
const { prisma } = await import("../../src/lib/prisma.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");
const { hotp, totpStep } = await import("../../src/lib/totp.js");

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
const PASSWORD = "Correct-Horse-Battery-2026";
const created: string[] = [];
const app = createApp();

// The clock moves in whole 30 second steps, so each code is a fresh one.
let now = new Date("2026-11-13T09:00:05Z");
function tick(steps = 1) {
  now = new Date(now.getTime() + steps * 30_000);
  vi.setSystemTime(now);
}
const codeNow = (secret: string) => hotp(secret, totpStep(now));

async function person() {
  const email = `mfa-${randomUUID()}@embr.test`;
  // ADMIN keeps these out of the admin metrics another suite counts.
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  created.push(user.id);
  return user;
}

async function login(email: string) {
  return request(app).post("/auth/login").send({ email, password: PASSWORD });
}

async function turnOn(email: string) {
  const first = await login(email);
  const bearer = `Bearer ${first.body.data.accessToken as string}`;
  const setup = await request(app).post("/auth/mfa/setup").set("Authorization", bearer);
  const secret = setup.body.data.secret as string;
  tick();
  const confirm = await request(app)
    .post("/auth/mfa/confirm")
    .set("Authorization", bearer)
    .send({ code: codeNow(secret) });
  return { bearer, secret, setup, confirm };
}

describe.skipIf(!reachable)("two-step sign in against Postgres", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it("sets up in two steps, stores the secret encrypted and the recovery codes hashed", async () => {
    const user = await person();
    const plain = await login(user.email);
    expect(plain.body.data.user.mfaEnabled).toBe(false);
    const bearer = `Bearer ${plain.body.data.accessToken as string}`;

    const setup = await request(app).post("/auth/mfa/setup").set("Authorization", bearer);
    expect(setup.status).toBe(200);
    expect(setup.headers["cache-control"]).toBe("no-store");
    const { secret, otpauthUri } = setup.body.data;
    expect(otpauthUri).toContain(`secret=${secret as string}`);

    // Nothing changes for sign in until a code proves the app has it.
    expect((await login(user.email)).body.data.mfaRequired).toBeUndefined();

    tick();
    const wrong = await request(app)
      .post("/auth/mfa/confirm")
      .set("Authorization", bearer)
      .send({ code: "000000" });
    expect(wrong.status).toBe(400);

    const confirm = await request(app)
      .post("/auth/mfa/confirm")
      .set("Authorization", bearer)
      .send({ code: codeNow(secret) });
    expect(confirm.status).toBe(200);
    const codes = confirm.body.data.recoveryCodes as string[];
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) => expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/));

    const [row] = await prisma.$queryRaw<
      Array<{ mfaSecret: string; mfaPendingSecret: string | null }>
    >`
      SELECT "mfaSecret", "mfaPendingSecret" FROM users WHERE id = ${user.id}`;
    expect(row!.mfaSecret.startsWith("enc:")).toBe(true);
    expect(row!.mfaSecret).not.toContain(secret);
    expect(row!.mfaPendingSecret).toBeNull();
    const stored = await prisma.mfaRecoveryCode.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(10);
    for (const c of codes) {
      expect(JSON.stringify(stored)).not.toContain(c.replace("-", ""));
    }

    const status = await request(app).get("/auth/mfa").set("Authorization", bearer);
    expect(status.body.data).toEqual({ enabled: true, recoveryCodesLeft: 10 });
  });

  it("asks for a code after the password, gives no session until then, and never takes the same code twice", async () => {
    const user = await person();
    const { secret } = await turnOn(user.email);

    tick();
    const first = await login(user.email);
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    expect(first.headers["set-cookie"]).toBeUndefined();

    const wrong = await request(app)
      .post("/auth/login/mfa")
      .send({ mfaToken: first.body.data.mfaToken, code: "123456" });
    expect(wrong.status).toBe(400);

    const code = codeNow(secret);
    const ok = await request(app)
      .post("/auth/login/mfa")
      .send({ mfaToken: first.body.data.mfaToken, code });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.mfaEnabled).toBe(true);
    expect(ok.body.data.accessToken).toEqual(expect.any(String));
    expect(String(ok.headers["set-cookie"])).toContain("embr_at=");

    // The same code, straight away, on a fresh sign in: refused.
    const again = await login(user.email);
    const replay = await request(app)
      .post("/auth/login/mfa")
      .send({ mfaToken: again.body.data.mfaToken, code });
    expect(replay.status).toBe(400);

    // And the challenge it came from is gone once used.
    tick();
    const reused = await request(app)
      .post("/auth/login/mfa")
      .send({ mfaToken: first.body.data.mfaToken, code: codeNow(secret) });
    expect(reused.status).toBe(401);
  });

  it("ends the challenge after five wrong codes, even for a right one", async () => {
    const user = await person();
    const { secret } = await turnOn(user.email);
    tick();
    const { body } = await login(user.email);
    for (let i = 0; i < 4; i++) {
      const r = await request(app)
        .post("/auth/login/mfa")
        .send({ mfaToken: body.data.mfaToken, code: "000000" });
      expect(r.status).toBe(400);
    }
    const fifth = await request(app)
      .post("/auth/login/mfa")
      .send({ mfaToken: body.data.mfaToken, code: "000000" });
    expect(fifth.status).toBe(401);
    const right = await request(app)
      .post("/auth/login/mfa")
      .send({ mfaToken: body.data.mfaToken, code: codeNow(secret) });
    expect(right.status).toBe(401);
    const failures = await prisma.auditLog.count({
      where: { userId: user.id, action: "MFA_CHALLENGE_FAILED" },
    });
    expect(failures).toBe(5);
  });

  it("refuses an expired challenge", async () => {
    const user = await person();
    const { secret } = await turnOn(user.email);
    tick();
    const { body } = await login(user.email);
    tick(11); // 5.5 minutes
    const late = await request(app)
      .post("/auth/login/mfa")
      .send({ mfaToken: body.data.mfaToken, code: codeNow(secret) });
    expect(late.status).toBe(401);
  });

  it("takes each recovery code once, in any case and with or without the dash", async () => {
    const user = await person();
    const { confirm } = await turnOn(user.email);
    const code = confirm.body.data.recoveryCodes[0] as string;

    const a = await login(user.email);
    const used = await request(app)
      .post("/auth/login/mfa")
      .send({ mfaToken: a.body.data.mfaToken, code: code.replace("-", "").toLowerCase() });
    expect(used.status).toBe(200);

    const b = await login(user.email);
    const twice = await request(app)
      .post("/auth/login/mfa")
      .send({ mfaToken: b.body.data.mfaToken, code });
    expect(twice.status).toBe(400);

    const bearer = `Bearer ${used.body.data.accessToken as string}`;
    const status = await request(app).get("/auth/mfa").set("Authorization", bearer);
    expect(status.body.data.recoveryCodesLeft).toBe(9);
    expect(
      await prisma.auditLog.count({ where: { userId: user.id, action: "MFA_RECOVERY_CODE_USED" } }),
    ).toBe(1);
  });

  it("asks for a code after a sign in link too", async () => {
    const user = await person();
    await turnOn(user.email);
    await request(app).post("/auth/login-link").send({ email: user.email });
    const token = sentLinks.filter((l) => l.to === user.email).at(-1)!.token;
    const res = await request(app).post("/auth/login-link/consume").send({ token });
    expect(res.status).toBe(200);
    expect(res.body.data.mfaRequired).toBe(true);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("replaces recovery codes only with a current code, and the old ones stop working", async () => {
    const user = await person();
    const { bearer, secret, confirm } = await turnOn(user.email);
    const old = confirm.body.data.recoveryCodes[0] as string;

    const refused = await request(app)
      .post("/auth/mfa/recovery-codes")
      .set("Authorization", bearer)
      .send({ code: "000000" });
    expect(refused.status).toBe(400);

    tick();
    const fresh = await request(app)
      .post("/auth/mfa/recovery-codes")
      .set("Authorization", bearer)
      .send({ code: codeNow(secret) });
    expect(fresh.status).toBe(200);
    expect(fresh.body.data.recoveryCodes).not.toContain(old);

    const { body } = await login(user.email);
    const stale = await request(app)
      .post("/auth/login/mfa")
      .send({ mfaToken: body.data.mfaToken, code: old });
    expect(stale.status).toBe(400);
  });

  it("turns off only with the password and a code, and then sign in is one step again", async () => {
    const user = await person();
    const { bearer, secret } = await turnOn(user.email);
    tick();

    const badPassword = await request(app)
      .post("/auth/mfa/disable")
      .set("Authorization", bearer)
      .send({ password: "wrong", code: codeNow(secret) });
    expect(badPassword.status).toBe(400);
    const badCode = await request(app)
      .post("/auth/mfa/disable")
      .set("Authorization", bearer)
      .send({ password: PASSWORD, code: "000000" });
    expect(badCode.status).toBe(400);

    const off = await request(app)
      .post("/auth/mfa/disable")
      .set("Authorization", bearer)
      .send({ password: PASSWORD, code: codeNow(secret) });
    expect(off.status).toBe(204);

    const after = await login(user.email);
    expect(after.body.data.mfaRequired).toBeUndefined();
    expect(after.body.data.user.mfaEnabled).toBe(false);
    expect(await prisma.mfaRecoveryCode.count({ where: { userId: user.id } })).toBe(0);
    const actions = (
      await prisma.auditLog.findMany({
        where: { userId: user.id },
        select: { action: true, metadata: true },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["MFA_ENABLED", "MFA_DISABLED"]));
    const logged = JSON.stringify(
      await prisma.auditLog.findMany({ where: { userId: user.id }, select: { metadata: true } }),
    );
    expect(logged).not.toContain(secret);
  });

  it("removes everything two-step with the account", async () => {
    const user = await person();
    await turnOn(user.email);
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.mfaRecoveryCode.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.mfaChallenge.count({ where: { userId: user.id } })).toBe(0);
  });
});
