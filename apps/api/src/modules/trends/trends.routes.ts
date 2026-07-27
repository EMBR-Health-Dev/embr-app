import { Router, type Router as ExpressRouter } from "express";
import { trendsQuerySchema, type TrendsQuery } from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { trendsService } from "./trends.service.js";

const router: ExpressRouter = Router();

router.use("/trends", requireAuth());

router.get(
  "/trends/symptom-frequency",
  validate(trendsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const data = await trendsService.symptomFrequency(
      req.user!.sub,
      req.query as unknown as TrendsQuery,
    );
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

router.get(
  "/trends/cycle-length",
  validate(trendsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const data = await trendsService.cycleLength(
      req.user!.sub,
      req.query as unknown as TrendsQuery,
    );
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

export { router as trendsRouter };
