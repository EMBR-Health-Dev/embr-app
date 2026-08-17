import type { BriefTreatmentSummaryEntryDto } from "@embr/types";
import type { Treatment } from "../../generated/prisma/index.js";

/**
 * PRISMA-SCHEMA-BOUNDARY — exact field the eventual migration needs to add:
 *
 *   model ClinicalBrief {
 *     ...
 *     /// Array<{ name: string, category: TreatmentCategory, startDate: string, endDate: string | null }>
 *     /// A snapshot of Treatment records overlapping [fromDate, toDate],
 *     /// taken at generation time — deliberately NOT a live query (see
 *     /// brief.pdf.ts's reproducibility invariant). Never sent to the
 *     /// AI — see brief.ai.ts's BriefInput, which this is not part of.
 *     /// notes is deliberately excluded — see this file's doc comment.
 *     treatmentSummary Json
 *     ...
 *   }
 *
 * No @default, no nullability — matching symptomSummary/cycleSummary
 * exactly, since the service layer will always provide all three
 * explicitly at create() time, the same way it already does for those
 * two. Until this field exists and `prisma generate` has run against
 * it, brief.mappers.ts's toClinicalBriefDto() cannot read a persisted
 * value (there is nothing on the ClinicalBrief record to read), and
 * brief.repository.ts's create() cannot persist one (its data
 * parameter would need a field Prisma's generated
 * ClinicalBriefCreateInput type doesn't know about yet). Search this
 * codebase for "PRISMA-SCHEMA-BOUNDARY" to find every place that's
 * currently working around the absence of this field.
 *
 * What *is* fully built and tested despite that boundary: this pure
 * mapping function, the repository query that feeds it
 * (treatment.repository.ts's listOverlappingRange), and every
 * rendering surface (PDF, web, mobile) that consumes a
 * BriefTreatmentSummaryEntryDto[] — none of those depend on the
 * schema at all. Once the field lands, the only remaining wiring is
 * brief.repository.ts's create() call and brief.mappers.ts's read —
 * both already marked PRISMA-SCHEMA-BOUNDARY at the exact line to
 * change.
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
