import { Router, type Router as ExpressRouter } from "express";
import {
  dismissReflectionSchema,
  reflectionsQuerySchema,
  type ReflectionsQuery,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { reflectionService } from "./reflection.service.js";

const router: ExpressRouter = Router();

router.use("/reflections", requireAuth());

router.get(
  "/reflections",
  validate(reflectionsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const data = await reflectionService.list(
      req.user!.sub,
      req.query as unknown as ReflectionsQuery,
    );
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

router.post(
  "/reflections/dismissals",
  validate(dismissReflectionSchema),
  asyncHandler(async (req, res) => {
    const { type, key } = req.body as {
      type: Parameters<typeof reflectionService.dismiss>[1];
      key: string;
    };
    await reflectionService.dismiss(req.user!.sub, type, key);
    res.status(204).send();
  }),
);

export { router as reflectionRouter };
