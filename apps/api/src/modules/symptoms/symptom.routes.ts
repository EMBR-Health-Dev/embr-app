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
import { requireAuth } from "../auth/auth.middleware.js";
import { symptomService } from "./symptom.service.js";

const router: ExpressRouter = Router();

router.use("/symptom-logs", requireAuth());

router.post(
  "/symptom-logs",
  validate(createSymptomLogSchema),
  asyncHandler(async (req, res) => {
    const log = await symptomService.create(req.user!.sub, req.body);
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
    const log = await symptomService.getById(req.user!.sub, req.params.id as string);
    res.status(200).json({ data: log, requestId: req.requestId });
  }),
);

router.patch(
  "/symptom-logs/:id",
  validate(idParamSchema, "params"),
  validate(updateSymptomLogSchema),
  asyncHandler(async (req, res) => {
    const log = await symptomService.update(req.user!.sub, req.params.id as string, req.body);
    res.status(200).json({ data: log, requestId: req.requestId });
  }),
);

router.delete(
  "/symptom-logs/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await symptomService.delete(req.user!.sub, req.params.id as string);
    res.status(204).send();
  }),
);

export { router as symptomRouter };
