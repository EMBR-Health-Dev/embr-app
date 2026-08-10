import * as client from "openid-client";
import type { Configuration } from "openid-client";
import { guardedFetch } from "./sso.ssrf-guard.js";

export interface PendingAuthorization {
  redirectUrl: string;
  codeVerifier: string;
  state: string;
  nonce: string;
}

export interface OidcIdentity {
  email: string;
  emailVerified: boolean;
  subject: string;
}

export const ssoOidc = {
  /** Fetches the IdP's `.well-known/openid-configuration` and returns a
   * ready-to-use client config. Not cached — this runs once per login
   * attempt (start and callback each need it), which costs a discovery
   * round-trip per login. Acceptable for a first cut at real-world
   * pilot-customer login volumes; worth caching per-connection with a
   * short TTL if this ever shows up in latency numbers. */
  async discover(
    issuerUrl: string,
    clientId: string,
    clientSecret: string,
  ): Promise<Configuration> {
    return client.discovery(new URL(issuerUrl), clientId, clientSecret, undefined, {
      [client.customFetch]: guardedFetch,
    });
  },

  /** Builds the redirect URL for Step 1 of the SP-initiated flow, along
   * with the PKCE verifier / state / nonce the caller must persist
   * (Redis, keyed by `state`) until the callback arrives. */
  async buildAuthorization(
    config: Configuration,
    redirectUri: string,
  ): Promise<PendingAuthorization> {
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();

    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: "openid email profile",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });

    return { redirectUrl: url.href, codeVerifier, state, nonce };
  },

  /** Step 2: exchanges the authorization code for tokens, validating
   * PKCE/state/nonce along the way, and returns just the identity
   * claims the rest of the app needs — callers never see the raw token
   * response. */
  async exchangeCode(
    config: Configuration,
    callbackUrl: URL,
    checks: { codeVerifier: string; state: string; nonce: string },
  ): Promise<OidcIdentity> {
    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: checks.codeVerifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
    });

    const claims = tokens.claims();
    if (!claims || typeof claims.email !== "string" || !claims.email) {
      throw new Error("The identity provider did not return an email claim");
    }

    return {
      email: claims.email,
      emailVerified: claims.email_verified === true,
      subject: String(claims.sub),
    };
  },
};
