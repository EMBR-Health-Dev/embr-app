import { Router, type Router as ExpressRouter } from "express";
import {
  mrsCheckInParamsSchema,
  mrsCheckInQuerySchema,
  saveMrsCheckInSchema,
  type MrsCheckInQuery,
} from "@embr/validation";
import { AppError } from "@embr/shared";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireParam } from "../../lib/params.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireCurrentConsent } from "../consent/consent.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { requireCsrfToken } from "../auth/csrf.js";
import { noteWriteLimiter } from "../notes/note-rate-limiter.js";
import { mrsService } from "./mrs.service.js";

const router: ExpressRouter = Router();

// Off until the MRS licence for commercial use is confirmed
// (MRS_CHECK_IN_ENABLED). While off, these routes do not exist.
// Answers are health information: same consent gate as the rest of the
// record, and audit entries carry the date only, never an answer.
router.use(
  "/mrs-check-ins",
  (_req, _res, next) => next(env.MRS_CHECK_IN_ENABLED ? undefined : AppError.notFound("Route")),
  requireAuth(),
  requireCurrentConsent(),
);

router.get(
  "/mrs-check-ins",
  validate(mrsCheckInQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const data = await mrsService.list(req.user!.sub, req.query as unknown as MrsCheckInQuery);
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

// One check-in per local calendar date (YYYY-MM-DD); saving again
// replaces it.
router.put(
  "/mrs-check-ins/:date",
  noteWriteLimiter,
  requireCsrfToken(),
  validate(mrsCheckInParamsSchema, "params"),
  validate(saveMrsCheckInSchema),
  asyncHandler(async (req, res) => {
    const date = requireParam(req, "date");
    const data = await mrsService.save(req.user!.sub, date, req.body);
    await writeAuditLog(req, "MRS_CHECK_IN_SAVED", req.user!.sub, { date });
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

router.delete(
  "/mrs-check-ins/:date",
  requireCsrfToken(),
  validate(mrsCheckInParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const date = requireParam(req, "date");
    await mrsService.delete(req.user!.sub, date);
    await writeAuditLog(req, "MRS_CHECK_IN_DELETED", req.user!.sub, { date });
    res.status(204).send();
  }),
);

export { router as mrsRouter };
