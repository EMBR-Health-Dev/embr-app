import { Router, type Router as ExpressRouter } from "express";
import rateLimit from "express-rate-limit";
import { supportMessageSchema, type SupportMessageInput } from "@embr/validation";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { logger } from "../../lib/logger.js";
import { redisRateLimitStore } from "../../lib/rate-limit-store.js";
import { rateLimitExceededHandler } from "../../lib/rate-limit-handler.js";
import { sendSupportMessageEmail } from "../auth/mailer.js";

const router: ExpressRouter = Router();

/** Per IP: enough for someone writing back and forth, not for a flood. */
const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitExceededHandler,
  store: redisRateLimitStore("rl:support:"),
  skip: () => env.NODE_ENV === "test",
});

/**
 * The Help page contact form. Public on purpose: someone who cannot sign
 * in still needs a way to reach us. Nothing is stored; the message goes
 * to the support inbox by email, and only its topic is logged. When the
 * email cannot be sent the answer says so (503), so the page can offer
 * the plain email address instead of claiming it was sent.
 */
router.post(
  "/support/messages",
  supportLimiter,
  validate(supportMessageSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as SupportMessageInput;
    if (input.company) {
      // Honeypot filled in: accept and drop, so a bot learns nothing.
      res.status(202).json({ data: { received: true }, requestId: req.requestId });
      return;
    }
    const sent = await sendSupportMessageEmail(input);
    logger.info({ topic: input.topic, platform: input.platform, sent }, "support message");
    if (!sent) {
      res.status(503).json({
        error: { code: "SUPPORT_UNAVAILABLE", message: "Your message could not be sent" },
        requestId: req.requestId,
      });
      return;
    }
    res.status(202).json({ data: { received: true }, requestId: req.requestId });
  }),
);

export { router as supportRouter };
