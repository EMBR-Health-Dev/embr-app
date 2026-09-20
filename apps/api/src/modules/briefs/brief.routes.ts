import { Router, type Router as ExpressRouter } from "express";
import { generateBriefSchema, idParamSchema, paginationQuerySchema } from "@embr/validation";
import type { GenerateBriefInput, PaginationQuery } from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireParam } from "../../lib/params.js";
import { resolveLocaleFromAcceptLanguage } from "../../lib/locale.js";
import { requireAuth, requireVerifiedEmail } from "../auth/auth.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { requireCsrfToken } from "../auth/csrf.js";
import { briefGenerationLimiter } from "./brief-rate-limiter.js";
import { briefService } from "./brief.service.js";
import { buildClinicalBriefPdf } from "./brief.pdf.js";

const router: ExpressRouter = Router();

router.use("/briefs", requireAuth());

router.post(
  "/briefs",
  // Before the rate limiter deliberately: a blocked-for-verification
  // attempt shouldn't spend any of the 10/hr generation budget the
  // limiter exists to protect.
  requireVerifiedEmail(),
  briefGenerationLimiter,
  requireCsrfToken(),
  validate(generateBriefSchema),
  asyncHandler(async (req, res) => {
    const { fromDate, toDate } = req.body as GenerateBriefInput;
    // Resolved once, here, and persisted on the brief itself (see
    // ClinicalBrief.locale's own doc comment) — never re-resolved from
    // whatever locale a later request happens to be in. GET .../pdf
    // below deliberately does NOT call this: it renders in the locale
    // the brief was actually generated in, read back off the brief
    // itself via briefService.get(), not the downloading session's
    // current language.
    const locale = resolveLocaleFromAcceptLanguage(req.headers["accept-language"]);
    const brief = await briefService.generate(req.user!.sub, fromDate, toDate, locale);
    await writeAuditLog(req, "CLINICAL_BRIEF_GENERATED", req.user!.sub, {
      briefId: brief.id,
      fromDate: brief.fromDate,
      toDate: brief.toDate,
    });
    res.status(201).json({ data: brief, requestId: req.requestId });
  }),
);

router.get(
  "/briefs",
  validate(paginationQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const result = await briefService.list(req.user!.sub, req.query as unknown as PaginationQuery);
    res.status(200).json({ data: result, requestId: req.requestId });
  }),
);

// Registered before /briefs/:id deliberately — idParamSchema requires
// a UUID, so if this route were registered after the :id route,
// Express would match the path pattern first regardless of order in
// which handlers are written, land on the :id handler, and fail
// UUID validation on the literal string "trends" (a 400, never
// reaching this handler at all) rather than routing here.
router.get(
  "/briefs/trends",
  asyncHandler(async (req, res) => {
    const result = await briefService.trends(req.user!.sub);
    res.status(200).json({ data: result, requestId: req.requestId });
  }),
);

router.get(
  "/briefs/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const brief = await briefService.get(requireParam(req, "id"), req.user!.sub);
    res.status(200).json({ data: brief, requestId: req.requestId });
  }),
);

router.get(
  "/briefs/:id/pdf",
  requireVerifiedEmail(),
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const brief = await briefService.get(requireParam(req, "id"), req.user!.sub);
    await writeAuditLog(req, "CLINICAL_BRIEF_DOWNLOADED", req.user!.sub, { briefId: brief.id });
    const doc = buildClinicalBriefPdf(brief, req.user!.email);
    res
      .status(200)
      .type("application/pdf")
      .set(
        "Content-Disposition",
        `attachment; filename="embr-brief-${brief.fromDate}-to-${brief.toDate}.pdf"`,
      );
    doc.pipe(res);
    doc.end();
  }),
);

router.delete(
  "/briefs/:id",
  requireCsrfToken(),
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const id = requireParam(req, "id");
    await briefService.delete(id, req.user!.sub);
    await writeAuditLog(req, "CLINICAL_BRIEF_DELETED", req.user!.sub, { briefId: id });
    res.status(204).send();
  }),
);

export { router as briefRouter };
