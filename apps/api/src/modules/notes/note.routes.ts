import { Router, type Router as ExpressRouter } from "express";
import {
  createNoteSchema,
  idParamSchema,
  noteQuerySchema,
  updateNoteSchema,
  type NoteQuery,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireParam } from "../../lib/params.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireCurrentConsent } from "../consent/consent.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { requireCsrfToken } from "../auth/csrf.js";
import { noteWriteLimiter } from "./note-rate-limiter.js";
import { noteService } from "./note.service.js";

const router: ExpressRouter = Router();

// Notes can hold health information, so they sit behind the same
// consent gate as the rest of the record. Audit entries carry the id
// only, never the title or text.
router.use("/notes", requireAuth(), requireCurrentConsent());

router.post(
  "/notes",
  noteWriteLimiter,
  requireCsrfToken(),
  validate(createNoteSchema),
  asyncHandler(async (req, res) => {
    const note = await noteService.create(req.user!.sub, req.body);
    await writeAuditLog(req, "NOTE_CREATED", req.user!.sub, { noteId: note.id });
    res.status(201).json({ data: note, requestId: req.requestId });
  }),
);

router.get(
  "/notes",
  validate(noteQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const page = await noteService.list(req.user!.sub, req.query as unknown as NoteQuery);
    res.status(200).json({ data: page, requestId: req.requestId });
  }),
);

router.get(
  "/notes/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const note = await noteService.getById(req.user!.sub, requireParam(req, "id"));
    res.status(200).json({ data: note, requestId: req.requestId });
  }),
);

router.patch(
  "/notes/:id",
  noteWriteLimiter,
  requireCsrfToken(),
  validate(idParamSchema, "params"),
  validate(updateNoteSchema),
  asyncHandler(async (req, res) => {
    const note = await noteService.update(req.user!.sub, requireParam(req, "id"), req.body);
    await writeAuditLog(req, "NOTE_UPDATED", req.user!.sub, { noteId: note.id });
    res.status(200).json({ data: note, requestId: req.requestId });
  }),
);

router.delete(
  "/notes/:id",
  requireCsrfToken(),
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const noteId = requireParam(req, "id");
    await noteService.delete(req.user!.sub, noteId);
    await writeAuditLog(req, "NOTE_DELETED", req.user!.sub, { noteId });
    res.status(204).send();
  }),
);

export { router as noteRouter };
