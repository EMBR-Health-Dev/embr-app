import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { AppError } from "@embr/shared";
import type {
  BriefShareDto,
  BriefShareStatus,
  ClinicalBriefDto,
  CreatedBriefShareDto,
} from "@embr/types";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { generateOpaqueToken, hashToken } from "../auth/tokens.js";
import { consentService } from "../consent/consent.service.js";
import { toClinicalBriefDto } from "./brief.mappers.js";

/**
 * Share links: she shows one brief to her clinician, read only, with no
 * account. Two secrets are needed to open one:
 *
 * - the token, 256 random bits, in the link's URL fragment (`/shared#…`).
 *   Browsers never send a fragment to a server, so it stays out of
 *   access logs, proxies and Referer headers.
 * - a 6 digit code she gives the clinician separately (aloud, on paper),
 *   so a forwarded or leaked link alone opens nothing.
 *
 * Only SHA-256 hashes of both are stored. A link stops working when it
 * expires, when she revokes it, after MAX_FAILED_CODES wrong codes, when
 * her consent is no longer current, or when the brief or her account is
 * deleted (the rows cascade). Every failure answers the same "not
 * available" so a caller learns nothing about which it was, except a
 * wrong code on a live link, which says so (the clinician needs to know
 * to re-check the code).
 */
export const MAX_FAILED_CODES = 5;
/** Live links per brief, so a loop or a mistake cannot mint hundreds. */
export const MAX_ACTIVE_SHARES_PER_BRIEF = 5;

const DAY = 86_400_000;

function codeHash(shareId: string, code: string): string {
  // Bound to the share, so equal codes on two links hash differently.
  return createHash("sha256").update(`${shareId}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

interface ShareRow {
  id: string;
  briefId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  failedAttempts: number;
  viewCount: number;
  lastViewedAt: Date | null;
}

function statusOf(row: ShareRow, now = new Date()): BriefShareStatus {
  if (row.revokedAt) return "REVOKED";
  if (row.failedAttempts >= MAX_FAILED_CODES) return "LOCKED";
  if (row.expiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}

function toDto(row: ShareRow): BriefShareDto {
  return {
    id: row.id,
    briefId: row.briefId,
    status: statusOf(row),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    viewCount: row.viewCount,
    lastViewedAt: row.lastViewedAt?.toISOString() ?? null,
  };
}

const shareSelect = {
  id: true,
  briefId: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
  failedAttempts: true,
  viewCount: true,
  lastViewedAt: true,
} as const;

async function assertOwnBrief(briefId: string, userId: string): Promise<void> {
  const brief = await prisma.clinicalBrief.findFirst({
    where: { id: briefId, userId },
    select: { id: true },
  });
  if (!brief) throw AppError.notFound("Brief");
}

const notAvailable = () => AppError.notFound("Shared brief");

export type OpenedShare = {
  shareId: string;
  ownerId: string;
  ownerEmail: string;
  brief: ClinicalBriefDto;
  sharedUntil: string;
};

export const briefShareService = {
  async create(
    briefId: string,
    userId: string,
    expiresInDays: number,
  ): Promise<CreatedBriefShareDto> {
    await assertOwnBrief(briefId, userId);
    const now = new Date();
    const live = await prisma.briefShare.count({
      where: {
        briefId,
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        failedAttempts: { lt: MAX_FAILED_CODES },
      },
    });
    if (live >= MAX_ACTIVE_SHARES_PER_BRIEF) {
      throw AppError.conflict(
        `This brief already has ${MAX_ACTIVE_SHARES_PER_BRIEF} active links. Turn one off before creating another.`,
      );
    }

    const token = generateOpaqueToken();
    const code = newCode();
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.briefShare.create({
        data: {
          briefId,
          userId,
          tokenHash: hashToken(token),
          // Replaced right below, once the id it is bound to exists.
          codeHash: "",
          expiresAt: new Date(now.getTime() + expiresInDays * DAY),
        },
        select: { id: true },
      });
      return tx.briefShare.update({
        where: { id: created.id },
        data: { codeHash: codeHash(created.id, code) },
        select: shareSelect,
      });
    });

    return { share: toDto(row), url: `${env.APP_URL}/shared#${token}`, code };
  },

  async list(briefId: string, userId: string): Promise<BriefShareDto[]> {
    await assertOwnBrief(briefId, userId);
    const rows = await prisma.briefShare.findMany({
      where: { briefId, userId },
      orderBy: { createdAt: "desc" },
      select: shareSelect,
    });
    return rows.map(toDto);
  },

  async revoke(briefId: string, shareId: string, userId: string): Promise<void> {
    const { count } = await prisma.briefShare.updateMany({
      where: { id: shareId, briefId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      // Already revoked is fine; someone else's or missing is not found.
      const exists = await prisma.briefShare.findFirst({
        where: { id: shareId, briefId, userId },
        select: { id: true },
      });
      if (!exists) throw AppError.notFound("Share");
    }
  },

  /**
   * Checks the token and code. Returns the brief on success. A wrong code
   * on a live link counts against it and answers 403; everything else
   * answers the same 404. `countView` is false for the PDF, which follows
   * a view the clinician already opened.
   */
  async open(token: string, code: string, countView: boolean): Promise<OpenedShare> {
    const share = await prisma.briefShare.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        ...shareSelect,
        codeHash: true,
        userId: true,
        user: { select: { email: true } },
      },
    });
    if (!share || statusOf(share) !== "ACTIVE") throw notAvailable();

    if (!sameHash(share.codeHash, codeHash(share.id, code))) {
      // Conditional, so concurrent wrong guesses cannot push past the cap
      // unnoticed or reset it.
      await prisma.briefShare.updateMany({
        where: { id: share.id, failedAttempts: { lt: MAX_FAILED_CODES } },
        data: { failedAttempts: { increment: 1 } },
      });
      const err = AppError.forbidden(
        "That code is not right. Check it with the person who shared this brief.",
      );
      Object.defineProperty(err, "shareContext", {
        value: { shareId: share.id, ownerId: share.userId },
        enumerable: false,
      });
      throw err;
    }

    // Her consent must still be current: withdrawing it stops sharing.
    const states = await consentService.statesFor(share.userId);
    if (!consentService.isFullyCurrent(states)) throw notAvailable();

    const brief = await prisma.clinicalBrief.findFirst({
      where: { id: share.briefId, userId: share.userId },
    });
    if (!brief) throw notAvailable();

    if (countView) {
      await prisma.briefShare.update({
        where: { id: share.id },
        data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
      });
    }

    return {
      shareId: share.id,
      ownerId: share.userId,
      ownerEmail: share.user.email,
      brief: toClinicalBriefDto(brief),
      sharedUntil: share.expiresAt.toISOString(),
    };
  },
};
