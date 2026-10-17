import { Router, type Router as ExpressRouter } from "express";
import { notificationPreferencesSchema, type NotificationPreferencesInput } from "@embr/validation";
import type { NotificationPreferencesDto } from "@embr/types";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireCsrfToken } from "../auth/csrf.js";
import { writeAuditLog } from "../auth/audit.js";
import { notificationsRepository } from "./notifications.repository.js";

const router: ExpressRouter = Router();

// Not behind requireCurrentConsent: turning an email off must always be
// possible, whatever else is pending.
router.use("/notifications", requireAuth());

router.get(
  "/notifications/preferences",
  asyncHandler(async (req, res) => {
    const data: NotificationPreferencesDto = {
      weeklyEmail: await notificationsRepository.getWeeklyEmail(req.user!.sub),
    };
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

router.patch(
  "/notifications/preferences",
  requireCsrfToken(),
  validate(notificationPreferencesSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as NotificationPreferencesInput;
    const weeklyEmail = await notificationsRepository.setWeeklyEmail(
      req.user!.sub,
      input.weeklyEmail,
    );
    await writeAuditLog(req, "NOTIFICATION_PREFERENCES_CHANGED", req.user!.sub, { weeklyEmail });
    const data: NotificationPreferencesDto = { weeklyEmail };
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

export { router as notificationsRouter };
