import { afterAll, describe, expect, it, vi } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// Every other suite runs against an in-memory fake of this repository
// (see test/setup.ts). This one exercises the real queries — nested
// create, DISTINCT ON latest-per-type, cascade on delete — against the
// real Postgres that CI provides via DATABASE_URL.
vi.unmock("../../src/modules/consent/consent.repository.js");

const { consentRepository } = await import("../../src/modules/consent/consent.repository.js");
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

function email() {
  const e = `consent-it-${randomUUID()}@embr.test`;
  createdEmails.push(e);
  return e;
}

describe.skipIf(!reachable)("consentRepository against Postgres", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
  });

  it("creates the account and its consent records together", async () => {
    const user = await consentRepository.createUserWithConsents(
      { email: email(), passwordHash: "x" },
      [
        { type: "TERMS", version: "1.0", locale: "en", action: "GRANTED", source: "REGISTRATION" },
        {
          type: "PRIVACY",
          version: "1.0",
          locale: "en",
          action: "GRANTED",
          source: "REGISTRATION",
        },
      ],
    );
    const rows = await consentRepository.history(user.id);
    expect(rows.map((r) => r.type).sort()).toEqual(["PRIVACY", "TERMS"]);
    expect(rows.every((r) => r.userId === user.id)).toBe(true);
  });

  it("creates nothing if a consent record is invalid (atomic)", async () => {
    const address = email();
    await expect(
      consentRepository.createUserWithConsents({ email: address, passwordHash: "x" }, [
        // Not a valid ConsentType: the whole write must fail.
        {
          type: "NOPE" as never,
          version: "1.0",
          locale: "en",
          action: "GRANTED",
          source: "REGISTRATION",
        },
      ]),
    ).rejects.toThrow();
    expect(await prisma.user.findUnique({ where: { email: address } })).toBeNull();
  });

  it("returns only the most recent row per user and type, keeping full history", async () => {
    const user = await consentRepository.createUserWithConsents(
      { email: email(), passwordHash: "x" },
      [
        {
          type: "HEALTH_PROCESSING",
          version: "1.0",
          locale: "ja",
          action: "GRANTED",
          source: "REGISTRATION",
        },
      ],
    );
    await new Promise((r) => setTimeout(r, 5));
    await consentRepository.insertMany([
      {
        userId: user.id,
        type: "HEALTH_PROCESSING",
        version: "1.0",
        locale: "ja",
        action: "WITHDRAWN",
        source: "SETTINGS",
      },
    ]);

    const latest = await consentRepository.latestPerType([user.id]);
    expect(latest).toHaveLength(1);
    expect(latest[0]!.action).toBe("WITHDRAWN");

    const ofType = await consentRepository.latestOfTypeForUsers([user.id], "HEALTH_PROCESSING");
    expect(ofType.map((r) => r.action)).toEqual(["WITHDRAWN"]);

    const history = await consentRepository.history(user.id);
    expect(history.map((r) => r.action)).toEqual(["WITHDRAWN", "GRANTED"]);
  });

  it("deletes consent records with the account", async () => {
    const address = email();
    const user = await consentRepository.createUserWithConsents(
      { email: address, passwordHash: "x" },
      [{ type: "TERMS", version: "1.0", locale: "en", action: "GRANTED", source: "REGISTRATION" }],
    );
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.consentRecord.count({ where: { userId: user.id } })).toBe(0);
  });
});
