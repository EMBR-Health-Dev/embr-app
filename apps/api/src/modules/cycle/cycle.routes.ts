import { Router, type Router as ExpressRouter } from "express";
import {
  cycleEntryQuerySchema,
  idParamSchema,
  updateCycleEntrySchema,
  upsertCycleEntrySchema,
  type CycleEntryQuery,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { cycleService } from "./cycle.service.js";

const router: ExpressRouter = Router();

router.use("/cycle-entries", requireAuth());

/** Create-or-replace the entry for the given date (see
 * cycleRepository.upsertByDate) — safe to call again for the same day
 * to correct an earlier entry. */
router.post(
  "/cycle-entries",
  validate(upsertCycleEntrySchema),
  asyncHandler(async (req, res) => {
    const entry = await cycleService.upsert(req.user!.sub, req.body);
    res.status(200).json({ data: entry, requestId: req.requestId });
  }),
);

router.get(
  "/cycle-entries",
  validate(cycleEntryQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const page = await cycleService.list(req.user!.sub, req.query as unknown as CycleEntryQuery);
    res.status(200).json({ data: page, requestId: req.requestId });
  }),
);

router.get(
  "/cycle-entries/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const entry = await cycleService.getById(req.user!.sub, req.params.id as string);
    res.status(200).json({ data: entry, requestId: req.requestId });
  }),
);

router.patch(
  "/cycle-entries/:id",
  validate(idParamSchema, "params"),
  validate(updateCycleEntrySchema),
  asyncHandler(async (req, res) => {
    const entry = await cycleService.update(req.user!.sub, req.params.id as string, req.body);
    res.status(200).json({ data: entry, requestId: req.requestId });
  }),
);

router.delete(
  "/cycle-entries/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await cycleService.delete(req.user!.sub, req.params.id as string);
    res.status(204).send();
  }),
);

export { router as cycleRouter };
