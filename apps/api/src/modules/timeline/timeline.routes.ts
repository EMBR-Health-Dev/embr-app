import { Router, type Router as ExpressRouter } from "express";
import { timelineQuerySchema, type TimelineQuery } from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { timelineService } from "./timeline.service.js";

const router: ExpressRouter = Router();

router.use("/timeline", requireAuth());

router.get(
  "/timeline",
  validate(timelineQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const data = await timelineService.get(req.user!.sub, req.query as unknown as TimelineQuery);
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

export { router as timelineRouter };
