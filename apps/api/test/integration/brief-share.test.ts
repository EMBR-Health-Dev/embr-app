import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import { CURRENT_CONSENTS } from "../helpers/consents.js";

// Share links end to end, against the real tables and the real app: she
// creates a link, a clinician with no account opens it with the code,
// and every way a link stops working is checked.
const { createApp } = await import("../../src/app.js");
const { prisma } = await import("../../src/lib/prisma.js");
const { signAccessToken, hashToken } = await import("../../src/modules/auth/tokens.js");
const { consentService } = await import("../../src/modules/consent/consent.service.js");
const { MAX_FAILED_CODES } = await import("../../src/modules/briefs/brief-share.service.js");

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
const userIds: string[] = [];

async function personWithBrief() {
  const user = await prisma.user.create({
    data: {
      email: `share-it-${randomUUID()}@embr.test`,
      passwordHash: "x",
      // ADMIN keeps these accounts out of the admin metrics another
      // suite counts at the same time; sharing works the same for all.
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(user.id);
  await consentService.grant(user.id, CURRENT_CONSENTS, "en", "REGISTRATION");
  const brief = await prisma.clinicalBrief.create({
    data: {
      userId: user.id,
      fromDate: new Date("2026-09-01"),
      toDate: new Date("2026-09-30"),
      symptomSummary: [{ category: "HOT_FLASH", count: 6, severityBreakdown: { MODERATE: 6 } }],
      cycleSummary: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
      treatmentSummary: [],
      aiNarrative: "Hot flushes were recorded on six days.",
      aiDiscussionTopics: ["Is this pattern worth discussing?"],
    },
  });
  const auth = `Bearer ${signAccessToken({ sub: user.id, email: user.email, role: user.role })}`;
  return { user, brief, auth };
}

function tokenOf(url: string): string {
  return url.slice(url.indexOf("#") + 1);
}

describe.skipIf(!reachable)("BRIEF share links against Postgres", () => {
  const app = createApp();

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("creates a link and code, stores only hashes, and opens for the clinician with the code", async () => {
    const { brief, auth } = await personWithBrief();
    const created = await request(app)
      .post(`/briefs/${brief.id}/shares`)
      .set("Authorization", auth)
      .send({ expiresInDays: 7 });
    expect(created.status).toBe(201);
    expect(created.headers["cache-control"]).toBe("no-store");
    const { url, code, share } = created.body.data;
    expect(url).toMatch(/\/shared#[A-Za-z0-9_-]{40,}$/);
    expect(code).toMatch(/^\d{6}$/);
    expect(share.status).toBe("ACTIVE");
    const days = (new Date(share.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    const token = tokenOf(url);
    const row = await prisma.briefShare.findUniqueOrThrow({ where: { id: share.id } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(`"${code}"`);

    const opened = await request(app).post("/shared/brief").send({ token, code });
    expect(opened.status).toBe(200);
    expect(opened.headers["x-robots-tag"]).toBe("noindex");
    expect(opened.body.data.brief.id).toBe(brief.id);
    expect(opened.body.data.brief.aiNarrative).toBe("Hot flushes were recorded on six days.");
    expect(opened.body.data.sharedUntil).toBe(share.expiresAt);

    const pdf = await request(app).post("/shared/brief/pdf").send({ token, code });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");

    const listed = await request(app).get(`/briefs/${brief.id}/shares`).set("Authorization", auth);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0]).toMatchObject({ id: share.id, viewCount: 1, status: "ACTIVE" });
    expect(listed.body.data[0].lastViewedAt).not.toBeNull();
    // Never the token, code or hashes again.
    expect(JSON.stringify(listed.body)).not.toContain(token);
    expect(JSON.stringify(listed.body)).not.toContain("Hash");

    const actions = await prisma.auditLog.findMany({
      where: { metadata: { path: ["shareId"], equals: share.id } },
      select: { action: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual(
      ["BRIEF_SHARE_CREATED", "BRIEF_SHARE_DOWNLOADED", "BRIEF_SHARE_VIEWED"].sort(),
    );
  });

  it("answers a wrong code with 403, locks the link after five, and then refuses even the right code", async () => {
    const { brief, auth } = await personWithBrief();
    const { url, code } = (
      await request(app)
        .post(`/briefs/${brief.id}/shares`)
        .set("Authorization", auth)
        .send({ expiresInDays: 30 })
    ).body.data;
    const token = tokenOf(url);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < MAX_FAILED_CODES; i++) {
      const res = await request(app).post("/shared/brief").send({ token, code: wrong });
      expect(res.status).toBe(403);
    }
    const afterLock = await request(app).post("/shared/brief").send({ token, code });
    expect(afterLock.status).toBe(404);

    const listed = await request(app).get(`/briefs/${brief.id}/shares`).set("Authorization", auth);
    expect(listed.body.data[0].status).toBe("LOCKED");
  });

  it("stops working once revoked, once expired, or when her consent is withdrawn", async () => {
    const { user, brief, auth } = await personWithBrief();
    const make = async () =>
      (
        await request(app)
          .post(`/briefs/${brief.id}/shares`)
          .set("Authorization", auth)
          .send({ expiresInDays: 7 })
      ).body.data;

    const a = await make();
    expect(
      (
        await request(app)
          .delete(`/briefs/${brief.id}/shares/${a.share.id}`)
          .set("Authorization", auth)
      ).status,
    ).toBe(204);
    expect(
      (
        await request(app)
          .post("/shared/brief")
          .send({ token: tokenOf(a.url), code: a.code })
      ).status,
    ).toBe(404);

    const b = await make();
    await prisma.briefShare.update({
      where: { id: b.share.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await request(app)
          .post("/shared/brief")
          .send({ token: tokenOf(b.url), code: b.code })
      ).status,
    ).toBe(404);

    const c = await make();
    await consentService.withdrawHealthProcessing(user.id);
    expect(
      (
        await request(app)
          .post("/shared/brief")
          .send({ token: tokenOf(c.url), code: c.code })
      ).status,
    ).toBe(404);
  });

  it("is gone when the brief is deleted, and an unknown token answers the same as a dead one", async () => {
    const { brief, auth } = await personWithBrief();
    const { url, code } = (
      await request(app)
        .post(`/briefs/${brief.id}/shares`)
        .set("Authorization", auth)
        .send({ expiresInDays: 7 })
    ).body.data;
    await prisma.clinicalBrief.delete({ where: { id: brief.id } });
    const gone = await request(app)
      .post("/shared/brief")
      .send({ token: tokenOf(url), code });
    const unknown = await request(app)
      .post("/shared/brief")
      .send({ token: "x".repeat(43), code: "123456" });
    expect(gone.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(gone.body.error?.message ?? gone.body.message).toBe(
      unknown.body.error?.message ?? unknown.body.message,
    );
  });

  it("only lets her share and manage her own brief", async () => {
    const owner = await personWithBrief();
    const other = await personWithBrief();
    const created = (
      await request(app)
        .post(`/briefs/${owner.brief.id}/shares`)
        .set("Authorization", owner.auth)
        .send({ expiresInDays: 7 })
    ).body.data;

    expect(
      (
        await request(app)
          .post(`/briefs/${owner.brief.id}/shares`)
          .set("Authorization", other.auth)
          .send({ expiresInDays: 7 })
      ).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/briefs/${owner.brief.id}/shares`).set("Authorization", other.auth))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/briefs/${owner.brief.id}/shares/${created.share.id}`)
          .set("Authorization", other.auth)
      ).status,
    ).toBe(404);
    expect(
      (await request(app).post(`/briefs/${owner.brief.id}/shares`).send({ expiresInDays: 7 }))
        .status,
    ).toBe(401);
  });

  it("refuses other durations and caps live links per brief", async () => {
    const { brief, auth } = await personWithBrief();
    expect(
      (
        await request(app)
          .post(`/briefs/${brief.id}/shares`)
          .set("Authorization", auth)
          .send({ expiresInDays: 365 })
      ).status,
    ).toBe(400);
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await request(app)
            .post(`/briefs/${brief.id}/shares`)
            .set("Authorization", auth)
            .send({ expiresInDays: 7 })
        ).status,
      ).toBe(201);
    }
    expect(
      (
        await request(app)
          .post(`/briefs/${brief.id}/shares`)
          .set("Authorization", auth)
          .send({ expiresInDays: 7 })
      ).status,
    ).toBe(409);
  });

  it("rejects a malformed code before touching the link", async () => {
    const res = await request(app)
      .post("/shared/brief")
      .send({ token: "y".repeat(43), code: "12ab" });
    expect(res.status).toBe(400);
  });
});
