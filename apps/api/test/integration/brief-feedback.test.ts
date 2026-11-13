import { afterAll, describe, expect, it, vi } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// The appointment follow up and the AI reliability record, against the
// real tables: ownership, encryption at rest, cascade on account
// deletion, and a metrics row that can never say whose brief it was.
const { aiMode } = vi.hoisted(() => ({ aiMode: { fail: false } }));

vi.mock("../../src/modules/briefs/brief.ai.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules/briefs/brief.ai.js")>();
  return {
    ...actual,
    briefAi: {
      generate: vi.fn(async (_input: unknown, _locale: unknown, observe?: (t: unknown) => void) => {
        observe?.({
          model: "test-model",
          latencyMs: 2100,
          inputTokens: 1000,
          outputTokens: 200,
          stopReason: aiMode.fail ? null : "end_turn",
        });
        if (aiMode.fail) {
          throw actual.tagBriefAiFailure(new Error("simulated timeout"), "timeout");
        }
        return {
          narrative: "stub",
          discussionTopics: ["Is this pattern worth discussing?"],
          patterns: [],
          modelId: "test-model",
          promptVersion: actual.PROMPT_VERSION,
        };
      }),
    },
  };
});

const { prisma } = await import("../../src/lib/prisma.js");
const { briefService } = await import("../../src/modules/briefs/brief.service.js");
const { briefFeedbackService } = await import("../../src/modules/briefs/brief-feedback.js");

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

async function newUser() {
  const user = await prisma.user.create({
    data: { email: `fb-it-${randomUUID()}@embr.test`, passwordHash: "x", role: "ADMIN" },
  });
  userIds.push(user.id);
  await prisma.symptomLog.create({
    data: {
      userId: user.id,
      category: "HOT_FLASH",
      severity: "MODERATE",
      occurredAt: new Date("2026-10-10T12:00:00Z"),
    },
  });
  return user;
}

const FROM = new Date("2026-10-01T00:00:00Z");
const TO = new Date("2026-10-31T00:00:00Z");

describe.skipIf(!reachable)(
  "BRIEF fallback, AI run record and appointment follow up against Postgres",
  () => {
    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
    });

    it("persists a deterministic brief marked UNAVAILABLE when the wording times out", async () => {
      const user = await newUser();
      const runsBefore = await prisma.briefAiRun.count();
      aiMode.fail = true;
      try {
        const brief = await briefService.generate(user.id, FROM, TO, "fr", "UTC");
        expect(brief.aiStatus).toBe("UNAVAILABLE");
        expect(brief.aiNarrative).toBe("");
        expect(brief.aiDiscussionTopics).toEqual([]);
        expect(brief.symptomSummary.map((s) => s.category)).toEqual(["HOT_FLASH"]);
        const stored = await prisma.clinicalBrief.findUniqueOrThrow({ where: { id: brief.id } });
        expect(stored.aiStatus).toBe("UNAVAILABLE");
      } finally {
        aiMode.fail = false;
      }
      expect(await prisma.briefAiRun.count()).toBe(runsBefore + 1);
      const run = await prisma.briefAiRun.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
      expect(run).toMatchObject({
        outcome: "REJECTED",
        reason: "timeout",
        locale: "fr",
        latencyMs: 2100,
        inputTokens: 1000,
        outputTokens: 200,
      });
      // The table has no column that could identify her or her brief.
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'brief_ai_runs'`;
      const names = columns.map((c) => c.column_name);
      expect(names).not.toContain("userId");
      expect(names).not.toContain("briefId");
    });

    it("stores her answer, encrypts the comment on disk, and lets her change it", async () => {
      const user = await newUser();
      const brief = await briefService.generate(user.id, FROM, TO, "en", "UTC");
      expect(brief.aiStatus).toBe("GENERATED");

      expect(await briefFeedbackService.get(brief.id, user.id)).toBeNull();
      const saved = await briefFeedbackService.save(brief.id, user.id, {
        answer: "YES_SOMEWHAT",
        comment: "My GP read the first page",
      });
      expect(saved).toMatchObject({ answer: "YES_SOMEWHAT", comment: "My GP read the first page" });

      const [raw] = await prisma.$queryRaw<Array<{ comment: string }>>`
      SELECT comment FROM brief_feedback WHERE "briefId" = ${brief.id}`;
      // The whole sentence, not a fragment: ciphertext is random base64url,
      // so a two letter fragment such as "GP" turns up in it by chance
      // (about 2% of runs), which made this test fail intermittently.
      expect(raw!.comment).not.toContain("My GP read the first page");
      expect(raw!.comment.startsWith("enc:")).toBe(true);

      const changed = await briefFeedbackService.save(brief.id, user.id, {
        answer: "YES_SIGNIFICANTLY",
        comment: null,
      });
      expect(changed).toMatchObject({ answer: "YES_SIGNIFICANTLY", comment: null });
      expect(await prisma.briefFeedback.count({ where: { briefId: brief.id } })).toBe(1);
    });

    it("treats someone else's brief as not found", async () => {
      const owner = await newUser();
      const other = await newUser();
      const brief = await briefService.generate(owner.id, FROM, TO, "en", "UTC");
      await expect(
        briefFeedbackService.save(brief.id, other.id, { answer: "NO", comment: null }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(briefFeedbackService.get(brief.id, other.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("removes her answers with her account", async () => {
      const user = await newUser();
      const brief = await briefService.generate(user.id, FROM, TO, "en", "UTC");
      await briefFeedbackService.save(brief.id, user.id, { answer: "NOT_REALLY", comment: "x" });
      await prisma.user.delete({ where: { id: user.id } });
      expect(await prisma.briefFeedback.count({ where: { briefId: brief.id } })).toBe(0);
    });
  },
);
