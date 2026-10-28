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
      LOGIN_LINK_TTL_SECONDS: 900,
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

describe("sendLoginLinkEmail", () => {
  it("sends the sign in link with its expiry", async () => {
    mockEnv();
    mockSend.mockResolvedValue({ data: { id: "email_789" }, error: null });
    const { sendLoginLinkEmail } = await import("../src/modules/auth/mailer.js");

    await sendLoginLinkEmail("user@example.com", "link-token");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: "Your EMBR sign in link",
        html: expect.stringContaining("http://localhost:3000/login-link?token=link-token"),
        text: expect.stringContaining("http://localhost:3000/login-link?token=link-token"),
      }),
    );
    expect(mockSend.mock.calls[0]![0].html).toContain("expires in 15 minutes");
  });
});

describe("sendWeeklyReminderEmail", () => {
  it("links to the timeline and Settings, in English, Japanese and French, with nothing from her record", async () => {
    mockEnv();
    mockSend.mockResolvedValue({ data: { id: "email_weekly" }, error: null });
    const { sendWeeklyReminderEmail } = await import("../src/modules/auth/mailer.js");

    await sendWeeklyReminderEmail("user@example.com");

    const sent = mockSend.mock.calls[0]![0];
    expect(sent).toMatchObject({
      to: "user@example.com",
      subject: "Your week in EMBR / EMBRの1週間 / Votre semaine dans EMBR",
    });
    expect(sent.html).toContain("http://localhost:3000/timeline");
    expect(sent.html).toContain("http://localhost:3000/settings");
    expect(sent.text).toContain("EMBRから週に一度のお知らせです");
    expect(sent.text).toContain("Un petit rappel hebdomadaire d’EMBR");
    expect(sent.html).toContain("Paramètres");
    // Fixed copy only: the function takes an address and a language,
    // nothing from her record.
    expect(sendWeeklyReminderEmail.length).toBe(2);
  });
});

describe("sendWeeklyReminderEmail in her stored language", () => {
  it.each([
    ["fr", "Votre semaine dans EMBR", "Un petit rappel hebdomadaire d’EMBR", "Paramètres"],
    ["ja", "EMBRの1週間", "EMBRから週に一度のお知らせです", "設定"],
    ["en", "Your week in EMBR", "A short weekly reminder from EMBR", "Settings"],
  ] as const)("sends only %s", async (locale, subject, body, settingsWord) => {
    mockEnv();
    mockSend.mockResolvedValue({ data: { id: "email_weekly" }, error: null });
    const { sendWeeklyReminderEmail } = await import("../src/modules/auth/mailer.js");

    await sendWeeklyReminderEmail("user@example.com", locale);

    const sent = mockSend.mock.calls[0]![0];
    expect(sent.subject).toBe(subject);
    expect(sent.text).toContain(body);
    expect(sent.html).toContain(settingsWord);
    expect(sent.html).toContain("http://localhost:3000/settings");
    // No other language alongside it.
    const others = ["Un petit rappel", "EMBRから週に一度", "A short weekly reminder"].filter(
      (b) => !body.startsWith(b),
    );
    for (const other of others) expect(sent.text).not.toContain(other);
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

describe("French transactional emails", () => {
  const cases = [
    {
      name: "verification",
      send: (m: typeof import("../src/modules/auth/mailer.js")) =>
        m.sendVerificationEmail("user@example.com", "tok", "fr"),
      subject: "Vérifiez votre compte EMBR",
      body: "Ce lien expire dans 24\u00a0heures.",
    },
    {
      name: "password reset",
      send: (m: typeof import("../src/modules/auth/mailer.js")) =>
        m.sendPasswordResetEmail("user@example.com", "tok", "fr"),
      subject: "Réinitialisez votre mot de passe EMBR",
      body: "Ce lien expire dans 60\u00a0minutes.",
    },
    {
      name: "sign in link",
      send: (m: typeof import("../src/modules/auth/mailer.js")) =>
        m.sendLoginLinkEmail("user@example.com", "tok", "fr"),
      subject: "Votre lien de connexion EMBR",
      body: "expire dans 15\u00a0minutes",
    },
    {
      name: "organization invite",
      send: (m: typeof import("../src/modules/auth/mailer.js")) =>
        m.sendOrganizationInviteEmail("user@example.com", "Acme Santé", "tok", "fr"),
      subject: "Invitation à rejoindre Acme Santé sur EMBR",
      body: "Ce lien expire dans 7\u00a0jours.",
    },
  ];

  for (const c of cases) {
    it(`sends the ${c.name} email in French, keeping the link`, async () => {
      mockEnv();
      mockSend.mockResolvedValue({ data: { id: "email_fr" }, error: null });
      const mailer = await import("../src/modules/auth/mailer.js");

      await c.send(mailer);

      const sent = mockSend.mock.calls[0]![0];
      expect(sent.subject).toBe(c.subject);
      expect(sent.html).toContain(c.body);
      expect(sent.html).toContain("tok");
      expect(sent.text).toContain("tok");
      expect(`${sent.subject} ${sent.html} ${sent.text}`).not.toMatch(/[\u2013\u2014]/);
    });
  }
});

describe("Japanese transactional emails", () => {
  const cases = [
    {
      name: "verification",
      send: (m: typeof import("../src/modules/auth/mailer.js")) =>
        m.sendVerificationEmail("user@example.com", "tok", "ja"),
      subject: "EMBRアカウントの確認",
      body: "このリンクの有効期限は24時間です。",
    },
    {
      name: "password reset",
      send: (m: typeof import("../src/modules/auth/mailer.js")) =>
        m.sendPasswordResetEmail("user@example.com", "tok", "ja"),
      subject: "EMBRのパスワード再設定",
      body: "このリンクの有効期限は60分です。",
    },
    {
      name: "sign in link",
      send: (m: typeof import("../src/modules/auth/mailer.js")) =>
        m.sendLoginLinkEmail("user@example.com", "tok", "ja"),
      subject: "EMBRのログインリンク",
      body: "15分で期限切れになります",
    },
    {
      name: "organization invite",
      send: (m: typeof import("../src/modules/auth/mailer.js")) =>
        m.sendOrganizationInviteEmail("user@example.com", "Acme Health", "tok", "ja"),
      subject: "EMBRでAcme Healthへの招待が届いています",
      body: "このリンクの有効期限は7日です。",
    },
  ];

  for (const c of cases) {
    it(`sends the ${c.name} email in Japanese, keeping the link`, async () => {
      mockEnv();
      mockSend.mockResolvedValue({ data: { id: "email_ja" }, error: null });
      const mailer = await import("../src/modules/auth/mailer.js");

      await c.send(mailer);

      const sent = mockSend.mock.calls[0]![0];
      expect(sent.subject).toBe(c.subject);
      expect(sent.html).toContain(c.body);
      expect(sent.html).toContain("tok");
      expect(sent.text).toContain("tok");
      expect(`${sent.subject} ${sent.html} ${sent.text}`).not.toMatch(/[\u2013\u2014]/);
    });
  }
});
