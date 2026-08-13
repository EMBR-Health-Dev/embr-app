import { Router, type Router as ExpressRouter } from "express";
import { patchOnboardingSchema, type PatchOnboardingInput } from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { onboardingService } from "./onboarding.service.js";

const router: ExpressRouter = Router();

router.use("/onboarding", requireAuth());

router.get(
  "/onboarding",
  asyncHandler(async (req, res) => {
    const profile = await onboardingService.get(req.user!.sub);
    res.status(200).json({ data: profile, requestId: req.requestId });
  }),
);

router.patch(
  "/onboarding",
  validate(patchOnboardingSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as PatchOnboardingInput;
    const profile = await onboardingService.patch(req.user!.sub, input);

    // Deliberately no onboarding answers (jobToBeDone, noticedAreas,
    // appointmentStatus) in the audit log metadata — those are
    // health-adjacent, and AuditLog is a security/compliance trail
    // other things (support staff, a future admin view) may read for
    // reasons that have nothing to do with a user's health context.
    if (input.status === "completed") {
      await writeAuditLog(req, "ONBOARDING_COMPLETED", req.user!.sub);
    } else if (input.status === "skipped") {
      await writeAuditLog(req, "ONBOARDING_SKIPPED", req.user!.sub);
    }

    res.status(200).json({ data: profile, requestId: req.requestId });
  }),
);

export { router as onboardingRouter };
