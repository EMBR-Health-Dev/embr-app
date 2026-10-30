import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import { LEGAL_DOCUMENT_VERSIONS } from "@embr/validation";

// The baseline check in against the real tables: one per account is a
// unique index, consent is the real ledger, deletion is the real
// cascade. None of that can be proven with the mocked prisma.
vi.unmock("../../src/modules/consent/consent.repository.js");

vi.mock("../../src/lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG"), quit: vi.fn() },
}));

const { createApp } = await import("../../src/app.js");
const { prisma } = await import("../../src/lib/prisma.js");
const { signAccessToken } = await import("../../src/modules/auth/tokens.js");
const { authRepository } = await import("../../src/modules/auth/auth.repository.js");
const { exportService } = await import("../../src/modules/export/export.service.js");
const { localDate } = await import("../../src/modules/trends/symptom-history.js");

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
const TZ = "Asia/Tokyo";

type Health = "current" | "missing" | "withdrawn" | "outdated";

/** A person with Terms and Privacy current, and health consent as asked. */
async function person(health: Health = "current") {
  const email = `baseline-${randomUUID()}@embr.test`;
  createdEmails.push(email);
  // ADMIN keeps these accounts out of the admin metrics another suite
  // counts against this same database; the routes treat every role alike.
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", role: "ADMIN", emailVerifiedAt: null },
  });
  const base = { userId: user.id, locale: "en", source: "REGISTRATION" as const };
  await prisma.consentRecord.createMany({
    data: [
      { ...base, type: "TERMS", version: LEGAL_DOCUMENT_VERSIONS.TERMS, action: "GRANTED" },
      { ...base, type: "PRIVACY", version: LEGAL_DOCUMENT_VERSIONS.PRIVACY, action: "GRANTED" },
    ],
  });
  if (health !== "missing") {
    await prisma.consentRecord.create({
      data: {
        ...base,
        type: "HEALTH_PROCESSING",
        version: health === "outdated" ? "0.0-old" : LEGAL_DOCUMENT_VERSIONS.HEALTH_PROCESSING,
        action: "GRANTED",
        createdAt: new Date(Date.now() - 60_000),
      },
    });
  }
  if (health === "withdrawn") {
    await prisma.consentRecord.create({
      data: {
        ...base,
        type: "HEALTH_PROCESSING",
        version: LEGAL_DOCUMENT_VERSIONS.HEALTH_PROCESSING,
        action: "WITHDRAWN",
        source: "SETTINGS",
      },
    });
  }
  const token = signAccessToken({ sub: user.id, email, role: "ADMIN" });
  return { user, auth: { Authorization: `Bearer ${token}` } };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    completedOn: localDate(new Date(), TZ),
    timeZone: TZ,
    locale: "ja",
    goal: "PREPARE_FOR_APPOINTMENT",
    sleepDuration: "UNDER_6H",
    workImpact: null,
    symptomsAnswered: true,
    symptoms: [
      { category: "HOT_FLASH", severity: "SEVERE", frequency: "MOST_DAYS" },
      { category: "BRAIN_FOG", severity: null, frequency: null },
    ],
    ...overrides,
  };
}

describe.skipIf(!reachable)("Baseline check in against Postgres", () => {
  const app = createApp();

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
  });

  it("needs a signed in person", async () => {
    expect((await request(app).post("/baseline-check-ins").send(body())).status).toBe(401);
    expect((await request(app).get("/baseline-check-ins")).status).toBe(401);
  });

  it.each(["missing", "withdrawn", "outdated"] as const)(
    "refuses to save when health consent is %s, and stores nothing",
    async (health) => {
      const { user, auth } = await person(health);
      const res = await request(app).post("/baseline-check-ins").set(auth).send(body());
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CONSENT_REQUIRED");
      expect(await prisma.baselineCheckIn.count({ where: { userId: user.id } })).toBe(0);
    },
  );

  it("saves her answers once, with the recall window and the consent that covered it", async () => {
    const { user, auth } = await person();
    const res = await request(app).post("/baseline-check-ins").set(auth).send(body());
    expect(res.status).toBe(201);
    const saved = res.body.data;
    expect(saved.created).toBe(true);
    expect(saved.baseline).toMatchObject({
      completedOn: localDate(new Date(), TZ),
      timeZone: TZ,
      recallDays: 14,
      locale: "ja",
      goal: "PREPARE_FOR_APPOINTMENT",
      sleepDuration: "UNDER_6H",
      workImpact: null,
      healthConsentVersion: LEGAL_DOCUMENT_VERSIONS.HEALTH_PROCESSING,
    });
    expect(saved.baseline.symptoms).toEqual([
      { category: "HOT_FLASH", severity: "SEVERE", frequency: "MOST_DAYS" },
      { category: "BRAIN_FOG", severity: null, frequency: null },
    ]);
    const consent = await prisma.consentRecord.findFirst({
      where: { userId: user.id, type: "HEALTH_PROCESSING" },
    });
    expect(saved.baseline.healthConsentAt).toBe(consent!.createdAt.toISOString());

    // Never turned into daily logs, so no BRIEF or pattern counts it.
    expect(await prisma.symptomLog.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.contextLog.count({ where: { userId: user.id } })).toBe(0);

    const audit = await prisma.auditLog.findFirst({
      where: { userId: user.id, action: "BASELINE_CHECK_IN_SAVED" },
    });
    expect(audit!.metadata).toEqual({ completedOn: localDate(new Date(), TZ), symptomCount: 2 });
    expect(JSON.stringify(audit!.metadata)).not.toMatch(/HOT_FLASH|SEVERE/);
  });

  it("returns the first baseline unchanged when she saves again", async () => {
    const { user, auth } = await person();
    const first = await request(app).post("/baseline-check-ins").set(auth).send(body());
    const again = await request(app)
      .post("/baseline-check-ins")
      .set(auth)
      .send(body({ symptoms: [{ category: "FATIGUE", severity: "MILD", frequency: "FEW_DAYS" }] }));
    expect(again.status).toBe(200);
    expect(again.body.data.created).toBe(false);
    expect(again.body.data.baseline).toEqual(first.body.data.baseline);
    expect(
      await prisma.baselineCheckInSymptom.count({
        where: { baselineCheckIn: { userId: user.id } },
      }),
    ).toBe(2);
  });

  it("keeps one baseline when two saves arrive at once", async () => {
    const { user, auth } = await person();
    const results = await Promise.all(
      [0, 1, 2].map(() => request(app).post("/baseline-check-ins").set(auth).send(body())),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    const ids = new Set(results.map((r) => r.body.data.baseline.id));
    expect(ids.size).toBe(1);
    expect(await prisma.baselineCheckIn.count({ where: { userId: user.id } })).toBe(1);
  });

  it("is safe to retry after a lost response", async () => {
    const { auth } = await person();
    await request(app).post("/baseline-check-ins").set(auth).send(body());
    // The client never saw that answer and sends the same thing again.
    const retry = await request(app).post("/baseline-check-ins").set(auth).send(body());
    expect(retry.status).toBe(200);
    expect(retry.body.data.created).toBe(false);
  });

  it("shows each person only her own baseline", async () => {
    const a = await person();
    const b = await person();
    await request(app).post("/baseline-check-ins").set(a.auth).send(body());

    const forB = await request(app).get("/baseline-check-ins").set(b.auth);
    expect(forB.status).toBe(200);
    expect(forB.body.data.baseline).toBeNull();

    const forA = await request(app).get("/baseline-check-ins").set(a.auth);
    expect(forA.body.data.baseline.symptoms).toHaveLength(2);

    // B saving does not touch A's.
    await request(app)
      .post("/baseline-check-ins")
      .set(b.auth)
      .send(body({ symptoms: [] }));
    const aAfter = await request(app).get("/baseline-check-ins").set(a.auth);
    expect(aAfter.body.data.baseline).toEqual(forA.body.data.baseline);
  });

  it('keeps "none of these" and a skipped question apart, though both list no symptoms', async () => {
    const none = await person();
    const skipped = await person();

    const noneRes = await request(app)
      .post("/baseline-check-ins")
      .set(none.auth)
      .send(body({ symptoms: [], symptomsAnswered: true }));
    const skippedRes = await request(app)
      .post("/baseline-check-ins")
      .set(skipped.auth)
      .send(body({ symptoms: [], symptomsAnswered: false }));
    expect(noneRes.status).toBe(201);
    expect(skippedRes.status).toBe(201);
    expect(noneRes.body.data.baseline).toMatchObject({ symptoms: [], symptomsAnswered: true });
    expect(skippedRes.body.data.baseline).toMatchObject({ symptoms: [], symptomsAnswered: false });

    // The stored value is what comes back on a later read, and a retry never changes it.
    const read = await request(app).get("/baseline-check-ins").set(skipped.auth);
    expect(read.body.data.baseline.symptomsAnswered).toBe(false);
    const retry = await request(app)
      .post("/baseline-check-ins")
      .set(skipped.auth)
      .send(body({ symptoms: [], symptomsAnswered: true }));
    expect(retry.status).toBe(200);
    expect(retry.body.data.baseline.symptomsAnswered).toBe(false);
  });

  it.each([
    [
      "Other, which has no meaning without words",
      { symptoms: [{ category: "OTHER", severity: null, frequency: null }] },
    ],
    [
      "the same symptom twice",
      {
        symptoms: [
          { category: "FATIGUE", severity: null, frequency: null },
          { category: "FATIGUE", severity: "MILD", frequency: null },
        ],
      },
    ],
    ["symptoms listed but the question marked unanswered", { symptomsAnswered: false }],
    ["no symptomsAnswered field at all", { symptomsAnswered: undefined }],
    ["an unknown time zone", { timeZone: "Mars/Olympus" }],
    ["a date in the future", { completedOn: "2999-01-01" }],
    ["a date more than a week old", { completedOn: "2020-01-01" }],
    [
      "an unknown frequency",
      { symptoms: [{ category: "FATIGUE", severity: null, frequency: "ALWAYS" }] },
    ],
    ["a score field", { score: 12 }],
  ])("refuses %s", async (_, overrides) => {
    const { user, auth } = await person();
    const res = await request(app).post("/baseline-check-ins").set(auth).send(body(overrides));
    if ("score" in overrides) {
      // Unknown fields are dropped, never stored.
      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body.data.baseline)).not.toContain("score");
      return;
    }
    expect(res.status).toBe(400);
    expect(await prisma.baselineCheckIn.count({ where: { userId: user.id } })).toBe(0);
  });

  it("is in her data export, and goes with her account", async () => {
    const { user, auth } = await person();
    await request(app).post("/baseline-check-ins").set(auth).send(body());

    const data = await exportService.allDataJson(user.id);
    expect(data.version).toBe(2);
    expect(data.baselineCheckIn).toMatchObject({ recallDays: 14, timeZone: TZ });
    // Postgres orders enum values as declared, so Hot flash comes first.
    expect(data.baselineCheckIn!.symptoms.map((s) => s.category)).toEqual([
      "HOT_FLASH",
      "BRAIN_FOG",
    ]);
    expect(JSON.stringify(data.baselineCheckIn)).not.toContain(user.id);

    expect(await authRepository.deleteUserAccount(user.id)).toBe("DELETED");
    expect(await prisma.baselineCheckIn.count({ where: { userId: user.id } })).toBe(0);
    const orphans = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM baseline_check_in_symptoms s
      LEFT JOIN baseline_check_ins b ON b.id = s."baselineCheckInId" WHERE b.id IS NULL`;
    expect(Number(orphans[0]!.n)).toBe(0);
  });
});
