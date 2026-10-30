import { Router, type Router as ExpressRouter } from "express";
import { saveBaselineCheckInSchema, type SaveBaselineCheckInInput } from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireCurrentConsent } from "../consent/consent.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { requireCsrfToken } from "../auth/csrf.js";
import { noteWriteLimiter } from "../notes/note-rate-limiter.js";
import { baselineService } from "./baseline.service.js";

const router: ExpressRouter = Router();

// Her first check in, saved once as her starting point. Health
// information: same consent gate as the rest of the record, which
// includes health processing consent. Email verification is not
// required, as for the daily check in. Audit entries carry the date and
// a count only, never a symptom or answer.
router.use("/baseline-check-ins", requireAuth(), requireCurrentConsent());

router.get(
  "/baseline-check-ins",
  asyncHandler(async (req, res) => {
    const baseline = await baselineService.get(req.user!.sub);
    res.status(200).json({ data: { baseline }, requestId: req.requestId });
  }),
);

// 201 when saved now; 200 with the stored baseline, unchanged, when she
// already has one. A retry after a lost response is therefore safe.
router.post(
  "/baseline-check-ins",
  noteWriteLimiter,
  requireCsrfToken(),
  validate(saveBaselineCheckInSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as SaveBaselineCheckInInput;
    const data = await baselineService.save(req.user!.sub, input);
    if (data.created) {
      await writeAuditLog(req, "BASELINE_CHECK_IN_SAVED", req.user!.sub, {
        completedOn: input.completedOn,
        symptomCount: input.symptoms.length,
      });
    }
    res.status(data.created ? 201 : 200).json({ data, requestId: req.requestId });
  }),
);

export { router as baselineRouter };
