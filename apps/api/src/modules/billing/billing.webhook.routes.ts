import { Router, type Router as ExpressRouter } from "express";
import express from "express";
import { AppError } from "@embr/shared";
import { asyncHandler } from "../../lib/async-handler.js";
import { logger } from "../../lib/logger.js";
import { processWebhookEvent, verifyWebhookSignature } from "./billing.webhook.js";

const router: ExpressRouter = Router();

/**
 * Deliberately its own router, mounted separately in app.ts ahead of
 * the app-wide `express.json()` call — see app.ts's comment at that
 * mount point. `express.raw()` here is scoped to exactly this one
 * route, not applied globally, so every other route keeps getting
 * parsed JSON as normal.
 *
 * Unauthenticated by design (requireAuth() checks a session cookie/
 * bearer token Stripe's servers don't have) — verifyWebhookSignature()
 * is what actually establishes trust here, cryptographically, which is
 * the correct authentication mechanism for a server-to-server webhook.
 */
router.post(
  "/billing/webhook",
  express.raw({ type: "application/json" }),
  asyncHandler(async (req, res) => {
    const signature = req.header("stripe-signature");
    if (!signature) {
      throw AppError.unauthorized("Missing Stripe-Signature header");
    }
    if (!Buffer.isBuffer(req.body)) {
      // Would only happen if this route were ever reachable without
      // express.raw() having run first (e.g. a future refactor
      // reordering middleware) — a real (mis)configuration bug, not
      // something a malicious request could trigger, since Stripe
      // always sends application/json and express.raw's type filter
      // matches it.
      throw AppError.internal("Webhook body was not captured as a raw buffer");
    }

    const event = verifyWebhookSignature(req.body, signature);
    await processWebhookEvent(event);

    logger.info({ eventId: event.id, type: event.type }, "billing webhook: processed");
    res.status(200).json({ received: true });
  }),
);

export { router as billingWebhookRouter };
