import { afterAll, describe, expect, it, vi } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// The BRIEF's MRS section from real check-ins, with the check-in
// switched on before the app's settings load. Only the AI wording is
// stubbed.
process.env.MRS_CHECK_IN_ENABLED = "true";

vi.mock("../../src/modules/briefs/brief.ai.js", () => ({
  briefAi: {
    generate: vi.fn(async () => ({
      narrative: "stub",
      discussionTopics: ["Is this pattern worth discussing?"],
      patterns: [],
      modelId: "stub-model",
      promptVersion: "stub",
    })),
  },
}));

const { prisma } = await import("../../src/lib/prisma.js");
const { briefService } = await import("../../src/modules/briefs/brief.service.js");
const { mrsRepository } = await import("../../src/modules/mrs/mrs.repository.js");
const { localNoon } = await import("../../src/modules/symptoms/symptom-check-in.js");

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

const ANSWERS = {
  hotFlushes: 3,
  heartDiscomfort: 1,
  sleepProblems: 4,
  depressiveMood: 2,
  irritability: 1,
  anxiety: 0,
  exhaustion: 3,
  sexualProblems: 1,
  bladderProblems: 0,
  vaginalDryness: 2,
  jointMuscular: 2,
};
const LATER = { ...ANSWERS, hotFlushes: 1, sleepProblems: 1, exhaustion: 1 };

describe.skipIf(!reachable)("BRIEF MRS section against Postgres", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it.each(["Europe/London", "Asia/Tokyo", "America/New_York"])(
    "shows the first and latest rating in 1 to 28 February in %s",
    async (timeZone) => {
      const user = await prisma.user.create({
        data: {
          email: `brief-mrs-${randomUUID()}@embr.test`,
          passwordHash: "x",
          emailVerifiedAt: new Date(),
        },
      });
      userIds.push(user.id);
      // The day before, the first and last day, one between, and the day after.
      await mrsRepository.save(user.id, "2026-01-31", { locale: "en", answers: LATER });
      await mrsRepository.save(user.id, "2026-02-01", { locale: "en", answers: ANSWERS });
      await mrsRepository.save(user.id, "2026-02-14", { locale: "en", answers: ANSWERS });
      await mrsRepository.save(user.id, "2026-02-28", { locale: "en", answers: LATER });
      await mrsRepository.save(user.id, "2026-03-01", { locale: "en", answers: ANSWERS });

      const start = new Date(localNoon("2026-02-01", timeZone).getTime() - 12 * 3_600_000);
      const end = new Date(localNoon("2026-02-28", timeZone).getTime() + 12 * 3_600_000 - 1);
      const brief = await briefService.generate(user.id, start, end, "en", timeZone);

      expect(brief.mrs).toEqual({
        checkInsInPeriod: 3,
        first: {
          completedOn: "2026-02-01",
          // somatic 3+1+4+2, psychological 2+1+0+3, urogenital 1+0+2
          scores: { total: 19, somatic: 10, psychological: 6, urogenital: 3 },
          bands: {
            total: "SEVERE",
            somatic: "SEVERE",
            psychological: "MODERATE",
            urogenital: "MODERATE",
          },
        },
        latest: {
          completedOn: "2026-02-28",
          // somatic 1+1+1+2, psychological 2+1+0+1, urogenital 1+0+2
          scores: { total: 12, somatic: 5, psychological: 4, urogenital: 3 },
          bands: {
            total: "MODERATE",
            somatic: "MODERATE",
            psychological: "MODERATE",
            urogenital: "MODERATE",
          },
        },
      });
      // Stored with the BRIEF, not recomputed on reading.
      await mrsRepository.delete(user.id, "2026-02-28");
      expect((await briefService.get(brief.id, user.id)).mrs).toEqual(brief.mrs);
    },
  );
});
