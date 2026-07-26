import { Router, type Router as ExpressRouter } from "express";
import {
  adminAuditLogQuerySchema,
  adminUserQuerySchema,
  type AdminAuditLogQuery,
  type AdminUserQuery,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { adminService } from "./admin.service.js";

const router: ExpressRouter = Router();

router.use("/admin", requireAuth(), requireRole("ADMIN"));

/**
 * Deliberately scoped to operational data — account metadata and the
 * security audit trail. Never symptom/cycle records: those are
 * personal health data, and RBAC granting an admin route access to
 * them "by default" is exactly the failure mode Milestone 3's design
 * note warned about. A clinician-facing view over health data, if it's
 * ever built, needs its own explicit scoping and consent model, not
 * to fall out of this router.
 */
router.get(
  "/admin/users",
  validate(adminUserQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const page = await adminService.listUsers(req.query as unknown as AdminUserQuery);
    await writeAuditLog(req, "ADMIN_VIEWED_USERS", req.user!.sub);
    res.status(200).json({ data: page, requestId: req.requestId });
  }),
);

router.get(
  "/admin/audit-logs",
  validate(adminAuditLogQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const page = await adminService.listAuditLogs(req.query as unknown as AdminAuditLogQuery);
    await writeAuditLog(req, "ADMIN_VIEWED_AUDIT_LOGS", req.user!.sub);
    res.status(200).json({ data: page, requestId: req.requestId });
  }),
);

export { router as adminRouter };
