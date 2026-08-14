import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { mockCreateTransport, mockVerify, mockSendMail } = vi.hoisted(() => ({
  mockCreateTransport: vi.fn(),
  mockVerify: vi.fn(),
  mockSendMail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mockCreateTransport,
  },
}));

vi.mock("../src/lib/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function mockEnv(overrides: Partial<Record<string, unknown>> = {}) {
  vi.doMock("../src/config/env.js", () => ({
    env: {
      SMTP_HOST: "localhost",
      SMTP_PORT: 1025,
      SMTP_FROM: "no-reply@embr.health",
      SMTP_SECURE: false,
      SMTP_REQUIRE_TLS: false,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      APP_URL: "http://localhost:3000",
      EMAIL_VERIFICATION_TTL_SECONDS: 86400,
      PASSWORD_RESET_TTL_SECONDS: 3600,
      ORG_INVITE_TTL_SECONDS: 604800,
      ...overrides,
    },
  }));
}

beforeEach(() => {
  vi.resetModules();
  mockCreateTransport.mockReturnValue({ verify: mockVerify, sendMail: mockSendMail });
  mockVerify.mockReset();
});

afterEach(() => {
  vi.doUnmock("../src/config/env.js");
});

describe("mailer transport configuration", () => {
  it("omits auth entirely when SMTP_USER/SMTP_PASS are both unset (MailHog/local dev)", async () => {
    mockEnv();
    await import("../src/modules/auth/mailer.js");

    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
  });

  it("omits auth when only one of SMTP_USER/SMTP_PASS is set — not a valid half-configured state", async () => {
    mockEnv({ SMTP_USER: "someuser" });
    await import("../src/modules/auth/mailer.js");

    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
  });

  it("includes auth when both SMTP_USER and SMTP_PASS are set — this is the actual fix: before it, no real provider could ever authenticate", async () => {
    mockEnv({ SMTP_USER: "apikey", SMTP_PASS: "secret-value" });
    await import("../src/modules/auth/mailer.js");

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: "apikey", pass: "secret-value" } }),
    );
  });

  it("passes SMTP_SECURE and SMTP_REQUIRE_TLS through explicitly, not hardcoded", async () => {
    mockEnv({ SMTP_SECURE: true, SMTP_REQUIRE_TLS: true });
    await import("../src/modules/auth/mailer.js");

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true, requireTLS: true }),
    );
  });
});

describe("verifyMailTransport", () => {
  it("resolves when the transport verifies successfully", async () => {
    mockEnv();
    mockVerify.mockResolvedValue(true);
    const { verifyMailTransport } = await import("../src/modules/auth/mailer.js");

    await expect(verifyMailTransport()).resolves.toBeUndefined();
  });

  it("propagates a verification failure rather than swallowing it — the health check needs the real reason", async () => {
    mockEnv();
    mockVerify.mockRejectedValue(new Error("535 Authentication failed"));
    const { verifyMailTransport } = await import("../src/modules/auth/mailer.js");

    await expect(verifyMailTransport()).rejects.toThrow("535 Authentication failed");
  });
});
