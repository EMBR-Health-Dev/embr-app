import { Router, type Router as ExpressRouter } from "express";
import { exportQuerySchema, type ExportQuery } from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { exportService } from "./export.service.js";

const router: ExpressRouter = Router();

router.use("/export", requireAuth());

router.get(
  "/export/symptom-logs.csv",
  validate(exportQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const csv = await exportService.symptomLogsCsv(
      req.user!.sub,
      req.query as unknown as ExportQuery,
    );
    await writeAuditLog(req, "DATA_EXPORTED", req.user!.sub, { type: "symptom-logs-csv" });
    res
      .status(200)
      .type("text/csv")
      .set("Content-Disposition", 'attachment; filename="embr-symptom-logs.csv"')
      .send(csv);
  }),
);

router.get(
  "/export/cycle-entries.csv",
  validate(exportQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const csv = await exportService.cycleEntriesCsv(
      req.user!.sub,
      req.query as unknown as ExportQuery,
    );
    await writeAuditLog(req, "DATA_EXPORTED", req.user!.sub, { type: "cycle-entries-csv" });
    res
      .status(200)
      .type("text/csv")
      .set("Content-Disposition", 'attachment; filename="embr-cycle-entries.csv"')
      .send(csv);
  }),
);

router.get(
  "/export/treatments.csv",
  validate(exportQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const csv = await exportService.treatmentsCsv(
      req.user!.sub,
      req.query as unknown as ExportQuery,
    );
    await writeAuditLog(req, "DATA_EXPORTED", req.user!.sub, { type: "treatments-csv" });
    res
      .status(200)
      .type("text/csv")
      .set("Content-Disposition", 'attachment; filename="embr-treatments.csv"')
      .send(csv);
  }),
);

router.get(
  "/export/summary.pdf",
  validate(exportQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const doc = await exportService.clinicianSummaryPdf(
      req.user!.sub,
      req.user!.email,
      req.query as unknown as ExportQuery,
    );
    await writeAuditLog(req, "DATA_EXPORTED", req.user!.sub, { type: "clinician-summary-pdf" });
    res
      .status(200)
      .type("application/pdf")
      .set("Content-Disposition", 'attachment; filename="embr-health-summary.pdf"');
    doc.pipe(res);
    doc.end();
  }),
);

export { router as exportRouter };
