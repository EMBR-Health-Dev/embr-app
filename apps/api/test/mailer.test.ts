import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { mockSend, MockResend } = vi.hoisted(() => {
  const mockSend = vi.fn();
  // Must be a real `function`, not an arrow function — mailer.ts calls
  // `new Resend(key)`, and an arrow function can't be used as a
  // constructor (returning an object from a plain function called with
  // `new` substitutes that object for `this`, which is all this needs).
  const MockResend = vi.fn(function (this: unknown) {
    return { emails: { send: mockSend } };
  });
  return { mockSend, MockResend };
});

vi.mock("resend", () => ({
  Resend: MockResend,
}));

vi.mock("../src/lib/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function mockEnv(overrides: Partial<Record<string, unknown>> = {}) {
  vi.doMock("../src/config/env.js", () => ({
    env: {
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "no-reply@embrhealthcare.com",
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
  mockSend.mockReset();
  MockResend.mockClear();
});

afterEach(() => {
  vi.doUnmock("../src/config/env.js");
  vi.useRealTimers();
});

describe("Resend client configuration", () => {
  it("constructs a Resend client with the configured API key", async () => {
    mockEnv();
    await import("../src/modules/auth/mailer.js");

    expect(MockResend).toHaveBeenCalledWith("re_test_key");
  });

  it("does not construct a Resend client when RESEND_API_KEY is unset", async () => {
    mockEnv({ RESEND_API_KEY: undefined });
    await import("../src/modules/auth/mailer.js");

    expect(MockResend).not.toHaveBeenCalled();
  });
});

describe("isEmailConfigured", () => {
  it("returns true when RESEND_API_KEY is set", async () => {
    mockEnv();
    const { isEmailConfigured } = await import("../src/modules/auth/mailer.js");

    expect(isEmailConfigured()).toBe(true);
  });

  it("returns false when RESEND_API_KEY is unset", async () => {
    mockEnv({ RESEND_API_KEY: undefined });
    const { isEmailConfigured } = await import("../src/modules/auth/mailer.js");

    expect(isEmailConfigured()).toBe(false);
  });
});

describe("sendVerificationEmail", () => {
  it("sends via Resend with the configured from address and correct subject", async () => {
    mockEnv();
    mockSend.mockResolvedValue({ data: { id: "email_123" }, error: null });
    const { sendVerificationEmail } = await import("../src/modules/auth/mailer.js");

    await sendVerificationEmail("user@example.com", "test-token");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "no-reply@embrhealthcare.com",
        to: "user@example.com",
        subject: "Verify your EMBR account",
        html: expect.stringContaining("test-token"),
        text: expect.stringContaining("test-token"),
      }),
    );
  });

  it("skips sending (and does not throw) when RESEND_API_KEY is unset — never breaks registration", async () => {
    mockEnv({ RESEND_API_KEY: undefined });
    const { sendVerificationEmail } = await import("../src/modules/auth/mailer.js");

    await expect(sendVerificationEmail("user@example.com", "test-token")).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("logs and does not throw when Resend returns an error response — the SDK returns errors, it doesn't throw them", async () => {
    mockEnv();
    mockSend.mockResolvedValue({
      data: null,
      error: { message: "Invalid `from` field", statusCode: 422, name: "invalid_from_address" },
    });
    const { sendVerificationEmail } = await import("../src/modules/auth/mailer.js");

    await expect(sendVerificationEmail("user@example.com", "test-token")).resolves.toBeUndefined();
  });

  it("logs and does not throw when the Resend request itself rejects (network failure)", async () => {
    mockEnv();
    mockSend.mockRejectedValue(new Error("fetch failed"));
    const { sendVerificationEmail } = await import("../src/modules/auth/mailer.js");

    await expect(sendVerificationEmail("user@example.com", "test-token")).resolves.toBeUndefined();
  });

  it("times out and logs rather than hanging indefinitely when Resend never responds", async () => {
    mockEnv();
    vi.useFakeTimers();
    mockSend.mockReturnValue(new Promise(() => {}));
    const { sendVerificationEmail } = await import("../src/modules/auth/mailer.js");

    const pending = sendVerificationEmail("user@example.com", "test-token");
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toBeUndefined();
  });
});

describe("sendPasswordResetEmail", () => {
  it("sends via Resend with the correct subject and reset link", async () => {
    mockEnv();
    mockSend.mockResolvedValue({ data: { id: "email_456" }, error: null });
    const { sendPasswordResetEmail } = await import("../src/modules/auth/mailer.js");

    await sendPasswordResetEmail("user@example.com", "reset-token");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "no-reply@embrhealthcare.com",
        to: "user@example.com",
        subject: "Reset your EMBR password",
        html: expect.stringContaining("reset-token"),
      }),
    );
  });
});

describe("sendOrganizationInviteEmail", () => {
  it("sends via Resend with the org name in the subject and body", async () => {
    mockEnv();
    mockSend.mockResolvedValue({ data: { id: "email_789" }, error: null });
    const { sendOrganizationInviteEmail } = await import("../src/modules/auth/mailer.js");

    await sendOrganizationInviteEmail("user@example.com", "Acme Health", "invite-token");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "no-reply@embrhealthcare.com",
        to: "user@example.com",
        subject: "You've been invited to join Acme Health on EMBR",
        html: expect.stringContaining("invite-token"),
      }),
    );
  });
});
