import { Router, type Router as ExpressRouter } from "express";
import { AppError } from "@embr/shared";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  idParamSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { authService } from "./auth.service.js";
import { authRepository } from "./auth.repository.js";
import { toUserDto } from "./auth.mappers.js";
import { requireAuth } from "./auth.middleware.js";
import { requireCsrfToken, issueCsrfToken } from "./csrf.js";
import {
  clearAuthCookies,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  REFRESH_TOKEN_COOKIE,
} from "./cookies.js";
import { hashToken } from "./tokens.js";
import {
  loginLimiter,
  passwordResetLimiter,
  refreshLimiter,
  registerLimiter,
} from "./rate-limiters.js";

const router: ExpressRouter = Router();

/**
 * Issues (or refreshes) the CSRF cookie. The frontend calls this once
 * on load — before login, and before any state-changing request — and
 * echoes the token back in the `x-csrf-token` header.
 */
router.get("/auth/csrf", (_req, res) => {
  const token = issueCsrfToken(res);
  res.status(200).json({ csrfToken: token });
});

router.post(
  "/auth/register",
  registerLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.register(req, req.body);
    res.status(201).json({ data: user, requestId: req.requestId });
  }),
);

router.post(
  "/auth/verify-email",
  validate(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    await authService.verifyEmail(req, req.body.token);
    res.status(204).send();
  }),
);

router.post(
  "/auth/resend-verification",
  passwordResetLimiter,
  validate(resendVerificationSchema),
  asyncHandler(async (req, res) => {
    await authService.resendVerification(req.body.email);
    // Always 202 regardless of whether the account exists/is already
    // verified — see authService.resendVerification for why.
    res.status(202).json({ message: "If that account exists, a verification email is on its way" });
  }),
);

router.post(
  "/auth/login",
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { user, accessToken, refreshToken } = await authService.login(req, req.body);
    setAccessTokenCookie(res, accessToken);
    setRefreshTokenCookie(res, refreshToken);
    issueCsrfToken(res);
    res.status(200).json({ data: { user, accessToken }, requestId: req.requestId });
  }),
);

router.post(
  "/auth/refresh",
  refreshLimiter,
  requireCsrfToken(),
  asyncHandler(async (req, res) => {
    const presented = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!presented) {
      throw AppError.unauthorized("No refresh token presented");
    }
    const { user, accessToken, refreshToken } = await authService.refresh(req, presented);
    setAccessTokenCookie(res, accessToken);
    setRefreshTokenCookie(res, refreshToken);
    res.status(200).json({ data: { user, accessToken }, requestId: req.requestId });
  }),
);

router.post(
  "/auth/logout",
  requireCsrfToken(),
  asyncHandler(async (req, res) => {
    await authService.logout(req, req.cookies?.[REFRESH_TOKEN_COOKIE]);
    clearAuthCookies(res);
    res.status(204).send();
  }),
);

router.post(
  "/auth/logout-all",
  requireAuth(),
  requireCsrfToken(),
  asyncHandler(async (req, res) => {
    await authService.logoutAll(req, req.user!.sub);
    clearAuthCookies(res);
    res.status(204).send();
  }),
);

router.post(
  "/auth/forgot-password",
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.forgotPassword(req.body.email);
    res
      .status(202)
      .json({ message: "If that account exists, a password reset email is on its way" });
  }),
);

router.post(
  "/auth/reset-password",
  passwordResetLimiter,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.resetPassword(req, req.body.token, req.body.password);
    res.status(204).send();
  }),
);

router.post(
  "/auth/change-password",
  requireAuth(),
  requireCsrfToken(),
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.changePassword(
      req,
      req.user!.sub,
      req.body.currentPassword,
      req.body.newPassword,
    );
    clearAuthCookies(res);
    res.status(204).send();
  }),
);

router.get(
  "/auth/me",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = await authRepository.findUserById(req.user!.sub);
    if (!user) throw AppError.unauthorized();
    res.status(200).json({ data: toUserDto(user), requestId: req.requestId });
  }),
);

router.get(
  "/auth/sessions",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const presented = req.cookies?.[REFRESH_TOKEN_COOKIE];
    const currentSession = presented
      ? await authRepository.findActiveSessionByTokenHash(hashToken(presented))
      : null;
    const sessions = await authService.listSessions(req.user!.sub, currentSession?.id ?? null);
    res.status(200).json({ data: sessions, requestId: req.requestId });
  }),
);

router.delete(
  "/auth/sessions/:id",
  requireAuth(),
  requireCsrfToken(),
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await authService.revokeSession(req.user!.sub, req.params.id as string);
    res.status(204).send();
  }),
);

export { router as authRouter };
