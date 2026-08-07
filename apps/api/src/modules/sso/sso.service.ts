import type { Request } from "express";
import { AppError, ErrorCode } from "@embr/shared";
import type { UpsertSsoConnectionInput } from "@embr/validation";
import type { SsoConnectionDto } from "@embr/types";
import { env } from "../../config/env.js";
import { redis } from "../../lib/redis.js";
import { ssoRepository } from "./sso.repository.js";
import { toSsoConnectionDto } from "./sso.mappers.js";
import { encryptClientSecret, decryptClientSecret } from "./sso.crypto.js";
import { ssoOidc } from "./sso.oidc.js";
import { organizationRepository } from "../organizations/organization.repository.js";
import { authRepository } from "../auth/auth.repository.js";
import { hashPassword } from "../auth/password.js";
import { generateOpaqueToken } from "../auth/tokens.js";
import { issueSession } from "../auth/auth.service.js";
import { writeAuditLog } from "../auth/audit.js";

/** Redirect target the IdP is configured to send the user back to.
 * Routed through the web app's own `/api/*` proxy (see
 * apps/web/next.config.ts) rather than the API's bare origin, so this
 * response's Set-Cookie headers land as ordinary first-party cookies —
 * identical treatment to every other auth endpoint. */
function callbackRedirectUri(): string {
  return `${env.APP_URL}/api/auth/sso/callback`;
}

function domainOf(email: string): string | null {
  const domain = email.split("@")[1];
  return domain ? domain.toLowerCase() : null;
}

function stateKey(state: string): string {
  return `sso:state:${state}`;
}

interface PendingState {
  connectionId: string;
  codeVerifier: string;
  nonce: string;
}

export const ssoService = {
  async getConnection(organizationId: string): Promise<SsoConnectionDto | null> {
    const connection = await ssoRepository.findByOrganizationId(organizationId);
    return connection ? toSsoConnectionDto(connection) : null;
  },

  async upsertConnection(
    req: Request,
    organizationId: string,
    input: UpsertSsoConnectionInput,
  ): Promise<SsoConnectionDto> {
    const org = await organizationRepository.findOrganizationById(organizationId);
    if (!org) throw AppError.notFound("Organization");

    // Fails fast on a typo'd issuer URL or unreachable IdP at config
    // time, rather than only discovering it the first time someone
    // tries to actually log in through this connection.
    try {
      await ssoOidc.discover(input.issuerUrl, input.clientId, input.clientSecret);
    } catch (err) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          "Couldn't verify this identity provider's configuration — check the issuer URL and try again",
        cause: err,
      });
    }

    const connection = await ssoRepository.upsert(organizationId, {
      issuerUrl: input.issuerUrl,
      clientId: input.clientId,
      encryptedClientSecret: encryptClientSecret(input.clientSecret),
      allowedEmailDomain: input.allowedEmailDomain,
      enabled: input.enabled,
    });

    await writeAuditLog(req, "SSO_CONNECTION_CONFIGURED", req.user!.sub, {
      organizationId,
      enabled: input.enabled,
    });

    return toSsoConnectionDto(connection);
  },

  /**
   * Step 1 of the SP-initiated flow. Given the email a visitor typed on
   * the login page — before they're authenticated at all — finds which
   * organization's SSO connection (if any) governs that email's domain
   * and returns the URL to redirect them to at the IdP. A domain with
   * no enabled connection is a 404, not a silent fallback to password
   * login — the caller (the route layer) decides how to present that
   * to a browser mid-navigation.
   */
  async startLogin(email: string): Promise<string> {
    const domain = domainOf(email);
    if (!domain) throw AppError.validation("Invalid email address");

    const connection = await ssoRepository.findEnabledByEmailDomain(domain);
    if (!connection) {
      throw AppError.notFound("SSO connection");
    }

    const clientSecret = decryptClientSecret(connection.encryptedClientSecret);
    const config = await ssoOidc.discover(connection.issuerUrl, connection.clientId, clientSecret);
    const pending = await ssoOidc.buildAuthorization(config, callbackRedirectUri());

    const record: PendingState = {
      connectionId: connection.id,
      codeVerifier: pending.codeVerifier,
      nonce: pending.nonce,
    };
    await redis.setex(stateKey(pending.state), env.SSO_STATE_TTL_SECONDS, JSON.stringify(record));

    return pending.redirectUrl;
  },

  /**
   * Step 2: the IdP redirected back with `code` and `state`. Validates
   * the state/PKCE/nonce, exchanges the code, JIT-provisions the user
   * and org membership if needed, and issues the same session a
   * password login would. Returns the tokens for the route layer to
   * set as cookies — this deliberately doesn't set cookies or redirect
   * itself, so the failure paths above it can distinguish "never got
   * this far" from "got here, then failed" without a partially-issued
   * session either way.
   */
  async handleCallback(
    req: Request,
    callbackUrl: URL,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const state = callbackUrl.searchParams.get("state");
    if (!state) {
      await writeAuditLog(req, "SSO_LOGIN_FAILED", null, { reason: "missing_state" });
      throw AppError.validation("This sign-in attempt is missing required parameters");
    }

    const raw = await redis.get(stateKey(state));
    // Single-use regardless of outcome: a state value that's already
    // been consumed (or was never valid) must not be retryable.
    if (raw) await redis.del(stateKey(state));

    if (!raw) {
      await writeAuditLog(req, "SSO_LOGIN_FAILED", null, { reason: "expired_or_unknown_state" });
      throw AppError.validation(
        "This sign-in attempt has expired or was already used — please try again",
      );
    }

    const pending = JSON.parse(raw) as PendingState;
    const connection = await ssoRepository.findById(pending.connectionId);
    if (!connection || !connection.enabled) {
      await writeAuditLog(req, "SSO_LOGIN_FAILED", null, {
        reason: "connection_unavailable",
        connectionId: pending.connectionId,
      });
      throw AppError.validation("This organization's SSO connection is no longer available");
    }

    const clientSecret = decryptClientSecret(connection.encryptedClientSecret);
    const config = await ssoOidc.discover(connection.issuerUrl, connection.clientId, clientSecret);

    const identity = await ssoOidc.exchangeCode(config, callbackUrl, {
      codeVerifier: pending.codeVerifier,
      state,
      nonce: pending.nonce,
    });

    const identityDomain = domainOf(identity.email);
    if (identityDomain !== connection.allowedEmailDomain) {
      await writeAuditLog(req, "SSO_LOGIN_FAILED", null, {
        reason: "domain_mismatch",
        connectionId: connection.id,
      });
      throw AppError.forbidden(
        `This identity provider authenticated an account outside the ${connection.allowedEmailDomain} domain this connection is scoped to`,
      );
    }

    let user = await authRepository.findUserByEmail(identity.email);
    if (!user) {
      // JIT provisioning. The password hash is a random value never
      // presented anywhere — this account has no password login path
      // unless the person separately completes forgot-password later
      // (see Milestone 15's remaining-work note on that gap).
      const unusablePassword = await hashPassword(generateOpaqueToken());
      user = await authRepository.createUser({
        email: identity.email,
        passwordHash: unusablePassword,
      });
      await writeAuditLog(req, "SSO_USER_PROVISIONED", user.id, { connectionId: connection.id });
    }

    if (!user.emailVerifiedAt) {
      // The IdP vouching for this identity is at least as strong
      // evidence of email ownership as our own unclicked verification
      // link would be.
      user = await authRepository.markEmailVerified(user.id);
    }

    const existingMembership = await organizationRepository.findMembership(
      connection.organizationId,
      user.id,
    );
    if (!existingMembership) {
      await organizationRepository.createMembership(
        connection.organizationId,
        user.id,
        "ORG_MEMBER",
      );
      await writeAuditLog(req, "ORG_MEMBER_JOINED", user.id, {
        organizationId: connection.organizationId,
        via: "sso",
      });
    }

    const session = await issueSession(req, user);
    await writeAuditLog(req, "SSO_LOGIN_SUCCEEDED", user.id, { connectionId: connection.id });

    return session;
  },
};
