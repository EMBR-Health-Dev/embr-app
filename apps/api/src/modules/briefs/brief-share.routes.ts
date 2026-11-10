import { Router, type Router as ExpressRouter } from "express";
import rateLimit from "express-rate-limit";
import {
  briefShareParamsSchema,
  createBriefShareSchema,
  idParamSchema,
  viewSharedBriefSchema,
  type CreateBriefShareInput,
  type ViewSharedBriefInput,
} from "@embr/validation";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireParam } from "../../lib/params.js";
import { redisRateLimitStore } from "../../lib/rate-limit-store.js";
import { rateLimitExceededHandler } from "../../lib/rate-limit-handler.js";
import { requireAuth, requireVerifiedEmail } from "../auth/auth.middleware.js";
import { requireCurrentConsent } from "../consent/consent.middleware.js";
import { requireCsrfToken } from "../auth/csrf.js";
import { writeAuditLog } from "../auth/audit.js";
import { briefShareService } from "./brief-share.service.js";
import { buildClinicalBriefPdf } from "./brief.pdf.js";

const router: ExpressRouter = Router();

// ---- Her side: create, list and turn off links (signed in) ----

const owner = [requireAuth(), requireCurrentConsent()];

router.post(
  "/briefs/:id/shares",
  ...owner,
  requireVerifiedEmail(),
  requireCsrfToken(),
  validate(idParamSchema, "params"),
  validate(createBriefShareSchema),
  asyncHandler(async (req, res) => {
    const briefId = requireParam(req, "id");
    const { expiresInDays } = req.body as CreateBriefShareInput;
    const created = await briefShareService.create(briefId, req.user!.sub, expiresInDays);
    await writeAuditLog(req, "BRIEF_SHARE_CREATED", req.user!.sub, {
      briefId,
      shareId: created.share.id,
      expiresInDays,
    });
    // The link and code exist only in this response.
    res.set("Cache-Control", "no-store");
    res.status(201).json({ data: created, requestId: req.requestId });
  }),
);

router.get(
  "/briefs/:id/shares",
  ...owner,
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const shares = await briefShareService.list(requireParam(req, "id"), req.user!.sub);
    res.status(200).json({ data: shares, requestId: req.requestId });
  }),
);

router.delete(
  "/briefs/:id/shares/:shareId",
  ...owner,
  requireCsrfToken(),
  validate(briefShareParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const briefId = requireParam(req, "id");
    const shareId = requireParam(req, "shareId");
    await briefShareService.revoke(briefId, shareId, req.user!.sub);
    await writeAuditLog(req, "BRIEF_SHARE_REVOKED", req.user!.sub, { briefId, shareId });
    res.status(204).send();
  }),
);

// ---- The clinician's side: open a shared brief (no account) ----

/** Per IP, on top of the per-link lockout after 5 wrong codes: bounds
 * guessing across many links from one place. */
const sharedBriefLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitExceededHandler,
  store: redisRateLimitStore("rl:shared-brief:"),
  skip: () => env.NODE_ENV === "test",
});

async function openOrAudit(
  req: Parameters<Parameters<typeof asyncHandler>[0]>[0],
  countView: boolean,
) {
  const { token, code } = req.body as ViewSharedBriefInput;
  try {
    return await briefShareService.open(token, code, countView);
  } catch (err) {
    const context = (err as { shareContext?: { shareId: string; ownerId: string } }).shareContext;
    if (context) {
      await writeAuditLog(req, "BRIEF_SHARE_CODE_FAILED", context.ownerId, {
        shareId: context.shareId,
      });
    }
    throw err;
  }
}

// POST, not GET: the token and code travel in the body, never in a URL.
router.post(
  "/shared/brief",
  sharedBriefLimiter,
  validate(viewSharedBriefSchema),
  asyncHandler(async (req, res) => {
    const opened = await openOrAudit(req, true);
    await writeAuditLog(req, "BRIEF_SHARE_VIEWED", opened.ownerId, {
      briefId: opened.brief.id,
      shareId: opened.shareId,
    });
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex");
    res.status(200).json({
      data: { brief: opened.brief, sharedUntil: opened.sharedUntil },
      requestId: req.requestId,
    });
  }),
);

router.post(
  "/shared/brief/pdf",
  sharedBriefLimiter,
  validate(viewSharedBriefSchema),
  asyncHandler(async (req, res) => {
    const opened = await openOrAudit(req, false);
    await writeAuditLog(req, "BRIEF_SHARE_DOWNLOADED", opened.ownerId, {
      briefId: opened.brief.id,
      shareId: opened.shareId,
    });
    // The same PDF she would print herself.
    const doc = buildClinicalBriefPdf(opened.brief, opened.ownerEmail);
    res
      .status(200)
      .type("application/pdf")
      .set("Cache-Control", "no-store")
      .set(
        "Content-Disposition",
        `attachment; filename="embr-brief-${opened.brief.fromDate}-to-${opened.brief.toDate}.pdf"`,
      );
    doc.pipe(res);
    doc.end();
  }),
);

export { router as briefShareRouter };
