import { Router, type Router as ExpressRouter } from "express";
import { perimenopauseAssessmentSchema, type PerimenopauseAssessmentInput } from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { scorePerimenopauseAssessment } from "./assessment-scoring.js";
import { assessmentLimiter } from "./assessment-rate-limiter.js";

const router: ExpressRouter = Router();

// Deliberately no requireAuth() — this is the one intentionally public,
// unauthenticated endpoint in the whole API. No signup, no session, no
// cookie is required or read. Nothing about the request is persisted:
// this handler computes a result and returns it, full stop. See
// assessment-scoring.ts for why the result is a plain count, never a
// diagnosis, probability, or anything resembling clinical output.
router.post(
  "/public/perimenopause-assessment",
  assessmentLimiter,
  validate(perimenopauseAssessmentSchema, "body"),
  asyncHandler(async (req, res) => {
    const result = scorePerimenopauseAssessment(req.body as PerimenopauseAssessmentInput);
    res.status(200).json({ data: result, requestId: req.requestId });
  }),
);

export { router as publicAssessmentRouter };
