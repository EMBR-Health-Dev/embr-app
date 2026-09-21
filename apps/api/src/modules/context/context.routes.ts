import { Router, type Router as ExpressRouter } from "express";
import {
  contextLogQuerySchema,
  upsertContextLogSchema,
  type ContextLogQuery,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { requireCsrfToken } from "../auth/csrf.js";
import { contextService } from "./context.service.js";

const router: ExpressRouter = Router();

router.use("/context-logs", requireAuth());

/** Create-or-replace the entry for the given date (see
 * contextRepository.upsertByDate) — safe to call again for the same
 * day to add or correct a factor. No PATCH/DELETE yet: this first
 * slice only needs create-or-replace, matching the deliberately small
 * scope of the fixed context taxonomy itself. */
router.post(
  "/context-logs",
  requireCsrfToken(),
  validate(upsertContextLogSchema),
  asyncHandler(async (req, res) => {
    const entry = await contextService.upsert(req.user!.sub, req.body);
    await writeAuditLog(req, "CONTEXT_LOG_UPSERTED", req.user!.sub, { contextLogId: entry.id });
    res.status(200).json({ data: entry, requestId: req.requestId });
  }),
);

router.get(
  "/context-logs",
  validate(contextLogQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const page = await contextService.list(req.user!.sub, req.query as unknown as ContextLogQuery);
    res.status(200).json({ data: page, requestId: req.requestId });
  }),
);

export { router as contextRouter };
