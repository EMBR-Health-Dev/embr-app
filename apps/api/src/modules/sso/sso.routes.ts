import { Router, type Router as ExpressRouter } from "express";
import { AppError, ErrorCode } from "@embr/shared";
import {
  ssoStartQuerySchema,
  upsertSsoConnectionSchema,
  type SsoStartQuery,
  type UpsertSsoConnectionInput,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { logger } from "../../lib/logger.js";
import { env } from "../../config/env.js";
import { requireAuth, requireOrgRole } from "../auth/auth.middleware.js";
import { setAccessTokenCookie, setRefreshTokenCookie } from "../auth/cookies.js";
import { loginLimiter } from "../auth/rate-limiters.js";
import { ssoService } from "./sso.service.js";

const router: ExpressRouter = Router();

// ---- Org-admin connection config — ordinary JSON API ----

router.get(
  "/organizations/:organizationId/sso",
  requireAuth(),
  requireOrgRole("ORG_ADMIN"),
  asyncHandler(async (req, res) => {
    const connection = await ssoService.getConnection(req.params.organizationId!);
    res.json({ data: connection, requestId: req.requestId });
  }),
);

router.put(
  "/organizations/:organizationId/sso",
  requireAuth(),
  requireOrgRole("ORG_ADMIN"),
  validate(upsertSsoConnectionSchema),
  asyncHandler(async (req, res) => {
    const connection = await ssoService.upsertConnection(
      req,
      req.params.organizationId!,
      req.body as UpsertSsoConnectionInput,
    );
    res.json({ data: connection, requestId: req.requestId });
  }),
);

// ---- Public, browser-navigated OIDC flow ----
//
// Both routes below are hit by a full-page browser navigation (a link
// click, then a redirect back from the IdP) rather than a fetch() call
// — so unlike the rest of this API, they never return JSON. Every path,
// success or failure, ends in a redirect. asyncHandler (which forwards
// thrown errors to the JSON error-handler middleware) is deliberately
// not used here for that reason; each handler catches its own errors
// and redirects to the login page with a query-string reason instead.

/** Reconstructs the exact URL registered as this connection's OIDC
 * `redirect_uri` — scheme/host/path from APP_URL, query string from the
 * real incoming request. Can't just use `req.originalUrl`/`req.get(
 * "host")`: this request arrives at the API's bare origin after being
 * proxied through the web app's `/api/*` rewrite (see
 * apps/web/next.config.ts), so those would reflect the internal proxy
 * hop, not the public `${APP_URL}/api/auth/sso/callback` the
 * authorization request actually used — and openid-client validates
 * the callback URL against exactly that. */
function reconstructCallbackUrl(originalUrl: string): URL {
  const incoming = new URL(originalUrl, "http://internal");
  const url = new URL(`${env.APP_URL}/api/auth/sso/callback`);
  url.search = incoming.search;
  return url;
}

router.get(
  "/auth/sso/start",
  loginLimiter,
  validate(ssoStartQuerySchema, "query"),
  async (req, res) => {
    const { email } = req.query as unknown as SsoStartQuery;
    try {
      const redirectUrl = await ssoService.startLogin(email);
      res.redirect(302, redirectUrl);
    } catch (err) {
      const reason =
        err instanceof AppError && err.code === ErrorCode.NOT_FOUND
          ? "sso_not_configured"
          : "sso_start_failed";
      if (!(err instanceof AppError)) {
        logger.error({ err }, "unexpected error starting SSO login");
      }
      res.redirect(302, `${env.APP_URL}/login?ssoError=${reason}`);
    }
  },
);

router.get("/auth/sso/callback", async (req, res) => {
  try {
    const callbackUrl = reconstructCallbackUrl(req.originalUrl);
    const { accessToken, refreshToken } = await ssoService.handleCallback(req, callbackUrl);
    setAccessTokenCookie(res, accessToken);
    setRefreshTokenCookie(res, refreshToken);
    res.redirect(302, `${env.APP_URL}/dashboard`);
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error({ err }, "unexpected error completing SSO login");
    }
    res.redirect(302, `${env.APP_URL}/login?ssoError=sso_callback_failed`);
  }
});

export { router as ssoRouter };
