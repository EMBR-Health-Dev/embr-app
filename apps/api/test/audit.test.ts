import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request } from "express";

const { logMock, auditLogCreateMock } = vi.hoisted(() => ({
  logMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  auditLogCreateMock: vi.fn(),
}));

vi.mock("../src/lib/logger.js", () => ({ logger: logMock }));
vi.mock("../src/lib/prisma.js", () => ({
  prisma: { auditLog: { create: auditLogCreateMock } },
}));

const { writeAuditLog } = await import("../src/modules/auth/audit.js");

function fakeRequest(): Request {
  return {
    requestId: "req-123",
    ip: "127.0.0.1",
    header: vi.fn().mockReturnValue("test-agent"),
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  auditLogCreateMock.mockResolvedValue(undefined);
});

describe("writeAuditLog observability", () => {
  it("logs routine actions at info level", async () => {
    await writeAuditLog(fakeRequest(), "LOGIN_SUCCEEDED", "user-1");
    expect(logMock.info).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_SUCCEEDED",
        userId: "user-1",
        requestId: "req-123",
      }),
      "audit event",
    );
    expect(logMock.warn).not.toHaveBeenCalled();
  });

  it("logs security-sensitive actions at warn level", async () => {
    await writeAuditLog(fakeRequest(), "LOGIN_FAILED", null, { email: "a@example.com" });
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_FAILED", email: "a@example.com" }),
      "audit event",
    );
    expect(logMock.info).not.toHaveBeenCalled();
  });

  it("still writes the DB record as before", async () => {
    await writeAuditLog(fakeRequest(), "ORG_MEMBER_REVOKED", "admin-1", { revokedUserId: "u-2" });
    expect(auditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "admin-1", action: "ORG_MEMBER_REVOKED" }),
      }),
    );
  });

  it("still emits the structured log even if the DB write fails, and does not throw", async () => {
    auditLogCreateMock.mockRejectedValueOnce(new Error("connection refused"));

    await expect(
      writeAuditLog(fakeRequest(), "LOGIN_SUCCEEDED", "user-1"),
    ).resolves.toBeUndefined();

    // The observability signal (info line) must have fired regardless of
    // the DB outcome -- it's emitted before the DB call, not derived from it.
    expect(logMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_SUCCEEDED" }),
      "audit event",
    );
    expect(logMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_SUCCEEDED", userId: "user-1" }),
      "failed to write audit log",
    );
  });
});
