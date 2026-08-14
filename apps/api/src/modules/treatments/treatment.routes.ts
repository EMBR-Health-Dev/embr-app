import { Router, type Router as ExpressRouter } from "express";
import {
  createTreatmentSchema,
  idParamSchema,
  treatmentQuerySchema,
  updateTreatmentSchema,
  type TreatmentQuery,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireParam } from "../../lib/params.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { treatmentService } from "./treatment.service.js";

const router: ExpressRouter = Router();

router.use("/treatments", requireAuth());

router.post(
  "/treatments",
  validate(createTreatmentSchema),
  asyncHandler(async (req, res) => {
    const treatment = await treatmentService.create(req.user!.sub, req.body);
    await writeAuditLog(req, "TREATMENT_CREATED", req.user!.sub, { treatmentId: treatment.id });
    res.status(201).json({ data: treatment, requestId: req.requestId });
  }),
);

router.get(
  "/treatments",
  validate(treatmentQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const page = await treatmentService.list(req.user!.sub, req.query as unknown as TreatmentQuery);
    res.status(200).json({ data: page, requestId: req.requestId });
  }),
);

router.get(
  "/treatments/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const treatment = await treatmentService.getById(req.user!.sub, requireParam(req, "id"));
    res.status(200).json({ data: treatment, requestId: req.requestId });
  }),
);

router.patch(
  "/treatments/:id",
  validate(idParamSchema, "params"),
  validate(updateTreatmentSchema),
  asyncHandler(async (req, res) => {
    const treatment = await treatmentService.update(
      req.user!.sub,
      requireParam(req, "id"),
      req.body,
    );
    await writeAuditLog(req, "TREATMENT_UPDATED", req.user!.sub, { treatmentId: treatment.id });
    res.status(200).json({ data: treatment, requestId: req.requestId });
  }),
);

router.delete(
  "/treatments/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const treatmentId = requireParam(req, "id");
    await treatmentService.delete(req.user!.sub, treatmentId);
    await writeAuditLog(req, "TREATMENT_DELETED", req.user!.sub, { treatmentId });
    res.status(204).send();
  }),
);

export { router as treatmentRouter };
