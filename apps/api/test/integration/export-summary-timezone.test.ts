import { afterAll, describe, expect, it } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import type PDFDocument from "pdfkit";
import { PDFParse } from "pdf-parse";

// The clinician summary PDF against the real Postgres CI provides: the
// real queries (including the cycle and treatment date bounds, which
// read the same time zone) run here, which export.pdf.test.ts's direct
// builder calls and the mocked route suite do not.
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

async function pdfText(doc: InstanceType<typeof PDFDocument>): Promise<string> {
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));
  doc.end();
  await done;
  const text = (await new PDFParse({ data: Buffer.concat(chunks) }).getText()).text;
  return text.replace(/\s+/g, " ");
}

const reachable = await isPostgresReachable(process.env.DATABASE_URL);
const createdEmails: string[] = [];

async function personWithHotFlash(occurredAt: string) {
  const email = `summary-tz-${randomUUID()}@embr.test`;
  createdEmails.push(email);
  return prisma.user.create({
    data: {
      email,
      passwordHash: "unused",
      symptomLogs: {
        create: [{ category: "HOT_FLASH", severity: "MODERATE", occurredAt: new Date(occurredAt) }],
      },
    },
  });
}

describe.skipIf(!reachable)("clinician summary PDF dates against Postgres", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
  });

  it("prints a Tokyo morning entry on her Tokyo day", async () => {
    // 08:00 on 10 October in Tokyo.
    const user = await personWithHotFlash("2026-10-09T23:00:00.000Z");
    const text = await pdfText(
      await exportService.clinicianSummaryPdf(user.id, user.email, {
        from: new Date("2026-09-30T15:00:00.000Z"),
        to: new Date("2026-10-31T14:59:59.999Z"),
        timeZone: "Asia/Tokyo",
      }),
    );
    expect(text).toContain("2026-10-10 Hot Flash");
    expect(text).toContain("Range: 2026-10-01 to 2026-10-31");
  });

  it("prints a Los Angeles evening entry on her Los Angeles day", async () => {
    // 20:00 on 10 October in Los Angeles.
    const user = await personWithHotFlash("2026-10-11T03:00:00.000Z");
    const text = await pdfText(
      await exportService.clinicianSummaryPdf(user.id, user.email, {
        timeZone: "America/Los_Angeles",
      }),
    );
    expect(text).toContain("2026-10-10 Hot Flash");
  });

  it("keeps UTC dates when no time zone is sent, as before", async () => {
    const user = await personWithHotFlash("2026-10-09T23:00:00.000Z");
    const text = await pdfText(await exportService.clinicianSummaryPdf(user.id, user.email, {}));
    expect(text).toContain("2026-10-09 Hot Flash");
  });

  it("never changes the stored timestamp", async () => {
    const user = await personWithHotFlash("2026-10-09T23:00:00.000Z");
    await exportService.clinicianSummaryPdf(user.id, user.email, { timeZone: "Asia/Tokyo" });
    const log = await prisma.symptomLog.findFirstOrThrow({ where: { userId: user.id } });
    expect(log.occurredAt.toISOString()).toBe("2026-10-09T23:00:00.000Z");
  });
});
