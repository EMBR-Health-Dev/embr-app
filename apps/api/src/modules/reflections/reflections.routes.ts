import { Router, type Router as ExpressRouter } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { reflectionsService } from "./reflections.service.js";

const router: ExpressRouter = Router();

router.get(
  "/reflections",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const data = await reflectionsService.list(req.user!.sub);
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

export { router as reflectionsRouter };
