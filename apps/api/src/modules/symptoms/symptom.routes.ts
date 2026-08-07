import { Router, type Router as ExpressRouter } from "express";
import {
  createSymptomLogSchema,
  idParamSchema,
  symptomLogQuerySchema,
  updateSymptomLogSchema,
  type SymptomLogQuery,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireParam } from "../../lib/params.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { symptomService } from "./symptom.service.js";

const router: ExpressRouter = Router();

router.use("/symptom-logs", requireAuth());

router.post(
  "/symptom-logs",
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
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const symptomLogId = requireParam(req, "id");
    await symptomService.delete(req.user!.sub, symptomLogId);
    await writeAuditLog(req, "SYMPTOM_LOG_DELETED", req.user!.sub, { symptomLogId });
    res.status(204).send();
  }),
);

export { router as symptomRouter };
