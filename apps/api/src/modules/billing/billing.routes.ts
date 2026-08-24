import { Router, type Router as ExpressRouter } from "express";
import { createCheckoutSessionSchema, type CreateCheckoutSessionInput } from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireParam } from "../../lib/params.js";
import { requireAuth, requireOrgRole } from "../auth/auth.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { checkoutSessionLimiter } from "./billing-rate-limiter.js";
import { billingService } from "./billing.service.js";

const router: ExpressRouter = Router();

router.use("/organizations/:organizationId/billing", requireAuth());

/**
 * Same visibility boundary as billing generally: ORG_ADMIN only, same
 * as SSO config and the member roster — this is account/contract-shaped
 * information, not something every ORG_MEMBER needs to see.
 */
router.get(
  "/organizations/:organizationId/billing",
  requireOrgRole("ORG_ADMIN"),
  asyncHandler(async (req, res) => {
    const organizationId = requireParam(req, "organizationId");
    const status = await billingService.getBillingStatus(organizationId);
    res.status(200).json({ data: status, requestId: req.requestId });
  }),
);

router.post(
  "/organizations/:organizationId/billing/checkout-session",
  requireOrgRole("ORG_ADMIN"),
  checkoutSessionLimiter,
  validate(createCheckoutSessionSchema),
  asyncHandler(async (req, res) => {
    const organizationId = requireParam(req, "organizationId");
    const { seats } = req.body as CreateCheckoutSessionInput;
    const session = await billingService.createCheckoutSession(organizationId, { seats });
    await writeAuditLog(req, "ORG_BILLING_CHECKOUT_STARTED", req.user!.sub, {
      organizationId,
      seats,
    });
    res.status(201).json({ data: session, requestId: req.requestId });
  }),
);

router.post(
  "/organizations/:organizationId/billing/portal-session",
  requireOrgRole("ORG_ADMIN"),
  asyncHandler(async (req, res) => {
    const organizationId = requireParam(req, "organizationId");
    const session = await billingService.createPortalSession(organizationId);
    await writeAuditLog(req, "ORG_BILLING_PORTAL_OPENED", req.user!.sub, { organizationId });
    res.status(201).json({ data: session, requestId: req.requestId });
  }),
);

export { router as billingRouter };
