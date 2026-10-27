import { afterAll, describe, expect, it, vi } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// The "all my data" download against the real Postgres CI provides:
// proves the real queries (field omission, the organisation join, the
// consent ledger) return what the route promises, which the mocked
// route suite in export.test.ts cannot.
vi.unmock("../../src/modules/consent/consent.repository.js");

const { exportService } = await import("../../src/modules/export/export.service.js");
const { prisma } = await import("../../src/lib/prisma.js");

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
const createdOrgSlugs: string[] = [];

describe.skipIf(!reachable)("exportService.allDataJson against Postgres", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.organization.deleteMany({ where: { slug: { in: createdOrgSlugs } } });
    await prisma.$disconnect();
  });

  it("returns every part of her record and nothing secret", async () => {
    const email = `export-all-${randomUUID()}@embr.test`;
    createdEmails.push(email);
    const slug = `export-all-${randomUUID()}`;
    createdOrgSlugs.push(slug);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: "never-exported",
        consentRecords: {
          create: [
            {
              type: "TERMS",
              version: "1.0",
              locale: "en",
              action: "GRANTED",
              source: "REGISTRATION",
            },
            {
              type: "HEALTH_PROCESSING",
              version: "0.2-draft",
              locale: "en",
              action: "GRANTED",
              source: "REGISTRATION",
            },
          ],
        },
        onboardingProfile: { create: { jobToBeDone: "PREPARE_FOR_APPOINTMENT", skipped: false } },
        symptomLogs: {
          create: [{ category: "HOT_FLASH", severity: "MILD", occurredAt: new Date("2026-09-01") }],
        },
        cycleEntries: { create: [{ date: new Date("2026-09-02"), flow: "LIGHT" }] },
        contextLogs: { create: [{ date: new Date("2026-09-03"), workImpact: "DID_LESS" }] },
        treatments: {
          create: [
            {
              name: "Estradiol",
              category: "HRT",
              startDate: new Date("2026-01-01"),
              endDate: new Date("2026-06-01"),
              stopReason: "LONG_TERM_CONCERN",
            },
          ],
        },
        notes: { create: [{ title: "Appointment", body: "Ask about sleep" }] },
        mrsCheckIns: {
          create: [
            {
              completedOn: new Date("2026-06-01T00:00:00Z"),
              locale: "en",
              instrumentVersion: "MRS-EN-2003",
              hotFlushes: 3,
              heartDiscomfort: 0,
              sleepProblems: 2,
              depressiveMood: 1,
              irritability: 1,
              anxiety: 0,
              exhaustion: 2,
              sexualProblems: 0,
              bladderProblems: 0,
              vaginalDryness: 1,
              jointMuscular: 2,
            },
          ],
        },
        sessions: {
          create: [
            { refreshTokenHash: `hash-${randomUUID()}`, expiresAt: new Date(Date.now() + 1e7) },
          ],
        },
      },
    });
    await prisma.organization.create({
      data: { name: "Acme", slug, memberships: { create: [{ userId: user.id }] } },
    });

    const data = await exportService.allDataJson(user.id);
    const text = JSON.stringify(data);

    expect(data.account).toMatchObject({ id: user.id, email, role: "MEMBER" });
    expect(data.onboarding).toMatchObject({ jobToBeDone: "PREPARE_FOR_APPOINTMENT" });
    expect(data.consentHistory.map((c) => c.type).sort()).toEqual(["HEALTH_PROCESSING", "TERMS"]);
    expect(data.symptomLogs).toHaveLength(1);
    expect(data.cycleEntries).toHaveLength(1);
    expect(data.dailyContext[0]).toMatchObject({ workImpact: "DID_LESS" });
    expect(data.treatments[0]).toMatchObject({ stopReason: "LONG_TERM_CONCERN" });
    expect(data.notes[0]).toMatchObject({ title: "Appointment", body: "Ask about sleep" });
    expect(data.menopauseRatingScale).toHaveLength(1);
    expect(data.menopauseRatingScale[0]).toMatchObject({ hotFlushes: 3, sleepProblems: 2 });
    expect(data.menopauseRatingScale[0]).not.toHaveProperty("userId");
    expect(data.organizations).toEqual([
      { organizationName: "Acme", role: "ORG_MEMBER", joinedAt: expect.any(Date) },
    ]);

    expect(text).not.toContain("never-exported");
    expect(text).not.toContain("refreshTokenHash");
    expect(text).not.toContain('"userId"');
  });
});
