import { Router, type Router as ExpressRouter } from "express";
import {
  createSymptomLogSchema,
  idParamSchema,
  saveSymptomCheckInSchema,
  symptomCheckInParamsSchema,
  symptomLogQuerySchema,
  updateSymptomLogSchema,
  type SymptomLogQuery,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireParam } from "../../lib/params.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireCurrentConsent } from "../consent/consent.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { requireCsrfToken } from "../auth/csrf.js";
import { symptomLogWriteLimiter } from "./symptom-rate-limiter.js";
import { symptomService } from "./symptom.service.js";

const router: ExpressRouter = Router();

router.use("/symptom-logs", requireAuth(), requireCurrentConsent());

router.post(
  "/symptom-logs",
  symptomLogWriteLimiter,
  requireCsrfToken(),
  validate(createSymptomLogSchema),
  asyncHandler(async (req, res) => {
    const log = await symptomService.create(req.user!.sub, req.body);
    await writeAuditLog(req, "SYMPTOM_LOG_CREATED", req.user!.sub, { symptomLogId: log.id });
    res.status(201).json({ data: log, requestId: req.requestId });
  }),
);

router.get(
  "/symptom-logs",
  validate(symptomLogQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const page = await symptomService.list(req.user!.sub, req.query as unknown as SymptomLogQuery);
    res.status(200).json({ data: page, requestId: req.requestId });
  }),
);

// The daily check in for one local calendar date (YYYY-MM-DD).
router.get(
  "/symptom-logs/check-ins/:date",
  validate(symptomCheckInParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const data = await symptomService.getCheckIn(req.user!.sub, requireParam(req, "date"));
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

router.put(
  "/symptom-logs/check-ins/:date",
  symptomLogWriteLimiter,
  requireCsrfToken(),
  validate(symptomCheckInParamsSchema, "params"),
  validate(saveSymptomCheckInSchema),
  asyncHandler(async (req, res) => {
    const date = requireParam(req, "date");
    const data = await symptomService.saveCheckIn(req.user!.sub, date, req.body);
    await writeAuditLog(req, "SYMPTOM_CHECK_IN_SAVED", req.user!.sub, {
      date,
      symptomCount: data.entries.length,
    });
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

router.get(
  "/symptom-logs/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const log = await symptomService.getById(req.user!.sub, requireParam(req, "id"));
    res.status(200).json({ data: log, requestId: req.requestId });
  }),
);

router.patch(
  "/symptom-logs/:id",
  requireCsrfToken(),
  validate(idParamSchema, "params"),
  validate(updateSymptomLogSchema),
  asyncHandler(async (req, res) => {
    const log = await symptomService.update(req.user!.sub, requireParam(req, "id"), req.body);
    await writeAuditLog(req, "SYMPTOM_LOG_UPDATED", req.user!.sub, { symptomLogId: log.id });
    res.status(200).json({ data: log, requestId: req.requestId });
  }),
);

router.delete(
  "/symptom-logs/:id",
  requireCsrfToken(),
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const symptomLogId = requireParam(req, "id");
    await symptomService.delete(req.user!.sub, symptomLogId);
    await writeAuditLog(req, "SYMPTOM_LOG_DELETED", req.user!.sub, { symptomLogId });
    res.status(204).send();
  }),
);

export { router as symptomRouter };
