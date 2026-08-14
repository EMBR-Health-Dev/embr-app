import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockDeleteManySession, mockDeleteManyVerification, mockDeleteManyReset } = vi.hoisted(
  () => ({
    mockDeleteManySession: vi.fn(),
    mockDeleteManyVerification: vi.fn(),
    mockDeleteManyReset: vi.fn(),
  }),
);

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    session: { deleteMany: mockDeleteManySession },
    emailVerificationToken: { deleteMany: mockDeleteManyVerification },
    passwordResetToken: { deleteMany: mockDeleteManyReset },
  },
}));

vi.mock("../src/config/env.js", () => ({
  env: { RETENTION_GRACE_PERIOD_DAYS: 30 },
}));

const { retentionService } = await import("../src/modules/retention/retention.service.js");

beforeEach(() => {
  mockDeleteManySession.mockReset().mockResolvedValue({ count: 0 });
  mockDeleteManyVerification.mockReset().mockResolvedValue({ count: 0 });
  mockDeleteManyReset.mockReset().mockResolvedValue({ count: 0 });
});

describe("retentionService.runCleanup", () => {
  it("uses a cutoff exactly RETENTION_GRACE_PERIOD_DAYS in the past", async () => {
    const before = Date.now();
    await retentionService.runCleanup();
    const after = Date.now();

    const call = mockDeleteManySession.mock.calls[0][0];
    const cutoffMs = call.where.OR[0].expiresAt.lt.getTime();

    const expectedMin = before - 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 30 * 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
  });

  it("deletes sessions that are either expired or revoked past the cutoff — not sessions still in use", async () => {
    await retentionService.runCleanup();

    const where = mockDeleteManySession.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toHaveProperty("expiresAt.lt");
    expect(where.OR[1]).toEqual({ revokedAt: { not: null, lt: expect.any(Date) } });
  });

  it("only deletes tokens past their expiry, never a still-valid unconsumed one", async () => {
    await retentionService.runCleanup();

    const verificationWhere = mockDeleteManyVerification.mock.calls[0][0].where;
    const resetWhere = mockDeleteManyReset.mock.calls[0][0].where;
    expect(verificationWhere).toEqual({ expiresAt: { lt: expect.any(Date) } });
    expect(resetWhere).toEqual({ expiresAt: { lt: expect.any(Date) } });
  });

  it("returns accurate counts from each deletion", async () => {
    mockDeleteManySession.mockResolvedValue({ count: 5 });
    mockDeleteManyVerification.mockResolvedValue({ count: 2 });
    mockDeleteManyReset.mockResolvedValue({ count: 1 });

    const result = await retentionService.runCleanup();

    expect(result.sessionsDeleted).toBe(5);
    expect(result.emailVerificationTokensDeleted).toBe(2);
    expect(result.passwordResetTokensDeleted).toBe(1);
    expect(result.cutoff).toBeTypeOf("string");
  });

  it("never touches auditLog — that's a separate, undecided policy", async () => {
    // No auditLog mock exists on the mocked prisma client at all —
    // if runCleanup ever tried to call prisma.auditLog.anything, this
    // would throw "Cannot read properties of undefined," not silently
    // pass.
    await expect(retentionService.runCleanup()).resolves.toBeDefined();
  });
});
