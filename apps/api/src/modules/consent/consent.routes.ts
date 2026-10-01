import { Router, type Router as ExpressRouter } from "express";
import {
  grantConsentsSchema,
  withdrawConsentSchema,
  type GrantConsentsInput,
  type WithdrawConsentInput,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireCsrfToken } from "../auth/csrf.js";
import { consentService } from "./consent.service.js";

const router: ExpressRouter = Router();

// Consent management is never behind requireCurrentConsent — it's how
// a person gets back to a current state.
router.use("/consents", requireAuth());

router.get(
  "/consents",
  asyncHandler(async (req, res) => {
    const status = await consentService.status(req.user!.sub);
    res.status(200).json({ data: status, requestId: req.requestId });
  }),
);

router.post(
  "/consents",
  requireCsrfToken(),
  validate(grantConsentsSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as GrantConsentsInput;
    const consents = await consentService.grant(
      req.user!.sub,
      input.consents,
      input.locale,
      "CONSENT_SCREEN",
      input.client,
    );
    res.status(200).json({ data: { consents }, requestId: req.requestId });
  }),
);

router.post(
  "/consents/withdraw",
  requireCsrfToken(),
  validate(withdrawConsentSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as WithdrawConsentInput;
    const consents = await consentService.withdrawHealthProcessing(req.user!.sub, input.client);
    res.status(200).json({ data: { consents }, requestId: req.requestId });
  }),
);

export { router as consentRouter };
