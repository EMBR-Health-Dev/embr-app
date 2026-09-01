import type { BriefTreatmentSummaryEntryDto } from "@embr/types";
import type { Treatment } from "../../generated/prisma/index.js";

/**
 * ClinicalBrief.treatmentSummary — persistence status
 *
 * This field exists on the Prisma schema (a plain, non-nullable Json
 * column, matching symptomSummary/cycleSummary exactly) and is fully
 * wired end to end: brief.service.ts's generate() computes it via
 * computeTreatmentSummary() below and passes it to
 * brief.repository.ts's create(), which persists it; brief.mappers.ts's
 * toClinicalBriefDto() reads the persisted value back on every
 * GET /briefs/:id and GET /briefs/:id/pdf request. Historically this
 * was blocked on a missing migration (search git history for
 * "PRISMA-SCHEMA-BOUNDARY" if curious about that period) — that's
 * resolved and this note exists only so a future reader doesn't have
 * to rediscover that themselves from the code alone.
 *
 * notes is still deliberately excluded from this summary — see this
 * file's next doc comment for why. That reasoning was never about the
 * schema boundary and doesn't change now that the field is real.
 */

/**
 * Deterministic, no AI involvement, no interpretation — a direct
 * structural mapping from Treatment records to the shape BRIEF
 * displays. Deliberately excludes `notes`: the same reasoning
 * brief.ai.ts already applies to SymptomLog.notes (free-text a person
 * wrote for themselves can contain anything, with no bearing on what
 * this summary is actually for) applies here with an added, sharper
 * reason — treatment notes are exactly where someone is most likely to
 * write their own efficacy commentary ("seems to be helping," "no
 * difference"), and surfacing that verbatim on a document that also
 * shows symptom-frequency trends would reintroduce the exact
 * causal-implication risk this whole feature exists to avoid, just in
 * the person's own words instead of an AI's.
 */
export function computeTreatmentSummary(treatments: Treatment[]): BriefTreatmentSummaryEntryDto[] {
  return treatments.map((t) => ({
    name: t.name,
    category: t.category,
    startDate: t.startDate.toISOString().slice(0, 10),
    endDate: t.endDate ? t.endDate.toISOString().slice(0, 10) : null,
  }));
}
