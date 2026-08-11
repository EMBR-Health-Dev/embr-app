import { describe, expect, it, vi, beforeEach } from "vitest";

const oidcMocks = vi.hoisted(() => ({
  discovery: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  authorizationCodeGrant: vi.fn(),
  randomPKCECodeVerifier: vi.fn(() => "mock-code-verifier"),
  calculatePKCECodeChallenge: vi.fn(async (verifier: string) => `challenge-of-${verifier}`),
  randomState: vi.fn(() => "mock-state"),
  randomNonce: vi.fn(() => "mock-nonce"),
  customFetch: Symbol("customFetch"),
}));

vi.mock("openid-client", () => oidcMocks);

const { ssoOidc } = await import("../src/modules/sso/sso.oidc.js");
const { guardedFetch } = await import("../src/modules/sso/sso.ssrf-guard.js");

beforeEach(() => {
  vi.clearAllMocks();
  oidcMocks.randomPKCECodeVerifier.mockReturnValue("mock-code-verifier");
  oidcMocks.calculatePKCECodeChallenge.mockImplementation(
    async (verifier: string) => `challenge-of-${verifier}`,
  );
  oidcMocks.randomState.mockReturnValue("mock-state");
  oidcMocks.randomNonce.mockReturnValue("mock-nonce");
});

describe("ssoOidc.discover", () => {
  it("passes the SSRF-guarded fetch through to the discovery call", async () => {
    const fakeConfig = { fake: "config" };
    oidcMocks.discovery.mockResolvedValue(fakeConfig);

    const result = await ssoOidc.discover("https://idp.example.com", "client-id", "client-secret");

    expect(result).toBe(fakeConfig);
    expect(oidcMocks.discovery).toHaveBeenCalledWith(
      new URL("https://idp.example.com"),
      "client-id",
      "client-secret",
      undefined,
      { [oidcMocks.customFetch]: guardedFetch },
    );
  });
});

describe("ssoOidc.buildAuthorization", () => {
  it("builds the redirect URL from freshly generated PKCE/state/nonce, and returns all of it", async () => {
    const fakeConfig = { fake: "config" } as never;
    oidcMocks.buildAuthorizationUrl.mockReturnValue(
      new URL("https://idp.example.com/authorize?state=mock-state"),
    );

    const result = await ssoOidc.buildAuthorization(fakeConfig, "https://app.example.com/callback");

    expect(oidcMocks.calculatePKCECodeChallenge).toHaveBeenCalledWith("mock-code-verifier");
    expect(oidcMocks.buildAuthorizationUrl).toHaveBeenCalledWith(fakeConfig, {
      redirect_uri: "https://app.example.com/callback",
      scope: "openid email profile",
      code_challenge: "challenge-of-mock-code-verifier",
      code_challenge_method: "S256",
      state: "mock-state",
      nonce: "mock-nonce",
    });
    expect(result).toEqual({
      redirectUrl: "https://idp.example.com/authorize?state=mock-state",
      codeVerifier: "mock-code-verifier",
      state: "mock-state",
      nonce: "mock-nonce",
    });
  });

  it("generates a fresh codeVerifier/state/nonce on every call — never reused across attempts", async () => {
    const fakeConfig = { fake: "config" } as never;
    oidcMocks.buildAuthorizationUrl.mockReturnValue(new URL("https://idp.example.com/authorize"));
    oidcMocks.randomPKCECodeVerifier
      .mockReturnValueOnce("verifier-1")
      .mockReturnValueOnce("verifier-2");
    oidcMocks.randomState.mockReturnValueOnce("state-1").mockReturnValueOnce("state-2");

    const first = await ssoOidc.buildAuthorization(fakeConfig, "https://app.example.com/cb");
    const second = await ssoOidc.buildAuthorization(fakeConfig, "https://app.example.com/cb");

    expect(first.codeVerifier).toBe("verifier-1");
    expect(second.codeVerifier).toBe("verifier-2");
    expect(first.state).toBe("state-1");
    expect(second.state).toBe("state-2");
  });
});

describe("ssoOidc.exchangeCode", () => {
  const fakeConfig = { fake: "config" } as never;
  const checks = { codeVerifier: "cv", state: "st", nonce: "nc" };
  const callbackUrl = new URL("https://app.example.com/callback?code=abc&state=st");

  function mockTokens(claims: Record<string, unknown> | null) {
    oidcMocks.authorizationCodeGrant.mockResolvedValue({ claims: () => claims });
  }

  it("passes PKCE/state/nonce checks through unchanged to authorizationCodeGrant", async () => {
    mockTokens({ email: "person@acme.com", email_verified: true, sub: "sub-1" });

    await ssoOidc.exchangeCode(fakeConfig, callbackUrl, checks);

    expect(oidcMocks.authorizationCodeGrant).toHaveBeenCalledWith(fakeConfig, callbackUrl, {
      pkceCodeVerifier: "cv",
      expectedState: "st",
      expectedNonce: "nc",
    });
  });

  it("maps a fully-verified identity correctly", async () => {
    mockTokens({ email: "person@acme.com", email_verified: true, sub: "sub-1" });

    const identity = await ssoOidc.exchangeCode(fakeConfig, callbackUrl, checks);

    expect(identity).toEqual({
      email: "person@acme.com",
      emailVerified: true,
      subject: "sub-1",
    });
  });

  it("marks emailVerified false when the claim is explicitly false", async () => {
    mockTokens({ email: "person@acme.com", email_verified: false, sub: "sub-1" });

    const identity = await ssoOidc.exchangeCode(fakeConfig, callbackUrl, checks);

    expect(identity.emailVerified).toBe(false);
  });

  it("marks emailVerified false when the claim is missing entirely — never defaults to trusted", async () => {
    mockTokens({ email: "person@acme.com", sub: "sub-1" });

    const identity = await ssoOidc.exchangeCode(fakeConfig, callbackUrl, checks);

    expect(identity.emailVerified).toBe(false);
  });

  it("coerces a non-string sub claim to a string", async () => {
    mockTokens({ email: "person@acme.com", email_verified: true, sub: 12345 });

    const identity = await ssoOidc.exchangeCode(fakeConfig, callbackUrl, checks);

    expect(identity.subject).toBe("12345");
  });

  it("throws when the IdP returns no email claim at all", async () => {
    mockTokens({ email_verified: true, sub: "sub-1" });

    await expect(ssoOidc.exchangeCode(fakeConfig, callbackUrl, checks)).rejects.toThrow(
      "The identity provider did not return an email claim",
    );
  });

  it("throws when the email claim is an empty string", async () => {
    mockTokens({ email: "", email_verified: true, sub: "sub-1" });

    await expect(ssoOidc.exchangeCode(fakeConfig, callbackUrl, checks)).rejects.toThrow(
      "The identity provider did not return an email claim",
    );
  });

  it("throws when the email claim is not a string", async () => {
    mockTokens({ email: 12345, email_verified: true, sub: "sub-1" });

    await expect(ssoOidc.exchangeCode(fakeConfig, callbackUrl, checks)).rejects.toThrow(
      "The identity provider did not return an email claim",
    );
  });

  it("throws when the token response has no claims at all", async () => {
    mockTokens(null);

    await expect(ssoOidc.exchangeCode(fakeConfig, callbackUrl, checks)).rejects.toThrow(
      "The identity provider did not return an email claim",
    );
  });
});
